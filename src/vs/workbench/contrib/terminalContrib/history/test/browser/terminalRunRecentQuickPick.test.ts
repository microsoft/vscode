/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAccessibleViewService } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeyMods, IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickItem, IQuickPickSeparator, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { PosixShellType } from '../../../../../../platform/terminal/common/terminal.js';
import { TerminalCapability, type ITerminalCommand } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { clearShellFileHistory, getCommandHistory, getDirectoryHistory } from '../../common/history.js';
import { isSafeTerminalHistoryText, showRunRecentQuickPick } from '../../browser/terminalRunRecentQuickPick.js';

type TestItem = IQuickPickItem & { rawLabel: string };

class TestQuickPick extends mock<IQuickPick<TestItem, { useSeparators: true }>>() {
	private readonly _onDidAccept = new Emitter<{ inBackground: boolean }>();
	private readonly _onDidHide = new Emitter<IQuickInputHideEvent>();

	override items: readonly (TestItem | IQuickPickSeparator)[] = [];
	override activeItems: readonly TestItem[] = [];
	override selectedItems: readonly TestItem[] = [];
	override value = '';
	override buttons = [];
	override placeholder: string | undefined;
	override matchOnLabelMode: 'fuzzy' | 'contiguous' = 'contiguous';
	override sortByLabel = false;
	override readonly keyMods: IKeyMods = { alt: false, ctrlCmd: false, shift: false };
	override readonly onDidAccept = this._onDidAccept.event;
	override readonly onDidHide = this._onDidHide.event;
	override readonly onDidTriggerButton = Event.None;
	override readonly onDidTriggerItemButton = Event.None;
	override readonly onDidTriggerSeparatorButton = Event.None;
	override readonly onDidChangeValue = Event.None;
	override readonly onDidChangeActive = Event.None;

	override show(): void { }
	override hide(): void { this._onDidHide.fire({ reason: QuickInputHideReason.Other }); }
	override dispose(): void {
		this._onDidAccept.dispose();
		this._onDidHide.dispose();
	}

	fireAccept(item: TestItem, alt = false): void {
		this.activeItems = [item];
		(this.keyMods as { alt: boolean }).alt = alt;
		this._onDidAccept.fire({ inBackground: false });
	}
}

class TestQuickInputService extends mock<IQuickInputService>() {
	lastQuickPick: TestQuickPick | undefined;

	override createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
	override createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: false }>;
	override createQuickPick<T extends IQuickPickItem>(): IQuickPick<T, { useSeparators: boolean }> {
		this.lastQuickPick = new TestQuickPick();
		return this.lastQuickPick as unknown as IQuickPick<T, { useSeparators: boolean }>;
	}
}

