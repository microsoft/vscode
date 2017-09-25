/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cp = require('child_process');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function updateGrammar(location) {
	const result = cp.spawnSync(npm, ['run', 'update-grammar'], {
		cwd: location,
		stdio: 'inherit'
	});

	if (result.error || result.status !== 0) {
		process.exit(1);
	}
}

const extensions = [
	// 'bat'   Grammar no longer available
	'clojure',
	'coffeescript',
	'cpp',
	'csharp',
	'css',
	'diff',
	'docker',
	'fsharp',
	'gitsyntax',
	'go',
	'groovy',
	'handlebars',
	'hlsl',
	'html',
	'ini',
	'java',
	// 'javascript',  updated through JavaScript
	'json',
	'less',
	'lua',
	'make',
	'markdown',
	'objective-c',
	'perl',
	'php',
	// 'powershell', grammar not ready yet, @daviwil will ping when ready
	'pug',
	'python',
	'r',
	'razor',
	'ruby',
	'rust',
	'scss',
	'shaderlab',
	'shellscript',
	// 'sql', customized, PRs pending
	'swift',
	'typescript',
	'vb',
	'xml',
	'yaml'
];

extensions.forEach(extension => updateGrammar(`extensions/${extension}`));

// run integration tests

if (process.platform === 'win32') {
	cp.spawn('.\scripts\test-integration.bat', [], { env: process.env, stdio: 'inherit' });
} else {
	cp.spawn('/bin/bash', ['./scripts/test-integration.sh'], { env: process.env, stdio: 'inherit' });
}