/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, Dimension } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MultiDiffEditorViewModel } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { MultiDiffEditorWidget } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { DiffEditorViewMode } from '../../../../../editor/common/config/editorOptions.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { AgentWorkbenchLayout, ISessionsHostLayoutService } from '../../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { IDiffEditorOptionsService, SessionsWordWrap } from '../../../../../workbench/services/editor/common/diffEditorOptionsService.js';
import { SessionChangesEditor } from '../../../../../workbench/contrib/sessionChanges/browser/sessionChangesEditor.js';
import { MultiDiffEditorWithFileListWidget } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorWithFileListWidget.js';
import { MultiDiffEditorFileList } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorFileList.js';
import { FocusFileListAction } from '../../../../../workbench/contrib/multiDiffEditor/browser/actions.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { SessionChangesEditorFileListContext } from '../../../../../workbench/contrib/sessions/common/changes.js';
import { isMultiDiffEditorFileListHost, multiDiffEditorExperimentalFileListSetting, MultiDiffEditorFileListAvailableContext, MultiDiffEditorFileListEnabledContext, MultiDiffEditorFileListVisibleContext, toggleMultiDiffEditorFileList } from '../../../../../workbench/contrib/multiDiffEditor/common/multiDiffEditor.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ISessionChangesService } from '../../../../../workbench/contrib/sessionChanges/browser/sessionChangesService.js';
import { ITestSessionWithChat, stubSessionHosts } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { IChangesSessionObservables, IChangesViewService } from '../../../../../workbench/contrib/sessions/common/changesViewService.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IChat, ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { timeout } from '../../../../../base/common/async.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { InMemoryTextModelService } from '../../../../../editor/common/services/inMemoryTextModelService.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { DiffItemSource, IDocumentDiffItem } from '../../../../../editor/browser/widget/multiDiffEditor/model.js';
import { Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { SessionChangesEditorInput } from '../../../../../workbench/contrib/sessionChanges/browser/sessionChangesEditorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { EditorPane } from '../../../../../workbench/browser/parts/editor/editorPane.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IMatchEditorOptions, IUntypedEditorInput } from '../../../../../workbench/common/editor.js';
import '../../../../../editor/browser/widget/multiDiffEditor/style.css';
import '../../../../../workbench/contrib/sessionChanges/browser/media/sessionChangesEditor.css';

