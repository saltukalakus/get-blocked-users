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

	DB.prototype.close = function() {
		self._db.close();
	};

};

module.exports = DB;