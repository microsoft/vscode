/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getActiveElement } from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IEditorResolverService, RegisteredEditorInfo } from '../../../../services/editor/common/editorResolverService.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IVisibleEditorPane } from '../../../../common/editor.js';
import { IUntitledDocumentTelemetryService } from '../../../../services/untitled/common/untitledDocumentTelemetry.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { IChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { EmptyEditorHintActionsWidget } from '../../browser/emptyTextEditorHint/emptyEditorHintActions.js';
import { EmptyTextEditorHintContentWidget } from '../../browser/emptyTextEditorHint/emptyTextEditorHint.js';
import { startsTextInput } from '../../browser/emptyTextEditorHint/emptyEditorHintFocus.js';

suite('EmptyEditorHintActionsWidget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('lists the available actions, offers the last chosen editor first and logs the actions that are used', async () => {
		const events: unknown[] = [];
		const commands: unknown[][] = [];
		const callbacks: string[] = [];

		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ITelemetryService, upcastPartial<ITelemetryService>({
			...NullTelemetryService,
			publicLog2: (eventName: string, data?: unknown) => { events.push({ eventName, data }); },
		}));
		instantiationService.stub(IUntitledDocumentTelemetryService, upcastPartial<IUntitledDocumentTelemetryService>({ getUntitledDocumentId: () => 'doc-1' }));
		instantiationService.stub(IChatAgentService, upcastPartial<IChatAgentService>({ getActivatedAgents: () => [], onDidChangeAgents: Event.None }));
		instantiationService.stub(IEditorResolverService, upcastPartial<IEditorResolverService>({
			getEditors: () => [upcastPartial<RegisteredEditorInfo>({ id: 'default', label: 'Text Editor' }), upcastPartial<RegisteredEditorInfo>({ id: 'vscode.markdown.editor', label: 'Markdown Editor' }), upcastPartial<RegisteredEditorInfo>({ id: 'hexEditor.hexedit', label: 'Hex Editor' })],
			onDidChangeEditorRegistrations: Event.None,
		}));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async (...args: unknown[]) => { commands.push(args); return undefined; },
			onWillExecuteCommand: Event.None,
			onDidExecuteCommand: Event.None,
		}));
		const contextKeyService = store.add(new ContextKeyService(instantiationService.get(IConfigurationService)));
		contextKeyService.createKey(ChatContextKeys.enabled.key, true);
		instantiationService.stub(IContextKeyService, contextKeyService);
		// The editor last chosen from the hint is offered first
		instantiationService.get(IStorageService).store('emptyEditorHint.lastUntitledEditor', 'hexEditor.hexedit', StorageScope.PROFILE, StorageTarget.USER);

		const model = store.add(createTextModel('', undefined, undefined, URI.from({ scheme: 'untitled', path: 'Untitled-1' })));
		const editor = store.add(createTestCodeEditor(model));

		// This editor is selected in its group together with another tab: the reopen commands must only act on this editor
		const thisInput = upcastPartial<EditorInput>({});
		const otherInput = upcastPartial<EditorInput>({});
		let selectedEditors = [thisInput, otherInput];
		const group = upcastPartial<IEditorGroup>({
			id: 1,
			get selectedEditors() { return selectedEditors; },
			isSelected: input => selectedEditors.includes(input),
			setSelection: async (active, inactive) => { selectedEditors = [active, ...inactive]; },
			getIndexOfEditor: input => input === thisInput ? 0 : 1,
		});
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
			visibleEditorPanes: [upcastPartial<IVisibleEditorPane>({ input: thisInput, group, getControl: () => editor })],
			activeEditor: undefined,
		}));

		const widget = store.add(instantiationService.createInstance(EmptyEditorHintActionsWidget, editor, {
			close: () => callbacks.push('close'),
			dontShowAgain: () => callbacks.push('dontShowAgain'),
			doesNotFit: () => callbacks.push('doesNotFit'),
		}));

		const domNode = widget.getDomNode();
		const rows = [...domNode.querySelectorAll<HTMLElement>('.watermark-entry, .separator')];
		const rowLabels = rows.map(row => row.classList.contains('separator') ? '---' : row.textContent);

		const click = async (label: string) => {
			rows.find(row => row.textContent === label)!.click();
			await timeout(0);
		};
		await click('Open in Hex Editor');
		const visibleBeforeClose = contextKeyService.getContextKeyValue('emptyEditorHintActionsVisible');
		domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		await timeout(0);

		assert.deepStrictEqual({ rowLabels, hasDropdown: !!domNode.querySelector('.empty-editor-hint-actions-dropdown'), visibleBeforeClose, commands, selectedEditors: selectedEditors.map(input => input === thisInput ? 'this' : 'other'), callbacks, events }, {
			rowLabels: ['New Chat Editor', 'Select a Language', '---', 'Open in Hex Editor'],
			hasDropdown: true,
			visibleBeforeClose: true,
			commands: [['reopenActiveEditorWith', 'hexEditor.hexedit', { groupId: 1, editorIndex: 0 }]],
			selectedEditors: ['this'],
			callbacks: ['close'],
			events: [
				{ eventName: 'emptyEditorHint', data: { kind: 'shown', action: undefined, variant: 'actions', scheme: 'untitled', untitledDocumentId: 'doc-1' } },
				{ eventName: 'emptyEditorHint', data: { kind: 'action', action: 'openEditor', variant: 'actions', scheme: 'untitled', untitledDocumentId: 'doc-1' } },
				{ eventName: 'emptyEditorHint', data: { kind: 'action', action: 'closeEscape', variant: 'actions', scheme: 'untitled', untitledDocumentId: 'doc-1' } },
			],
		});
	});

	test('Tab from the editor focuses the first row, Shift+Tab and typing return to the editor', () => {
		const { instantiationService, contextKeyService, editor, editorFocusCalls } = createHintTestSetup(store);
		const widget = store.add(instantiationService.createInstance(EmptyEditorHintActionsWidget, editor, { close: () => { }, dontShowAgain: () => { }, doesNotFit: () => { } }));
		const domNode = attachToDocument(store, widget.getDomNode());

		widget.focus();
		const focusedRow = getActiveElement()?.textContent;
		pressKey(getActiveElement(), { key: 'Tab', keyCode: 9, shiftKey: true });
		pressKey(domNode.querySelector('.watermark-entry'), { key: 'a', keyCode: 65 });

		assert.deepStrictEqual({ hintVisible: contextKeyService.getContextKeyValue('emptyEditorHintVisible'), focusedRow, editorFocusCalls }, {
			hintVisible: true,
			focusedRow: 'Select a Language',
			editorFocusCalls: ['Tab', 'a'],
		});
	});
});

