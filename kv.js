var sqlite3 = require('sqlite3').verbose();
var fs = require('fs');

var DB = function() {
	var self = this;
	self._db = null;
	self._dbName = 'settings.sqlite';
	
	DB.prototype.open = function(cb) {
		if(self._db) {
			cb();
		} else {
			
			fs.exists(self._dbName, function(exists) {
				self._db = new sqlite3.Database(self._dbName);
				if(!exists) {
					console.info('Creating database. This may take a while...');
					self._db.exec('CREATE TABLE data (key TEXT, value TEXT);CREATE INDEX idx_key ON data ( key );', function(err) {
						if(err) throw err;
						console.info('Done.');
					});
				}
				cb();
			});

		}
	};
	DB.prototype.get = function(key, cb) {
		self.open(function() {
			//console.log(self._db);
			self._db.get('select value from data where key=?', key, function(err, row) {
				var result = null;
				if(row !== undefined) {
					//console.log(row);
					result = JSON.parse(row.value);
					//console.log(result);
				}
				//console.log(row);
				cb(err, result);
			});
		});
	};

	DB.prototype.set = function(key, value, cb) {
		self.get(key, function(err, result) {
			if(result) {
				//update
				self._update(key, value, function(err) {
					if(err) {
						console.log(err);

					}
					cb(err);
				});
			} else {
				//insert
				self._insert(key, value, function(err) {
					if(err) {
						console.log(err);
					}
					cb(err);
				});
			}
		});
	};

	DB.prototype._update = function(key, value, cb) {
		self.open(function() {
			self._db.run('update data set value=? where key=?', JSON.stringify(value), key, function(err) {
				cb(err);
			});
		});
	};

	DB.prototype._insert = function(key, value, cb) {
		self.open(function() {
			self._db.run('insert into data(key,value) values(?,?)', key, JSON.stringify(value), function(err) {
				cb(err);
			});
		});
	};

	DB.prototype.rm = function(key, cb) {
		self.open(function() {
			self._db.run('delete from data where key=?', key, function(err) {
				cb(err);
			});
		});
	};
	DB.prototype.forEach = function(cb, done) {
		self.open(function() {
			self._db.each('select key,value from data', function(err, row) {
				//console.
				cb(row.key, JSON.parse(row.value));
			}, done);
		});
	};

	DB.prototype.close = function() {
		self._db.close();
	};

};

module.exports = DB;