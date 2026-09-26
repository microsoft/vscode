/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CodeLens, isExecutableCodeLensCommand } from '../../common/languages.js';

suite('Languages', () => {
	test('CodeLens commands can omit an id', () => {
		const codeLens: CodeLens = {
			range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
			command: { title: 'Information' }
		};

		assert.deepStrictEqual([
			isExecutableCodeLensCommand(codeLens.command),
			isExecutableCodeLensCommand({ id: 'command.id', title: 'Run' })
		], [false, true]);
	});
});