suite('EmptyTextEditorHintContentWidget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('the links can be focused and run from the keyboard', () => {
		const { instantiationService, contextKeyService, editor, editorFocusCalls, commands } = createHintTestSetup(store);
		const widget = store.add(instantiationService.createInstance(EmptyTextEditorHintContentWidget, editor));
		const domNode = attachToDocument(store, widget.getDomNode());
		const links = [...domNode.querySelectorAll('a')];

		widget.focus();
		const focused = [getActiveElement()?.textContent];
		pressKey(getActiveElement(), { key: 'ArrowRight', keyCode: 39 });
		focused.push(getActiveElement()?.textContent);
		pressKey(getActiveElement(), { key: 'ArrowRight', keyCode: 39 });
		focused.push(getActiveElement()?.textContent);
		pressKey(links[0], { key: 'Tab', keyCode: 9, shiftKey: true });
		pressKey(links[1], { key: 'Escape', keyCode: 27 });
		pressKey(links[0], { key: 'x', keyCode: 88 });
		pressKey(links[0], { key: 'Enter', keyCode: 13 });

		assert.deepStrictEqual({
			hintVisible: contextKeyService.getContextKeyValue('emptyEditorHintVisible'),
			links: links.map(link => ({ text: link.textContent, tabIndex: link.tabIndex, role: link.getAttribute('role') })),
			focused,
			editorFocusCalls,
			commands,
		}, {
			hintVisible: true,
			links: [{ text: 'Select a language', tabIndex: 0, role: 'button' }, { text: 'don\'t show', tabIndex: 0, role: 'button' }],
			focused: ['Select a language', 'don\'t show', 'Select a language'],
			editorFocusCalls: ['Tab', 'Escape', 'x', 'Enter'],
			commands: [['workbench.action.editor.changeLanguageMode']],
		});
	});
});

