/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

var fs = require('fs');
var cp = require('child_process');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var ROOT_NODE_MODULES_PATH = path.join(ROOT, 'node_modules');
var EDITOR_ROOT = path.join(ROOT, 'build/monaco')
var EDITOR_NODE_MODULES_PATH = path.join(EDITOR_ROOT, 'node_modules')

var cmd = `npm install`;
cp.execSync(cmd, {
	cwd: EDITOR_ROOT,
	stdio:[0,1,2]
});

if (!fs.existsSync(ROOT_NODE_MODULES_PATH)) {
	fs.mkdirSync(ROOT_NODE_MODULES_PATH);
}

// Move deps over
var modules = fs.readdirSync(EDITOR_NODE_MODULES_PATH);
modules.forEach(function(module) {
	var src = path.join(EDITOR_NODE_MODULES_PATH, module);
	var dst = path.join(ROOT_NODE_MODULES_PATH, module);
	if (!fs.existsSync(dst)) {
		console.log('Moving ' + module + '...');
		fs.renameSync(src, dst);
	} else {
		console.log('Skipping moving ' + module + '.');
	}
});