suite('SessionChangesEditor empty state layout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('centers before resize observers run after initial layout, resizing, and restoring empty content', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules(): boolean { return true; }
		});
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const activeSession = constObservable<ITestSessionWithChat | undefined>(undefined);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			readonly activeSession = activeSession;
			readonly mainWindowActiveSession = activeSession;
			readonly windowSessions = constObservable<readonly ITestSessionWithChat[]>([]);
		}());
		stubSessionHosts(instantiationService, store, { session: activeSession });
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
			override readonly activeSessionHasGitRepositoryObs = constObservable(false);
		}());
		const agentLayoutService = {
			agentWorkbenchLayout: AgentWorkbenchLayout.Desktop,
		};
		instantiationService.stub(IAgentWorkbenchLayoutService, agentLayoutService);
		instantiationService.stub(ISessionsHostLayoutService, agentLayoutService);
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() { }());
		instantiationService.stub(IDiffEditorOptionsService, new class extends mock<IDiffEditorOptionsService>() {
			override readonly viewMode = constObservable<DiffEditorViewMode>('automatic');
			override readonly diffEditorWordWrap = constObservable<SessionsWordWrap>('off');
		}());
		const loading = observableValue('loading', false);
		const model = new class extends mock<MultiDiffEditorViewModel>() {
			override readonly isLoading = loading;
			override readonly items = constObservable([]);
		}();
		const viewModel = observableValue<MultiDiffEditorViewModel | undefined>('viewModel', model);
		const diffWidget = {
			viewModel,
			onDidChangeActiveControl: Event.None,
			setPaddingBottom() { },
			setVariant() { },
			setDiffLayoutOptions() { },
			layout() { },
			dispose() { },
		};
		instantiationService.stubInstance(MultiDiffEditorWidget, diffWidget);
		instantiationService.stubInstance(MultiDiffEditorWithFileListWidget, {
			multiDiffEditorWidget: diffWidget as unknown as MultiDiffEditorWidget,
			isFileListVisible: observableValue('fileListVisible', false),
			layout() { },
			dispose() { },
		});
		const group = append(mainWindow.document.body, $('.editor-group-container'));
		group.style.cssText = 'height: 0; width: 400px; --vscode-spacing-size160: 16px; --vscode-spacing-size240: 24px; --vscode-spacing-size280: 28px;';
		store.add(toDisposable(() => group.remove()));
		const header = append(group, $('div'));
		header.style.height = '35px';
		const parent = append(group, $('.editor-instance'));
		parent.style.height = '365px';
		const editor = store.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		editor.create(parent);
		const container = parent.querySelector<HTMLElement>('.session-changes-editor-empty-state')!;
		const content = container.querySelector<HTMLElement>('.sessions-empty-state-content')!;
		const actions = container.querySelector<HTMLElement>('.changes-empty-state-actions')!;
		const status = container.querySelector<HTMLElement>('.sessions-empty-state-description')!;
		const initialTranslate = content.style.translate;
		const results = [];
		for (const height of [400, 640, 260, 400]) {
			for (const headerHeight of [35, 28]) {
				group.style.height = `${height}px`;
				header.style.height = `${headerHeight}px`;
				parent.style.height = `${height - headerHeight}px`;
				editor.layout(new Dimension(400, height - headerHeight));
				for (const restored of [false, true]) {
					if (restored) {
						loading.set(true, undefined);
						group.style.height = `${height + 100}px`;
						parent.style.height = `${height + 100 - headerHeight}px`;
						loading.set(false, undefined);
					}
					const bounds = group.getBoundingClientRect();
					results.push({
						height, headerHeight, restored,
						visible: !container.hidden,
						aligned: Math.abs(actions.getBoundingClientRect().top - (bounds.top + bounds.bottom) / 2 + 42) < 1,
						statusAboveActions: status.getBoundingClientRect().bottom < actions.getBoundingClientRect().top,
						insideEditor: content.getBoundingClientRect().top >= container.getBoundingClientRect().top
							&& content.getBoundingClientRect().bottom <= container.getBoundingClientRect().bottom,
					});
				}
			}
		}
		assert.deepStrictEqual({ initialTranslate, results }, {
			initialTranslate: '',
			results: results.map(result => ({
				...result, visible: true, aligned: true, statusAboveActions: true, insideEditor: true,
			})),
		});
	});
});

