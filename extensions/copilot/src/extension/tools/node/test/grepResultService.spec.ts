/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { expect, suite, test } from 'vitest';
import { URI } from '../../../../util/vs/base/common/uri';
import { Range } from '../../../../vscodeTypes';
import { GrepResultService, NullGrepResultService } from '../grepResultService';

suite('GrepResultService', () => {
	const uri = URI.file('/file.ts');

	function createMatch(range: vscode.Range): vscode.TextSearchMatch2 {
		return {
			uri,
			previewText: '',
			ranges: [{
				previewRange: range,
				sourceRange: range,
			}]
		};
	}

	test('returns all ranges within the inclusive line bounds', () => {
		const before = new Range(3, 0, 3, 1);
		const first = new Range(4, 2, 4, 5);
		const second = new Range(8, 1, 8, 7);
		const after = new Range(9, 0, 9, 1);
		const service = new GrepResultService();
		service.addGrepResult('request', {
			files: [{ uri, matches: [before, first, second, after].map(createMatch) }]
		});

		expect(service.getGrepResult('request', uri, 4, 8)).toEqual([first, second]);
	});

	test('returns undefined when no results are available', () => {
		const service = new GrepResultService();

		expect(service.getGrepResult('unknown', uri, 0, 10)).toBeUndefined();
		expect(new NullGrepResultService().getGrepResult('request', uri, 0, 10)).toBeUndefined();
	});
});
