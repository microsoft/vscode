/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IDimension } from '../../../../../base/browser/dom.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IViewContainerModel, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../../../workbench/common/views.js';
import { IEditorGroup, IEditorGroupsService, IEditorWorkingSet } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../../workbench/services/panecomposite/browser/panecomposite.js';
import { IPaneComposite } from '../../../../../workbench/common/panecomposite.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IEditorWillOpenEvent, IUntypedEditorInput, isResourceEditorInput } from '../../../../../workbench/common/editor.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, IChat, ISession, ISessionFileChange, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionChangesService, SessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { CHANGES_VIEW_CONTAINER_ID } from '../../../changes/common/changes.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../../files/browser/files.contribution.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { ILifecycleService } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { IChangesViewService } from '../../../changes/common/changesViewService.js';

export function makeChange(filePath: string): ISessionFileChange {
	return { uri: URI.file(filePath), insertions: 1, deletions: 0 };
}

/** A minimal editor input for tests, identified only by its resource. */
export class TestStubEditorInput extends EditorInput {
	constructor(private readonly _resource: URI) { super(); }
	override get typeId(): string { return 'test.stubEditor'; }
	override get resource(): URI { return this._resource; }
	override toUntyped(): IUntypedEditorInput { return { resource: this._resource }; }
}

