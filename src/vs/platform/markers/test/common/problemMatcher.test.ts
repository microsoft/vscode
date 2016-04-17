/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import assert = require('assert');

import * as Types from 'vs/base/common/types';

import Severity from 'vs/base/common/severity';
import {createLineMatcher, ProblemMatcher, ProblemPattern, ApplyToKind, FileLocationKind} from 'vs/platform/markers/common/problemMatcher';

suite('Problem Matcher', () => {
	test('default location for single line matcher', () => {
		let problemMatcher = <ProblemMatcher>{
			owner: "external",
			applyTo: ApplyToKind.allDocuments,
			fileLocation: FileLocationKind.Absolute,
			pattern: <ProblemPattern>{
				regexp: /([a-z]+) abc/,
				file: 1,
				message: 0
			}
		};
		var lineMatcher = createLineMatcher(problemMatcher);
		var result = lineMatcher.handle(["filename abc"]);
		assert.ok(result.match);
		assert.ok(!result.continue);
		assert.ok(Types.isUndefined(result.match.marker.code));
		assert.equal(result.match.marker.severity, Severity.Error);
		assert.equal(result.match.marker.message, "filename abc");
		assert.ok(Types.isUndefined(result.match.marker.source));
		assert.equal(result.match.marker.startLineNumber, 1);
		assert.equal(result.match.marker.startColumn, 1);
		assert.equal(result.match.marker.endLineNumber, 1);
		assert.equal(result.match.marker.endColumn, Number.MAX_VALUE);
	});

	test('default location for multi line matcher', () => {
		let problemMatcher = <ProblemMatcher>{
			owner: "external",
			applyTo: ApplyToKind.allDocuments,
			fileLocation: FileLocationKind.Absolute,
			pattern: [
				<ProblemPattern>{
					regexp: /file = ([a-z]+)/,
					file: 1,
					message: 0
				},
				<ProblemPattern>{
					regexp: /severity = ([a-z]+)/,
					severity: 1
				}
			]
		};
		var lineMatcher = createLineMatcher(problemMatcher);
		var result = lineMatcher.handle(["file = filename", "severity = warning"]);
		assert.ok(result.match);
		assert.ok(!result.continue);
		assert.ok(Types.isUndefined(result.match.marker.code));
		assert.equal(result.match.marker.severity, Severity.Warning);
		assert.equal(result.match.marker.message, "file = filename");
		assert.ok(Types.isUndefined(result.match.marker.source));
		assert.equal(result.match.marker.startLineNumber, 1);
		assert.equal(result.match.marker.startColumn, 1);
		assert.equal(result.match.marker.endLineNumber, 1);
		assert.equal(result.match.marker.endColumn, Number.MAX_VALUE);
	})
});