var sqlite3 = require('sqlite3').verbose();
var fs = require('fs');

var DB = function() {
	var self = this;
	self._db = null;
	self._dbName = 'users.sqlite';
	
	DB.prototype.open = function(cb) {
		if(self._db) {
			cb();
		} else {
			
			fs.exists(self._dbName, function(exists) {
				self._db = new sqlite3.Database(self._dbName);
				if(!exists) {
					cb("Users DB is empthy!");
				} else {
					cb();
				}
			});

		}
	};
	DB.prototype.findUser = function(email, cb) {
		self.open(function() {
			self._db.get('select * from users where email=?', email, function(err, row) {
				var result = null;
				if(row !== undefined) {
					result = row;
				}
				cb(err, result);
			});
		});
	};

	DB.prototype.addUser = function(user_id, email, cb) {
		self.findUser(user_id, function(err, result) {
			if(result) {
				//update
				self._update(user_id, email, function(err) {
					if(err) {
						console.log(err);

					}
					cb(err);
				});
			} else {
				//insert
				self._insert(user_id, email, function(err) {
					if(err) {
						console.log(err);
					}
					cb(err);
				});
			}
		});
	};

	DB.prototype._update = function(user_id, email, cb) {
		self.open(function() {
			self._db.run('update users set email=? where user_id=?', email, user_id, function(err) {
				cb(err);
			});
		});
	};

	DB.prototype._insert = function(user_id, email, cb) {
		self.open(function() {
			self._db.run('insert into users(user_id,email) values(?,?)', user_id, email, function(err) {
				cb(err);
			});
		});
	};

	DB.prototype.deleteUser = function(user_id, cb) {
		self.open(function() {
			self._db.run('delete from users where user_id=?', user_id, function(err) {
				cb(err);
			});
		});
	};

	DB.prototype.close = function() {
		self._db.close();
	};

};

module.exports = DB;