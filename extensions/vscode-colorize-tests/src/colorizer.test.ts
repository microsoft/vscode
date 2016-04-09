/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {commands, Uri} from 'vscode';
import {join, basename, normalize, dirname} from 'path';
import * as fs from 'fs';

function assertUnchangedTokens(testFixurePath:string, done) {
	let fileName = basename(testFixurePath);

	return commands.executeCommand('_workbench.captureSyntaxTokens', Uri.file(testFixurePath)).then(data => {
		try {
			let resultsFolderPath = join(dirname(dirname(testFixurePath)), 'colorize-results');
			let resultPath = join(resultsFolderPath, fileName.replace('.', '_') + '.json');
			if (fs.existsSync(resultPath)) {
				let previosData = JSON.parse(fs.readFileSync(resultPath).toString());
				try {
					assert.deepEqual(data, previosData);
				} catch (e) {
					let errorResultPath = join(resultsFolderPath, fileName.replace('.', '_') + '.error.json');
					fs.writeFileSync(errorResultPath, JSON.stringify(data, null, '\t'));
					throw e;
				}
			} else {
				fs.writeFileSync(resultPath, JSON.stringify(data, null, '\t'));
			}
			done();
		} catch (e) {
			done(e);
		}
	}, done);
}

suite("colorization", () => {
	let extensionsFolder = normalize(join(__dirname, '../../'));
	console.log(extensionsFolder);
	let extensions = fs.readdirSync(extensionsFolder);
	extensions.forEach(extension => {
		let extensionColorizeFixurePath = join(extensionsFolder, extension, 'test', 'colorize-fixtures');
		if (fs.existsSync(extensionColorizeFixurePath)) {
			console.log(extensionColorizeFixurePath);
			let fixturesFiles = fs.readdirSync(extensionColorizeFixurePath);
			fixturesFiles.forEach(fixturesFile => {
				// define a test for each fixture
				test(extension + '-' + fixturesFile, function(done) {
					assertUnchangedTokens(join(extensionColorizeFixurePath, fixturesFile), done);
				});
			});
		}
	});
});
