/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IUntypedEditorInput, isResourceDiffEditorInput } from '../../../../../../common/editor.js';
import { EditorInput } from '../../../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatInputPart } from '../../../../browser/widget/input/chatInputPart.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { IChatSessionFileChange2 } from '../../../../common/chatSessionsService.js';
import { emptySessionEntryDiff, IChatEditingSession, IEditSessionEntryDiff, IModifiedFileEntry, ModifiedFileEntryState } from '../../../../common/editing/chatEditingService.js';
import { LocalChatSessionUri } from '../../../../common/model/chatUri.js';

suite('ChatInputPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWorkingSetInput(isSessionsWindow = false, sessionResource = LocalChatSessionUri.forSession('test')) {
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IConfigurationService, configurationService);
		const opened: (EditorInput | IUntypedEditorInput)[] = [];
		instantiationService.stub(IEditorService, {
			openEditor: async (input: EditorInput | IUntypedEditorInput) => {
				opened.push(input);
				return undefined;
			},
		});
		const container = dom.$('.chat-editing-session');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		let sessionChanges: readonly IChatSessionFileChange2[] | undefined;
		const sessionsChanged = store.add(new Emitter<void>());
		const model: { sessionResource: URI; editingSession?: IChatEditingSession } = { sessionResource };
		const legacyCollapsed = observableValue('legacyCollapsed', true);
		let inputFocusCalls = 0;
		const inputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			options: { renderWorkingSet: true, isSessionsWindow },
			configurationService,
			instantiationService,
			chatEditingSessionWidgetContainer: container,
			_widget: { viewModel: { get sessionResource() { return model.sessionResource; }, model } },
			_sessionFileChanges: observableValue<IObservable<readonly IEditSessionEntryDiff[] | undefined> | undefined>('providerChanges', undefined),
			_sessionWorkingSetView: store.add(new MutableDisposable()),
			_sessionWorkingSetDiffs: observableValue<readonly IEditSessionEntryDiff[]>('sessionDiffs', []),
			_workingSetCollapsed: legacyCollapsed,
			_sessionWorkingSetCollapsed: observableValue('sessionCollapsed', false),
			_chatEditsActionsDisposables: store.add(new DisposableStore()),
			_chatEditsDisposables: store.add(new DisposableStore()),
			_renderingChatEdits: store.add(new MutableDisposable()),
			_onDidFocus: store.add(new Emitter<void>()),
			agentSessionsService: { model: { onDidChangeSessions: sessionsChanged.event }, getSession: () => ({ changes: sessionChanges }) },
			focus: () => { inputFocusCalls++; },
		}) as ChatInputPart;
		return {
			inputPart,
			container,
			sessionResource,
			model,
			legacyCollapsed,
			opened,
			get inputFocusCalls() { return inputFocusCalls; },
			setSessionChanges(changes: readonly IChatSessionFileChange2[]) {
				sessionChanges = changes;
				sessionsChanged.fire();
			},
			async setEnabled(enabled: boolean) {
				await configurationService.setUserConfiguration(ChatConfiguration.EditorWorkingSetEnabled, enabled);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
					affectsConfiguration: key => key === ChatConfiguration.EditorWorkingSetEnabled,
				}));
			},
		};
	}

	test('switches the session working set on and off without reloading the chat', async () => {
		const { inputPart, container, setEnabled } = createWorkingSetInput();
		store.add(inputPart.registerSessionFileChanges(constObservable([
			emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/first.ts')),
			emptySessionEntryDiff(URI.file('/before/second.ts'), URI.file('/second.ts')),
		])));
		inputPart.renderChatEditingSessionState(null);
		const state = () => ({ visible: container.style.display !== 'none', rows: container.querySelectorAll('.monaco-list-row').length });
		const states = [state()];
		await setEnabled(true);
		states.push(state());
		await setEnabled(false);
		states.push(state());
		assert.deepStrictEqual(states, [
			{ visible: false, rows: 0 },
			{ visible: true, rows: 2 },
			{ visible: false, rows: 0 },
		]);
	});

	test('hides an empty working set and updates when session changes arrive or disappear', async () => {
		const { inputPart, container, setEnabled } = createWorkingSetInput();
		const diffs = observableValue<readonly IEditSessionEntryDiff[]>('diffs', []);
		store.add(inputPart.registerSessionFileChanges(diffs));
		await setEnabled(true);
		inputPart.renderChatEditingSessionState(null);
		const states = [container.style.display !== 'none'];
		diffs.set([emptySessionEntryDiff(URI.file('/before.ts'), URI.file('/after.ts'))], undefined);
		states.push(container.style.display !== 'none');
		diffs.set([], undefined);
		states.push(container.style.display !== 'none');
		assert.deepStrictEqual(states, [false, true, false]);
	});

	test('uses cumulative local diffs rather than only unresolved editing entries', async () => {
		const { inputPart, container, sessionResource, setEnabled } = createWorkingSetInput();
		const entry = new class extends mock<IModifiedFileEntry>() {
			override readonly state = constObservable(ModifiedFileEntryState.Accepted);
		}();
		const editingSession = new class extends mock<IChatEditingSession>() {
			override readonly chatSessionResource = sessionResource;
			override readonly entries = constObservable([entry]);
			override getDiffsForFilesInSession() {
				return constObservable([
					emptySessionEntryDiff(URI.file('/before/earlier.ts'), URI.file('/earlier.ts')),
					emptySessionEntryDiff(URI.file('/before/latest.ts'), URI.file('/latest.ts')),
				]);
			}
		}();
		await setEnabled(true);
		inputPart.renderChatEditingSessionState(editingSession);
		assert.deepStrictEqual({
			visible: container.style.display !== 'none',
			files: [...container.querySelectorAll('.monaco-list-row')].map(row => row.getAttribute('aria-label')),
			actions: container.querySelectorAll('.monaco-action-bar').length,
		}, {
			visible: true,
			files: ['/earlier.ts, 0 lines added, 0 lines removed', '/latest.ts, 0 lines added, 0 lines removed'],
			actions: 0,
		});
	});

	test('does not enable the editor working set in the Agents window', async () => {
		const { inputPart, container, setEnabled } = createWorkingSetInput(true);
		store.add(inputPart.registerSessionFileChanges(constObservable([emptySessionEntryDiff(URI.file('/before.ts'), URI.file('/after.ts'))])));
		await setEnabled(true);
		inputPart.renderChatEditingSessionState(null);
		assert.deepStrictEqual({ visible: container.style.display !== 'none', workingSet: !!container.querySelector('.chat-session-working-set') }, { visible: false, workingSet: false });
	});

	test('uses late-arriving external session changes even when an empty editing session exists', async () => {
		const { inputPart, container, sessionResource, setEnabled, setSessionChanges } = createWorkingSetInput(false, URI.parse('copilot-cloud-agent:/session'));
		const editingSession = new class extends mock<IChatEditingSession>() {
			override readonly chatSessionResource = sessionResource;
			override readonly entries = constObservable([]);
			override getDiffsForFilesInSession() { return constObservable([]); }
		}();
		await setEnabled(true);
		inputPart.renderChatEditingSessionState(editingSession);
		const initiallyVisible = container.style.display !== 'none';
		setSessionChanges([{
			uri: URI.file('/repo/cloud.ts'),
			originalUri: URI.parse('snapshot:/before/cloud.ts'),
			modifiedUri: URI.parse('snapshot:/after/cloud.ts'),
			insertions: 5,
			deletions: 2,
		}]);
		const files = [...container.querySelectorAll('.monaco-list-row')].map(row => row.getAttribute('aria-label'));
		setSessionChanges([]);
		assert.deepStrictEqual({ initiallyVisible, files, visibleAfterRemoval: container.style.display !== 'none' }, {
			initiallyVisible: false,
			files: ['/repo/cloud.ts, 5 lines added, 2 lines removed'],
			visibleAfterRemoval: false,
		});
	});

	test('does not replace authoritative empty provider changes with session metadata', async () => {
		const { inputPart, container, setEnabled, setSessionChanges } = createWorkingSetInput();
		setSessionChanges([{ uri: URI.file('/stale.ts'), modifiedUri: URI.file('/stale.ts'), insertions: 1, deletions: 0 }]);
		store.add(inputPart.registerSessionFileChanges(constObservable([])));
		await setEnabled(true);
		inputPart.renderChatEditingSessionState(null);
		assert.deepStrictEqual({ visible: container.style.display !== 'none', rows: container.querySelectorAll('.monaco-list-row').length }, { visible: false, rows: 0 });
	});

	test('keeps the file list and focus while editing-session state is refreshed', async () => {
		const harness = createWorkingSetInput();
		const diffs = observableValue<readonly IEditSessionEntryDiff[]>('diffs', [
			emptySessionEntryDiff(URI.file('/before/first.ts'), URI.file('/first.ts')),
		]);
		const editingSession = new class extends mock<IChatEditingSession>() {
			override readonly chatSessionResource = harness.sessionResource;
			override readonly entries = constObservable([]);
			override getDiffsForFilesInSession() { return diffs; }
		}();
		harness.model.editingSession = editingSession;
		await harness.setEnabled(true);
		harness.inputPart.renderChatEditingSessionState(editingSession);
		const list = harness.container.querySelector<HTMLElement>('.monaco-list')!;
		list.focus();
		harness.inputPart.renderChatEditingSessionState(null);
		harness.inputPart.renderChatEditingSessionState(editingSession);
		diffs.set([...diffs.get(), emptySessionEntryDiff(URI.file('/before/second.ts'), URI.file('/second.ts'))], undefined);
		assert.deepStrictEqual({
			sameList: harness.container.querySelector('.monaco-list') === list,
			focused: dom.getActiveElement() === list,
			inputFocusCalls: harness.inputFocusCalls,
			rows: list.querySelectorAll('.monaco-list-row').length,
		}, { sameList: true, focused: true, inputFocusCalls: 0, rows: 2 });
	});

	test('does not infer file creation from missing original metadata', async () => {
		const { inputPart, container, opened, setEnabled, setSessionChanges } = createWorkingSetInput(false, URI.parse('copilot-cloud-agent:/session'));
		setSessionChanges([{
			uri: URI.file('/repo/existing.ts'),
			modifiedUri: URI.parse('snapshot:/after/existing.ts'),
			insertions: 5,
			deletions: 2,
		}]);
		await setEnabled(true);
		inputPart.renderChatEditingSessionState(null);
		const row = container.querySelector<HTMLElement>('.monaco-list-row')!;
		row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		await Promise.resolve();
		assert.deepStrictEqual({
			label: row.getAttribute('aria-label'),
			editors: opened.map(input => isResourceDiffEditorInput(input) ? {
				original: input.original.resource?.toString(),
				modified: input.modified.resource?.toString(),
			} : undefined),
		}, {
			label: '/repo/existing.ts, 5 lines added, 2 lines removed',
			editors: [{ original: 'file:///repo/existing.ts', modified: 'snapshot:/after/existing.ts' }],
		});
	});

	for (const isSessionsWindow of [false, true]) {
		test(`preserves legacy disclosure state without an editing session (Agents window: ${isSessionsWindow})`, () => {
			const { inputPart, model, legacyCollapsed } = createWorkingSetInput(isSessionsWindow);
			inputPart.setWorkingSetCollapsed(false);
			inputPart.renderChatEditingSessionState(null);
			model.sessionResource = URI.parse('copilot-cloud-agent:/other');
			inputPart.renderChatEditingSessionState(null);
			assert.strictEqual(legacyCollapsed.get(), false);
		});
	}

	test('disposing an old source does not remove the current session changes', async () => {
		const { inputPart, container, setEnabled } = createWorkingSetInput();
		const oldSource = store.add(inputPart.registerSessionFileChanges(constObservable([emptySessionEntryDiff(URI.file('/old-before.ts'), URI.file('/old.ts'))])));
		await setEnabled(true);
		inputPart.renderChatEditingSessionState(null);
		const currentSource = store.add(inputPart.registerSessionFileChanges(constObservable([emptySessionEntryDiff(URI.file('/new-before.ts'), URI.file('/new.ts'))])));
		oldSource.dispose();
		const currentFile = container.querySelector('.monaco-list-row')?.getAttribute('aria-label');
		currentSource.dispose();
		assert.deepStrictEqual({ currentFile, visibleAfterDispose: container.style.display !== 'none' }, { currentFile: '/new.ts, 0 lines added, 0 lines removed', visibleAfterDispose: false });
	});

	test('uses the Sessions content gutter for composer layout', () => {
		const followupsContainer = dom.$('div');
		const editorLayouts: { width: number; height: number }[] = [];
		const inputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			options: { isSessionsWindow: true },
			inputContainer: dom.$('div'),
			followupsContainer,
			_inputEditor: {
				getScrollWidth: () => 100,
				getContentHeight: () => 20,
				layout: (dimension: { width: number; height: number }) => editorLayouts.push(dimension),
			},
			inputEditorMaxHeight: 250,
			inputEditorMinHeight: undefined,
			singleLineInputEditorHeight: 20,
			inputEditorTrailingSpace: 0,
			ignoreInputEditorContentSizeChanges: false,
		}) as ChatInputPart;

		inputPart.layout(800);

		assert.deepStrictEqual({
			followupsWidth: followupsContainer.style.width,
			editorLayouts,
		}, {
			followupsWidth: '752px',
			editorLayouts: [{ width: 740, height: 20 }],
		});
	});
});
