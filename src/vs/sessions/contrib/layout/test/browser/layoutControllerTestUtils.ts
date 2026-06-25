/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IDimension } from '../../../../../base/browser/dom.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ViewContainerLocation } from '../../../../../workbench/common/views.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../../workbench/services/panecomposite/browser/panecomposite.js';
import { IPaneComposite } from '../../../../../workbench/common/panecomposite.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISessionFileChange, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { CHANGES_VIEW_CONTAINER_ID } from '../../../changes/common/changes.js';
import { SESSIONS_FILES_CONTAINER_ID } from '../../../files/browser/files.contribution.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';

export function makeChange(filePath: string): ISessionFileChange {
	return { uri: URI.file(filePath), insertions: 1, deletions: 0 };
}

export function makeSession(resource: URI, opts?: {
	status?: SessionStatus;
	changes?: readonly ISessionFileChange[];
	workspace?: ISessionWorkspace;
}): IActiveSession {
	const chat: IChat = {
		resource,
		createdAt: new Date(),
		title: observableValue('title', 'Test'),
		updatedAt: observableValue('updatedAt', new Date()),
		status: observableValue('status', opts?.status ?? SessionStatus.Completed),
		checkpoints: observableValue('checkpoints', undefined),
		changes: observableValue('changes', opts?.changes ?? []),
		modelId: observableValue('modelId', undefined),
		mode: observableValue('mode', undefined),
		isArchived: observableValue('isArchived', false),
		isRead: observableValue('isRead', true),
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
		capabilities: { supportsMultipleChats: false },
		isCreated: observableValue('isCreated', true),
		sticky: observableValue('sticky', false),
		openChats: observableValue('openChats', [chat]),
		closedChats: constObservable([]),
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
	onDidChangePartVisibility: Emitter<IPartVisibilityChangeEvent>;
	onDidChangeEditorMaximized: Emitter<void>;
	onDidLayoutMainContainer: Emitter<IDimension>;
	mainContainerWidth: number;
	editorMaximized: boolean;
	partVisibility: Map<Parts, boolean>;
	openedViewContainers: string[];
	openedViews: string[];
	setPartHiddenCalls: { hidden: boolean; part: Parts }[];
	activePaneCompositeId: string | undefined;
	pinnedAuxiliaryBarContainerIds: string[];
	visibleEditorsList: readonly unknown[];
}

export function createTestHarness(store: DisposableStore, options: ICreateOptions = {}): ITestLayoutHarness {
	const instaService = store.add(new TestInstantiationService());

	const storageService = store.add(new TestStorageService());
	if (options.layoutState) {
		storageService.store('sessions.layoutState', JSON.stringify(options.layoutState), StorageScope.WORKSPACE, 0);
	}
	if (options.newSessionViewState) {
		storageService.store('sessions.newSessionViewState', JSON.stringify(options.newSessionViewState), StorageScope.WORKSPACE, 0);
	}
	if (options.newSessionViewStateRaw !== undefined) {
		storageService.store('sessions.newSessionViewState', options.newSessionViewStateRaw, StorageScope.WORKSPACE, 0);
	}
	instaService.stub(IStorageService, storageService);

	const configService = new TestConfigurationService();
	configService.setUserConfiguration('workbench.editor.useModal', options.useModal ?? 'all');
	configService.setUserConfiguration('sessions.layout.autoCollapseSessionsSidebar', options.responsiveSidebar ?? true);
	instaService.stub(IConfigurationService, configService);

	const harness: ITestLayoutHarness = {
		instaService,
		storageService,
		activeSessionObs: observableValue<IActiveSession | undefined>('activeSession', undefined),
		visibleSessionsObs: observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', []),
		onDidChangeSessions: store.add(new Emitter<ISessionsChangeEvent>()),
		onDidChangePartVisibility: store.add(new Emitter<IPartVisibilityChangeEvent>()),
		onDidChangeEditorMaximized: store.add(new Emitter<void>()),
		onDidLayoutMainContainer: store.add(new Emitter<IDimension>()),
		mainContainerWidth: 2000,
		editorMaximized: false,
		partVisibility: new Map<Parts, boolean>([
			[Parts.AUXILIARYBAR_PART, true],
			[Parts.PANEL_PART, false],
			[Parts.EDITOR_PART, true],
		]),
		openedViewContainers: [],
		openedViews: [],
		setPartHiddenCalls: [],
		activePaneCompositeId: undefined,
		pinnedAuxiliaryBarContainerIds: [SESSIONS_FILES_CONTAINER_ID, CHANGES_VIEW_CONTAINER_ID],
		visibleEditorsList: [],
	};

	instaService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
		override readonly onDidChangeSessions = harness.onDidChangeSessions.event;
		override getSessions() { return []; }
	});
	instaService.stub(ISessionsService, new class extends mock<ISessionsService>() {
		override readonly activeSession = harness.activeSessionObs;
		override readonly visibleSessions = harness.visibleSessionsObs;
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
		suppressEditorPartAutoVisibility(): IDisposable { return Disposable.None; }
		override readonly onDidChangePartVisibility = harness.onDidChangePartVisibility.event;
		isEditorMaximized(): boolean { return harness.editorMaximized; }
		readonly onDidChangeEditorMaximized = harness.onDidChangeEditorMaximized.event;
		override readonly onDidLayoutMainContainer = harness.onDidLayoutMainContainer.event;
		override get mainContainerDimension(): IDimension { return { width: harness.mainContainerWidth, height: 1000 }; }
	} as Partial<IWorkbenchLayoutService> as IWorkbenchLayoutService);

	instaService.stub(IViewsService, new class extends mock<IViewsService>() {
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
	});

	instaService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
		override saveWorkingSet(name: string): IEditorWorkingSet { return { id: name, name }; }
		override async applyWorkingSet() { return true; }
		override deleteWorkingSet() { }
	});

	instaService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
		override readonly onDidChangeWorkspaceFolders = Event.None;
		override getWorkspace(): IWorkspace { return { id: 'test', folders: (options.workspaceFolders ?? []) as IWorkspace['folders'] }; }
	});

	return harness;
}
