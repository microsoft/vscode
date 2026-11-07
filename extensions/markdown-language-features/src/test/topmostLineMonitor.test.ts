/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { TopmostLineMonitor } from '../preview/topmostLineMonitor';

suite('Markdown topmost line monitor', () => {
	test('Hands the preview scroll line to the text editor only once', () => {
		const monitor = new TopmostLineMonitor();
		try {
			const resource = vscode.Uri.parse('test:/workspace/readme.md');
			monitor.setPreviousStaticEditorLine({ uri: resource, line: 10 });

			assert.deepStrictEqual(
				[monitor.getPreviousStaticEditorLineByUri(resource), monitor.getPreviousStaticEditorLineByUri(resource)],
				[10, undefined],
			);
		} finally {
			monitor.dispose();
		}
	});
});
