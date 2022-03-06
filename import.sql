DROP TABLE IF EXISTS users;
CREATE TABLE users (user_id varchar(255) not null, email varchar(255) not null);
.separator ,
.import download.csv users