suite('SessionChangesEditor spacing', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('the leading Changes card keeps the gap of the cards between them above it, as in other editors', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		root.style.cssText = '--vscode-spacing-size40: 4px; --vscode-spacing-size80: 8px; --vscode-spacing-size320: 32px; --vscode-strokeThickness: 1px;';
		store.add(toDisposable(() => root.remove()));
		const results = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const changesEditor of [true, false]) {
				const body = append(root, $(changesEditor ? '.session-changes-editor-body' : '.other-editor-body'));
				for (const cards of [true, false]) {
					const widget = append(body, $('.monaco-component.multiDiffEditor.multiDiffEditor-compact'));
					widget.classList.toggle('multiDiffEditor-card', cards);
					for (const first of [true, false]) {
						const entry = append(widget, $('.multiDiffEntry'));
						entry.classList.toggle('first-diff-entry', first);
						const header = append(entry, $('.header'));
						header.setAttribute('aria-expanded', 'true');
						const content = append(header, $('.header-content'));
						for (const sticky of [false, true]) {
							header.classList.toggle('shadow', sticky);
							results.push({
								theme, changesEditor, cards, first, sticky,
								topMargin: mainWindow.getComputedStyle(content).marginTop,
							});
						}
					}
				}
				body.remove();
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(results, results.map(result => ({
			...result,
			topMargin: result.cards && !result.sticky ? '4px' : '0px',
		})));
	});

	test('the leading card keeps the diff body at the same offset when its header becomes sticky', () => {
		const container = append(mainWindow.document.body, $('.session-changes-editor-body'));
		container.style.cssText = '--vscode-spacing-size40: 4px; --vscode-spacing-size80: 8px; --vscode-spacing-size320: 32px; --vscode-strokeThickness: 1px;';
		store.add(toDisposable(() => container.remove()));
		const widget = append(container, $('.monaco-component.multiDiffEditor.multiDiffEditor-compact.multiDiffEditor-card'));
		widget.style.cssText = 'width: 800px; height: 120px;';
		const content = append(widget, $('div'));
		const entry = append(content, $('.multiDiffEntry.first-diff-entry'));
		entry.style.cssText = 'position: absolute; width: 800px; height: 1000px;';
		const header = append(entry, $('.header'));
		header.setAttribute('aria-expanded', 'true');
		const headerContent = append(header, $('.header-content'));
		const body = append(entry, $('.editorParent'));
		const results = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			container.classList.add(theme);
			for (const top of [0, 10, 0]) {
				header.style.transform = `translateY(${top}px)`;
				header.classList.toggle('shadow', top > 0);
				results.push({
					theme, top,
					sticky: header.classList.contains('shadow'),
					headerFlowHeight: headerContent.offsetHeight + Number.parseFloat(mainWindow.getComputedStyle(headerContent).marginTop),
					bodyOffset: body.getBoundingClientRect().top - entry.getBoundingClientRect().top,
				});
			}
			container.classList.remove(theme);
		}
		assert.deepStrictEqual(results, ['vs', 'vs-dark', 'hc-black', 'hc-light'].flatMap(theme =>
			[0, 10, 0].map(top => ({ theme, top, sticky: top > 0, headerFlowHeight: 36, bodyOffset: 36 }))));
	});
});

