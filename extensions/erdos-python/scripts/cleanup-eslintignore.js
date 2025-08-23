const fs = require('fs');
const path = require('path');

const baseDir = process.cwd();
const eslintignorePath = path.join(baseDir, '.eslintignore');

fs.readFile(eslintignorePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading .eslintignore file:', err);
        return;
    }

    const lines = data.split('\n');
    const files = lines.map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
    const nonExistentFiles = [];

    files.forEach((file) => {
        const filePath = path.join(baseDir, file);
        if (!fs.existsSync(filePath) && file !== 'pythonExtensionApi/out/') {
            nonExistentFiles.push(file);
        }
    });

    if (nonExistentFiles.length > 0) {
        console.log('The following files listed in .eslintignore do not exist:');
        nonExistentFiles.forEach((file) => console.log(file));

        const updatedLines = lines.filter((line) => {
            const trimmedLine = line.trim();
            return !nonExistentFiles.includes(trimmedLine) || trimmedLine === 'pythonExtensionApi/out/';
        });
        const updatedData = `${updatedLines.join('\n')}\n`;

        fs.writeFile(eslintignorePath, updatedData, 'utf8', (err) => {
            if (err) {
                console.error('Error writing to .eslintignore file:', err);
                return;
            }
            console.log('Non-existent files have been removed from .eslintignore.');
        });
    } else {
        console.log('All files listed in .eslintignore exist.');
    }
});
