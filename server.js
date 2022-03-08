const fs = require('fs');
const util = require('util')
const https = require('https');
const gunzip = require('gunzip-file')
const shell = require('shelljs'); 
const express = require('express');
const app = express();
const { auth, requiredScopes, JSONPrimitive } = require('express-oauth2-jwt-bearer');
const cors = require('cors');
const { response } = require('express');

const KV = require('./kv');
const Users = require('./users');

require('dotenv').config();

var ManagementAPIClient = require('auth0').ManagementClient;

if (!process.env.ISSUER_BASE_URL || !process.env.AUDIENCE) {
  throw 'Make sure you have ISSUER_BASE_URL, and AUDIENCE in your .env file';
}

if (!shell.which('sqlite3')) {
  shell.echo('Sorry, this app requires sqlite3');
  shell.exit(1);
}

var startFrom = null;
const kv = new KV();
kv.open(function(){
  kv.get("startFrom", function(err, res){
    if (err) {
      console.log(err);
    }
    console.log("Current log id: ", res);
    if (res !== null) {
      startFrom = res;
    }
    kv.close();
  });
});

var auth0 = new ManagementAPIClient({
  domain: process.env.ISSUER_BASE_URL.replace('https://',''),
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
});

function checkExportJobStatus(jobID, cb) {

  var downloadURL = null;
  var params = {
    id: jobID
  };

  try {
    auth0.jobs.get(params).then((result) => {
      if (result.status === "completed") {
        cb(null, result.location);
      } else if (result.status === "pending") {
        cb(null, "pending")
      }
    });
  } catch(error){
    cb(error);
  }
}

function downloadExportFile(downloadURL, cb) {
  try {
    https.get(downloadURL,(res) => {

      const path = `${__dirname}/download.csv.gz`; 
      const filePath = fs.createWriteStream(path);
      res.pipe(filePath);
      filePath.on('finish',() => {
          filePath.close();
          console.log('Download Completed'); 
          gunzip(`${__dirname}/download.csv.gz`, `${__dirname}/download.csv`, () => {
            console.log('gunzip done!')
            cb(null);
          })
      })
    })
  } catch (error){
    cb(error)
  }
}

const checkJwt = auth();

app.get('/api/public', function(req, res) {
  res.json({
    message: 'Hello from a public endpoint! You don\'t need to be authenticated to see this.'
  });
});

app.get('/api/export-users', checkJwt, function(req, res) {
  var data = {
    connection_id: process.env.CONNECTION_ID_TO_EXPORT,
    format: 'csv',
    fields: [
      {
        "name": "user_id"
      },
      {
        "name": "email"
      }
    ]
  }

  auth0.jobs.exportUsers(data, function (err, results) {
    if (err) {
      // Handle error.
    }
    // Retrieved job.
    console.log(results);

    let jobID = results && results.id;

    const kv = new KV();
    kv.open(function(){
      kv.set("jobID", jobID, function(err){
        if (err) {
          console.log(err);
        }
        kv.close();
        res.json({
          message: `Export user job started with id ${jobID}.`
        });
      })
    });
  });
});

app.get('/api/update-users-db', checkJwt, function(req, res) {
  try{
    const kv = new KV();
    kv.open(function(){
      kv.get("jobID", function(err, jobID){
        if (err) {
          console.log(err);
        }
        kv.close();
        console.log(`User export job ID: ${jobID}`);
        checkExportJobStatus(jobID, function (err, downloadlink){
          if (err) {
            console.log(err);
          }
          console.log(`User export job URL: ${downloadlink}`);
          if (downloadlink === "pending") {
            return  res.json({
              message: 'Export is still ongoing. Try again shortly.'
            });
          }
          downloadExportFile(downloadlink, function (err){
            if (err) {
              console.log(err);
            }
            console.log("Update users DB..");
            if (shell.exec('sqlite3 users.sqlite < import.sql').code !== 0) {
              res.json({
                message: 'User import to local database failed.'
              });
              shell.echo('Error: SQLite3 command failed');
            } else {
              res.json({
                message: 'User import to local database completed successfully.'
              });
            }
          })   
        })
      })
    });
  } catch(error) {
    console.log(error);
  }
});

app.get('/api/check-logs', checkJwt, function(req, res) {
  let params = {
    sort:"date:1",
    from: startFrom?startFrom:""
  }

  auth0.getLogs(params, function (err, logs){
    if (err){
      console.log("In error: ", err);
      startFrom = null;
      const kv = new KV();
      kv.open(function(){
        kv.rm("startFrom", function(err){
          if (err) {
            console.log(err);
          }
          kv.close();
        });
      });
    }
    console.log("Current log id : ", startFrom);
    if (logs && Array.isArray(logs) && 
        logs[logs.length-1] && logs[logs.length-1].log_id != undefined &&
        startFrom !== logs[logs.length-1].log_id && logs.length > 0) {
              
      // Update the latest log id the app is getting from logs
      startFrom = logs[logs.length-1].log_id;
      const kv = new KV();
      kv.open(function(){
        kv.set("startFrom", startFrom, function(err, res){
          if (err) {
            console.log(err);
          }
          kv.close();
        })
      });

      const users = new Users();
      const findUser = util.promisify(users.findUser);
      const addUser  = util.promisify(users.addUser);
      const deleteUser = util.promisify(users.deleteUser);

      users.open( async function() {

      // Array of blocked users
      const blockedUsers = [];

      for (let i=0; i < logs.length; i++) {

        // Add users added on Auth0 
        if (logs[i].type == "ss" && 
            logs[i].connection_id == process.env.CONNECTION_ID_TO_EXPORT) {
          try{
            await addUser(logs[i].user_id, logs[i].user_name);
          } catch(err) {
            console.log(err);
          }
        }
                    
        // Remove users deleted on Auth0 
        if (logs[i].type == "sdu"  && 
            logs[i].connection_id == process.env.CONNECTION_ID_TO_EXPORT) {
              try{
                let user_id = logs[i].description.replace("user_id: ", "auth0|");
                await deleteUser(user_id);
              } catch(err) {
                console.log(err);
              }
        }
                                      
        // Find block users and check if the user exists in the DB
        if (logs[i].type == "limit_wc" && 
            logs[i].connection_id == process.env.CONNECTION_ID_TO_EXPORT) {
          try{
            const user = await findUser(logs[i].user_name);
            if (user) {
              blockedUsers.push(user);
            }
          } catch(err) {
            console.log(err);
          }
        }
      } 
      users.close();
      console.log("Blocked users");
      console.log(blockedUsers);
      return res.json({
        users: blockedUsers
      });
    })
  } else {
    console.log("No new user blocks. Current log_id:", startFrom);
    res.json({
      message: `No new user blocks. Current log_id: ${startFrom}`
    });
  }
  });
});

app.use(function(err, req, res, next){
  console.error(err.stack);
  return res.set(err.headers).status(err.status).json({ message: err.message });
});

app.listen(3010);
console.log('Listening on http://localhost:3010');
