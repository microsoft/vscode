/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { commands, Uri } from 'vscode';
import { join, basename, normalize, dirname } from 'path';
import * as fs from 'fs';

function assertUnchangedTokens(testFixurePath: string, done) {
	let fileName = basename(testFixurePath);

	return commands.executeCommand('_workbench.captureSyntaxTokens', Uri.file(testFixurePath)).then(data => {
		try {
			let resultsFolderPath = join(dirname(dirname(testFixurePath)), 'colorize-results');
			if (!fs.existsSync(resultsFolderPath)) {
				fs.mkdirSync(resultsFolderPath);
			}
			let resultPath = join(resultsFolderPath, fileName.replace('.', '_') + '.json');
			if (fs.existsSync(resultPath)) {
				let previousData = JSON.parse(fs.readFileSync(resultPath).toString());
				try {
					assert.deepEqual(data, previousData);
				} catch (e) {
					fs.writeFileSync(resultPath, JSON.stringify(data, null, '\t'), { flag: 'w' });
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

suite('colorization', () => {
	let extensionsFolder = normalize(join(__dirname, '../../'));
	let extensions = fs.readdirSync(extensionsFolder);
	extensions.forEach(extension => {
		let extensionColorizeFixturePath = join(extensionsFolder, extension, 'test', 'colorize-fixtures');
		if (fs.existsSync(extensionColorizeFixturePath)) {
			let fixturesFiles = fs.readdirSync(extensionColorizeFixturePath);
			fixturesFiles.forEach(fixturesFile => {
				// define a test for each fixture
				test(extension + '-' + fixturesFile, function (done) {
					assertUnchangedTokens(join(extensionColorizeFixturePath, fixturesFile), done);
				});
			});
		}
	});
});