suite('SessionChangesEditor changed files list', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows the changed files list only while its host enables it, with a header border that the list continues, until the user hides it', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const parent = append(mainWindow.document.body, $('.editor-instance'));
		parent.style.cssText = '--vscode-strokeThickness: 1px; --vscode-multiDiffEditor-border: rgb(1, 2, 3);';
		store.add(toDisposable(() => parent.remove()));
		// The host, such as an editor part, owns a scoped context key service that the editors in it inherit.
		const hostContextKeyService = store.add(store.add(new ContextKeyService(instantiationService.get(IConfigurationService))).createScoped(parent));
		instantiationService.stub(IContextKeyService, hostContextKeyService);
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const activeSession = constObservable<ITestSessionWithChat | undefined>(undefined);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			readonly activeSession = activeSession;
			readonly mainWindowActiveSession = activeSession;
			readonly windowSessions = constObservable<readonly ITestSessionWithChat[]>([]);
		}());
		stubSessionHosts(instantiationService, store, { session: activeSession });
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
			override readonly activeSessionHasGitRepositoryObs = constObservable(false);
		}());
		instantiationService.stub(IAgentWorkbenchLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop });
		instantiationService.stub(ISessionsHostLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop });
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() { }());
		instantiationService.stub(IDiffEditorOptionsService, new class extends mock<IDiffEditorOptionsService>() {
			override readonly viewMode = constObservable<DiffEditorViewMode>('automatic');
			override readonly diffEditorWordWrap = constObservable<SessionsWordWrap>('off');
		}());
		instantiationService.stubInstance(MultiDiffEditorWidget, {
			viewModel: observableValue<MultiDiffEditorViewModel | undefined>('viewModel', undefined),
			onDidChangeActiveControl: Event.None,
			setPaddingBottom() { },
			setVariant() { },
			setDiffLayoutOptions() { },
			layout() { },
			dispose() { },
		});
		const calls: string[] = [];
		instantiationService.stubInstance(MultiDiffEditorFileList, {
			layout() { },
			focus() { calls.push('focus'); },
			dispose() { },
		});
		const editor = store.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		editor.create(parent);
		editor.layout(new Dimension(800, 400));
		const body = parent.querySelector<HTMLElement>('.session-changes-editor-body')!;
		const read = () => {
			const headerBorder = mainWindow.getComputedStyle(body, '::before');
			return {
				available: hostContextKeyService.getContextKeyValue(MultiDiffEditorFileListAvailableContext.key),
				shown: hostContextKeyService.getContextKeyValue(MultiDiffEditorFileListEnabledContext.key),
				visible: hostContextKeyService.getContextKeyValue(MultiDiffEditorFileListVisibleContext.key),
				focusFileListInCommandPalette: hostContextKeyService.contextMatchesRules(new FocusFileListAction().desc.precondition),
				headerBorder: body.classList.contains('file-list-visible') ? `${headerBorder.top} ${headerBorder.height} ${headerBorder.backgroundColor}` : 'none',
			};
		};

		const off = read();
		editor.focusFileList();
		const focusedWhileOff = { ...read(), calls: [...calls] };
		const hostFileList = SessionChangesEditorFileListContext.bindTo(hostContextKeyService);
		hostFileList.set(true);
		const on = read();
		toggleMultiDiffEditorFileList(instantiationService.get(IStorageService));
		const hidden = read();
		editor.focusFileList();
		const focused = { ...read(), calls: [...calls] };
		hostFileList.reset();
		const offAgain = read();

		const hiddenList = { available: true, shown: false, visible: false, focusFileListInCommandPalette: true, headerBorder: 'none' };
		const noList = { available: false, shown: false, visible: false, focusFileListInCommandPalette: false, headerBorder: 'none' };
		const list = { available: true, shown: true, visible: true, focusFileListInCommandPalette: true, headerBorder: '-1px 1px rgb(1, 2, 3)' };
		assert.deepStrictEqual({ experimentalFileList: instantiationService.get(IConfigurationService).getValue(multiDiffEditorExperimentalFileListSetting) ?? false, off, focusedWhileOff, on, hidden, focused, offAgain, togglesFromHeader: editor.togglesFileListFromEditorHeader, host: isMultiDiffEditorFileListHost(editor) }, {
			experimentalFileList: false,
			off: noList,
			focusedWhileOff: { ...noList, calls: [] },
			on: list,
			hidden: hiddenList,
			focused: { ...list, calls: ['focus'] },
			offAgain: noList,
			togglesFromHeader: true,
			host: true,
		});
	});
});

suite('SessionChangesEditor disposal', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('the diffs it shows do not render again as they dispose, such as with the services they render with disposed', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const activeSession = constObservable<ITestSessionWithChat | undefined>(undefined);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			readonly activeSession = activeSession;
			readonly mainWindowActiveSession = activeSession;
			readonly windowSessions = constObservable<readonly ITestSessionWithChat[]>([]);
		}());
		stubSessionHosts(instantiationService, store, { session: activeSession });
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
			override readonly activeSessionHasGitRepositoryObs = constObservable(false);
		}());
		instantiationService.stub(IAgentWorkbenchLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop });
		instantiationService.stub(ISessionsHostLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop });
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() { }());
		instantiationService.stub(IDiffEditorOptionsService, new class extends mock<IDiffEditorOptionsService>() {
			override readonly viewMode = constObservable<DiffEditorViewMode>('automatic');
			override readonly diffEditorWordWrap = constObservable<SessionsWordWrap>('off');
		}());
		// The real diffs, as the multi-diff editor's tests create them
		instantiationService.stub(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		instantiationService.stub(IEditorProgressService, new class extends mock<IEditorProgressService>() { }());
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService(false));
		instantiationService.stub(ITextModelService, instantiationService.createInstance(InMemoryTextModelService));
		// Instantiation services that dispose as the workbench's do, which those of the test services do not
		const editorInstantiationService = store.add(new InstantiationService(new ServiceCollection(), false, instantiationService));

		const parent = append(mainWindow.document.body, $('.editor-instance'));
		store.add(toDisposable(() => parent.remove()));
		const editor = store.add(editorInstantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		editor.create(parent);
		editor.layout(new Dimension(800, 400));
		const widget = (editor as unknown as { widget: MultiDiffEditorWidget }).widget;
		const documents = [URI.file('/repo/added.png'), URI.file('/repo/other.png')].map(modified => store.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original: undefined, modified: new DiffItemSource(modified, undefined) }, { dispose() { } })));
		const viewModel = store.add(widget.createViewModel({ documents: ValueWithChangeEvent.const(documents) }));
		await waitForState(viewModel.items, items => items.length === documents.length);
		widget.setViewModel(viewModel, { preserveFocus: true });
		await waitForState(viewModel.isLoading, isLoading => !isLoading);

		const errors: string[] = [];
		const handler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => errors.push(String(error)));
		try {
			editor.dispose();
		} finally {
			setUnexpectedErrorHandler(handler);
		}

		assert.deepStrictEqual(errors, []);
	});
});

