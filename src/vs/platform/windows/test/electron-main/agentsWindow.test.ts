/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { MessageBoxOptions } from 'electron';
import sinon from 'sinon';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ChatAIDisabledSettingId } from '../../../chat/common/chatSettings.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IDialogMainService } from '../../../dialogs/electron-main/dialogMainService.js';
import { NativeParsedArgs } from '../../../environment/common/argv.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService } from '../../../files/common/files.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentsWindowOpenSource } from '../../../window/common/window.js';
import { ICodeWindow } from '../../../window/electron-main/window.js';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from '../../../workspace/common/workspace.js';
import { checkAgentsWindowEnabled, resolveAgentsWindowFolder, sendAgentsWindowOpenIntent } from '../../electron-main/agentsWindow.js';
import { IOpenConfiguration, OpenContext } from '../../electron-main/windows.js';

suite('Agents window AI opt-out', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	async function checkLaunch(options: {
		disabled?: boolean;
		workspaceDisabled?: boolean;
		policyDisabled?: boolean;
		content?: string;
		readError?: Error;
	}) {
		const configurationService = new TestConfigurationService({ [ChatAIDisabledSettingId]: options.disabled });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const update = sinon.spy(configurationService, 'updateValue');
		sinon.stub(configurationService, 'inspect').returns({ value: options.disabled, policyValue: options.policyDisabled });
		const dialogs: MessageBoxOptions[] = [];
		const dialogService = upcastPartial<IDialogMainService>({
			showMessageBox: async options => {
				dialogs.push(options);
				return { response: 0, checkboxChecked: false };
			},
		});
		const readFile = sinon.stub();
		if (options.readError) {
			readFile.rejects(options.readError);
		} else {
			readFile.resolves(upcastPartial<IFileContent>({
				value: VSBuffer.fromString(options.content ?? JSON.stringify({ folders: [], settings: { [ChatAIDisabledSettingId]: options.workspaceDisabled } })),
			}));
		}
		const enabled = await checkAgentsWindowEnabled(configurationService, dialogService, store.add(new NullLogService()), upcastPartial<IFileService>({ readFile }), URI.file('/agents.code-workspace'));
		return { enabled, disabled: configurationService.getValue(ChatAIDisabledSettingId), updates: update.callCount, dialogs };
	}

	for (const disabled of [true, false, undefined]) {
		test(`preserves the AI-disabled setting (${disabled}) and only explains blocked launches`, async () => {
			assert.deepStrictEqual(await checkLaunch({ disabled }), {
				enabled: disabled !== true,
				disabled,
				updates: 0,
				dialogs: disabled === true ? [{
					type: 'info',
					message: 'AI features are disabled',
					detail: 'Open a VS Code editor window and enable AI features in Settings to use Agents. Your setting has not been changed.',
					buttons: ['OK'],
					defaultId: 0,
					cancelId: 0,
					noLink: true,
				}] : [],
			});
		});
	}

	for (const { disabled, workspaceDisabled, policyDisabled, enabled } of [
		{ disabled: true, workspaceDisabled: false, policyDisabled: undefined, enabled: true },
		{ disabled: false, workspaceDisabled: true, policyDisabled: undefined, enabled: false },
		{ disabled: true, workspaceDisabled: false, policyDisabled: true, enabled: false },
		{ disabled: false, workspaceDisabled: true, policyDisabled: false, enabled: true },
	]) {
		test(`honors user=${disabled}, workspace=${workspaceDisabled}, policy=${policyDisabled}`, async () => {
			const result = await checkLaunch({ disabled, workspaceDisabled, policyDisabled });
			assert.deepStrictEqual({ enabled: result.enabled, userDisabled: result.disabled, updates: result.updates, dialogCount: result.dialogs.length }, {
				enabled, userDisabled: disabled, updates: 0, dialogCount: enabled ? 0 : 1,
			});
		});
	}

	test('reads workspace overrides from commented JSON with trailing commas', async () => {
		assert.deepStrictEqual(await checkLaunch({
			disabled: true,
			content: '{ // Agents workspace\n"settings": { "chat.disableAIFeatures": false, }, "folders": [], }',
		}), { enabled: true, disabled: true, updates: 0, dialogs: [] });
	});

	test('uses the user setting when the Agents workspace has not been created', async () => {
		const result = await checkLaunch({ disabled: true, readError: new FileOperationError('Missing workspace', FileOperationResult.FILE_NOT_FOUND) });
		assert.deepStrictEqual({ enabled: result.enabled, userDisabled: result.disabled, updates: result.updates, dialogCount: result.dialogs.length }, {
			enabled: false, userDisabled: true, updates: 0, dialogCount: 1,
		});
	});

	test('does not silently ignore workspace read failures', async () => {
		await assert.rejects(checkLaunch({ disabled: true, readError: new FileOperationError('Access denied', FileOperationResult.FILE_PERMISSION_DENIED) }), /Access denied/);
	});
});

