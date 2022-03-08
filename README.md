## get-blocked-users
Auth0 logs shows the account lock events for all attempts including the ones for the non-existing users in the tenant. This project returns the logs for the user blocks for the exsiting users only. For the API to work it is required to export the users from the connection and then start the log polling with /api/check-logs endpoint. This API exports the logs and returns a JSON response for the users who are blocked. 

### Setup 

* Create an API on APIs section with Signing Algorithm set to RS256 and API Identifier set to https://blocked-users


<img width="1782" alt="Screen Shot 2022-03-09 at 00 53 36" src="https://user-images.githubusercontent.com/815705/157334562-87a37605-4788-43b1-b804-e2f7be617e43.png">


* Create an M2M application and give permissions for the above API server and the Auth0 management API with the following scopes:

```
read:logs
read:logs_users
read:users
```

<img width="1779" alt="Screen Shot 2022-03-09 at 00 54 28" src="https://user-images.githubusercontent.com/815705/157334670-4e10f343-2ead-4731-9fec-17f20c4e8933.png">

<img width="1723" alt="Screen Shot 2022-03-09 at 01 05 09" src="https://user-images.githubusercontent.com/815705/157334704-9011887d-de18-408c-98cd-f4097c84c3bb.png">

<img width="1539" alt="Screen Shot 2022-03-09 at 01 05 31" src="https://user-images.githubusercontent.com/815705/157334723-e42305e6-cd91-4153-b2a2-b5eea20a7655.png">

* Create .env and change the settings according to your tenant.

```
> cp .env.example .env
```

* For local testing make sure you have sqlite3 installed on the computer.

* Install dependencies.

```
> cd get-blocked-users
> npm install
```

### Run the app on localhost:3010

```
> cd get-blocked-users
> npm start
```

### API usage:

* Get the access token for the API:

```
curl --request POST \
  --url https://saltukalakus.auth0.com/oauth/token \
  --header 'content-type: application/json' \
  --data '{"client_id":"IcsImdrWr2poWoKCj3gehKGX3aEQZmn7","client_secret":"5L2vQ1..REDACTED","audience":"https://blocked-users","grant_type":"client_credentials"}'
  ```

* Start the user export

```
curl --request GET \
  --url http://localhost:3010/api/export-users \
  --header 'authorization: Bearer eyJhb..REDACTED'
```

* Check the user export status and update the local SQLite when completed. This endpoint may need to be pooled until the export file is ready by Auth0. Once the export compeles successfull you don't need to export again as the application keep tracks of new signups and user deletions by checking the logs.

```
curl --request GET \
  --url http://localhost:3010/api/update-users-db \
  --header 'authorization: Bearer eyJhb..REDACTED'
```

* Get the blocked exiting users. The endpoint needs to be queried periodically. However for this API to work, the user export and local database update steps should be completed with the above two endpoints.

```
curl --request GET \
  --url http://localhost:3010/api/check-logs \
  --header 'authorization: Bearer eyJhb..REDACTED'
```

### TODO: 
* Works for a single regular Auth0 DB on a tenant. It could be implemented to support all Auth0 connections on the tenant.
