/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import { useRunnerNodeForServer } from '../../azure-pipelines/common/useRunnerNodeForServer.ts';

suite('useRunnerNodeForServer', () => {

	test('copies the runner\'s Node.js only when the server needs that version and does not have it yet', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'use-runner-node-for-server-'));
		try {
			const runnerNode = path.join(root, 'runner', 'node');
			fs.mkdirSync(path.dirname(runnerNode));
			fs.writeFileSync(runnerNode, 'runner');
			const serverNode = (name: string) => path.join(root, '.build', 'node', name, 'darwin-arm64', 'node');
			fs.mkdirSync(path.dirname(serverNode('present')), { recursive: true });
			fs.writeFileSync(serverNode('present'), 'downloaded');

			const results = {
				copied: useRunnerNodeForServer(serverNode('copied'), '24.22.1', runnerNode, 'v24.22.1'),
				present: useRunnerNodeForServer(serverNode('present'), '24.22.1', runnerNode, 'v24.22.1'),
				versionMismatch: useRunnerNodeForServer(serverNode('versionMismatch'), '24.22.1', runnerNode, 'v24.21.0'),
				copyFailure: (() => {
					try {
						return useRunnerNodeForServer(serverNode('copyFailure'), '24.22.1', path.join(root, 'missing'), 'v24.22.1');
					} catch (error) {
						return (error as NodeJS.ErrnoException).code;
					}
				})(),
			};

			assert.deepStrictEqual({
				results,
				contents: { copied: fs.readFileSync(serverNode('copied'), 'utf8'), present: fs.readFileSync(serverNode('present'), 'utf8') },
				copiedIsExecutable: process.platform === 'win32' || (fs.statSync(serverNode('copied')).mode & 0o111) === 0o111,
				// `npm run gulp node` skips the download when the platform folder exists.
				platformFolders: Object.keys(results).filter(name => fs.existsSync(path.dirname(serverNode(name)))),
			}, {
				results: { copied: 'copied', present: 'present', versionMismatch: 'versionMismatch', copyFailure: 'ENOENT' },
				contents: { copied: 'runner', present: 'downloaded' },
				copiedIsExecutable: true,
				platformFolders: ['copied', 'present'],
			});
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
