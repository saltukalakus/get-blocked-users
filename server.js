const fs = require('fs');
const https = require('https');
const gunzip = require('gunzip-file')
const shell = require('shelljs'); 
const sqlite3 = require('sqlite3')
const express = require('express');
const app = express();
const { auth, requiredScopes, JSONPrimitive } = require('express-oauth2-jwt-bearer');
const cors = require('cors');
const { response } = require('express');

const KV = require('./kv');
const Users = require('./users');

require('dotenv').config();

var ManagementAPIClient = require('auth0').ManagementClient;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (!process.env.ISSUER_BASE_URL || !process.env.AUDIENCE) {
  throw 'Make sure you have ISSUER_BASE_URL, and AUDIENCE in your .env file';
}

if (!shell.which('sqlite3')) {
  shell.echo('Sorry, this app requires sqlite3');
  shell.exit(1);
}

var dbUsers = new sqlite3.Database('users.sqlite');

var startFrom = null;
const kv = new KV();
kv.open(function(){
  kv.get("startFrom", function(err, res){
    if (err) {
      console.log(err);
    }
    console.log("Get val");
    console.log(res);
    if (res !== null) {
      startFrom = res;
    }
    kv.close();
  });
});

var auth0 = new ManagementAPIClient({
  domain: process.env.YOUR_ACCOUNT +'.auth0.com',
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

const corsOptions =  {
  origin: 'http://localhost:3000'
};

app.use(cors(corsOptions));

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
            q : "type:limit_wc",
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

              const availableUsers = [];
              const users = new Users();

              users.open( function() {
                for (let i=0; i < logs.length; i++) {
                  if (logs[i].type == "limit_wc") {
                    users.findUser(logs[i].user_name, function(err, result){
                      if (err){
                        console.log(err);
                      }
                      if (result){
                        console.log("hey");
                        console.log(result);
                        availableUsers.push(result);
                      }
                    })
                  }
                  if (i === logs.length - 1){
                    users.close();
                    console.log("Available users");
                    console.log(availableUsers);
                    return res.json({
                      users: availableUsers
                    });
                  }
                } 
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
