/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
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
import { emptyEditorHintOpenInMarkdownEditorSetting, EmptyTextEditorHintContentWidget, EmptyTextEditorHintContribution } from '../../browser/emptyTextEditorHint/emptyTextEditorHintController.js';
import { IInlineChatSessionService } from '../../../inlineChat/browser/inlineChatSessionService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';

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
});

suite('EmptyTextEditorHint', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const markdownEditor = upcastPartial<RegisteredEditorInfo>({ id: 'vscode.markdown.editor', label: 'Markdown Editor' });

	function createServices(configuration: Record<string, unknown>, editors: RegisteredEditorInfo[]) {
		const events: unknown[] = [];
		const commands: unknown[][] = [];
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IConfigurationService, new TestConfigurationService(configuration));
		instantiationService.stub(ITelemetryService, upcastPartial<ITelemetryService>({
			...NullTelemetryService,
			publicLog2: (eventName: string, data?: unknown) => { events.push({ eventName, data }); },
		}));
		instantiationService.stub(IUntitledDocumentTelemetryService, upcastPartial<IUntitledDocumentTelemetryService>({ getUntitledDocumentId: () => 'doc-1' }));
		instantiationService.stub(IChatAgentService, upcastPartial<IChatAgentService>({ getActivatedAgents: () => [], getDefaultAgent: () => undefined, onDidChangeAgents: Event.None }));
		instantiationService.stub(IInlineChatSessionService, upcastPartial<IInlineChatSessionService>({ getSessionByTextModel: () => undefined, onWillStartSession: Event.None, onDidChangeSessions: Event.None }));
		instantiationService.stub(IEditorResolverService, upcastPartial<IEditorResolverService>({
			getEditors: () => [upcastPartial<RegisteredEditorInfo>({ id: 'default', label: 'Text Editor' }), ...editors],
			onDidChangeEditorRegistrations: Event.None,
		}));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async (...args: unknown[]) => { commands.push(args); return undefined; },
			onWillExecuteCommand: Event.None,
			onDidExecuteCommand: Event.None,
		}));
		const model = store.add(createTextModel('', undefined, undefined, URI.from({ scheme: 'untitled', path: 'Untitled-1' })));
		const editor = store.add(createTestCodeEditor(model));
		return { instantiationService, editor, events, commands };
	}

	test('the classic hint offers the Markdown Editor only when the setting is on and the Markdown Editor can open the file', () => {
		const shownVariant = (configuration: Record<string, unknown>, editors: RegisteredEditorInfo[]) => {
			const { instantiationService, editor, events } = createServices(configuration, editors);
			const model = editor.getModel();
			// The hint is shown when the editor gets its model
			editor.setModel(null);
			const contribution = instantiationService.createInstance(EmptyTextEditorHintContribution, editor);
			editor.setModel(model);
			contribution.dispose();
			return events.map(e => (e as { data: { variant: string } }).data.variant);
		};
		assert.deepStrictEqual({
			off: shownVariant({}, [markdownEditor]),
			on: shownVariant({ [emptyEditorHintOpenInMarkdownEditorSetting]: true }, [markdownEditor]),
			onWithoutMarkdownEditor: shownVariant({ [emptyEditorHintOpenInMarkdownEditorSetting]: true }, []),
			onWithActions: shownVariant({ [emptyEditorHintOpenInMarkdownEditorSetting]: true, 'workbench.editor.experimental.emptyEditorHintActions': true }, [markdownEditor]),
		}, {
			off: ['classic'],
			on: ['classicMarkdownEditor'],
			onWithoutMarkdownEditor: ['classic'],
			onWithActions: ['actions'],
		});
	});

	test('the open in Markdown Editor link reopens only this editor in the Markdown Editor', async () => {
		const { instantiationService, editor, events, commands } = createServices({}, [markdownEditor]);
		const thisInput = upcastPartial<EditorInput>({});
		const group = upcastPartial<IEditorGroup>({
			id: 1,
			selectedEditors: [thisInput],
			isSelected: () => true,
			getIndexOfEditor: () => 0,
		});
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
			visibleEditorPanes: [upcastPartial<IVisibleEditorPane>({ input: thisInput, group, getControl: () => editor })],
			activeEditor: undefined,
		}));

		const widget = store.add(instantiationService.createInstance(EmptyTextEditorHintContentWidget, editor, true));
		const domNode = widget.getDomNode();
		[...domNode.querySelectorAll('a')].find(a => a.textContent === 'open in Markdown Editor')!.click();
		await timeout(0);

		assert.deepStrictEqual({ text: domNode.textContent, commands, events }, {
			text: 'Select a language or open in Markdown Editor to get started. Start typing to dismiss or don\'t show this again.',
			commands: [['reopenActiveEditorWith', 'vscode.markdown.editor', { groupId: 1, editorIndex: 0 }]],
			events: [
				{ eventName: 'emptyEditorHint', data: { kind: 'shown', action: undefined, variant: 'classicMarkdownEditor', scheme: 'untitled', untitledDocumentId: 'doc-1' } },
				{ eventName: 'emptyEditorHint', data: { kind: 'action', action: 'openMarkdownEditor', variant: 'classicMarkdownEditor', scheme: 'untitled', untitledDocumentId: 'doc-1' } },
			],
		});
	});
});
