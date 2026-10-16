/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { retry } from '../../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { Lazy } from '../../../../../../../base/common/lazy.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IMenuService, MenuId } from '../../../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../../../platform/actions/common/menuService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { ITextDiffEditorPane, IUntypedEditorInput, isResourceDiffEditorInput, isResourceEditorInput } from '../../../../../../common/editor.js';
import { EditorInput } from '../../../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatInputPart } from '../../../../browser/widget/input/chatInputPart.js';
import { CollapsibleListPool } from '../../../../browser/widget/chatContentParts/chatReferencesContentPart.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { IChatSessionFileChange2, SessionType } from '../../../../common/chatSessionsService.js';
import { emptySessionEntryDiff, hasUndecidedChatEditingResourceContextKey, IChatEditingSession, IEditSessionEntryDiff, IModifiedFileEntry, IModifiedFileEntryEditorIntegration, ModifiedFileEntryState } from '../../../../common/editing/chatEditingService.js';
import { LocalChatSessionUri } from '../../../../common/model/chatUri.js';
import { IChatAttachmentWidgetInstance, IChatAttachmentWidgetRegistry } from '../../../../browser/attachments/chatAttachmentWidgetRegistry.js';
import { createChatReferenceVariableEntry } from '../../../../common/attachments/chatVariableEntries.js';
import { IChatSessionCost } from '../../../../common/model/chatModel.js';
import { MockChatModel } from '../../../common/model/mockChatModel.js';
import '../../../../browser/widget/media/chat.css';