export function makeSession(resource: URI, opts?: {
	status?: SessionStatus;
	isCreated?: boolean;
	changes?: readonly ISessionFileChange[];
	workspace?: ISessionWorkspace;
	isQuickChat?: boolean;
}): IActiveSession {
	const status = observableValue('status', opts?.status ?? SessionStatus.Completed);
	const chat: IChat = {
		resource,
		createdAt: new Date(),
		title: observableValue('title', 'Test'),
		updatedAt: observableValue('updatedAt', new Date()),
		status,
		checkpoints: observableValue('checkpoints', undefined),
		changes: observableValue('changes', opts?.changes ?? []),
		modelId: observableValue('modelId', undefined),
		mode: observableValue('mode', undefined),
		isArchived: observableValue('isArchived', false),
		isRead: observableValue('isRead', true),
		interactivity: observableValue('interactivity', ChatInteractivity.Full),
		lastTurnEnd: observableValue('lastTurnEnd', undefined),
		description: observableValue('description', undefined),
	};

	return {
		sessionId: `test:${resource.toString()}`,
		resource,
		providerId: 'test',
		sessionType: 'local',
		icon: Codicon.copilot,
		createdAt: chat.createdAt,
		workspace: observableValue('workspace', opts?.workspace ?? {
			uri: URI.file('/repo'),
			label: 'test',
			icon: Codicon.repo,
			folders: [{
				root: URI.file('/repo'),
				workingDirectory: URI.file('/repo'),
				name: 'repo',
				description: undefined,
				gitRepository: undefined,
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		}),
		title: chat.title,
		updatedAt: chat.updatedAt,
		status: chat.status,
		changesets: constObservable([]),
		changes: chat.changes,
		modelId: chat.modelId,
		mode: chat.mode,
		loading: observableValue('loading', false),
		isArchived: chat.isArchived,
		isRead: chat.isRead,
		lastTurnEnd: chat.lastTurnEnd,
		description: chat.description,
		chats: observableValue('chats', [chat]),
		activeChat: observableValue('activeChat', chat),
		mainChat: constObservable(chat),
		capabilities: constObservable({ supportsMultipleChats: false }),
		isCreated: opts?.isCreated === undefined
			? status.map(status => status !== SessionStatus.Untitled)
			: observableValue('isCreated', opts.isCreated),
		sticky: observableValue('sticky', false),
		openChats: observableValue('openChats', [chat]),
		closedChats: constObservable([]),
		lastClosedChat: undefined,
		visibleChatTabs: constObservable([chat]),
		shouldShowChatTabs: constObservable(false),
		isQuickChat: constObservable(opts?.isQuickChat ?? false),
	};
}

export interface ICreateOptions {
	readonly useModal?: 'off' | 'some' | 'all';
	readonly workspaceFolders?: readonly { readonly uri: URI }[];
	readonly layoutState?: readonly object[];
	readonly newSessionViewState?: { readonly auxiliaryBarVisible: boolean };
	readonly newSessionViewStateRaw?: string;
	/** [D7] Value for `sessions.layout.autoCollapseSessionsSidebar` (defaults to enabled). */
	readonly responsiveSidebar?: boolean;
	/** [D7] When set, `openView`/`openViewContainer` reveal the auxiliary bar (mirroring production) so navigation reveals can be exercised. */
	readonly revealAuxiliaryBarOnOpen?: boolean;
	/** Initial main container width (defaults to 2000). Set below `SMALL_WINDOW_MAX_WIDTH` to start space-constrained. */
	readonly mainContainerWidth?: number;
	/** Initial part visibility overrides applied before the controller is constructed (mirrors restored layout after a reload). */
	readonly initialPartVisibility?: ReadonlyMap<Parts, boolean>;
	/** IDs of aux-bar view containers active at construction (defaults to Changes + Files). Empty ⇒ no active aux containers (e.g. a quick chat). */
	readonly activeAuxViewContainerIds?: readonly string[];
	/** When set, resolves the lifecycle `Restored` phase so a single-pane controller's managed-tab / detail-panel behaviour activates. */
	readonly activateAux?: boolean;
	/** When true, the layout service reports single-pane layout enabled (drives base single-pane branches). */
	readonly singlePaneLayoutEnabled?: boolean;
}

/**
 * Mutable test harness shared by the base / desktop / mobile controller test
 * suites. Mocks read the mutable fields on each call, so a test can reassign
 * (e.g. `harness.openedViews = []`) or mutate them between actions.
 */
export interface ITestLayoutHarness {
	readonly instaService: TestInstantiationService;
	storageService: TestStorageService;
	activeSessionObs: ISettableObservable<IActiveSession | undefined>;
	visibleSessionsObs: ISettableObservable<readonly (IActiveSession | undefined)[]>;
	onDidChangeSessions: Emitter<ISessionsChangeEvent>;
	onDidReplaceSession: Emitter<{ readonly from: ISession; readonly to: ISession }>;
	onDidChangePartVisibility: Emitter<IPartVisibilityChangeEvent>;
	onDidChangeEditorMaximized: Emitter<void>;
	onDidActiveEditorChange: Emitter<void>;
	onWillOpenEditor: Emitter<IEditorWillOpenEvent>;
	onDidCloseEditor: Emitter<{ editor: EditorInput }>;
	onDidEditorsChange: Emitter<void>;
	onDidLayoutMainContainer: Emitter<IDimension>;
	onDidChangeViewContainerVisibility: Emitter<{ id: string; visible: boolean; location: ViewContainerLocation }>;
	onDidChangeActiveViewDescriptors: Emitter<void>;
	/** IDs of aux-bar view containers that are currently active (shown as a tab). */
	activeAuxViewContainerIds: string[];
	mainContainerWidth: number;
	editorMaximized: boolean;
	partVisibility: Map<Parts, boolean>;
	openedViewContainers: string[];
	openedViews: string[];
	setPartHiddenCalls: { hidden: boolean; part: Parts }[];
	/** Value returned by the layout service's `isEditorRevealedExplicitly()` mock. */
	editorRevealedExplicitly: boolean;
	/** Predicate registered via `setEditorRevealOnOpenExclusion()` (managed editors that shouldn't reveal the editor area). */
	editorRevealOnOpenExclusion: ((editor: EditorInput) => boolean) | undefined;
	/** Current suppression depth for `suppressEditorPartAutoVisibility()`. */
	editorPartAutoVisibilitySuppressionDepth: number;
	/** Whether the lifecycle `Restored` phase has resolved (activates single-pane managed-tab / detail-panel behaviour). */
	activateAux: boolean;
	/** Editors in the main part's active group (drives the single-pane managed-tab logic). */
	activeGroupEditors: EditorInput[];
	/** Records editors closed via `IEditorService.closeEditors`. */
	closedEditors: EditorInput[];
	/** Records untyped editors reopened via `IEditorService.openEditors`. */
	openedEditors: IUntypedEditorInput[];
	/** Records the depth-at-close for each `closeEditors` call, to assert layout-driven closes happen while suppressed. */
	closeSuppressionFlags: boolean[];
	activePaneCompositeId: string | undefined;
	pinnedAuxiliaryBarContainerIds: string[];
	visibleEditorsList: readonly unknown[];
	activeEditorResource: URI | undefined;
	/** Whether the editor groups have content (drives `hasEditors` in `toggleSidePane`). */
	editorGroupsHaveContent: boolean;
	/** Records every `applyWorkingSet` call made by the controller. */
	applyWorkingSetCalls: (IEditorWorkingSet | 'empty')[];
	/** Records the name of every `saveWorkingSet` call made by the controller. */
	saveWorkingSetCalls: string[];
	/**
	 * Optional callback invoked synchronously during `applyWorkingSet`, allowing
	 * tests to simulate external visibility changes (e.g. the single-pane detail
	 * panel) while `_isRestoringSessionLayout` is true.
	 */
	onApplyWorkingSet?: () => void;
	readonly sessionChangesService: ISessionChangesService;
	readonly contextKeyService: MockContextKeyService;
	activeEditorInput?: EditorInput;
}

export function createTestHarness(store: DisposableStore, options: ICreateOptions = {}): ITestLayoutHarness {
	const instaService = store.add(new TestInstantiationService());

	const storageService = store.add(new TestStorageService());
	if (options.layoutState) {
		const raw = JSON.stringify(options.layoutState);
		// Seed both the classic desktop key and the fresh single-pane key so the
		// same harness serves both the LayoutController and SinglePaneLayoutController tests.
		storageService.store('sessions.layoutState', raw, StorageScope.WORKSPACE, 0);
		storageService.store('sessions.singlePane.layoutState', raw, StorageScope.WORKSPACE, 0);
	}
	if (options.newSessionViewState) {
		const raw = JSON.stringify(options.newSessionViewState);
		storageService.store('sessions.newSessionViewState', raw, StorageScope.WORKSPACE, 0);
		storageService.store('sessions.singlePane.newSessionViewState', raw, StorageScope.WORKSPACE, 0);
	}
	if (options.newSessionViewStateRaw !== undefined) {
		storageService.store('sessions.newSessionViewState', options.newSessionViewStateRaw, StorageScope.WORKSPACE, 0);
		storageService.store('sessions.singlePane.newSessionViewState', options.newSessionViewStateRaw, StorageScope.WORKSPACE, 0);
	}
	instaService.stub(IStorageService, storageService);

	const configService = new TestConfigurationService();
	configService.setUserConfiguration('workbench.editor.useModal', options.useModal ?? 'all');
	configService.setUserConfiguration('sessions.layout.autoCollapseSessionsSidebar', options.responsiveSidebar ?? true);
	instaService.stub(IConfigurationService, configService);
	const contextKeyService = store.add(new MockContextKeyService());
	instaService.stub(IContextKeyService, contextKeyService);

	const harness: ITestLayoutHarness = {
		instaService,
		storageService,
		activeSessionObs: observableValue<IActiveSession | undefined>('activeSession', undefined),
		visibleSessionsObs: observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', []),
		onDidChangeSessions: store.add(new Emitter<ISessionsChangeEvent>()),
		onDidReplaceSession: store.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>()),
		onDidChangePartVisibility: store.add(new Emitter<IPartVisibilityChangeEvent>()),
		onDidChangeEditorMaximized: store.add(new Emitter<void>()),
		onDidActiveEditorChange: store.add(new Emitter<void>()),
		onWillOpenEditor: store.add(new Emitter<IEditorWillOpenEvent>()),
		onDidCloseEditor: store.add(new Emitter<{ editor: EditorInput }>()),
		onDidEditorsChange: store.add(new Emitter<void>()),
		onDidLayoutMainContainer: store.add(new Emitter<IDimension>()),
		onDidChangeViewContainerVisibility: store.add(new Emitter<{ id: string; visible: boolean; location: ViewContainerLocation }>()),
		onDidChangeActiveViewDescriptors: store.add(new Emitter<void>()),
		activeAuxViewContainerIds: options.activeAuxViewContainerIds ? [...options.activeAuxViewContainerIds] : [CHANGES_VIEW_CONTAINER_ID, SESSIONS_FILES_CONTAINER_ID],
		mainContainerWidth: options.mainContainerWidth ?? 2000,
		editorMaximized: false,
		partVisibility: new Map<Parts, boolean>([
			[Parts.AUXILIARYBAR_PART, true],
			[Parts.PANEL_PART, false],
			[Parts.EDITOR_PART, true],
			...(options.initialPartVisibility ?? []),
		]),
		openedViewContainers: [],
		openedViews: [],
		setPartHiddenCalls: [],
		editorRevealedExplicitly: false,
		editorRevealOnOpenExclusion: undefined,
		editorPartAutoVisibilitySuppressionDepth: 0,
		activateAux: options.activateAux ?? false,
		activeGroupEditors: [],
		closedEditors: [],
		openedEditors: [],
		closeSuppressionFlags: [],
		activePaneCompositeId: undefined,
		pinnedAuxiliaryBarContainerIds: [SESSIONS_FILES_CONTAINER_ID, CHANGES_VIEW_CONTAINER_ID],
		visibleEditorsList: [],
		activeEditorResource: undefined,
		activeEditorInput: undefined,
		editorGroupsHaveContent: true,
		applyWorkingSetCalls: [],
		saveWorkingSetCalls: [],
		sessionChangesService: new SessionChangesService(new class extends mock<IEditorService>() { }, instaService, configService),
		contextKeyService,
	};

	const testActiveGroup: IEditorGroup = new class extends mock<IEditorGroup>() {
		override readonly id = 1;
		override get editors() { return harness.activeGroupEditors as IEditorGroup['editors']; }
		override get count() { return harness.activeGroupEditors.length; }
		override get isEmpty() { return harness.activeGroupEditors.length === 0; }
		override isPinned() { return true; }
		override pinEditor() { }
		override getIndexOfEditor(editor: EditorInput) { return harness.activeGroupEditors.indexOf(editor); }
		override moveEditor(editor: EditorInput, _target: IEditorGroup, options?: { index?: number }) {
			const currentIndex = harness.activeGroupEditors.indexOf(editor);
			if (currentIndex === -1) {
				return false;
			}
			harness.activeGroupEditors.splice(currentIndex, 1);
			const targetIndex = Math.max(0, Math.min(options?.index ?? harness.activeGroupEditors.length, harness.activeGroupEditors.length));
			harness.activeGroupEditors.splice(targetIndex, 0, editor);
			return true;
		}
	};

	instaService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
		override readonly onDidChangeSessions = harness.onDidChangeSessions.event;
		override readonly onDidReplaceSession = harness.onDidReplaceSession.event;
		override getSessions() { return []; }
	});
	instaService.stub(ISessionsService, new class extends mock<ISessionsService>() {
		override readonly activeSession = harness.activeSessionObs;
		override readonly visibleSessions = harness.visibleSessionsObs;
	});

	instaService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
		override getChangesEditorResource(sessionResource: URI): URI { return harness.sessionChangesService.getChangesEditorResource(sessionResource); }
		override getSessionResource(editorResource: URI): URI | undefined { return harness.sessionChangesService.getSessionResource(editorResource); }
		override async openChangesEditor(sessionResource: URI, options?: { index?: number }): Promise<IEditorGroup> {
			const resource = harness.sessionChangesService.getChangesEditorResource(sessionResource);
			if (!harness.activeGroupEditors.some(e => e.resource && isEqual(e.resource, resource))) {
				const editor = store.add(new TestStubEditorInput(resource));
				const index = options?.index;
				if (typeof index === 'number' && index >= 0 && index <= harness.activeGroupEditors.length) {
					harness.activeGroupEditors.splice(index, 0, editor);
				} else {
					harness.activeGroupEditors.push(editor);
				}
			}
			return testActiveGroup;
		}
	});
	instaService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
		override setChangesetId(): void { }
	});
	instaService.stub(ILifecycleService, new class extends mock<ILifecycleService>() {
		// Resolves only when a test opts in via `activateAux`, so the single-pane
		// managed-tab / detail-panel behaviour is not spun up otherwise.
		override when(): Promise<void> { return harness.activateAux ? Promise.resolve() : new Promise<void>(() => { }); }
	});

	instaService.stub(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
		override isVisible(part: Parts): boolean {
			return harness.partVisibility.get(part) ?? true;
		}
		override setPartHidden(hidden: boolean, part: Parts): void {
			harness.setPartHiddenCalls.push({ hidden, part });
			const wasVisible = harness.partVisibility.get(part) ?? true;
			harness.partVisibility.set(part, !hidden);
			// Mirror production: fire the visibility change synchronously when it actually changes
			if (wasVisible === hidden) {
				harness.onDidChangePartVisibility.fire({ partId: part, visible: !hidden });
			}
		}
		override hasFocus(_part: Parts): boolean { return false; }
		suppressEditorPartAutoVisibility(): IDisposable {
			harness.editorPartAutoVisibilitySuppressionDepth++;
			return toDisposable(() => harness.editorPartAutoVisibilitySuppressionDepth--);
		}
		setEditorRevealOnOpenExclusion(predicate: (editor: EditorInput) => boolean): IDisposable {
			harness.editorRevealOnOpenExclusion = predicate;
			return toDisposable(() => { harness.editorRevealOnOpenExclusion = undefined; });
		}
		isEditorRevealedExplicitly(): boolean { return harness.editorRevealedExplicitly; }
		revealEditorPartExplicitly(): void {
			harness.editorRevealedExplicitly = true;
			this.setPartHidden(false, Parts.EDITOR_PART);
		}
		override readonly onDidChangePartVisibility = harness.onDidChangePartVisibility.event;
		isEditorMaximized(): boolean { return harness.editorMaximized; }
		get isSinglePaneLayoutEnabled(): boolean { return options.singlePaneLayoutEnabled ?? false; }
		readonly onDidChangeEditorMaximized = harness.onDidChangeEditorMaximized.event;
		override readonly onDidLayoutMainContainer = harness.onDidLayoutMainContainer.event;
		override get mainContainerDimension(): IDimension { return { width: harness.mainContainerWidth, height: 1000 }; }
	} as Partial<IWorkbenchLayoutService> as IWorkbenchLayoutService);

	instaService.stub(IViewsService, new class extends mock<IViewsService>() {
		override readonly onDidChangeViewContainerVisibility = harness.onDidChangeViewContainerVisibility.event;
		override isViewContainerActive(id: string): boolean {
			return harness.activeAuxViewContainerIds.includes(id);
		}
		override async openViewContainer(id: string) {
			harness.openedViewContainers.push(id);
			revealAuxiliaryBar();
			return null;
		}
		override closeViewContainer() { }
		override async openView(id: string) {
			harness.openedViews.push(id);
			revealAuxiliaryBar();
			return null;
		}
	});

	instaService.stub(IViewDescriptorService, new class extends mock<IViewDescriptorService>() {
		override readonly onDidChangeViewContainers = Event.None;
		override readonly onDidChangeContainerLocation = Event.None;
		override getViewContainersByLocation(location: ViewContainerLocation): ViewContainer[] {
			if (location !== ViewContainerLocation.AuxiliaryBar) {
				return [];
			}
			return [CHANGES_VIEW_CONTAINER_ID, SESSIONS_FILES_CONTAINER_ID].map(id => {
				const container: Partial<ViewContainer> = { id };
				return container as ViewContainer;
			});
		}
		override getViewContainerModel(_container: ViewContainer): IViewContainerModel {
			const model = { onDidChangeActiveViewDescriptors: harness.onDidChangeActiveViewDescriptors.event };
			return model as unknown as IViewContainerModel;
		}
	});

	function revealAuxiliaryBar(): void {
		if (!options.revealAuxiliaryBarOnOpen || harness.partVisibility.get(Parts.AUXILIARYBAR_PART) === true) {
			return;
		}
		harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
		harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
	}

	instaService.stub(IPaneCompositePartService, new class extends mock<IPaneCompositePartService>() {
		override getActivePaneComposite(_location: ViewContainerLocation): IPaneComposite | undefined {
			if (harness.activePaneCompositeId) {
				return new class extends mock<IPaneComposite>() {
					override getId() { return harness.activePaneCompositeId!; }
				};
			}
			return undefined;
		}
		override getPinnedPaneCompositeIds(_location: ViewContainerLocation): string[] {
			return [...harness.pinnedAuxiliaryBarContainerIds];
		}
	});

	instaService.stub(IEditorService, new class extends mock<IEditorService>() {
		override get visibleEditors() { return harness.visibleEditorsList as IEditorService['visibleEditors']; }
		override readonly onDidActiveEditorChange = harness.onDidActiveEditorChange.event;
		override readonly onWillOpenEditor = harness.onWillOpenEditor.event;
		override readonly onDidCloseEditor = harness.onDidCloseEditor.event as unknown as IEditorService['onDidCloseEditor'];
		override readonly onDidEditorsChange = harness.onDidEditorsChange.event as unknown as IEditorService['onDidEditorsChange'];
		override get activeEditor() {
			if (harness.activeEditorInput) {
				return harness.activeEditorInput as IEditorService['activeEditor'];
			}
			if (!harness.activeEditorResource) {
				return undefined;
			}
			const editor = { resource: harness.activeEditorResource };
			return editor as IEditorService['activeEditor'];
		}
		override async openEditor(...args: unknown[]): Promise<undefined> {
			const editor = args[0];
			if (editor instanceof EditorInput && !harness.activeGroupEditors.includes(editor)) {
				const options = args[1] as { index?: number } | undefined;
				const index = options?.index;
				if (typeof index === 'number' && index >= 0 && index <= harness.activeGroupEditors.length) {
					harness.activeGroupEditors.splice(index, 0, store.add(editor));
				} else {
					harness.activeGroupEditors.push(store.add(editor));
				}
			}
			return undefined;
		}
		override async openEditors(editors: readonly IUntypedEditorInput[]): Promise<never[]> {
			for (const editor of editors) {
				harness.openedEditors.push(editor);
				const resource = isResourceEditorInput(editor) ? editor.resource : undefined;
				if (resource) {
					const stub = store.add(new TestStubEditorInput(resource));
					const index = editor.options?.index;
					if (typeof index === 'number' && index >= 0 && index <= harness.activeGroupEditors.length) {
						harness.activeGroupEditors.splice(index, 0, stub);
					} else {
						harness.activeGroupEditors.push(stub);
					}
				}
			}
			return [];
		}
		override async closeEditors(editors: readonly { editor: EditorInput }[]): Promise<void> {
			for (const { editor } of editors) {
				const index = harness.activeGroupEditors.indexOf(editor);
				if (index !== -1) {
					harness.closeSuppressionFlags.push(harness.editorPartAutoVisibilitySuppressionDepth > 0);
					harness.activeGroupEditors.splice(index, 1);
					harness.closedEditors.push(editor);
				}
			}
		}
	});

	instaService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
		override get mainPart() {
			const groups = this.groups;
			return new class extends mock<IEditorGroupsService['mainPart']>() {
				override get groups() { return groups; }
				override get activeGroup() { return testActiveGroup; }
			};
		}
		override get groups() { return [{ isEmpty: !harness.editorGroupsHaveContent }] as unknown as IEditorGroupsService['groups']; }
		override saveWorkingSet(name: string): IEditorWorkingSet { harness.saveWorkingSetCalls.push(name); return { id: name, name }; }
		override async applyWorkingSet(workingSet: IEditorWorkingSet | 'empty') {
			harness.applyWorkingSetCalls.push(workingSet);
			harness.onApplyWorkingSet?.();
			return true;
		}
		override deleteWorkingSet() { }
	});

	instaService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
		override readonly onDidChangeWorkspaceFolders = Event.None;
		override getWorkspace(): IWorkspace { return { id: 'test', folders: (options.workspaceFolders ?? []) as IWorkspace['folders'] }; }
	});

	return harness;
}
