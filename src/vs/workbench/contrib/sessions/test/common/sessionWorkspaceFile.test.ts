/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseSessionWorkspaceFile, stringifySessionWorkspaceFile } from '../../common/sessionWorkspaceFile.js';

suite('SessionWorkspaceFile', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const file = URI.file('/work/platform.code-workspace');

	function parse(content: string) {
		const parsed = parseSessionWorkspaceFile(content, file, extUri);
		return { ...parsed, folders: parsed.folders.map(folder => folder.path) };
	}

	test('reads the name, icon and color, naming a file without a name after its file and skipping invalid folders', () => {
		assert.deepStrictEqual({
			named: parse('{ "name": " Platform ", "icon": "rocket", "color": "#00AA00", "folders": [{ "path": "vscode" }, { "uri": "file:///work/docs" }] }'),
			unnamed: parse('{ "name": " ", "icon": 1, "folders": [{ "path": "/abs" }, { "nope": true }, "x"] }'),
		}, {
			named: { name: 'Platform', icon: 'rocket', color: '#00AA00', folders: ['/work/vscode', '/work/docs'] },
			unnamed: { name: 'platform', folders: ['/abs'] },
		});
	});

	test('rejects content that is not a workspace file', () => {
		assert.throws(() => parseSessionWorkspaceFile('{ "folders": ', file, extUri), /is not a valid workspace file/);
		assert.throws(() => parseSessionWorkspaceFile('{ "name": "x" }', file, extUri), /is not a valid workspace file/);
	});

	test('writes the icon and color as properties of a workspace file, keeping its comments and the rest of it, and removes them again', () => {
		const content = '{\n\t// my workspace\n\t"folders": [{ "path": "vscode" }],\n\t"settings": {\n\t\t"a": 1 // one\n\t}\n}\n';

		const written = stringifySessionWorkspaceFile(file, { icon: 'rocket', color: 'charts.blue' }, extUri, { existing: content });
		const removed = stringifySessionWorkspaceFile(file, { icon: null, color: null }, extUri, { existing: written });

		assert.deepStrictEqual({ written, removed }, {
			written: '{\n\t// my workspace\n\t"folders": [{ "path": "vscode" }],\n\t"settings": {\n\t\t"a": 1 // one\n\t},\n\t"icon": "rocket",\n\t"color": "charts.blue"\n}\n',
			removed: content,
		});
	});

	test('writes a new workspace file with folders relative to it, or absolute when asked', () => {
		const folders = [URI.file('/work/vscode'), URI.file('/other/docs')];

		assert.deepStrictEqual({
			relative: JSON.parse(stringifySessionWorkspaceFile(file, { name: 'Platform', folders }, extUri)),
			absolute: JSON.parse(stringifySessionWorkspaceFile(file, { folders }, extUri, { forceAbsolute: true })),
		}, {
			relative: { folders: [{ path: 'vscode' }, { path: '../other/docs' }], name: 'Platform' },
			absolute: { folders: [{ path: '/work/vscode' }, { path: '/other/docs' }] },
		});
	});
});