suite('Agents window reveal intent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const folder = URI.file('/project');
	const session = URI.parse('agent-host-copilot:/session');
	const cli = { _: [] };

	function createHarness() {
		const messages: { channel: string; args: unknown[] }[] = [];
		const window = upcastPartial<ICodeWindow>({
			sendWhenReady: (channel, _token, ...args) => { messages.push({ channel, args }); },
		});
		return { window, messages };
	}

	for (const initiallyOpen of [false, true]) {
		for (const reveal of [undefined, session, 'new'] as const) {
			test(`${initiallyOpen ? 'existing' : 'new'} window with reveal ${reveal ?? 'omitted'}`, () => {
				const harness = createHarness();
				sendAgentsWindowOpenIntent(harness.window, initiallyOpen, { context: OpenContext.API, cli }, {
					folderUri: folder, reveal, revealRemoteAuthority: 'tunnel+box', source: AgentsWindowOpenSource.TitleBar,
				});
				assert.deepStrictEqual(harness.messages, initiallyOpen && reveal === undefined ? [] : [{
					channel: 'vscode:selectAgentsFolder',
					args: [folder.toJSON(), reveal === 'new' ? 'new' : reveal?.toJSON(), AgentsWindowOpenSource.TitleBar, false, undefined, undefined, 'tunnel+box'],
				}]);
			});
		}
	}

	test('a focus-only open does not supersede a pending explicit reveal', () => {
		const harness = createHarness();
		const config = { context: OpenContext.API, cli };
		sendAgentsWindowOpenIntent(harness.window, false, config, { reveal: session });
		sendAgentsWindowOpenIntent(harness.window, true, config, { folderUri: folder });
		assert.deepStrictEqual(harness.messages, [{
			channel: 'vscode:selectAgentsFolder',
			args: [undefined, session.toJSON(), AgentsWindowOpenSource.Unknown, false, undefined, undefined, undefined],
		}]);
	});

	for (const context of [OpenContext.CLI, OpenContext.LINK]) {
		test(`preserves workspace handoff when reusing a window from ${context}`, () => {
			const harness = createHarness();
			sendAgentsWindowOpenIntent(harness.window, true, { context, cli }, { folderUri: folder });
			assert.deepStrictEqual(harness.messages, [{
				channel: 'vscode:selectAgentsFolder',
				args: [folder.toJSON(), undefined, AgentsWindowOpenSource.Unknown, false, undefined, undefined, undefined],
			}]);
		});
	}

	for (const reveal of [undefined, session, 'new'] as const) {
		test(`serializes reveal ${reveal ?? 'omitted'} and only copies drafts for new-session intent`, () => {
			const harness = createHarness();
			const draft = { inputText: 'Editor draft', attachments: '[]' };
			sendAgentsWindowOpenIntent(harness.window, false, { context: OpenContext.API, cli }, {
				folderUri: folder.toJSON(),
				reveal: reveal === 'new' ? 'new' : reveal?.toJSON(),
				draft,
				source: AgentsWindowOpenSource.TitleBar,
			});
			assert.deepStrictEqual(harness.messages, [{
				channel: 'vscode:selectAgentsFolder',
				args: [folder.toJSON(), reveal === 'new' ? 'new' : reveal?.toJSON(), AgentsWindowOpenSource.TitleBar, false, reveal === 'new' ? draft : undefined, undefined, undefined],
			}]);
		});
	}

	test('preserves a new-session deep link draft without a separate reveal argument', () => {
		const harness = createHarness();
		const draft = { inputText: 'Linked draft', attachments: '[]' };
		sendAgentsWindowOpenIntent(harness.window, true, { context: OpenContext.LINK, cli }, { draft, source: AgentsWindowOpenSource.Link });
		assert.deepStrictEqual(harness.messages, [{
			channel: 'vscode:selectAgentsFolder',
			args: [undefined, undefined, AgentsWindowOpenSource.Link, false, draft, undefined, undefined],
		}]);
	});
});

