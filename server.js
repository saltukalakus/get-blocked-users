const fs = require('fs');
const https = require('https');
const gunzip = require('gunzip-file')
var shell = require('shelljs'); 
const express = require('express');
const app = express();
const { auth, requiredScopes } = require('express-oauth2-jwt-bearer');
const cors = require('cors');
const { response } = require('express');
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

var startFrom = null;

var auth0 = new ManagementAPIClient({
  domain: process.env.YOUR_ACCOUNT +'.auth0.com',
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
});

async function checkExportJobStatus(jobID) {

  var downloadURL = null;
  var params = {
    id: jobID
  };
  
  let exportJobCompleted = false;
    auth0.jobs.get(params).then((result) => {
      console.log("export job status");
      console.log(result);
    
      if (result.status === "completed") {
        console.log("Job completed..");
        exportJobCompleted = true;
        downloadURL = result.location;

        https.get(downloadURL,(res) => {
            // Image will be stored at this path
            const path = `${__dirname}/download.csv.gz`; 
            const filePath = fs.createWriteStream(path);
            res.pipe(filePath);
            filePath.on('finish',() => {
                filePath.close();
                console.log('Download Completed'); 
                gunzip(`${__dirname}/download.csv.gz`, `${__dirname}/download.csv`, () => {
                  console.log('gunzip done!')
                })
            })
        })

      } else {
        console.log("Recursively call check exports again.")
        checkExportJobStatus(jobID);
      }
    });
    sleep(5000);
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

app.get('/api/refresh-users-list', checkJwt, function(req, res) {
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
    checkExportJobStatus(jobID).then((result, result2) => {
      console.log("RESULT");
      console.log(result);
      console.log("RESULT2");
      console.log(result2);
      res.json({
        message: 'Hello from a private endpoint! You need to be authenticated and have a scope of read:messages to see this.'
      });
    });
  });
});

app.get('/api/update-users-db', checkJwt, function(req, res) {
  console.log("Update users DB called");
  if (shell.exec('sqlite3 users.sqlite < import.sql').code !== 0) {
    res.json({
      message: 'SQLite users import completed'
    });
    shell.echo('Error: SQLite3 command failed');
    shell.exit(1);
  } else {
    res.json({
      message: 'SQLite users import completed'
    });
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
            }
            if (logs && 
              Array.isArray(logs) && 
              logs[logs.length-1] && 
              logs[logs.length-1].log_id != undefined &&
              startFrom !== logs[logs.length-1].log_id) {
              startFrom = logs[logs.length-1].log_id;
              for (let i=0; i < logs.length; i++) {
                if (logs[i].type == "limit_wc") {
                  console.log("Log...");
                  console.log(logs[i]);
                }
              }
              res.json({
                message: 'Hello from a private endpoint! You need to be authenticated and have a scope of read:messages to see this.'
              });
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
