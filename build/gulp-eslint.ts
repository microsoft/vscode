/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ESLint } from 'eslint';
import fancyLog from 'fancy-log';
import { relative } from 'path';
import { Transform, type TransformOptions } from 'stream';

interface ESLintResults extends Array<ESLint.LintResult> {
	errorCount: number;
	warningCount: number;
}

interface EslintAction {
	(results: ESLintResults): void;
}

export default function eslint(action: EslintAction) {
	const linter = new ESLint({});
	const formatter = linter.loadFormatter('compact');

	const results: ESLintResults = Object.assign([], { errorCount: 0, warningCount: 0 });

	return createTransform(
		async (file, _enc, cb) => {
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

function createTransform(
	transform: TransformOptions['transform'],
	flush: TransformOptions['flush']
): Transform {
	return new Transform({
		objectMode: true,
		transform,
		flush
	});
}