suite('TerminalRunRecentQuickPick', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	const quickInputService = new TestQuickInputService();
	let storageService: InMemoryStorageService;
	let shellHistoryContent = '';

	suiteSetup(() => {
		instantiationService = new TestInstantiationService();
		storageService = new InMemoryStorageService();
		instantiationService.stub(IInstantiationService, instantiationService);
		instantiationService.stub(IQuickInputService, quickInputService);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({
			terminal: { integrated: { shellIntegration: { history: 100 } } }
		}));
		instantiationService.stub(IAccessibleViewService, { showLastProvider: () => { } } as Partial<IAccessibleViewService>);
		instantiationService.stub(IEditorService, {} as Partial<IEditorService>);
		instantiationService.stub(IPathService, { fileURI: async (path: string) => URI.file(path) } as Partial<IPathService>);
		instantiationService.stub(ITextModelService, {
			registerTextModelContentProvider: () => toDisposable(() => { })
		} as Partial<ITextModelService>);
		instantiationService.stub(IModelService, {} as Partial<IModelService>);
		instantiationService.stub(IRemoteAgentService, {
			getEnvironment: async () => ({ os: OperatingSystem.Linux, userHome: URI.file('/home/test') }),
			getConnection: () => null
		} as Partial<IRemoteAgentService>);
		instantiationService.stub(IFileService, {
			readFile: async () => ({ value: VSBuffer.fromString(shellHistoryContent) })
		} as unknown as Partial<IFileService>);
		instantiationService.invokeFunction(getCommandHistory);
		instantiationService.invokeFunction(getDirectoryHistory);
	});

	suiteTeardown(() => {
		instantiationService.dispose();
		storageService.dispose();
	});

	const contextKey = {
		set: () => { },
		reset: () => { },
		get: () => false
	} as IContextKey<boolean>;

	function command(command: string, isTrusted: boolean): ITerminalCommand {
		return {
			command,
			isTrusted,
			cwd: '/workspace',
			timestamp: Date.now(),
			exitCode: 0,
			hasOutput: () => false,
			getOutput: () => undefined,
		} as ITerminalCommand;
	}

	function instance(options: {
		commands?: ITerminalCommand[];
		executingCommand?: string;
		executingCommandTrusted?: boolean;
		cwds?: string[];
		runCommands?: { text: string; execute: boolean }[];
	}): ITerminalInstance {
		const runCommands = options.runCommands ?? [];
		const commandDetection = {
			commands: options.commands ?? [],
			executingCommand: options.executingCommand,
			executingCommandObject: options.executingCommand === undefined ? undefined : { isTrusted: options.executingCommandTrusted },
			cwd: '/workspace',
		};
		return {
			xterm: {
				markTracker: {
					saveScrollState: () => { },
					restoreScrollState: () => { },
					clear: () => { },
					revealRange: () => { },
				}
			},
			capabilities: {
				get: (capability: TerminalCapability) => capability === TerminalCapability.CommandDetection
					? commandDetection
					: capability === TerminalCapability.CwdDetection
						? { cwds: options.cwds ?? [] }
						: undefined
			},
			shellType: PosixShellType.Bash,
			userHome: '/home/test',
			os: OperatingSystem.Linux,
			remoteAuthority: undefined,
			instanceId: 1,
			cols: 80,
			getUriLabelForShell: async (resource: URI) => resource.fsPath,
			preparePathForShell: async (path: string | URI) => `'${typeof path === 'string' ? path : path.fsPath}'`,
			runCommand: (text: string, execute: boolean) => { runCommands.push({ text, execute }); },
			scrollToBottom: () => { },
			focus: () => { },
		} as unknown as ITerminalInstance;
	}

	async function openQuickPick(terminalInstance: ITerminalInstance, type: 'command' | 'cwd'): Promise<{ quickPick: TestQuickPick; completion: Promise<void> }> {
		const completion = instantiationService.invokeFunction(showRunRecentQuickPick, terminalInstance, contextKey, type);
		await timeout(0);
		assert.ok(quickInputService.lastQuickPick);
		return { quickPick: quickInputService.lastQuickPick, completion };
	}

	setup(() => {
		instantiationService.invokeFunction(getCommandHistory).clear();
		instantiationService.invokeFunction(getDirectoryHistory).clear();
		clearShellFileHistory();
		shellHistoryContent = '';
	});

	test('rejects terminal control characters', () => {
		const rejected = [0x00, 0x08, 0x09, 0x0A, 0x0D, 0x1B, 0x1F, 0x7F, 0x80, 0x85, 0x9B, 0x9F];
		assert.deepStrictEqual(
			rejected.map(code => isSafeTerminalHistoryText(`echo${String.fromCharCode(code)}value`)),
			rejected.map(() => false)
		);
		assert.deepStrictEqual(
			['echo value', `echo${String.fromCharCode(0x7E)}value`, `echo${String.fromCharCode(0xA0)}value`].map(isSafeTerminalHistoryText),
			[true, true, true]
		);
	});

	test('filters untrusted commands and blocked duplicate history labels', async () => {
		const unsafePersisted = `persisted${String.fromCharCode(0x1B)}command`;
		instantiationService.invokeFunction(getCommandHistory).add('blocked', { shellType: PosixShellType.Bash });
		instantiationService.invokeFunction(getCommandHistory).add('previous-only', { shellType: PosixShellType.Bash });
		instantiationService.invokeFunction(getCommandHistory).add(unsafePersisted, { shellType: PosixShellType.Bash });
		shellHistoryContent = 'blocked\nshell-only';

		const { quickPick, completion } = await openQuickPick(instance({
			commands: [command('trusted', true), command('blocked', false)]
		}), 'command');
		const labels = quickPick.items.flatMap(item => item.type === 'separator' ? [] : [item.rawLabel]);

		assert.ok(labels.includes('trusted'));
		assert.ok(labels.includes('previous-only'));
		assert.ok(labels.includes('shell-only'));
		assert.ok(!labels.includes('blocked'));
		assert.ok(!labels.includes(unsafePersisted));
		quickPick.hide();
		await completion;
	});

	test('accepts safe run and edit commands and rejects unsafe final text', async () => {
		const runCommands: { text: string; execute: boolean }[] = [];

		for (const alt of [false, true]) {
			const { quickPick, completion } = await openQuickPick(instance({
				commands: [command('echo safe', true)],
				runCommands
			}), 'command');
			const item = quickPick.items.find((item): item is TestItem => 'rawLabel' in item && item.rawLabel === 'echo safe');
			assert.ok(item);
			quickPick.fireAccept(item, alt);
			await completion;
			await timeout(0);
		}

		const { quickPick, completion } = await openQuickPick(instance({
			commands: [command('echo safe', true)],
			runCommands
		}), 'command');
		const item = quickPick.items.find((item): item is TestItem => 'rawLabel' in item && item.rawLabel === 'echo safe');
		assert.ok(item);
		item.rawLabel = `echo${String.fromCharCode(0x1B)}unsafe`;
		quickPick.fireAccept(item);
		await completion;
		await timeout(0);

		assert.deepStrictEqual(runCommands, [
			{ text: 'echo safe', execute: true },
			{ text: 'echo safe', execute: false },
		]);
	});

	test('filters unsafe directory history before display and dispatch', async () => {
		const unsafeCwd = `/workspace/${String.fromCharCode(0x1B)}cwd`;
		const unsafePersistedCwd = `/persisted/${String.fromCharCode(0x1B)}cwd`;
		const runCommands: { text: string; execute: boolean }[] = [];
		instantiationService.invokeFunction(getDirectoryHistory).add(unsafePersistedCwd, {});

		const { quickPick, completion } = await openQuickPick(instance({
			cwds: ['/workspace/safe', unsafeCwd],
			runCommands
		}), 'cwd');
		const labels = quickPick.items.flatMap(item => item.type === 'separator' ? [] : [item.rawLabel]);
		assert.deepStrictEqual(labels, ['/workspace/safe']);

		const item = quickPick.items.find((item): item is TestItem => 'rawLabel' in item);
		assert.ok(item);
		quickPick.fireAccept(item);
		await completion;
		await timeout(0);

		assert.deepStrictEqual(runCommands, [{ text: 'cd \'/workspace/safe\'', execute: true }]);
	});
});
