/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const fs = require('fs');
const path = require('path');

function generate(name) {
    const root = path.join(__dirname, '..', 'chat');
    const files = [
        { dir: 'services', file: `${name}.js`, content: `// Service: ${name}\n` },
        { dir: 'ui', file: `${name}.js`, content: `// UI: ${name}\n` },
        { dir: 'tests', file: `${name}.test.js`, content: `// Test: ${name}\n` }
    ];
    for (const f of files) {
        const dir = path.join(root, f.dir);
        fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, f.file);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, f.content);
            console.log(`Created ${filePath}`);
        } else {
            console.log(`Skipped ${filePath} (exists)`);
        }
    }
}

function run() {
    const root = path.join(__dirname, '..', 'chat');
    console.log('Watching chat directory for changes...');
    fs.watch(root, { recursive: true }, (event, filename) => {
        if (filename) {
            console.log(`File ${filename} changed (${event}).`);
        }
    });
}

function main() {
    const args = process.argv.slice(2);
    const cmd = args[0];
    if (cmd === 'generate') {
        const name = args[1];
        if (!name) {
            console.error('Usage: chat-cli.js generate <name>');
            process.exit(1);
        }
        generate(name);
    } else if (cmd === 'run') {
        run();
    } else {
        console.log('Usage: chat-cli.js <command>\n');
        console.log('Commands:\n  generate <name>  Create boilerplate files.\n  run              Start the chat in watch mode.');
    }
}

main();
