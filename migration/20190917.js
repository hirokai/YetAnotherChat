const { exec } = require('child_process');
exec('sqlite3 server/private/db.sqlite3 < migration/20190917.sql', (err, stdout, stderr) => {
});
