const { exec } = require('child_process');
exec('sqlite3 server/private/db.sqlite3 < migration/20190830.sql', (err, stdout, stderr) => {
    if (err) {
        // node couldn't execute the command
        return;
    }

    // the *entire* stdout and stderr (buffered)
    console.log(`stdout: ${stdout}`);
    console.log(`stderr: ${stderr}`);
});
