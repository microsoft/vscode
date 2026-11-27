/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionWorkspaceFile } from '../../common/sessionWorkspaceFile.js';
import { localDrive, localFile, pathOf } from './sessionWorkspaceTestPaths.js';

suite('SessionWorkspaceFile', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const file = localFile('/work/platform.code-workspace');
	const workspaceFile = new SessionWorkspaceFile(extUri);

	function parse(content: string, remoteAuthority?: string) {
		const parsed = workspaceFile.parse(content, file, { remoteAuthority });
		return { ...parsed, folders: parsed.folders.map(pathOf) };
	}

	test('reads the name, icon and color, naming a file without a name after its file and skipping invalid folders', () => {
		assert.deepStrictEqual({
			named: parse('{ "name": " Platform ", "icon": "rocket", "color": "#00AA00", "folders": [{ "path": "vscode" }, { "uri": "file:///work/docs" }] }'),
			unnamed: parse('{ "name": " ", "icon": 1, "folders": [{ "path": "/abs" }, { "nope": true }, "x"] }'),
		}, {
			named: { name: 'Platform', icon: 'rocket', color: '#00AA00', folders: ['/work/vscode', '/work/docs'], hasErrors: false },
			unnamed: { name: 'platform', folders: ['/abs'], hasErrors: true },
		});
	});

	test('rejects content that is not a workspace file', () => {
		assert.throws(() => workspaceFile.parse('{ "folders": ', file), /is not a valid workspace file/);
		assert.throws(() => workspaceFile.parse('{ "name": "x" }', file), /is not a valid workspace file/);
		assert.throws(() => workspaceFile.parse('{ "folders": [{ "uri": "no scheme" }] }', file), /is not a valid workspace file/);
	});

	test('skips folder paths in a local file of a remote workspace, which are paths on the remote and not on this computer', () => {
		assert.deepStrictEqual({
			stored: parse('{ "remoteAuthority": "ssh-remote+box", "folders": [{ "path": "/home/me/vscode" }, { "uri": "vscode-remote://ssh-remote+box/home/me/docs" }] }'),
			recent: parse('{ "folders": [{ "path": "/home/me/vscode" }] }', 'wsl+Ubuntu'),
		}, {
			stored: { name: 'platform', folders: ['/home/me/docs'], hasErrors: true },
			recent: { name: 'platform', folders: [], hasErrors: true },
		});
	});

	test('never writes content that is not a workspace file', () => {
		assert.throws(() => workspaceFile.stringify(file, { icon: 'rocket' }, { existing: '{ "folders": ' }), /is not a valid workspace file/);
		assert.throws(() => workspaceFile.stringify(file, { name: 'Platform' }), /is not a valid workspace file/);
	});

	test('writes the icon and color as properties of a workspace file, keeping its comments and the rest of it, and removes them again', () => {
		const content = '{\n\t// my workspace\n\t"folders": [{ "path": "vscode" }],\n\t"settings": {\n\t\t"a": 1 // one\n\t}\n}\n';

		const written = workspaceFile.stringify(file, { icon: 'rocket', color: 'charts.blue' }, { existing: content });
		const removed = workspaceFile.stringify(file, { icon: null, color: null }, { existing: written });

		assert.deepStrictEqual({ written, removed }, {
			written: '{\n\t// my workspace\n\t"folders": [{ "path": "vscode" }],\n\t"settings": {\n\t\t"a": 1 // one\n\t},\n\t"icon": "rocket",\n\t"color": "charts.blue"\n}\n',
			removed: content,
		});
	});

	test('writes a new workspace file with folders relative to it, or absolute when asked', () => {
		const folders = [localFile('/work/vscode'), localFile('/other/docs')];

		assert.deepStrictEqual({
			relative: JSON.parse(workspaceFile.stringify(file, { name: 'Platform', folders })),
			absolute: JSON.parse(workspaceFile.stringify(file, { folders }, { forceAbsolute: true })),
		}, {
			relative: { folders: [{ path: 'vscode' }, { path: '../other/docs' }], name: 'Platform' },
			absolute: { folders: [{ path: `${localDrive}/work/vscode` }, { path: `${localDrive}/other/docs` }] },
		});
	});

	test('changing the folders keeps the folder entries that are not read, and writes folders as URIs in a local file of a remote workspace', () => {
		const content = '{ "remoteAuthority": "ssh-remote+box", "folders": [{ "path": "/home/me/vscode" }, { "uri": "vscode-remote://ssh-remote+box/home/me/docs" }, { "nope": true }] }';

		const written = workspaceFile.stringify(file, { folders: [URI.parse('vscode-remote://ssh-remote+box/home/me/chat'), URI.file('/work/vscode')] }, { existing: content });
		const recent = workspaceFile.stringify(file, { folders: [URI.file('/work/docs')] }, { existing: '{ "folders": [{ "path": "/home/me/vscode" }] }', remoteAuthority: 'wsl+Ubuntu' });

		assert.deepStrictEqual({ written: JSON.parse(written).folders, recent: JSON.parse(recent).folders }, {
			written: [{ uri: 'vscode-remote://ssh-remote+box/home/me/chat' }, { uri: 'file:///work/vscode' }, { path: '/home/me/vscode' }, { nope: true }],
			recent: [{ uri: 'file:///work/docs' }, { path: '/home/me/vscode' }],
		});
	});

	test('changing the folders keeps the names given to them, which workspace folder variables refer to', () => {
		const local = workspaceFile.stringify(file, { folders: [localFile('/work/vscode-docs'), localFile('/work/vscode'), localFile('/work/chat')] }, {
			existing: '{ "folders": [{ "path": "vscode", "name": "Code" }, { "path": "vscode-docs", "name": "Docs" }] }',
		});
		const remote = workspaceFile.stringify(file, { folders: [URI.parse('vscode-remote://ssh-remote+box/home/me/chat'), URI.parse('vscode-remote://ssh-remote+box/home/me/docs')] }, {
			existing: '{ "remoteAuthority": "ssh-remote+box", "folders": [{ "uri": "vscode-remote://ssh-remote+box/home/me/docs", "name": "Docs" }] }',
		});

		assert.deepStrictEqual({ local: JSON.parse(local).folders, remote: JSON.parse(remote).folders }, {
			local: [{ name: 'Docs', path: 'vscode-docs' }, { name: 'Code', path: 'vscode' }, { path: 'chat' }],
			remote: [{ uri: 'vscode-remote://ssh-remote+box/home/me/chat' }, { name: 'Docs', uri: 'vscode-remote://ssh-remote+box/home/me/docs' }],
		});
	});
});
