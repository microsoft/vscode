/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import 'mocha';
import { join, normalize } from 'path';
import { commands, Uri } from 'vscode';

function assertUnchangedTokens(fixturesPath: string, resultsPath: string, fixture: string, done: any) {
	const testFixurePath = join(fixturesPath, fixture);

	return commands.executeCommand('_workbench.captureSyntaxTokens', Uri.file(testFixurePath)).then(data => {
		try {
			if (!fs.existsSync(resultsPath)) {
				fs.mkdirSync(resultsPath);
			}
			const resultPath = join(resultsPath, fixture.replace('.', '_') + '.json');
			if (fs.existsSync(resultPath)) {
				const previousData = JSON.parse(fs.readFileSync(resultPath).toString());
				try {
					assert.deepStrictEqual(data, previousData);
				} catch (e) {
					fs.writeFileSync(resultPath, JSON.stringify(data, null, '\t'), { flag: 'w' });
					if (Array.isArray(data) && Array.isArray(previousData) && data.length === previousData.length) {
						for (let i = 0; i < data.length; i++) {
							const d = data[i];
							const p = previousData[i];
							if (d.c !== p.c || hasThemeChange(d.r, p.r)) {
								throw e;
							}
						}
						// different but no tokenization ot color change: no failure
					} else {
						throw e;
					}
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

function hasThemeChange(d: any, p: any): boolean {
	const keys = Object.keys(d);
	for (const key of keys) {
		if (d[key] !== p[key]) {
			return true;
		}
	}
	return false;
}

suite('colorization', () => {
	const testPath = normalize(join(__dirname, '../test'));
	const fixturesPath = join(testPath, 'colorize-fixtures');
	const resultsPath = join(testPath, 'colorize-results');

	for (const fixture of fs.readdirSync(fixturesPath)) {
		test(`colorize: ${fixture}`, function (done) {
			commands.executeCommand('workbench.action.closeAllEditors').then(() => {
				assertUnchangedTokens(fixturesPath, resultsPath, fixture, done);
			});
		});
	}
});