suite('startsTextInput', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('characters, dead keys and IME composition start text input, keys that operate the hint do not', () => {
		const keys: Record<string, KeyboardEventInit> = {
			'a': { key: 'a', keyCode: 65 },
			'AltGr+q (@)': { key: '@', keyCode: 81, ctrlKey: true, altKey: true, modifierAltGraph: true } as KeyboardEventInit,
			'dead key': { key: 'Dead', keyCode: 192 },
			'IME': { key: 'Process', keyCode: 229 },
			'Space': { key: ' ', keyCode: 32 },
			'Enter': { key: 'Enter', keyCode: 13 },
			'Tab': { key: 'Tab', keyCode: 9 },
			'ArrowDown': { key: 'ArrowDown', keyCode: 40 },
			'Ctrl+c': { key: 'c', keyCode: 67, ctrlKey: true },
		};
		assert.deepStrictEqual(Object.fromEntries(Object.entries(keys).map(([name, init]) => [name, startsTextInput(new StandardKeyboardEvent(new KeyboardEvent('keydown', init)))])), {
			'a': true,
			'AltGr+q (@)': true,
			'dead key': true,
			'IME': true,
			'Space': false,
			'Enter': false,
			'Tab': false,
			'ArrowDown': false,
			'Ctrl+c': false,
		});
	});
});

function createHintTestSetup(store: Pick<DisposableStore, 'add'>) {
	const commands: unknown[][] = [];
	const editorFocusCalls: string[] = [];

	const instantiationService = workbenchInstantiationService(undefined, store);
	instantiationService.stub(IUntitledDocumentTelemetryService, upcastPartial<IUntitledDocumentTelemetryService>({ getUntitledDocumentId: () => 'doc-1' }));
	instantiationService.stub(IChatAgentService, upcastPartial<IChatAgentService>({ getActivatedAgents: () => [], onDidChangeAgents: Event.None }));
	instantiationService.stub(IEditorResolverService, upcastPartial<IEditorResolverService>({ getEditors: () => [], onDidChangeEditorRegistrations: Event.None }));
	instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
		executeCommand: async (...args: unknown[]) => { commands.push(args); return undefined; },
		onWillExecuteCommand: Event.None,
		onDidExecuteCommand: Event.None,
	}));
	const contextKeyService = store.add(new ContextKeyService(instantiationService.get(IConfigurationService)));
	instantiationService.stub(IContextKeyService, contextKeyService);

	const model = store.add(createTextModel('', undefined, undefined, URI.from({ scheme: 'untitled', path: 'Untitled-1' })));
	const editor = store.add(createTestCodeEditor(model));
	// The test editor has no view to focus, so record the key that returned focus to it
	editor.focus = () => editorFocusCalls.push(lastPressedKey);

	return { instantiationService, contextKeyService, editor, editorFocusCalls, commands };
}

let lastPressedKey = '';

function pressKey(target: Element | null | undefined, init: KeyboardEventInit & { keyCode: number }): void {
	lastPressedKey = init.key ?? '';
	target?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

function attachToDocument(store: Pick<DisposableStore, 'add'>, node: HTMLElement): HTMLElement {
	mainWindow.document.body.appendChild(node);
	store.add(toDisposable(() => node.remove()));
	return node;
}
