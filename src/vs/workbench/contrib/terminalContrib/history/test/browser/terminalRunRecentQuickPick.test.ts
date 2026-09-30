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
import { showRunRecentQuickPick } from '../../browser/terminalRunRecentQuickPick.js';

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
	}): ITerminalInstance {
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
					: undefined
			},
			shellType: PosixShellType.Bash,
			userHome: '/home/test',
			os: OperatingSystem.Linux,
			remoteAuthority: undefined,
			instanceId: 1,
			cols: 80,
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

	test('lists only trusted commands from the current session', async () => {
		const { quickPick, completion } = await openQuickPick(instance({
			commands: [command('trusted', true), command('untrusted', false)],
			executingCommand: 'untrusted executing',
			executingCommandTrusted: false,
		}), 'command');
		const labels = quickPick.items.flatMap(item => item.type === 'separator' ? [] : [item.rawLabel]);
		quickPick.hide();
		await completion;

		assert.deepStrictEqual(labels, ['trusted']);
	});
});