suite('ChatInputPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWorkingSetInput(isSessionsWindow = false, sessionResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' })) {
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IConfigurationService, configurationService);
		const contextKeyService = store.add(instantiationService.createInstance(ContextKeyService));
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		hasUndecidedChatEditingResourceContextKey.bindTo(contextKeyService).set(true);
		const opened: (EditorInput | IUntypedEditorInput)[] = [];
		instantiationService.stub(IEditorService, {
			openEditor: async (input: EditorInput | IUntypedEditorInput) => {
				opened.push(input);
				return upcastPartial<ITextDiffEditorPane>({});
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
			options: { renderWorkingSet: true, isSessionsWindow, menus: { telemetrySource: 'test' } },
			configurationService,
			instantiationService,
			contextKeyService,
			editorService: instantiationService.get(IEditorService),
			inputUri: URI.parse('vscode-chat-input:/test'),
			chatEditingSessionWidgetContainer: container,
			_widget: { viewModel: { get sessionResource() { return model.sessionResource; }, model } },
			_sessionFileChanges: observableValue<IObservable<readonly IEditSessionEntryDiff[] | undefined> | undefined>('providerChanges', undefined),
			_sessionWorkingSetView: store.add(new MutableDisposable()),
			_sessionWorkingSetDiffs: observableValue<readonly IEditSessionEntryDiff[]>('sessionDiffs', []),
			_workingSetCollapsed: legacyCollapsed,
			_sessionWorkingSetCollapsed: observableValue('sessionCollapsed', false),
			_workingSetLinesAddedSpan: new Lazy(() => dom.$('.working-set-lines-added')),
			_workingSetLinesRemovedSpan: new Lazy(() => dom.$('.working-set-lines-removed')),
			_chatEditsListPool: store.add(instantiationService.createInstance(CollapsibleListPool, Event.None, MenuId.ChatEditingWidgetModifiedFilesToolbar, undefined)),
			_chatEditsActionsDisposables: store.add(new DisposableStore()),
			_chatEditsDisposables: store.add(new DisposableStore()),
			_renderingChatEdits: store.add(new MutableDisposable()),
			_onDidFocus: store.add(new Emitter<void>()),
			agentSessionsService: { model: { onDidChangeSessions: sessionsChanged.event }, getSession: () => ({ changes: sessionChanges }) },
			focus: () => { inputFocusCalls++; },
			hasFocus: () => false,
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
					affectedKeys: new Set([ChatConfiguration.EditorWorkingSetEnabled]),
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

	test('leaves Local controls, pending files, and live-editor opening unchanged when enabled', async () => {
		const { inputPart, container, sessionResource, opened, setEnabled } = createWorkingSetInput(false, LocalChatSessionUri.forSession('local'));
		const resource = URI.file('/repo/pending.ts');
		const revealed: boolean[] = [];
		const pending = new class extends mock<IModifiedFileEntry>() {
			override readonly modifiedURI = resource;
			override readonly originalURI = URI.parse('snapshot:/before/pending.ts');
			override readonly state = constObservable(ModifiedFileEntryState.Modified);
			override getEditorIntegration() {
				return upcastPartial<IModifiedFileEntryEditorIntegration>({ reveal: first => { revealed.push(first); } });
			}
		}();
		const accepted = new class extends mock<IModifiedFileEntry>() {
			override readonly state = constObservable(ModifiedFileEntryState.Accepted);
		}();
		const editingSession = new class extends mock<IChatEditingSession>() {
			override readonly chatSessionResource = sessionResource;
			override readonly entries = constObservable([pending, accepted]);
			override getEntry() { return pending; }
			override getDiffsForFilesInSession(): IObservable<readonly IEditSessionEntryDiff[]> {
				throw new Error('Local must not request cumulative diffs for the new working set');
			}
		}();
		inputPart.renderChatEditingSessionState(editingSession);
		inputPart.setWorkingSetCollapsed(false);
		const list = container.querySelector<HTMLElement>('.monaco-list');
		const readState = () => ({
			newWorkingSet: inputPart.hasSessionWorkingSet,
			files: [...container.querySelectorAll('.monaco-list-row')].map(row => row.getAttribute('aria-label')),
			keep: container.querySelector('.chat-editing-session-actions')?.textContent?.includes('Keep'),
			undo: container.querySelector('.chat-editing-session-actions')?.textContent?.includes('Undo'),
		});
		const states = [readState()];
		await setEnabled(true);
		states.push(readState());
		container.querySelector('.monaco-list-row')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		await Promise.resolve();
		await setEnabled(false);
		states.push(readState());
		assert.deepStrictEqual({
			states,
			sameList: list === container.querySelector('.monaco-list'),
			filesOpened: opened.map(input => isResourceEditorInput(input) ? input.resource.toString() : undefined),
			diffsOpened: opened.filter(isResourceDiffEditorInput).length,
			revealed,
		}, {
			states: Array.from({ length: 3 }, () => ({ newWorkingSet: false, files: ['pending.ts'], keep: true, undo: true })),
			sameList: true,
			filesOpened: [resource.toString()],
			diffsOpened: 0,
			revealed: [true],
		});
	});

	test('does not enable the editor working set in the Agents window', async () => {
		const { inputPart, container, setEnabled } = createWorkingSetInput(true);
		store.add(inputPart.registerSessionFileChanges(constObservable([emptySessionEntryDiff(URI.file('/before.ts'), URI.file('/after.ts'))])));
		await setEnabled(true);
		inputPart.renderChatEditingSessionState(null);
		assert.deepStrictEqual({ visible: container.style.display !== 'none', workingSet: !!container.querySelector('.chat-session-working-set') }, { visible: false, workingSet: false });
	});

	test('leaves metadata-backed providers on their existing working-set presentation', async () => {
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
		assert.deepStrictEqual({ initiallyVisible, files, visibleAfterRemoval: container.style.display !== 'none', newWorkingSet: inputPart.hasSessionWorkingSet }, {
			initiallyVisible: false,
			files: ['cloud.ts'],
			visibleAfterRemoval: false,
			newWorkingSet: false,
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
		store.add(harness.inputPart.registerSessionFileChanges(diffs));
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

	test('preserves regular-editor opening for other providers without original metadata', async () => {
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
		assert.deepStrictEqual({
			label: row.getAttribute('aria-label'),
			editors: opened.map(input => isResourceEditorInput(input) ? input.resource.toString() : undefined),
			newWorkingSet: inputPart.hasSessionWorkingSet,
		}, {
			label: 'existing.ts',
			editors: ['snapshot:/after/existing.ts'],
			newWorkingSet: false,
		});
	});

	test('leaves the new presentation when the registered source becomes ineligible', async () => {
		const { inputPart, container, setEnabled } = createWorkingSetInput();
		const changes = observableValue<readonly IEditSessionEntryDiff[] | undefined>('changes', [
			emptySessionEntryDiff(URI.file('/before.ts'), URI.file('/after.ts')),
		]);
		store.add(inputPart.registerSessionFileChanges(changes));
		await setEnabled(true);
		inputPart.renderChatEditingSessionState(null);
		const states = [inputPart.hasSessionWorkingSet];
		changes.set(undefined, undefined);
		states.push(inputPart.hasSessionWorkingSet);
		assert.deepStrictEqual({ states, rows: container.querySelectorAll('.monaco-list-row').length }, { states: [true, false], rows: 0 });
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

	test('session-cost listener updates the usage widget without another turn and detaches on chat switches', () => {
		const first = store.add(new MockChatModel(URI.parse('test:/first')));
		const peer = store.add(new MockChatModel(URI.parse('test:/peer')));
		const widget = { viewModel: { model: first } };
		const costs: IChatSessionCost[] = [];
		const inputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			_contextUsageDisposables: store.add(new MutableDisposable()),
			_widget: widget,
			contextUsageWidget: {
				update: () => { },
				updateSessionCost: (credits: number, status?: IChatSessionCost['status']) => costs.push({ credits, status }),
			},
			languageModelsService: { onDidChangeLanguageModels: Event.None },
		}) as { updateContextUsageWidget(): void };

		inputPart.updateContextUsageWidget();
		first.setSessionCost({ credits: 0.6, status: 'complete' });
		widget.viewModel.model = peer;
		inputPart.updateContextUsageWidget();
		first.setSessionCost({ credits: 1.2, status: 'complete' });
		peer.setSessionCost({ credits: 0.25, status: 'partial' });
		assert.deepStrictEqual(costs, [
			{ credits: 0, status: undefined },
			{ credits: 0.6, status: 'complete' },
			{ credits: 0, status: undefined },
			{ credits: 0.25, status: 'partial' },
		]);
	});

	test('renders contributed attachment widgets for the session of the input model that holds the attachments, else the widget session', () => {
		const restoredSession = URI.parse('remote-remote.example__1-copilotcli:/restored');
		const chip = createChatReferenceVariableEntry(URI.parse('ahp-chat://default/c2Vzc2lvbg'), undefined, 'Chat');
		const createdFor: (string | undefined)[] = [];
		// While setInputModel restores the incoming session's attachments, the
		// widget's view model is still absent (first load) or the outgoing session.
		const render = (inputModelSession: URI | undefined, viewModelSession: URI | undefined) => {
			const attachedContextDisposables = store.add(new MutableDisposable());
			const inputPart = Object.assign(Object.create(ChatInputPart.prototype), {
				attachedContextContainer: dom.$('div'),
				attachmentsContainer: dom.$('div'),
				attachedContextDisposables,
				_attachmentModel: { attachments: [chip] },
				configurationService: { getValue: () => false },
				options: {},
				_currentLanguageModel: observableValue('model', undefined),
				_indexOfLastAttachedContextDeletedWithKeyboard: -1,
				_indexOfLastOpenedContext: -1,
				_inputModelSessionResource: inputModelSession,
				_widget: viewModelSession && { viewModel: { sessionResource: viewModelSession } },
				_chatAttachmentWidgetRegistry: {
					createWidget: (_attachment, _options, _container, sessionResource): IChatAttachmentWidgetInstance => {
						createdFor.push(sessionResource?.toString());
						return { element: dom.$('div'), onDidDelete: Event.None, onDidOpen: Event.None, dispose: () => { } };
					},
				} satisfies Pick<IChatAttachmentWidgetRegistry, 'createWidget'>,
			}) as ChatInputPart;
			inputPart.renderAttachedContext();
			attachedContextDisposables.dispose();
		};

		const editedRequestSession = URI.parse('agent-host-copilotcli:/edited');
		render(restoredSession, undefined);
		render(restoredSession, URI.parse('agent-host-copilotcli:/outgoing'));
		// The inline request-edit input part never binds an input model.
		render(undefined, editedRequestSession);

		assert.deepStrictEqual(createdFor, [restoredSession.toString(), restoredSession.toString(), editedRequestSession.toString()]);
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

	test('working borders rotate fixed gradients inside masks at any input aspect ratio', async () => {
		const host = mainWindow.document.body.appendChild(dom.$('.monaco-workbench'));
		host.style.cssText = '--vscode-strokeThickness: 1px; --vscode-cornerRadius-large: 8px;';
		store.add(toDisposable(() => host.remove()));
		const session = dom.append(host, dom.$('.interactive-session'));
		const inputPart = dom.append(session, dom.$('.interactive-input-part'));
		const input = dom.append(inputPart, dom.$('.chat-input-container.working'));
		const beam = dom.append(input, dom.$('.chat-input-working-border'));
		const glow = dom.append(input, dom.$('.chat-input-working-border.chat-input-working-border-glow'));
		await retry(async () => assert.strictEqual(mainWindow.getComputedStyle(beam).position, 'absolute'), 10, 100);
		const geometry = [];
		for (const [width, height] of [[400, 80], [200, 300], [333.33, 97.25]]) {
			input.style.width = `${width}px`;
			input.style.height = `${height}px`;
			geometry.push(...[beam, glow].map(border => {
				const bounds = border.getBoundingClientRect();
				const style = mainWindow.getComputedStyle(border, '::before');
				// Allow 1/64px layout rounding plus computed-style serialization.
				return {
					coversCorners: Math.abs(parseFloat(style.width) - Math.hypot(bounds.width, bounds.height)) < 0.02,
					animation: style.animationName,
					timing: style.animationTimingFunction,
				};
			}));
		}
		const animations = input.getAnimations({ subtree: true }).filter(animation => animation instanceof mainWindow.CSSAnimation);
		const keyframes = animations.map(animation => animation.effect instanceof mainWindow.KeyframeEffect
			? animation.effect.getKeyframes().map(frame => frame.transform)
			: []);
		const reduced = mainWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
		input.classList.remove('working');

		assert.deepStrictEqual({
			geometry,
			keyframes,
			idleAnimations: input.getAnimations({ subtree: true }).filter(animation => animation instanceof mainWindow.CSSAnimation).length,
		}, {
			geometry: Array.from({ length: 6 }, () => ({
				coversCorners: true, animation: reduced ? 'none' : 'chat-input-working-border-spin', timing: reduced ? 'ease' : 'linear',
			})),
			keyframes: reduced ? [] : Array.from({ length: 2 }, () => ['translate(-50%, -50%) rotate(0deg)', 'translate(-50%, -50%) rotate(360deg)']),
			idleAnimations: 0,
		});
	});

	test('decorative input borders do not increase ancestor scroll overflow', async () => {
		const snapshots = [];
		for (const compact of [false, true]) {
			for (const working of [false, true]) {
				const host = mainWindow.document.body.appendChild(dom.$('.monaco-workbench'));
				host.style.cssText = 'position: relative; width: 500px; height: 100px; overflow: hidden; --vscode-strokeThickness: 1px;';
				store.add(toDisposable(() => host.remove()));
				const session = dom.append(host, dom.$('.interactive-session'));
				const inputPart = dom.append(session, dom.$('.interactive-input-part'));
				inputPart.classList.toggle('compact', compact);
				const input = dom.append(inputPart, dom.$('.chat-input-container'));
				input.classList.toggle('working', working);
				input.style.cssText = 'width: 400px; height: 40px;';
				await retry(async () => assert.strictEqual(mainWindow.getComputedStyle(input).position, 'relative'), 10, 100);
				const before = { width: host.scrollWidth, height: host.scrollHeight };
				dom.append(input, dom.$('.chat-input-working-border'));
				dom.append(input, dom.$('.chat-input-working-border.chat-input-working-border-glow'));
				snapshots.push({
					compact,
					working,
					widthIncrease: host.scrollWidth - before.width,
					heightIncrease: host.scrollHeight - before.height,
				});
			}
		}
		assert.deepStrictEqual(snapshots, [
			{ compact: false, working: false, widthIncrease: 0, heightIncrease: 0 },
			{ compact: false, working: true, widthIncrease: 0, heightIncrease: 0 },
			{ compact: true, working: false, widthIncrease: 0, heightIncrease: 0 },
			{ compact: true, working: true, widthIncrease: 0, heightIncrease: 0 },
		]);
	});
});
