/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const { ESLint } = require('eslint');
const { Transform } = require('stream');
const { relative } = require('path');
const fancyLog = require('fancy-log');

/**
 * @param {Function} action - A function to handle all ESLint results
 * @returns {stream} gulp file stream
 */
function eslint(action) {
	const linter = new ESLint({});
	const formatter = linter.loadFormatter('compact');

	const results = [];
	results.errorCount = 0;
	results.warningCount = 0;

	return transform(
		async (file, enc, cb) => {
			const filePath = relative(process.cwd(), file.path);

			if (file.isNull()) {
				cb(null, file);
				return;
			}

			if (file.isStream()) {
				cb(new Error('vinyl files with Stream contents are not supported'));
				return;
			}

			try {
				// TODO: Should this be checked?
				if (await linter.isPathIgnored(filePath)) {
					cb(null, file);
					return;
				}

				const result = (await linter.lintText(file.contents.toString(), { filePath }))[0];
				results.push(result);
				results.errorCount += result.errorCount;
				results.warningCount += result.warningCount;

				const message = (await formatter).format([result]);
				if (message) {
					fancyLog(message);
				}
				cb(null, file);
			} catch (error) {
				cb(error);
			}
		},
		(done) => {
			try {
				action(results);
				done();
			} catch (error) {
				done(error);
			}
		});
}

function transform(transform, flush) {
	return new Transform({
		objectMode: true,
		transform,
		flush
	});
}

module.exports = eslint;
