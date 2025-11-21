/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

import es from 'event-stream';
import vfs from 'vinyl-fs';
import { stylelintFilter } from './filters.js';
import { getVariableNameValidator } from './lib/stylelint/validateVariableNames.ts';

/**
 * use regex on lines
 *
 * @param {(arg0: string, arg1: boolean) => void} reporter
 */
export default function gulpstylelint(reporter) {
	const variableValidator = getVariableNameValidator();
	let errorCount = 0;
	const monacoWorkbenchPattern = /\.monaco-workbench/;
	const restrictedPathPattern = /^src[\/\\]vs[\/\\](base|platform|editor)[\/\\]/;
	const layerCheckerDisablePattern = /\/\*\s*stylelint-disable\s+layer-checker\s*\*\//;

	return es.through(function (file) {
		/** @type {string[]} */
		const lines = file.__lines || file.contents.toString('utf8').split(/\r\n|\r|\n/);
		file.__lines = lines;

		const isRestrictedPath = restrictedPathPattern.test(file.relative);

		// Check if layer-checker is disabled for the entire file
		const isLayerCheckerDisabled = lines.some(line => layerCheckerDisablePattern.test(line));

		lines.forEach((line, i) => {
			variableValidator(line, unknownVariable => {
				reporter(file.relative + '(' + (i + 1) + ',1): Unknown variable: ' + unknownVariable, true);
				errorCount++;
			});

			if (isRestrictedPath && !isLayerCheckerDisabled && monacoWorkbenchPattern.test(line)) {
				reporter(file.relative + '(' + (i + 1) + ',1): The class .monaco-workbench cannot be used in files under src/vs/{base,platform,editor} because only src/vs/workbench applies it', true);
				errorCount++;
			}
		});

		this.emit('data', file);
	}, function () {
		if (errorCount > 0) {
			reporter('All valid variable names are in `build/lib/stylelint/vscode-known-variables.json`\nTo update that file, run `./scripts/test-documentation.sh|bat.`', false);
		}
		this.emit('end');
	}
	);
}

function stylelint() {
	return vfs
		.src(stylelintFilter, { base: '.', follow: true, allowEmpty: true })
		.pipe(gulpstylelint((message, isError) => {
			if (isError) {
				console.error(message);
			} else {
				console.info(message);
			}
		}))
		.pipe(es.through(function () { /* noop, important for the stream to end */ }));
}

if (import.meta.main) {
	stylelint().on('error', (err) => {
		console.error();
		console.error(err);
		process.exit(1);
	});
}