suite('SessionChangesEditor input', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('lets go of what its input resolved only when no other group shows the input, such as the one its tab moved to, whose diffs would otherwise empty', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const activeSession = constObservable<ITestSessionWithChat | undefined>(undefined);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			readonly activeSession = activeSession;
			readonly mainWindowActiveSession = activeSession;
			readonly windowSessions = constObservable<readonly ITestSessionWithChat[]>([]);
		}());
		stubSessionHosts(instantiationService, store, { session: activeSession });
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
			override readonly activeSessionHasGitRepositoryObs = constObservable(false);
		}());
		instantiationService.stub(IAgentWorkbenchLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop, onDidChangePartVisibility: Event.None });
		instantiationService.stub(ISessionsHostLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop });
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override readonly activeSessionUncommittedChangesCountObs = constObservable(0);
			override getSessionResource(): URI | undefined { return undefined; }
			override getChatResource(): URI | undefined { return undefined; }
		}());
		instantiationService.stub(IDiffEditorOptionsService, new class extends mock<IDiffEditorOptionsService>() {
			override readonly viewMode = constObservable<DiffEditorViewMode>('automatic');
			override readonly diffEditorWordWrap = constObservable<SessionsWordWrap>('off');
		}());
		const input = store.add(instantiationService.createInstance(SessionChangesEditorInput, URI.parse('session-changes:/session')));
		const cleared: boolean[] = [];
		input.clear = () => { cleared.push(true); };
		const otherGroupShows = { value: true };
		const groups = [
			upcastPartial<IEditorGroup>({ id: 1, contains: () => false }),
			upcastPartial<IEditorGroup>({ id: 2, contains: (editor: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions) => otherGroupShows.value && editor === input && !!options?.strictEquals }),
		];
		Object.defineProperty(instantiationService.get(IEditorGroupsService), 'groups', { get: () => groups });
		const editor = store.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		const clearWith = (shownElsewhere: boolean) => {
			otherGroupShows.value = shownElsewhere;
			cleared.length = 0;
			EditorPane.prototype.setInput.call(editor, input, undefined, {}, CancellationToken.None);
			editor.clearInput();
			return cleared.length;
		};

		assert.deepStrictEqual({ movedToAnotherGroup: clearWith(true), closed: clearWith(false) }, { movedToAnotherGroup: 0, closed: 1 });
	});
});

