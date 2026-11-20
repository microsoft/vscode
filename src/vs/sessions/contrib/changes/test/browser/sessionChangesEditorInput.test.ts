/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MultiDiffEditorWidget } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { DocumentDiffItemViewModel, MultiDiffEditorViewModel } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { IMultiDiffResourceId } from '../../../../../editor/common/multiDiffEditor.js';
import { DiffEditorViewMode } from '../../../../../editor/common/config/editorOptions.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { MainEditorAreaVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { EditorInputCapabilities } from '../../../../../workbench/common/editor.js';
import { IEditorGroup, IEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { MultiDiffEditorInput } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { TestEditorGroupsService, TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { AgentWorkbenchLayout, ISessionsHostLayoutService } from '../../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { ITestSessionWithChat, stubSessionHosts } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { IChat, ISession, ISessionChangeset, ISessionChangesSummary, ISessionFileChange } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IDiffEditorOptionsService, SessionsWordWrap } from '../../../../../workbench/services/editor/common/diffEditorOptionsService.js';
import { SessionChangesEditor } from '../../../../../workbench/contrib/sessionChanges/browser/sessionChangesEditor.js';
import { ChangesPickerActionItem, ChangesPickerSummary } from '../../../../../workbench/contrib/sessionChanges/browser/changesView.js';
import { SessionChangesEditorInput } from '../../../../../workbench/contrib/sessionChanges/browser/sessionChangesEditorInput.js';
import { ISessionChangesService } from '../../../../../workbench/contrib/sessionChanges/browser/sessionChangesService.js';
import { IChangesViewService } from '../../../../../workbench/contrib/sessions/common/changesViewService.js';

suite('SessionChangesEditorInput', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const emptyChangesViewService = new class extends mock<IChangesViewService>() {
		override readonly activeSessionChangesObs = constObservable<readonly ISessionFileChange[]>([]);
		override readonly activeSessionResourceObs = constObservable<URI | undefined>(undefined);
		override readonly activeSessionChangesetLoadingObs = constObservable(false);
	};
	const emptySessionChangesService = new class extends mock<ISessionChangesService>() {
		override readonly activeSessionUncommittedChangesCountObs = constObservable(0);
		override getSessionResource(): URI | undefined { return undefined; }
		override getChatResource(): URI | undefined { return undefined; }
	};
	const noSessions = new class extends mock<ISessionsManagementService>() {
		override readonly onDidChangeSessions = Event.None;
		override getSession() { return undefined; }
	};
	const sessionChangesServiceWithResource = new class extends mock<ISessionChangesService>() {
		override readonly activeSessionUncommittedChangesCountObs = constObservable(0);
		override getChatResource(): URI | undefined {
			return undefined;
		}
		override getSessionResource(): URI | undefined {
			return URI.parse('agent-host-copilotcli:/session');
		}
	};

	test('releases resolved multi-diff models without disposing restorable input state', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible(): boolean {
				return true;
			}
		});
		instantiationService.stub(IChangesViewService, emptyChangesViewService);
		instantiationService.stub(ISessionChangesService, emptySessionChangesService);
		instantiationService.stub(ITextModelService, new class extends mock<ITextModelService>() { }());
		const viewModel = disposables.add(instantiationService.createInstance(MultiDiffEditorViewModel, {
			documents: ValueWithChangeEvent.const([]),
		}));

		let firstModelReferenceDisposed = false;
		instantiationService.stubInstance(MultiDiffEditorInput, {
			getViewModel: async () => viewModel,
			dispose: () => firstModelReferenceDisposed = true,
		});

		const input = disposables.add(instantiationService.createInstance(
			SessionChangesEditorInput,
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
		));
		await input.getViewModel();
		input.clear();

		let secondModelResolved = false;
		instantiationService.stubInstance(MultiDiffEditorInput, {
			getViewModel: async () => {
				secondModelResolved = true;
				return viewModel;
			},
			dispose: () => { },
		});
		await input.getViewModel();

		assert.deepStrictEqual({
			firstModelReferenceDisposed,
			outerInputDisposed: input.isDisposed(),
			secondModelResolved,
		}, {
			firstModelReferenceDisposed: true,
			outerInputDisposed: false,
			secondModelResolved: true,
		});
	});

	test('clearing the editor pane releases the resolved multi-diff model', () => {
		class TestSessionChangesEditor extends SessionChangesEditor {
			setCurrentInput(input: SessionChangesEditorInput): void {
				this._input = input;
			}
		}

		class TestSessionChangesEditorInput extends SessionChangesEditorInput {
			released = false;

			override clear(): void {
				this.released = true;
				super.clear();
			}
		}

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IChangesViewService, emptyChangesViewService);
		instantiationService.stub(IAgentWorkbenchLayoutService, {});
		instantiationService.stub(ISessionsHostLayoutService, {});
		instantiationService.stub(ISessionChangesService, emptySessionChangesService);
		instantiationService.stub(IWorkbenchLayoutService, {
			onDidChangePartVisibility: Event.None,
			isVisible: () => true,
		});

		const editor = disposables.add(instantiationService.createInstance(TestSessionChangesEditor, new TestEditorGroupView(1)));
		const input = disposables.add(instantiationService.createInstance(
			TestSessionChangesEditorInput,
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
		));
		editor.setCurrentInput(input);

		editor.clearInput();

		assert.deepStrictEqual({
			inputReleased: input.released,
			editorInput: editor.input,
		}, {
			inputReleased: true,
			editorInput: undefined,
		});
	});

	test('defers revealing a snapshot-backed resource until its diff item resolves', () => {
		const originalUri = URI.parse('snapshot:/before/file.ts');
		const modifiedUri = URI.parse('snapshot:/after/file.ts');
		const item = new class extends mock<DocumentDiffItemViewModel>() {
			override get originalUri() { return originalUri; }
			override get modifiedUri() { return modifiedUri; }
		}();
		const items = observableValue<readonly DocumentDiffItemViewModel[]>('items', []);
		const viewModel = new class extends mock<MultiDiffEditorViewModel>() {
			override readonly items = items;
		}();
		const revealed: IMultiDiffResourceId[] = [];
		const widget = new class extends mock<MultiDiffEditorWidget>() {
			override reveal(resource: IMultiDiffResourceId): void {
				revealed.push(resource);
			}
		}();
		const pendingReveal = disposables.add(new MutableDisposable());
		const editor = Object.create(SessionChangesEditor.prototype) as SessionChangesEditor;
		Object.defineProperties(editor, {
			viewModel: { value: viewModel, writable: true },
			widget: { value: widget, writable: true },
			_pendingReveal: { value: pendingReveal },
		});

		editor.setOptions({
			viewState: {
				revealData: {
					resource: { original: originalUri, modified: modifiedUri },
				},
			},
		});
		const beforeResolution = [...revealed];
		items.set([item], undefined);

		assert.deepStrictEqual({
			beforeResolution,
			afterResolution: revealed.map(resource => ({
				original: resource.original?.toString(),
				modified: resource.modified?.toString(),
			})),
			pending: pendingReveal.value !== undefined,
		}, {
			beforeResolution: [],
			afterResolution: [{
				original: originalUri.toString(),
				modified: modifiedUri.toString(),
			}],
			pending: false,
		});
	});

	test('does not resolve a canceled editor input', async () => {
		class TestSessionChangesEditorInput extends SessionChangesEditorInput {
			viewModelRequested = false;

			override async getViewModel(): Promise<MultiDiffEditorViewModel> {
				this.viewModelRequested = true;
				throw new Error('Canceled input must not be resolved');
			}
		}

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IChangesViewService, emptyChangesViewService);
		instantiationService.stub(IAgentWorkbenchLayoutService, {});
		instantiationService.stub(ISessionsHostLayoutService, {});
		instantiationService.stub(ISessionChangesService, emptySessionChangesService);
		instantiationService.stub(IWorkbenchLayoutService, {
			onDidChangePartVisibility: Event.None,
			isVisible: () => true,
		});

		const editor = disposables.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		const input = disposables.add(instantiationService.createInstance(
			TestSessionChangesEditorInput,
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
		));
		const operation = disposables.add(new CancellationTokenSource());
		operation.cancel();

		await editor.setInput(input, undefined, {}, operation.token);

		assert.deepStrictEqual(input.viewModelRequested, false);
	});

	test('resolves a hidden editor input once the editor area is shown, even after the open operation ended', async () => {
		class TestSessionChangesEditorInput extends SessionChangesEditorInput {
			viewModelRequests = 0;

			override async getViewModel(): Promise<MultiDiffEditorViewModel> {
				this.viewModelRequests++;
				return new class extends mock<MultiDiffEditorViewModel>() {
					override readonly items = constObservable<readonly DocumentDiffItemViewModel[]>([]);
				}();
			}
		}

		let editorVisible = false;
		const onDidChangePartVisibility = disposables.add(new Emitter<IPartVisibilityChangeEvent>());
		const layoutService = {
			onDidChangePartVisibility: onDidChangePartVisibility.event,
			isVisible: (part: Parts) => part === Parts.EDITOR_PART && editorVisible,
		};
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IChangesViewService, emptyChangesViewService);
		instantiationService.stub(IAgentWorkbenchLayoutService, layoutService);
		instantiationService.stub(ISessionsHostLayoutService, {});
		instantiationService.stub(ISessionChangesService, sessionChangesServiceWithResource);
		instantiationService.stub(IWorkbenchLayoutService, layoutService);

		const editor = disposables.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		const input = disposables.add(instantiationService.createInstance(
			TestSessionChangesEditorInput,
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
		));
		const operation = disposables.add(new CancellationTokenSource());

		await editor.setInput(input, undefined, {}, operation.token);
		const requestsWhileHidden = input.viewModelRequests;
		operation.cancel();

		editorVisible = true;
		onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual({
			requestsWhileHidden,
			requestsAfterShown: input.viewModelRequests,
			hasViewModel: editor.hasViewModel,
		}, {
			requestsWhileHidden: 0,
			requestsAfterShown: 1,
			hasViewModel: true,
		});
	});

	test('drops a deferred resolve when the input is cleared before the editor area is shown', async () => {
		class TestSessionChangesEditorInput extends SessionChangesEditorInput {
			viewModelRequests = 0;

			override async getViewModel(): Promise<MultiDiffEditorViewModel> {
				this.viewModelRequests++;
				return new class extends mock<MultiDiffEditorViewModel>() { }();
			}
		}

		const onDidChangePartVisibility = disposables.add(new Emitter<IPartVisibilityChangeEvent>());
		const layoutService = {
			onDidChangePartVisibility: onDidChangePartVisibility.event,
			isVisible: () => false,
		};
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IChangesViewService, emptyChangesViewService);
		instantiationService.stub(IAgentWorkbenchLayoutService, layoutService);
		instantiationService.stub(ISessionsHostLayoutService, {});
		instantiationService.stub(ISessionChangesService, sessionChangesServiceWithResource);
		instantiationService.stub(IWorkbenchLayoutService, layoutService);

		const editor = disposables.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		const input = disposables.add(instantiationService.createInstance(
			TestSessionChangesEditorInput,
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
		));

		await editor.setInput(input, undefined, {}, CancellationToken.None);
		editor.clearInput();
		onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		assert.strictEqual(input.viewModelRequests, 0);
	});

	test('updates managed Changes editor capabilities with editor area visibility', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		let editorVisible = false;
		const onDidChangePartVisibility = disposables.add(new Emitter<IPartVisibilityChangeEvent>());
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = onDidChangePartVisibility.event;
			override isVisible(part: Parts): boolean {
				return part === Parts.EDITOR_PART && editorVisible;
			}
		};
		const input = disposables.add(new SessionChangesEditorInput(
			URI.parse('test-changes:session'),
			instantiationService,
			emptySessionChangesService,
			layoutService,
			new TestEditorGroupsService(),
			noSessions,
		));
		let capabilitiesChanges = 0;
		disposables.add(input.onDidChangeCapabilities(() => capabilitiesChanges++));

		const hiddenCapabilities = input.capabilities;
		editorVisible = true;
		onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });

		assert.deepStrictEqual({
			hiddenCapabilities,
			visibleCapabilities: input.capabilities,
			capabilitiesChanges
		}, {
			hiddenCapabilities: EditorInputCapabilities.ExcludeFromEditorLimit |
				EditorInputCapabilities.Singleton |
				EditorInputCapabilities.Readonly |
				EditorInputCapabilities.CannotClose,
			visibleCapabilities: EditorInputCapabilities.ExcludeFromEditorLimit |
				EditorInputCapabilities.Singleton |
				EditorInputCapabilities.Readonly,
			capabilitiesChanges: 1
		});
	});

	test('is closable while the part that shows it is visible: the main window\'s editor area for the main part, the part\'s own visibility for the part of another window', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		let mainEditorAreaVisible = false;
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible(part: Parts): boolean {
				return part === Parts.EDITOR_PART && mainEditorAreaVisible;
			}
		};
		const otherPartContextKeyService = disposables.add(new MockContextKeyService());
		const otherPartVisible = MainEditorAreaVisibleContext.bindTo(otherPartContextKeyService);
		let inOtherPart = false;
		const otherPart = new class extends mock<IEditorPart>() {
			override readonly groups = [new class extends mock<IEditorGroup>() {
				override readonly scopedContextKeyService = otherPartContextKeyService;
				override contains(): boolean { return inOtherPart; }
			}()];
		}();
		const editorGroupsService = new class extends TestEditorGroupsService {
			override readonly parts: readonly IEditorPart[] = [this, otherPart];
		}();
		const input = disposables.add(new SessionChangesEditorInput(
			URI.parse('test-changes:session'),
			instantiationService,
			emptySessionChangesService,
			layoutService,
			editorGroupsService,
			noSessions,
		));
		const closable = () => (input.capabilities & EditorInputCapabilities.CannotClose) === 0;

		const results: Record<string, boolean> = {};
		for (const [name, main, other, inOther] of [
			['main part, editor area hidden', false, true, false],
			['main part, editor area visible', true, false, false],
			['other part visible, main editor area hidden', false, true, true],
			['other part hidden, main editor area visible', true, false, true],
		] as const) {
			mainEditorAreaVisible = main;
			otherPartVisible.set(other);
			inOtherPart = inOther;
			results[name] = closable();
		}

		assert.deepStrictEqual(results, {
			'main part, editor area hidden': false,
			'main part, editor area visible': true,
			'other part visible, main editor area hidden': true,
			'other part hidden, main editor area visible': false,
		});
	});

	test('updates the tab badge class and accessible label with the changed file count', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const changes = observableValue<readonly ISessionFileChange[]>('changes', []);
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible(): boolean {
				return true;
			}
		};
		const resource = URI.parse('test-changes:session');
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override readonly activeSessionUncommittedChangesCountObs = derived(reader => changes.read(reader).length);
			override getSessionResource(): URI | undefined { return undefined; }
			override getChatResource(): URI | undefined { return undefined; }
		};
		const input = disposables.add(new SessionChangesEditorInput(
			resource,
			instantiationService,
			sessionChangesService,
			layoutService,
			new TestEditorGroupsService(),
			noSessions,
		));
		let labelChanges = 0;
		disposables.add(input.onDidChangeLabel(() => labelChanges++));

		changes.set([createFileChange(1)], undefined);
		const oneChangeAriaLabel = input.getAriaLabel();
		changes.set(Array.from({ length: 10 }, (_, index) => createFileChange(index)), undefined);

		assert.deepStrictEqual({
			oneChangeAriaLabel,
			tenChangesAriaLabel: input.getAriaLabel(),
			labelExtraClasses: input.getLabelExtraClasses(),
			labelChanges,
		}, {
			oneChangeAriaLabel: 'Changes, 1 file',
			tenChangesAriaLabel: 'Changes, 10 files',
			labelExtraClasses: ['session-changes-editor-label'],
			labelChanges: 2,
		});
	});

	test('the Changes tab of a chat is described and titled by the chat, also once it is renamed; the tab of a session is described as the session', () => {
		const sessionResource = URI.parse('agent-host-copilotcli:/session');
		const chatResource = URI.parse('agent-host-copilotcli:/session#nested');
		const chatTitle = observableValue('chatTitle', 'Fix the tests');
		const chat = new class extends mock<IChat>() {
			override readonly resource = chatResource;
			override readonly title = chatTitle;
		}();
		const session = new class extends mock<ISession>() {
			override readonly chats = constObservable([chat]);
		}();
		const changes = observableValue<readonly ISessionFileChange[]>('changes', [createFileChange(1)]);
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override readonly activeSessionUncommittedChangesCountObs = derived(reader => changes.read(reader).length);
			override getSessionResource(): URI | undefined { return sessionResource; }
			override getChatResource(resource: URI): URI | undefined { return resource.query === 'chat' ? chatResource : undefined; }
		};
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override getSession(resource: URI) { return resource.toString() === sessionResource.toString() ? session : undefined; }
		};
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible(): boolean { return true; }
		};
		const instantiationService = disposables.add(new TestInstantiationService());
		const create = (query: string) => disposables.add(new SessionChangesEditorInput(URI.from({ scheme: 'test-changes', query }), instantiationService, sessionChangesService, layoutService, new TestEditorGroupsService(), sessionsManagementService));
		const ofChat = create('chat');
		const ofSession = create('session');
		const labels = (input: SessionChangesEditorInput) => ({ name: input.getName(), description: input.getDescription(), title: input.getTitle(), ariaLabel: input.getAriaLabel() });
		let chatLabelChanges = 0;
		disposables.add(ofChat.onDidChangeLabel(() => chatLabelChanges++));
		const named = labels(ofChat);
		chatTitle.set('Fix the flaky tests', undefined);

		assert.deepStrictEqual({ named, renamed: labels(ofChat), chatLabelChanges, ofSession: labels(ofSession) }, {
			named: { name: 'Changes', description: 'Fix the tests', title: 'Changes · Fix the tests', ariaLabel: 'Changes · Fix the tests, 1 file' },
			renamed: { name: 'Changes', description: 'Fix the flaky tests', title: 'Changes · Fix the flaky tests', ariaLabel: 'Changes · Fix the flaky tests, 1 file' },
			chatLabelChanges: 1,
			ofSession: { name: 'Changes', description: 'Session', title: 'Changes', ariaLabel: 'Changes, 1 file' },
		});
	});

	/**
	 * A Changes editor of the main window, with the header's Changes picker as the main window's header creates it for the
	 * editor, whose inputs resolve their diffs only when the test lets them, as resolving the documents of the diffs does.
	 */
	function createSwitchingEditor() {
		const activeSession = observableValue<URI | undefined>('activeSession', URI.parse('agent-host-copilotcli:/outgoing'));
		const changesLoading = observableValue('changesLoading', false);
		// Whether the session still initializes: the service's loading covers it as well as its changes loading.
		const sessionLoading = observableValue('sessionLoading', false);
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules(): boolean { return true; }
		});
		instantiationService.stub(IMenuService, disposables.add(instantiationService.createInstance(MenuService)));
		// The editor shows the changes of its host's session: here the main window's.
		const mainWindowSession = constObservable<ITestSessionWithChat | undefined>(undefined);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			readonly activeSession = mainWindowSession;
			readonly mainWindowActiveSession = mainWindowSession;
			readonly windowSessions = constObservable<readonly ITestSessionWithChat[]>([]);
		}());
		stubSessionHosts(instantiationService, disposables, { session: mainWindowSession });
		// While the incoming session's changes load, the active summary keeps the outgoing session's, as the service does.
		const changeset = upcastPartial<ISessionChangeset>({ id: 'branch', label: 'Branch Changes', isEnabled: constObservable(true), isDefault: constObservable(true) });
		const summary = observableValue<ISessionChangesSummary | undefined>('summary', { files: 2, additions: 5, deletions: 1 });
		const changes = observableValue<readonly ISessionFileChange[]>('changes', []);
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
			override readonly activeSessionHasGitRepositoryObs = constObservable(false);
			override readonly activeSessionResourceObs = activeSession;
			override readonly activeSessionChangesetLoadingObs = changesLoading;
			override readonly activeSessionLoadingObs = derived(reader => sessionLoading.read(reader) || changesLoading.read(reader));
			override readonly activeSessionChangesObs = changes;
			override readonly activeSessionChangesetsObs = constObservable([changeset]);
			override readonly activeSessionChangesetsLoadingObs = constObservable(false);
			override readonly activeSessionChangesetObs = constObservable(changeset);
			override readonly activeSessionChangesSummaryObs = summary;
		}());
		instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService { override isMotionReduced() { return true; } }());
		const layoutService = { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop, onDidChangePartVisibility: Event.None, isVisible: () => true };
		instantiationService.stub(IAgentWorkbenchLayoutService, layoutService);
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		instantiationService.stub(ISessionsHostLayoutService, layoutService);
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override readonly activeSessionUncommittedChangesCountObs = constObservable(0);
			override getSessionResource(resource: URI): URI | undefined {
				return URI.parse(JSON.parse(resource.query).sessionResource);
			}
			override getChatResource(): URI | undefined { return undefined; }
		}());
		instantiationService.stub(IDiffEditorOptionsService, new class extends mock<IDiffEditorOptionsService>() {
			override readonly viewMode = constObservable<DiffEditorViewMode>('automatic');
			override readonly diffEditorWordWrap = constObservable<SessionsWordWrap>('off');
		}());
		const shownViewModel = observableValue<MultiDiffEditorViewModel | undefined>('shownViewModel', undefined);
		instantiationService.stubInstance(MultiDiffEditorWidget, {
			viewModel: shownViewModel,
			onDidChangeActiveControl: Event.None,
			setPaddingBottom() { },
			setVariant() { },
			setDiffLayoutOptions() { },
			setViewModel(viewModel: MultiDiffEditorViewModel | undefined) { shownViewModel.set(viewModel, undefined); },
			getViewState() { return { scrollState: { top: 0, left: 0 } }; },
			layout() { },
			dispose() { },
		});

		const disposedViewModels: string[] = [];
		const viewModelRequests = new Map<string, DeferredPromise<MultiDiffEditorViewModel>[]>();
		const onDidRequestViewModel = disposables.add(new Emitter<void>());
		const itemsByInput = new Map<string, ISettableObservable<readonly DocumentDiffItemViewModel[]>>();
		const resolvingDocumentsByInput = new Map<string, ISettableObservable<boolean>>();
		const createInput = (name: string, hasChanges: boolean) => {
			const items = observableValue<readonly DocumentDiffItemViewModel[]>('items', hasChanges ? [upcastPartial<DocumentDiffItemViewModel>({})] : []);
			itemsByInput.set(name, items);
			const resolvingDocuments = observableValue('resolvingDocuments', false);
			resolvingDocumentsByInput.set(name, resolvingDocuments);
			const viewModel = new class extends mock<MultiDiffEditorViewModel>() {
				override readonly isLoading = observableValue('isLoading', false);
				override readonly items = items;
				override toString() { return name; }
			}();
			const input = disposables.add(instantiationService.createInstance(SessionChangesEditorInput, URI.parse(`changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/${name}"}`)));
			input.getViewModel = () => {
				const request = new DeferredPromise<MultiDiffEditorViewModel>();
				viewModelRequests.set(name, [...viewModelRequests.get(name) ?? [], request]);
				onDidRequestViewModel.fire();
				return request.p.then(() => viewModel);
			};
			// The editor lets go of what the input resolved.
			input.clear = () => disposedViewModels.push(name);
			Object.defineProperty(input, 'multiDiffInput', { value: upcastPartial<MultiDiffEditorInput>({ isResolvingDocuments: resolvingDocuments }) });
			return input;
		};
		/** Waits until the editor asks `name` for its diffs the `count`th time. */
		const whenRequested = async (name: string, count = 1) => {
			while ((viewModelRequests.get(name)?.length ?? 0) < count) {
				await Event.toPromise(onDidRequestViewModel.event);
			}
		};
		/** Settles the `index`th request for the diffs of `name`, waiting for it first. */
		const settleViewModel = async (name: string, index = 0, error?: Error) => {
			await whenRequested(name, index + 1);
			const request = viewModelRequests.get(name)![index];
			if (error) {
				request.error(error);
			} else {
				request.complete(upcastPartial<MultiDiffEditorViewModel>({}));
			}
		};
		const parent = append(mainWindow.document.body, $('.editor-instance'));
		disposables.add(toDisposable(() => parent.remove()));
		const editor = disposables.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		editor.create(parent);
		editor.setVisible(true);
		instantiationService.stub(IActionWidgetService, new class extends mock<IActionWidgetService>() { }());
		const pickerSummary = disposables.add(instantiationService.createInstance(ChangesPickerSummary, summary));
		const action = new MenuItemAction({ id: 'test.versionsPicker', title: 'Versions' }, undefined, undefined, undefined, undefined, new MockContextKeyService(), new class extends mock<ICommandService>() { }());
		disposables.add(editor.scopedInstantiationService!.createInstance(ChangesPickerActionItem, action, pickerSummary, undefined, undefined)).render(append(parent, $('.header')));
		const isShown = (element: HTMLElement | null) => !!element && !element.hidden && mainWindow.getComputedStyle(element).display !== 'none';
		/** What the editor and its header show now: its diffs, whether it is pending, and the stats its header shows and announces. */
		const state = () => {
			const headerSummary = parent.querySelector<HTMLElement>('.changes-picker-summary');
			return {
				shown: String(shownViewModel.get()),
				placeholderHidden: !!parent.querySelector('.session-changes-editor-body.changes-loading'),
				emptyState: isShown(parent.querySelector<HTMLElement>('.session-changes-editor-empty-state')),
				headerStats: isShown(headerSummary) ? [...headerSummary!.children].map(child => child.textContent).join(' ') : 'hidden',
				headerAriaLabel: parent.querySelector<HTMLElement>('.header .action-label')?.ariaLabel,
				disposed: [...disposedViewModels],
			};
		};
		/** {@link state} once the progress would show, with whether it does. */
		const presentation = async () => {
			await timeout(250);
			return { progress: isShown(parent.querySelector<HTMLElement>('.session-changes-editor-progress .monaco-progress-container.active')), ...state() };
		};
		/** Lets the multi-diff of `name` resolve the documents of its changes, then show the diffs of `count` of them. */
		const resolveDocuments = (name: string, resolving: boolean, count = 0) => transaction(tx => {
			resolvingDocumentsByInput.get(name)!.set(resolving, tx);
			itemsByInput.get(name)!.set(Array.from({ length: count }, () => upcastPartial<DocumentDiffItemViewModel>({})), tx);
		});
		return { editor, activeSession, changesLoading, sessionLoading, summary, changes, shownViewModel, disposedViewModels, createInput, whenRequested, settleViewModel, resolveDocuments, state, presentation };
	}

	for (const loadingSettles of [true, false]) {
		test(`stops showing the replaced input's diffs right away and shows its progress until the incoming input's diffs resolve, keeping its diffs only when the same input is set again (load settles: ${loadingSettles})`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { editor, activeSession, changesLoading, summary, shownViewModel, disposedViewModels, createInput, settleViewModel, presentation } = createSwitchingEditor();

			const outgoing = createInput('outgoing', true);
			const opened = editor.setInput(outgoing, undefined, {}, CancellationToken.None);
			await settleViewModel('outgoing');
			await opened;
			const beforeSwitch = await presentation();
			const incoming = createInput('incoming', false);
			activeSession.set(URI.parse('agent-host-copilotcli:/incoming'), undefined);
			changesLoading.set(true, undefined);
			editor.clearInput();
			const switched = editor.setInput(incoming, undefined, {}, CancellationToken.None);
			outgoing.dispose();
			const whileChangesLoad = await presentation();
			// The incoming session has no changes.
			const finishLoading = () => transaction(tx => {
				changesLoading.set(false, tx);
				summary.set(undefined, tx);
			});
			if (loadingSettles) {
				finishLoading();
			} else {
				await timeout(1000);
			}
			const whileDiffsResolve = await presentation();
			await settleViewModel('incoming');
			await switched;
			const resolved = await presentation();
			finishLoading();
			const loaded = await presentation();
			editor.clearInput();
			const reloaded = editor.setInput(incoming, { forceReload: true }, {}, CancellationToken.None);
			const whileReloading = await presentation();
			await settleViewModel('incoming', 1);
			await reloaded;
			editor.clearInput();
			await timeout(0);

			const pending = { progress: true, placeholderHidden: true, emptyState: false, headerStats: 'hidden', headerAriaLabel: 'Branch Changes' };
			const emptyIncoming = { progress: false, shown: 'incoming', placeholderHidden: false, emptyState: true, headerStats: 'hidden', headerAriaLabel: 'Branch Changes', disposed: ['outgoing'] };
			assert.deepStrictEqual({ beforeSwitch, whileChangesLoad, whileDiffsResolve, resolved, loaded, whileReloading, afterClear: { shown: String(shownViewModel.get()), disposed: disposedViewModels } }, {
				beforeSwitch: { progress: false, shown: 'outgoing', placeholderHidden: false, emptyState: false, headerStats: '2 Files +5 -1', headerAriaLabel: 'Branch Changes, 2 files, 5 additions, 1 deletions', disposed: [] },
				whileChangesLoad: { shown: 'undefined', ...pending, disposed: ['outgoing'] },
				whileDiffsResolve: { shown: 'undefined', ...pending, disposed: ['outgoing'] },
				// Once the editor stops waiting for the changes, it shows what it resolved, still pending while they load.
				resolved: loadingSettles ? { ...emptyIncoming } : { shown: 'incoming', ...pending, disposed: ['outgoing'] },
				loaded: { ...emptyIncoming },
				whileReloading: { ...emptyIncoming },
				afterClear: { shown: 'undefined', disposed: ['outgoing', 'incoming'] },
			});
		}));
	}

	test('an earlier resolve of an input set again since, A then B then A, neither shows its diffs nor ends the pending state of the latest; clearing the input ends it', async () => {
		const { editor, createInput, whenRequested, settleViewModel, state } = createSwitchingEditor();
		const a = createInput('a', true);
		const b = createInput('b', true);
		// As editor panes do: each open cancels the previous one and clears the input before setting the next.
		let operation: CancellationTokenSource | undefined;
		const open = (input: SessionChangesEditorInput) => {
			operation?.dispose(true);
			operation = new CancellationTokenSource();
			editor.clearInput();
			return editor.setInput(input, undefined, {}, operation.token);
		};

		const a1 = open(a);
		await whenRequested('a');
		const b1 = open(b);
		await whenRequested('b');
		const a2 = open(a);
		await whenRequested('a', 2);
		const whileResolvingA2 = state();
		// What the first resolve of A asked for was let go of when it was cleared.
		await settleViewModel('a', 0, new CancellationError());
		await a1;
		const afterFirstResolveOfA = state();
		await settleViewModel('b');
		await b1;
		const afterResolveOfB = state();
		await settleViewModel('a', 1);
		await a2;
		const resolvedA2 = state();
		const b2 = open(b);
		await whenRequested('b', 2);
		const whileResolvingB2 = state();
		operation?.dispose(true);
		editor.clearInput();
		const cleared = state();
		await settleViewModel('b', 1);
		await b2;
		const afterClearedResolve = state();

		const pending = { shown: 'undefined', placeholderHidden: true, emptyState: false, headerStats: 'hidden', headerAriaLabel: 'Branch Changes' };
		const notPending = { shown: 'undefined', placeholderHidden: false, emptyState: false, headerStats: '2 Files +5 -1', headerAriaLabel: 'Branch Changes, 2 files, 5 additions, 1 deletions' };
		assert.deepStrictEqual({ whileResolvingA2, afterFirstResolveOfA, afterResolveOfB, resolvedA2, whileResolvingB2, cleared, afterClearedResolve }, {
			whileResolvingA2: { ...pending, disposed: ['a', 'b'] },
			afterFirstResolveOfA: { ...pending, disposed: ['a', 'b'] },
			afterResolveOfB: { ...pending, disposed: ['a', 'b'] },
			resolvedA2: { ...notPending, shown: 'a', disposed: ['a', 'b'] },
			whileResolvingB2: { ...pending, disposed: ['a', 'b', 'a'] },
			cleared: { ...notPending, disposed: ['a', 'b', 'a', 'b'] },
			afterClearedResolve: { ...notPending, disposed: ['a', 'b', 'a', 'b'] },
		});
	});

	for (const outcome of ['resolve', 'fail'] as const) {
		test(`while the documents of its changes resolve after its view model, it shows its progress rather than that there are none, and its header no stats, until they settle (${outcome})`, async () => {
			const { editor, activeSession, summary, changes, createInput, settleViewModel, resolveDocuments, presentation } = createSwitchingEditor();
			activeSession.set(URI.parse('agent-host-copilotcli:/many'), undefined);
			summary.set({ files: 1, additions: 1, deletions: 0 }, undefined);
			changes.set([createFileChange(1)], undefined);
			const input = createInput('many', false);
			const opened = editor.setInput(input, undefined, {}, CancellationToken.None);
			await settleViewModel('many');
			await opened;
			editor.setVisible(true);
			// The changes are known while the multi-diff still resolves their documents: it shows none yet.
			resolveDocuments('many', true);
			const whileResolving = await presentation();
			// The documents of all the changes resolved, or every one of them failed to.
			resolveDocuments('many', false, outcome === 'resolve' ? 1 : 0);
			const settled = await presentation();
			editor.clearInput();

			const pending = { progress: true, shown: 'many', placeholderHidden: true, emptyState: false, headerStats: 'hidden', headerAriaLabel: 'Branch Changes', disposed: [] };
			assert.deepStrictEqual({ whileResolving, settled }, {
				whileResolving: pending,
				settled: { progress: false, shown: 'many', placeholderHidden: false, emptyState: outcome === 'fail', headerStats: '1 File +1 -0', headerAriaLabel: 'Branch Changes, 1 file, 1 additions, 0 deletions', disposed: [] },
			});
		});
	}

	test('while the session of its input initializes, with its changes not loading, it shows its progress and its header no stats, also once it shows what it resolved meanwhile', async () => {
		const { editor, activeSession, sessionLoading, summary, createInput, settleViewModel, presentation } = createSwitchingEditor();
		activeSession.set(URI.parse('agent-host-copilotcli:/initializing'), undefined);
		sessionLoading.set(true, undefined);
		const input = createInput('initializing', false);
		const opened = editor.setInput(input, undefined, {}, CancellationToken.None);
		const whileWaiting = await presentation();
		// What it resolves while the session still initializes shows no diffs, which need not be all its changes.
		await settleViewModel('initializing');
		await opened;
		const stillInitializing = await presentation();
		// The session initialized: its summary is its own, and it has no changes.
		transaction(tx => {
			sessionLoading.set(false, tx);
			summary.set(undefined, tx);
		});
		const initialized = await presentation();
		editor.clearInput();

		const pending = { progress: true, placeholderHidden: true, emptyState: false, headerStats: 'hidden', headerAriaLabel: 'Branch Changes', disposed: [] };
		assert.deepStrictEqual({ whileWaiting, stillInitializing, initialized }, {
			whileWaiting: { ...pending, shown: 'undefined' },
			stillInitializing: { ...pending, shown: 'initializing' },
			initialized: { progress: false, shown: 'initializing', placeholderHidden: false, emptyState: true, headerStats: 'hidden', headerAriaLabel: 'Branch Changes', disposed: [] },
		});
	});
});

function createFileChange(index: number): ISessionFileChange {
	const uri = URI.file(`/workspace/file${index}.ts`);
	return {
		uri,
		originalUri: uri.with({ scheme: 'git', query: 'ref=base' }),
		modifiedUri: uri.with({ scheme: 'git', query: 'ref=head' }),
		insertions: 1,
		deletions: 0,
	};
}
