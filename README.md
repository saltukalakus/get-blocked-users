## get-blocked-users
Auth0 logs shows all blocks including non-existing users. This API server checks the logs for the exsiting users and returns only the exsiting blocked users.

### Setup 

* Create an API on APIs section with Signing Algorithm selected as RS256 and 
Identifier set to https://blocked-users


* Create an M2M application and give permissions for the API server and the Auth0 management API with following scopes:

read:logs
read:logs_users
read:users

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

* Check the user export status and update the local SQLite when completed. This endpoint may need to be pooled until the export file is ready by Auth0.

curl --request GET \
  --url http://localhost:3010/api/update-users-db \
  --header 'authorization: Bearer eyJhb..REDACTED'

* Get the blocked exiting users 

curl --request GET \
  --url http://localhost:3010/api/check-logs \
  --header 'authorization: Bearer eyJhb..REDACTED'


### TODOS: 
* Works for a single regular Auth0 DB on a tenant. It could be implemented to support all Auth0 connections on the tenant.