suite('SessionChangesEditor chat changes observation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the chat its input names observed while it has that input, also while the pane hides so its diffs and their view state stay, letting go as the input changes or clears or the editor closes', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const activeSession = constObservable<ITestSessionWithChat | undefined>(undefined);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			readonly activeSession = activeSession;
			readonly mainWindowActiveSession = activeSession;
			readonly windowSessions = constObservable<readonly ITestSessionWithChat[]>([]);
		}());
		stubSessionHosts(instantiationService, store, { session: activeSession });
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
			override readonly activeSessionHasGitRepositoryObs = constObservable(false);
			override readonly activeSessionResourceObs = constObservable<URI | undefined>(undefined);
			override readonly activeSessionChangesetLoadingObs = constObservable(false);
			override getSessionChanges(): IChangesSessionObservables {
				return upcastPartial<IChangesSessionObservables>({ changesObs: constObservable([]), changesetLoadingObs: constObservable(false) });
			}
		}());
		instantiationService.stub(IAgentWorkbenchLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop, onDidChangePartVisibility: Event.None, isVisible: () => true });
		instantiationService.stub(ISessionsHostLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop });
		const sessionResource = URI.parse('agent-host:/session');
		const live = new Map<string, number>();
		const chat = (name: string) => upcastPartial<IChat>({
			resource: URI.parse(`agent-host-chat:/session/${name}`),
			title: constObservable(name),
			observeChanges: () => {
				live.set(name, (live.get(name) ?? 0) + 1);
				return toDisposable(() => live.set(name, live.get(name)! - 1));
			},
		});
		const chats = [chat('x'), chat('y')];
		const session = upcastPartial<ISession>({ sessionId: 'session', resource: sessionResource, chats: constObservable(chats) });
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override getSession(resource: URI): ISession | undefined { return resource.toString() === sessionResource.toString() ? session : undefined; }
		}());
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override readonly activeSessionUncommittedChangesCountObs = constObservable(0);
			override getSessionResource(): URI | undefined { return sessionResource; }
			override getChatResource(resource: URI): URI | undefined { return resource.path === '/session' ? undefined : chats.find(chat => chat.resource.path.endsWith(resource.path))?.resource; }
		}());
		instantiationService.stub(IDiffEditorOptionsService, new class extends mock<IDiffEditorOptionsService>() {
			override readonly viewMode = constObservable<DiffEditorViewMode>('automatic');
			override readonly diffEditorWordWrap = constObservable<SessionsWordWrap>('off');
		}());
		const input = (path: string) => {
			const input = store.add(instantiationService.createInstance(SessionChangesEditorInput, URI.parse(`session-changes:${path}`)));
			input.getViewModel = () => new Promise<MultiDiffEditorViewModel>(() => { });
			input.clear = () => { };
			return input;
		};
		const [inputX, inputY, inputSession] = [input('/x'), input('/y'), input('/session')];
		const editor = store.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		const state = () => ({ x: live.get('x') ?? 0, y: live.get('y') ?? 0 });
		const show = async (input: SessionChangesEditorInput) => {
			void editor.setInput(input, undefined, {}, CancellationToken.None);
			await timeout(0);
			return state();
		};

		editor.setVisible(true);
		const chatX = await show(inputX);
		const changedToChatY = await show(inputY);
		editor.setVisible(false);
		const hidden = state();
		editor.setVisible(true);
		const shownAgain = state();
		editor.clearInput();
		const cleared = state();
		const sessionLevel = await show(inputSession);
		const chatXAgain = await show(inputX);
		editor.dispose();

		assert.deepStrictEqual({ chatX, changedToChatY, hidden, shownAgain, cleared, sessionLevel, chatXAgain, closed: state() }, {
			chatX: { x: 1, y: 0 },
			changedToChatY: { x: 0, y: 1 },
			hidden: { x: 0, y: 1 },
			shownAgain: { x: 0, y: 1 },
			cleared: { x: 0, y: 0 },
			sessionLevel: { x: 0, y: 0 },
			chatXAgain: { x: 1, y: 0 },
			closed: { x: 0, y: 0 },
		});
	});
});

