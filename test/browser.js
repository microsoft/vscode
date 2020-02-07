/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const express = require('express');
const glob = require('glob');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '../');
const PORT = 8887;

function template(str, env) {
	return str.replace(/{{\s*([\w_\-]+)\s*}}/g, function (all, part) {
		return env[part];
	});
}

var app = express();

app.use('/out', express.static(path.join(REPO_ROOT, 'out')));
app.use('/test', express.static(path.join(REPO_ROOT, 'test')));
app.use('/node_modules', express.static(path.join(REPO_ROOT, 'node_modules')));

app.get('/', function (req, res) {
	glob('**/vs/{base,platform,editor}/**/test/{common,browser}/**/*.test.js', {
		cwd: path.join(REPO_ROOT, 'out'),
		// ignore: ['**/test/{node,electron*}/**/*.js']
	}, function (err, files) {
		if (err) { return res.sendStatus(500); }

		var modules = files
			.map(function (file) { return file.replace(/\.js$/, ''); });

		fs.readFile(path.join(__dirname, 'index.html'), 'utf8', function (err, templateString) {
			if (err) { return res.sendStatus(500); }

			res.send(template(templateString, {
				modules: JSON.stringify(modules)
			}));
		});
	});
});

app.listen(PORT, function () {
	console.log('http://localhost:8887/');
});
