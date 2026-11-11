/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildLinkDevContainerStateCommand, devContainerStateFallbackTarget, devContainerStateWorkspacesTarget, findDevContainerStateMount, getDefaultDevContainerIdLabels, getDevContainerId, getDevContainerStateMountTarget, IDevContainerStateLinkOptions, parseLinkDevContainerStateOutput } from '../../node/devContainerState.js';

suite('DevContainerState', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const linkOptions: IDevContainerStateLinkOptions = { volumePath: '/workspaces', homeFolder: '/home/node', uid: '1000', gid: '1000', serverDataFolderName: '.vscode-server' };

	test('computes the same devcontainerId as the Dev Containers CLI', () => {
		// Expected values are from the CLI's devcontainerIdForLabels.
		assert.deepStrictEqual([
			getDevContainerId(['devcontainer.config_file=/home/user/project/.devcontainer/devcontainer.json', 'devcontainer.local_folder=/home/user/project']),
			getDevContainerId(['vsch.local.repository=https://github.com/a/b=c']),
		], [
			'0ns9efvs2cg80a2avksvk7nqv06jrab7n2918j79h49700ucligl',
			'13v0hj1tukgk70ajudelqmn28hqv5df9d095kklumc70cmut8n8a',
		]);
	});

	test('normalizes Windows id labels like the Dev Containers CLI', () => {
		assert.deepStrictEqual(getDefaultDevContainerIdLabels('win32', 'C:\\Users\\me\\project\\', 'C:/Users/me/project/.devcontainer/devcontainer.json'), [
			'devcontainer.local_folder=c:\\Users\\me\\project',
			'devcontainer.config_file=c:\\Users\\me\\project\\.devcontainer\\devcontainer.json',
		]);
	});

	test('mounts the state volume at /workspaces only when nothing else uses it', () => {
		const cases: [string, Parameters<typeof getDevContainerStateMountTarget>][] = [
			['default', [{}]],
			['workspace mount inside /workspaces', [{ workspaceMount: 'type=bind,source=/src,target=/workspaces/src' }]],
			['mount inside /workspaces', [{ mounts: ['source=cache,target=/workspaces/cache,type=volume'] }]],
			['Compose', [{ dockerComposeFile: 'compose.yml' }]],
			['empty workspace mount', [{ workspaceMount: '' }]],
			['workspace mount elsewhere', [{ workspaceMount: 'source=/src,target=/src,type=bind' }]],
			['string mount', [{ mounts: ['source=data,target=/workspaces,type=volume'] }]],
			['object mount', [{ mounts: [{ source: 'data', target: '/workspaces/', type: 'volume' }] }]],
			['runArgs', [{ runArgs: ['-v', 'data:/workspaces'] }]],
			['additional mount', [{}, ['type=volume,source=repo,target=/workspaces,external=true']]],
		];
		assert.deepStrictEqual(cases.map(([name, args]) => [name, getDevContainerStateMountTarget(...args)]), [
			['default', devContainerStateWorkspacesTarget],
			['workspace mount inside /workspaces', devContainerStateWorkspacesTarget],
			['mount inside /workspaces', devContainerStateWorkspacesTarget],
			['Compose', devContainerStateFallbackTarget],
			['empty workspace mount', devContainerStateFallbackTarget],
			['workspace mount elsewhere', devContainerStateFallbackTarget],
			['string mount', devContainerStateFallbackTarget],
			['object mount', devContainerStateFallbackTarget],
			['runArgs', devContainerStateFallbackTarget],
			['additional mount', devContainerStateFallbackTarget],
		]);
	});

	test('finds only state volume mounts', () => {
		const name = `vscode-state-${'0'.repeat(52)}`;
		assert.deepStrictEqual(findDevContainerStateMount([
			{ Type: 'volume', Name: 'vscode' },
			{ Type: 'bind', Name: name },
			{ Type: 'volume', Name: `${name}0` },
			{ Type: 'volume', Name: name },
		]), { Type: 'volume', Name: name });
	});

	test('rejects unsafe link options', () => {
		for (const options of [
			{ volumePath: 'workspaces' },
			{ volumePath: '/' },
			{ homeFolder: 'home/node' },
			{ uid: 'node' },
			{ gid: '1000; true' },
			{ serverDataFolderName: '..' },
			{ serverDataFolderName: '.vscode-server/data' },
		]) {
			assert.throws(() => buildLinkDevContainerStateCommand({ ...linkOptions, ...options }), /Invalid Dev Container state folder or user/, JSON.stringify(options));
		}
	});

	(isWindows ? test.skip : test)('builds a valid shell script', () => {
		const result = spawnSync('/bin/sh', ['-n', '-c', buildLinkDevContainerStateCommand({ ...linkOptions, homeFolder: '/home/o\'brien' })], { encoding: 'utf8' });
		assert.deepStrictEqual({ status: result.status, stderr: result.stderr }, { status: 0, stderr: '' });
	});

	test('parses link progress for telemetry', () => {
		const output = ['volume', 'stateFolder', 'statePath', 'stateLink', 'home', 'mountinfo', 'folders'].map(step => `vscode-state:step:${step}`).concat([
			'vscode-state:folder:restored',
			'vscode-state:folder:moved',
			'vscode-state:folder:moved',
			'vscode-state:folder:created',
			'vscode-state:folder:existing',
			'vscode-state:folder:other',
			'vscode-state:skip:symlink',
			'vscode-state:skip:mounted',
			'vscode-state:skip:mounted',
			'vscode-state:skip:/home/node',
			'vscode-state:step:/home/node',
			'unrelated output',
		]).join('\r\n');
		assert.deepStrictEqual([
			parseLinkDevContainerStateOutput(output),
			parseLinkDevContainerStateOutput('vscode-state:step:volume\nvscode-state:step:home\nvscode-state:noHome\n'),
			parseLinkDevContainerStateOutput(''),
		], [
			{ step: 'folders', homeFound: true, restoredFolders: 1, movedFolders: 2, createdFolders: 1, existingFolders: 1, skippedFolders: 4, skipReasons: 'mounted,symlink,unknown' },
			{ step: 'home', homeFound: false, restoredFolders: 0, movedFolders: 0, createdFolders: 0, existingFolders: 0, skippedFolders: 0, skipReasons: '' },
			{ step: undefined, homeFound: true, restoredFolders: 0, movedFolders: 0, createdFolders: 0, existingFolders: 0, skippedFolders: 0, skipReasons: '' },
		]);
	});
});