suite('SessionChangesEditor chat changes loading', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('while the chat its input names loads its changes, past the time setInput waits for them, shows its own progress rather than "No Changed Files", only while visible, and the empty state once loaded', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const activeSession = constObservable<ITestSessionWithChat | undefined>(undefined);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			readonly activeSession = activeSession;
			readonly mainWindowActiveSession = activeSession;
			readonly windowSessions = constObservable<readonly ITestSessionWithChat[]>([]);
		}());
		stubSessionHosts(instantiationService, store, { session: activeSession });
		const changesetLoading = observableValue('changesetLoading', true);
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
			override readonly activeSessionHasGitRepositoryObs = constObservable(false);
			override readonly activeSessionResourceObs = constObservable<URI | undefined>(undefined);
			override readonly activeSessionChangesetLoadingObs = constObservable(false);
			override getSessionChanges(): IChangesSessionObservables {
				return upcastPartial<IChangesSessionObservables>({ changesObs: constObservable([]), changesetLoadingObs: changesetLoading, hasGitRepositoryObs: constObservable(false) });
			}
		}());
		instantiationService.stub(IAgentWorkbenchLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop, onDidChangePartVisibility: Event.None, isVisible: () => true });
		instantiationService.stub(ISessionsHostLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop });
		const sessionResource = URI.parse('agent-host:/session');
		const chat = upcastPartial<IChat>({ resource: URI.parse('agent-host-chat:/session/x'), title: constObservable('x') });
		const session = upcastPartial<ISession>({ sessionId: 'session', resource: sessionResource, chats: constObservable([chat]) });
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override getSession(): ISession | undefined { return session; }
		}());
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override readonly activeSessionUncommittedChangesCountObs = constObservable(0);
			override getSessionResource(): URI | undefined { return sessionResource; }
			override getChatResource(): URI | undefined { return chat.resource; }
		}());
		instantiationService.stub(IDiffEditorOptionsService, new class extends mock<IDiffEditorOptionsService>() {
			override readonly viewMode = constObservable<DiffEditorViewMode>('automatic');
			override readonly diffEditorWordWrap = constObservable<SessionsWordWrap>('off');
		}());
		instantiationService.stub(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		instantiationService.stub(IEditorProgressService, new class extends mock<IEditorProgressService>() { }());
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService(false));
		instantiationService.stub(ITextModelService, instantiationService.createInstance(InMemoryTextModelService));
		const editorInstantiationService = store.add(new InstantiationService(new ServiceCollection(), false, instantiationService));

		const parent = append(mainWindow.document.body, $('.editor-instance'));
		store.add(toDisposable(() => parent.remove()));
		const editor = store.add(editorInstantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		editor.create(parent);
		editor.layout(new Dimension(800, 400));
		const widget = (editor as unknown as { widget: MultiDiffEditorWidget }).widget;
		const viewModel = store.add(widget.createViewModel({ documents: ValueWithChangeEvent.const([]) }));
		const input = store.add(instantiationService.createInstance(SessionChangesEditorInput, URI.parse('session-changes:/x')));
		input.getViewModel = async () => viewModel;
		input.clear = () => { };
		const shown = (selector: string) => {
			const element = parent.querySelector<HTMLElement>(selector);
			return !!element && !element.hidden && mainWindow.getComputedStyle(element).display !== 'none';
		};
		const presentation = async () => {
			await timeout(250);
			return {
				noChangedFilesPlaceholder: shown('.multiDiffEditor .placeholder.visible'),
				emptyState: shown('.session-changes-editor-empty-state'),
				progress: shown('.session-changes-editor-progress .monaco-progress-container.active'),
			};
		};
		editor.setVisible(true);
		// Resolves the empty diffs once it stops waiting for the changes, which are still loading.
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await waitForState(viewModel.isLoading, isLoading => !isLoading);
		const loading = await presentation();
		editor.setVisible(false);
		const loadingHidden = await presentation();
		editor.setVisible(true);
		const loadingShownAgain = await presentation();
		changesetLoading.set(false, undefined);
		const loaded = await presentation();
		editor.clearInput();

		assert.deepStrictEqual({ loading, loadingHidden, loadingShownAgain, loaded }, {
			loading: { noChangedFilesPlaceholder: false, emptyState: false, progress: true },
			loadingHidden: { noChangedFilesPlaceholder: false, emptyState: false, progress: false },
			loadingShownAgain: { noChangedFilesPlaceholder: false, emptyState: false, progress: true },
			loaded: { noChangedFilesPlaceholder: false, emptyState: true, progress: false },
		});
	});

	test('waits and is pending for the changes of the chat its input names only, not for those of another chat of its session that the main window shows', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const activeSession = constObservable<ITestSessionWithChat | undefined>(undefined);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			readonly activeSession = activeSession;
			readonly mainWindowActiveSession = activeSession;
			readonly windowSessions = constObservable<readonly ITestSessionWithChat[]>([]);
		}());
		stubSessionHosts(instantiationService, store, { session: activeSession });
		const sessionResource = URI.parse('agent-host:/session');
		const chatLoading = observableValue('chatLoading', false);
		// The main window shows the session, with the changes of its chat there still loading.
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
			override readonly activeSessionHasGitRepositoryObs = constObservable(false);
			override readonly activeSessionResourceObs = constObservable<URI | undefined>(sessionResource);
			override readonly activeSessionChangesetLoadingObs = constObservable(true);
			override getSessionChanges(): IChangesSessionObservables {
				return upcastPartial<IChangesSessionObservables>({ changesObs: constObservable([]), changesetLoadingObs: chatLoading, hasGitRepositoryObs: constObservable(false) });
			}
		}());
		instantiationService.stub(IAgentWorkbenchLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop, onDidChangePartVisibility: Event.None, isVisible: () => true });
		instantiationService.stub(ISessionsHostLayoutService, { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop });
		const chat = upcastPartial<IChat>({ resource: URI.parse('agent-host-chat:/session/x'), title: constObservable('x') });
		const session = upcastPartial<ISession>({ sessionId: 'session', resource: sessionResource, chats: constObservable([chat]) });
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override getSession(): ISession | undefined { return session; }
		}());
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override readonly activeSessionUncommittedChangesCountObs = constObservable(0);
			override getSessionResource(): URI | undefined { return sessionResource; }
			override getChatResource(): URI | undefined { return chat.resource; }
		}());
		instantiationService.stub(IDiffEditorOptionsService, new class extends mock<IDiffEditorOptionsService>() {
			override readonly viewMode = constObservable<DiffEditorViewMode>('automatic');
			override readonly diffEditorWordWrap = constObservable<SessionsWordWrap>('off');
		}());
		instantiationService.stub(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		instantiationService.stub(IEditorProgressService, new class extends mock<IEditorProgressService>() { }());
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService(false));
		instantiationService.stub(ITextModelService, instantiationService.createInstance(InMemoryTextModelService));
		const editorInstantiationService = store.add(new InstantiationService(new ServiceCollection(), false, instantiationService));

		const parent = append(mainWindow.document.body, $('.editor-instance'));
		store.add(toDisposable(() => parent.remove()));
		const editor = store.add(editorInstantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		editor.create(parent);
		editor.layout(new Dimension(800, 400));
		const widget = (editor as unknown as { widget: MultiDiffEditorWidget }).widget;
		const viewModel = store.add(widget.createViewModel({ documents: ValueWithChangeEvent.const([]) }));
		const input = store.add(instantiationService.createInstance(SessionChangesEditorInput, URI.parse('session-changes:/x')));
		input.getViewModel = async () => viewModel;
		input.clear = () => { };
		const state = () => ({ shown: widget.viewModel.get() === viewModel, pending: !!parent.querySelector('.session-changes-editor-body.changes-loading') });
		editor.setVisible(true);

		const opened = editor.setInput(input, undefined, {}, CancellationToken.None);
		// Well before the time setInput waits for changes that load.
		await timeout(50);
		const whileOtherChatLoads = state();
		chatLoading.set(true, undefined);
		const whileChatLoads = state();
		chatLoading.set(false, undefined);
		const chatLoaded = state();
		await opened;
		editor.clearInput();

		assert.deepStrictEqual({ whileOtherChatLoads, whileChatLoads, chatLoaded }, {
			whileOtherChatLoads: { shown: true, pending: false },
			whileChatLoads: { shown: true, pending: true },
			chatLoaded: { shown: true, pending: false },
		});
	});
});
