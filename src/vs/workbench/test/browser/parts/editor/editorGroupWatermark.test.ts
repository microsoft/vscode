/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord, ResolvedKeybinding } from '../../../../../base/common/keybindings.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { isMacintosh, isWeb, OS } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { EditorGroupWatermark } from '../../../../browser/parts/editor/editorGroupWatermark.js';
import { TestContextService } from '../../../common/workbenchTestServices.js';
import { workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('EditorGroupWatermark', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let container: HTMLElement;
	let configurationService: TestConfigurationService;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let keybindings: Map<string, ResolvedKeybinding>;
	let keybindingsChanged: Emitter<void>;
	let workbenchState: WorkbenchState;
	let chatEnabled: boolean;

	function keybinding(keyCode: KeyCode): ResolvedKeybinding {
		return new USLayoutResolvedKeybinding([new KeyCodeChord(!isMacintosh, false, false, isMacintosh, keyCode)], OS);
	}

	function render(): void {
		disposables.add(instantiationService.createInstance(EditorGroupWatermark, container));
	}

	function rows() {
		return [...container.querySelectorAll('dl')].map(row => ({
			label: row.querySelector('.watermark-label')?.textContent,
			icon: row.querySelector('.codicon')?.className,
			iconHidden: row.querySelector('.codicon')?.getAttribute('aria-hidden'),
			keybinding: row.querySelector('.monaco-keybinding')?.getAttribute('aria-label'),
		}));
	}

	setup(() => {
		container = append(document.body, $('.editor-group-container.empty'));
		disposables.add(toDisposable(() => container.remove()));
		configurationService = new TestConfigurationService({ workbench: { tips: { enabled: true } } });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, disposables);
		keybindingsChanged = disposables.add(new Emitter<void>());
		keybindings = new Map([
			['workbench.action.chat.open', keybinding(KeyCode.KeyI)],
			['workbench.action.showCommands', keybinding(KeyCode.KeyP)],
			['workbench.action.openSettings', keybinding(KeyCode.Comma)],
		]);
		workbenchState = WorkbenchState.FOLDER;
		chatEnabled = true;
		instantiationService.stub(IKeybindingService, new class extends MockKeybindingService {
			override get onDidUpdateKeybindings() { return keybindingsChanged.event; }
			override lookupKeybinding(id: string) { return keybindings.get(id); }
		});
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules() { return chatEnabled; }
		});
		instantiationService.stub(IWorkspaceContextService, new class extends TestContextService {
			override getWorkbenchState() { return workbenchState; }
		});

		for (const id of [
			...keybindings.keys(),
			'workbench.action.quickOpen',
			'workbench.action.files.openFile',
			'workbench.action.files.openFolder',
			'workbench.action.files.openFileFolder',
			'workbench.action.openRecent',
			'workbench.action.files.newUntitledFile',
			'workbench.action.findInFiles',
			'workbench.action.terminal.toggleTerminal',
			'workbench.action.debug.start',
		]) {
			disposables.add(CommandsRegistry.registerCommand(id, () => { }));
		}
	});

	test('renders shortcut labels with decorative icons and standard keybinding labels', () => {
		render();

		assert.deepStrictEqual(rows(), [
			{ label: 'Open Chat', icon: 'codicon codicon-watermark-chat', iconHidden: 'true', keybinding: keybindings.get('workbench.action.chat.open')?.getAriaLabel() },
			{ label: 'Show All Commands', icon: 'codicon codicon-watermark-commands', iconHidden: 'true', keybinding: keybindings.get('workbench.action.showCommands')?.getAriaLabel() },
			{ label: 'Open Settings', icon: 'codicon codicon-watermark-settings', iconHidden: 'true', keybinding: keybindings.get('workbench.action.openSettings')?.getAriaLabel() },
		]);
	});

	test('updates keybindings without duplicating rows or icons and removes unbound shortcuts', () => {
		render();
		const updatedKeybinding = keybinding(KeyCode.KeyO);
		keybindings.set('workbench.action.chat.open', updatedKeybinding);
		keybindings.delete('workbench.action.openSettings');
		keybindingsChanged.fire();
		keybindingsChanged.fire();

		assert.deepStrictEqual({
			labels: rows().map(row => row.label),
			icons: container.querySelectorAll('.codicon').length,
			keybinding: rows()[0].keybinding,
		}, {
			labels: ['Open Chat', 'Show All Commands'],
			icons: 2,
			keybinding: updatedKeybinding.getAriaLabel(),
		});
	});

	test('keeps chat hidden when its context condition does not match', () => {
		chatEnabled = false;
		render();

		assert.deepStrictEqual(rows().map(row => row.label), ['Show All Commands', 'Open Settings']);
	});

	test('respects the tips setting when disabled and re-enabled', async () => {
		render();
		const setTipsEnabled = async (enabled: boolean) => {
			await configurationService.setUserConfiguration('workbench.tips.enabled', enabled);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set(['workbench.tips.enabled']),
				change: { keys: ['workbench.tips.enabled'], overrides: [] },
				affectsConfiguration: key => key === 'workbench.tips.enabled',
			});
		};

		await setTipsEnabled(false);
		keybindingsChanged.fire();
		const hiddenRows = rows();
		await setTipsEnabled(true);

		assert.deepStrictEqual({ hiddenRows, labels: rows().map(row => row.label) }, {
			hiddenRows: [],
			labels: ['Open Chat', 'Show All Commands', 'Open Settings'],
		});
	});

	test('renders file and folder icons in an empty window', () => {
		workbenchState = WorkbenchState.EMPTY;
		for (const id of ['openFile', 'openFolder', 'openFileFolder', 'newUntitledFile']) {
			keybindings.set(`workbench.action.files.${id}`, keybinding(KeyCode.KeyO));
		}
		keybindings.set('workbench.action.openRecent', keybinding(KeyCode.KeyR));
		render();

		assert.deepStrictEqual(rows().map(row => row.icon), [
			'codicon codicon-watermark-chat',
			'codicon codicon-watermark-commands',
			'codicon codicon-watermark-open-recent',
			...(isMacintosh && !isWeb ? ['codicon codicon-watermark-open-file-folder', 'codicon codicon-watermark-new-file'] : ['codicon codicon-watermark-open-file', 'codicon codicon-watermark-open-folder']),
		]);
	});

	for (const [id, icon] of [
		['workbench.action.quickOpen', 'watermark-quick-open'],
		['workbench.action.findInFiles', 'watermark-find-in-files'],
		['workbench.action.terminal.toggleTerminal', 'watermark-terminal'],
		['workbench.action.debug.start', 'watermark-debug'],
	]) {
		test(`renders the icon for ${id}`, () => {
			keybindings.delete('workbench.action.openSettings');
			keybindings.set(id, keybinding(KeyCode.KeyT));
			render();

			assert.strictEqual(rows()[2].icon, `codicon codicon-${icon}`);
		});
	}
});