suite('Agents window CLI folder', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const folder = URI.file('/project');
	const resolvedFolder = { workspace: { id: 'project', uri: folder } };

	async function resolveFolder(options: {
		cli?: NativeParsedArgs;
		context?: OpenContext;
		initialStartup?: boolean;
		folderUri?: URI;
		sessionResource?: URI;
		source?: AgentsWindowOpenSource;
		paths?: readonly { readonly workspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier }[];
	} = {}) {
		const calls: NativeParsedArgs[] = [];
		const openConfig: IOpenConfiguration = {
			context: options.context ?? OpenContext.CLI,
			cli: options.cli ?? { _: ['/project'], agents: true },
			initialStartup: options.initialStartup,
		};
		const result = await resolveAgentsWindowFolder(openConfig, options.folderUri, options.sessionResource, options.source, async cli => {
			calls.push(cli);
			return options.paths ?? [resolvedFolder];
		});
		return { folder: result?.toString(), calls };
	}

	for (const initialStartup of [true, false]) {
		test(`selects a CLI folder on ${initialStartup ? 'initial' : 'subsequent'} launch`, async () => {
			assert.deepStrictEqual(await resolveFolder({ initialStartup }), {
				folder: folder.toString(),
				calls: [{ _: ['/project'], agents: true }],
			});
		});
	}

	test('passes relative paths to the existing CLI resolver', async () => {
		const cli = { _: ['./project'], agents: true };
		assert.deepStrictEqual(await resolveFolder({ cli }), { folder: folder.toString(), calls: [cli] });
	});

	test('passes folder URIs to the existing CLI resolver', async () => {
		const cli = { _: [], agents: true, 'folder-uri': [folder.toString()] };
		assert.deepStrictEqual(await resolveFolder({ cli }), { folder: folder.toString(), calls: [cli] });
	});

	test('preserves opening without a resolved folder', async () => {
		const cli = { _: [], agents: true };
		assert.deepStrictEqual(await resolveFolder({ cli, paths: [] }), { folder: undefined, calls: [cli] });
	});

	test('selects the first folder, not files or multi-root workspaces', async () => {
		assert.deepStrictEqual(await resolveFolder({
			paths: [
				{},
				{ workspace: { id: 'multi-root', configPath: URI.file('/project.code-workspace') } },
				resolvedFolder,
				{ workspace: { id: 'second', uri: URI.file('/second') } },
			],
		}), { folder: folder.toString(), calls: [{ _: ['/project'], agents: true }] });
	});

	test('does not select files or multi-root workspaces as folders', async () => {
		assert.deepStrictEqual(await resolveFolder({
			paths: [{}, { workspace: { id: 'multi-root', configPath: URI.file('/project.code-workspace') } }],
		}), { folder: undefined, calls: [{ _: ['/project'], agents: true }] });
	});

	test('preserves an explicit folder over CLI arguments', async () => {
		const explicitFolder = URI.file('/explicit');
		assert.deepStrictEqual(await resolveFolder({ folderUri: explicitFolder }), { folder: explicitFolder.toString(), calls: [] });
	});

	test('preserves an existing-session intent over CLI arguments', async () => {
		assert.deepStrictEqual(await resolveFolder({ sessionResource: URI.parse('agent-host://session/123') }), { folder: undefined, calls: [] });
	});

	test('does not use inherited CLI arguments for a link intent', async () => {
		assert.deepStrictEqual(await resolveFolder({ source: AgentsWindowOpenSource.Link }), { folder: undefined, calls: [] });
	});

	for (const context of [OpenContext.API, OpenContext.DESKTOP, OpenContext.LINK]) {
		test(`does not use inherited CLI arguments in context ${context}`, async () => {
			assert.deepStrictEqual(await resolveFolder({ context }), { folder: undefined, calls: [] });
		});
	}

	test('does not infer a folder without the agents flag', async () => {
		assert.deepStrictEqual(await resolveFolder({ cli: { _: ['/project'] } }), { folder: undefined, calls: [] });
	});

	test('accepts an explicit command-line source', async () => {
		assert.deepStrictEqual(await resolveFolder({ source: AgentsWindowOpenSource.CommandLine }), {
			folder: folder.toString(),
			calls: [{ _: ['/project'], agents: true }],
		});
	});
});
