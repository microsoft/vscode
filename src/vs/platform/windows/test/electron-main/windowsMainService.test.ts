/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { FileAccess } from '../../../../base/common/network.js';
import { relative } from '../../../../base/common/path.js';
import { cwd } from '../../../../base/common/process.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NativeParsedArgs } from '../../../environment/common/argv.js';
import { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { IFileService } from '../../../files/common/files.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentsWindowOpenSource } from '../../../window/common/window.js';
import { ICodeWindow } from '../../../window/electron-main/window.js';
import { IWorkspacesManagementMainService } from '../../../workspaces/electron-main/workspacesManagementMainService.js';
import { IOpenConfiguration, OpenContext } from '../../electron-main/windows.js';
import type { WindowsMainService } from '../../electron-main/windowsMainService.js';

suite('WindowsMainService - Agents CLI', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const folder = FileAccess.asFileUri('vs/platform/windows');
	let windowsMainServiceClass: typeof WindowsMainService;

	suiteSetup(async function () {
		// The window manager requires Electron's main-process APIs.
		if (process.type !== 'browser') {
			this.skip();
			return;
		}
		windowsMainServiceClass = (await import('../../electron-main/windowsMainService.js')).WindowsMainService;
	});

	async function openAgents(cli: NativeParsedArgs, options: { initialStartup?: boolean; folderUri?: URI; sessionResource?: URI; source?: AgentsWindowOpenSource } = {}) {
		const messages: { channel: string; args: unknown[] }[] = [];
		const configurations: IOpenConfiguration[] = [];
		const window = new class extends mock<ICodeWindow>() {
			override sendWhenReady(channel: string, _token: CancellationToken, ...args: unknown[]): void {
				messages.push({
					channel, args: [
						URI.revive(args[0] as UriComponents | undefined)?.toString(),
						URI.revive(args[1] as UriComponents | undefined)?.toString(),
						...args.slice(2),
					]
				});
			}
		};
		const service: WindowsMainService = Object.assign(Object.create(windowsMainServiceClass.prototype), {
			logService: store.add(new NullLogService()),
			environmentMainService: new class extends mock<IEnvironmentMainService>() {
				override agentSessionsWorkspace = URI.file('/agents.code-workspace');
			},
			fileService: new class extends mock<IFileService>() {
				override async exists(): Promise<boolean> { return true; }
			},
			workspacesManagementMainService: new class extends mock<IWorkspacesManagementMainService>() {
				override async resolveLocalWorkspace() { return undefined; }
			},
			open: async (config: IOpenConfiguration) => {
				configurations.push(config);
				return [window];
			},
		});

		await service.openAgentsWindow({
			context: OpenContext.CLI,
			cli,
			initialStartup: options.initialStartup,
		}, options.folderUri, options.sessionResource, options.source);

		return { messages, configurations };
	}

	function expectedMessage(folderUri?: URI, sessionResource?: URI, source = AgentsWindowOpenSource.CommandLine) {
		return [{
			channel: 'vscode:selectAgentsFolder',
			args: [folderUri?.toString(), sessionResource?.toString(), source, false, undefined, undefined],
		}];
	}

	for (const initialStartup of [true, false]) {
		test(`selects a CLI folder on ${initialStartup ? 'initial' : 'subsequent'} launch`, async () => {
			const result = await openAgents({ _: [folder.fsPath], agents: true }, { initialStartup });
			assert.deepStrictEqual({
				messages: result.messages,
				urisToOpen: result.configurations[0].urisToOpen,
			}, {
				messages: expectedMessage(folder),
				urisToOpen: [{ workspaceUri: URI.file('/agents.code-workspace') }],
			});
		});
	}

	test('resolves a relative CLI folder', async () => {
		const result = await openAgents({ _: [relative(cwd(), folder.fsPath)], agents: true });
		assert.deepStrictEqual(result.messages, expectedMessage(folder));
	});

	test('selects a folder URI', async () => {
		const result = await openAgents({ _: [], agents: true, 'folder-uri': [folder.toString()] });
		assert.deepStrictEqual(result.messages, expectedMessage(folder));
	});

	test('preserves opening without a folder', async () => {
		const result = await openAgents({ _: [], agents: true });
		assert.deepStrictEqual(result.messages, expectedMessage());
	});

	test('does not select files as folders', async () => {
		const file = FileAccess.asFileUri('vs/platform/windows/electron-main/windowsMainService.js');
		const result = await openAgents({ _: [file.fsPath], agents: true });
		assert.deepStrictEqual(result.messages, expectedMessage());
	});

	test('preserves an explicit folder over CLI arguments', async () => {
		const explicitFolder = URI.file('/explicit');
		const result = await openAgents({ _: [folder.fsPath], agents: true }, { folderUri: explicitFolder });
		assert.deepStrictEqual(result.messages, expectedMessage(explicitFolder));
	});

	test('preserves an existing-session intent over CLI arguments', async () => {
		const sessionResource = URI.parse('agent-host://session/123');
		const result = await openAgents({ _: [folder.fsPath], agents: true }, { sessionResource });
		assert.deepStrictEqual(result.messages, expectedMessage(undefined, sessionResource));
	});

	test('does not use inherited CLI arguments for a link intent', async () => {
		const result = await openAgents({ _: [folder.fsPath], agents: true }, { source: AgentsWindowOpenSource.Link });
		assert.deepStrictEqual(result.messages, expectedMessage(undefined, undefined, AgentsWindowOpenSource.Link));
	});
});
