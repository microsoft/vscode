/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesView.css';
import * as dom from '../../../../base/browser/dom.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ICompressedTreeNode } from '../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { IObjectTreeElement, ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, IObservableWithChange, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { basename, dirname } from '../../../../base/common/path.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { MenuWorkbenchButtonBar } from '../../../../platform/actions/browser/buttonbar.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchCompressibleObjectTree } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { fillEditorsDragData } from '../../../../workbench/browser/dnd.js';
import { IResourceLabel, ResourceLabels } from '../../../../workbench/browser/labels.js';
import { ViewPane, IViewPaneOptions, ViewAction } from '../../../../workbench/browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { chatEditingWidgetFileStateContextKey, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, ModifiedFileEntryState } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { createFileIconThemableTreeContainerScope } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { IActivityService, NumberBadge } from '../../../../workbench/services/activity/common/activity.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../workbench/services/editor/common/editorService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';

const $ = dom.$;

// --- Constants

export const CHANGES_VIEW_CONTAINER_ID = 'workbench.view.agentSessions.changesContainer';
export const CHANGES_VIEW_ID = 'workbench.view.agentSessions.changes';

// --- View Mode

export const enum ChangesViewMode {
	List = 'list',
	Tree = 'tree'
}

const changesViewModeContextKey = new RawContextKey<ChangesViewMode>('changesViewMode', ChangesViewMode.List);

// --- List Item

type ChangeType = 'added' | 'modified' | 'deleted';

interface IChangesFileItem {
	readonly type: 'file';
	readonly uri: URI;
	readonly originalUri?: URI;
	readonly state: ModifiedFileEntryState;
	readonly isDeletion: boolean;
	readonly changeType: ChangeType;
	readonly linesAdded: number;
	readonly linesRemoved: number;
}

interface IChangesFolderItem {
	readonly type: 'folder';
	readonly uri: URI;
	readonly name: string;
}

interface IActiveSession {
	readonly resource: URI;
	readonly sessionType: string;
}

type ChangesTreeElement = IChangesFileItem | IChangesFolderItem;

function isChangesFileItem(element: ChangesTreeElement): element is IChangesFileItem {
	return element.type === 'file';
}

/**
 * Builds a tree of `IObjectTreeElement<ChangesTreeElement>` from a flat list of file items.
 * Groups files by their directory path segments to create a hierarchical tree structure.
 */
function buildTreeChildren(items: IChangesFileItem[]): IObjectTreeElement<ChangesTreeElement>[] {
	if (items.length === 0) {
		return [];
	}

	interface FolderNode {
		name: string;
		uri: URI;
		children: Map<string, FolderNode>;
		files: IChangesFileItem[];
	}

	const root: FolderNode = { name: '', uri: URI.file('/'), children: new Map(), files: [] };

	for (const item of items) {
		const dirPath = dirname(item.uri.path);
		const segments = dirPath.split('/').filter(Boolean);

		let current = root;
		let currentPath = '';
		for (const segment of segments) {
			currentPath += '/' + segment;
			if (!current.children.has(segment)) {
				current.children.set(segment, {
					name: segment,
					uri: item.uri.with({ path: currentPath }),
					children: new Map(),
					files: []
				});
			}
			current = current.children.get(segment)!;
		}
		current.files.push(item);
	}

	function convert(node: FolderNode): IObjectTreeElement<ChangesTreeElement>[] {
		const result: IObjectTreeElement<ChangesTreeElement>[] = [];

		for (const [, child] of node.children) {
			const folderElement: IChangesFolderItem = { type: 'folder', uri: child.uri, name: child.name };
			const folderChildren = convert(child);
			result.push({
				element: folderElement,
				children: folderChildren,
				collapsible: true,
				collapsed: false,
			});
		}

		for (const file of node.files) {
			result.push({
				element: file,
				collapsible: false,
			});
		}

		return result;
	}

	return convert(root);
}

// --- View Pane

export class ChangesViewPane extends ViewPane {

	private bodyContainer: HTMLElement | undefined;
	private welcomeContainer: HTMLElement | undefined;
	private contentContainer: HTMLElement | undefined;
	private overviewContainer: HTMLElement | undefined;
	private summaryContainer: HTMLElement | undefined;
	private listContainer: HTMLElement | undefined;
	// Actions container is positioned outside the card for this layout experiment
	private actionsContainer: HTMLElement | undefined;

	private tree: WorkbenchCompressibleObjectTree<ChangesTreeElement> | undefined;

	private readonly renderDisposables = this._register(new DisposableStore());

	// Track current body dimensions for list layout
	private currentBodyHeight = 0;
	private currentBodyWidth = 0;

	// View mode (list vs tree)
	private readonly viewModeObs: ReturnType<typeof observableValue<ChangesViewMode>>;
	private readonly viewModeContextKey: IContextKey<ChangesViewMode>;

	get viewMode(): ChangesViewMode { return this.viewModeObs.get(); }
	set viewMode(mode: ChangesViewMode) {
		if (this.viewModeObs.get() === mode) {
			return;
		}
		this.viewModeObs.set(mode, undefined);
		this.viewModeContextKey.set(mode);
		this.storageService.store('changesView.viewMode', mode, StorageScope.WORKSPACE, StorageTarget.USER);
	}

	// Track the active session used by this view
	private readonly activeSession: IObservableWithChange<IActiveSession | undefined>;
	private readonly activeSessionFileCountObs: IObservableWithChange<number>;
	private readonly activeSessionHasChangesObs: IObservableWithChange<boolean>;

	get activeSessionHasChanges(): IObservable<boolean> {
		return this.activeSessionHasChangesObs;
	}

	// Badge for file count
	private readonly badgeDisposable = this._register(new MutableDisposable());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
		@IEditorService private readonly editorService: IEditorService,
		@IActivityService private readonly activityService: IActivityService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
		@ILabelService private readonly labelService: ILabelService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// View mode
		const storedMode = this.storageService.get('changesView.viewMode', StorageScope.WORKSPACE);
		const initialMode = storedMode === ChangesViewMode.Tree ? ChangesViewMode.Tree : ChangesViewMode.List;
		this.viewModeObs = observableValue<ChangesViewMode>(this, initialMode);
		this.viewModeContextKey = changesViewModeContextKey.bindTo(contextKeyService);
		this.viewModeContextKey.set(initialMode);

		// Track active session from sessions management service
		this.activeSession = derivedOpts<IActiveSession | undefined>({
			equalsFn: (a, b) => isEqual(a?.resource, b?.resource),
		}, reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			if (!activeSession?.resource) {
				return undefined;
			}

			return {
				resource: activeSession.resource,
				sessionType: getChatSessionType(activeSession.resource),
			};
		}).recomputeInitiallyAndOnChange(this._store);

		this.activeSessionFileCountObs = this.createActiveSessionFileCountObservable();
		this.activeSessionHasChangesObs = this.activeSessionFileCountObs.map(fileCount => fileCount > 0).recomputeInitiallyAndOnChange(this._store);

		// Setup badge tracking
		this.registerBadgeTracking();

		// Set chatSessionType on the view's context key service so ViewTitle
		// menu items can use it in their `when` clauses. Update reactively
		// when the active session changes.
		const viewSessionTypeKey = this.scopedContextKeyService.createKey<string>(ChatContextKeys.agentSessionType.key, '');
		this._register(autorun(reader => {
			const activeSession = this.activeSession.read(reader);
			viewSessionTypeKey.set(activeSession?.sessionType ?? '');
		}));
	}

	private registerBadgeTracking(): void {
		// Update badge when file count changes
		this._register(autorun(reader => {
			const fileCount = this.activeSessionFileCountObs.read(reader);
			this.updateBadge(fileCount);
		}));
	}

	private createActiveSessionFileCountObservable(): IObservableWithChange<number> {
		const activeSessionResource = this.activeSession.map(a => a?.resource);

		const sessionsChangedSignal = observableFromEvent(
			this,
			this.agentSessionsService.model.onDidChangeSessions,
			() => ({}),
		);

		const sessionFileChangesObs = derived(reader => {
			const sessionResource = activeSessionResource.read(reader);
			sessionsChangedSignal.read(reader);
			if (!sessionResource) {
				return Iterable.empty();
			}

			const model = this.agentSessionsService.getSession(sessionResource);
			return model?.changes instanceof Array ? model.changes : Iterable.empty();
		});

		return derived(reader => {
			const activeSession = this.activeSession.read(reader);
			if (!activeSession) {
				return 0;
			}

			const isBackgroundSession = activeSession.sessionType === AgentSessionProviders.Background;

			let editingSessionCount = 0;
			if (!isBackgroundSession) {
				const sessions = this.chatEditingService.editingSessionsObs.read(reader);
				const session = sessions.find(candidate => isEqual(candidate.chatSessionResource, activeSession.resource));
				editingSessionCount = session ? session.entries.read(reader).length : 0;
			}

			const sessionFiles = [...sessionFileChangesObs.read(reader)];
			const sessionFilesCount = sessionFiles.length;

			return editingSessionCount + sessionFilesCount;
		}).recomputeInitiallyAndOnChange(this._store);
	}

	private updateBadge(fileCount: number): void {
		if (fileCount > 0) {
			const message = fileCount === 1
				? localize('changesView.oneFileChanged', '1 file changed')
				: localize('changesView.filesChanged', '{0} files changed', fileCount);
			this.badgeDisposable.value = this.activityService.showViewActivity(CHANGES_VIEW_ID, { badge: new NumberBadge(fileCount, () => message) });
		} else {
			this.badgeDisposable.clear();
		}
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.bodyContainer = dom.append(container, $('.changes-view-body'));

		// Welcome message for empty state
		this.welcomeContainer = dom.append(this.bodyContainer, $('.changes-welcome'));
		const welcomeIcon = dom.append(this.welcomeContainer, $('.changes-welcome-icon'));
		welcomeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
		const welcomeMessage = dom.append(this.welcomeContainer, $('.changes-welcome-message'));
		welcomeMessage.textContent = localize('changesView.noChanges', "No files have been changed.");

		// Actions container - positioned outside and above the card
		this.actionsContainer = dom.append(this.bodyContainer, $('.chat-editing-session-actions.outside-card'));

		// Main container with file icons support (the "card")
		this.contentContainer = dom.append(this.bodyContainer, $('.chat-editing-session-container.show-file-icons'));
		this._register(createFileIconThemableTreeContainerScope(this.contentContainer, this.themeService));

		// Toggle class based on whether the file icon theme has file icons
		const updateHasFileIcons = () => {
			this.contentContainer!.classList.toggle('has-file-icons', this.themeService.getFileIconTheme().hasFileIcons);
		};
		updateHasFileIcons();
		this._register(this.themeService.onDidFileIconThemeChange(updateHasFileIcons));

		// Overview section (header with summary only - actions moved outside card)
		this.overviewContainer = dom.append(this.contentContainer, $('.chat-editing-session-overview'));
		this.summaryContainer = dom.append(this.overviewContainer, $('.changes-summary'));

		// List container
		this.listContainer = dom.append(this.contentContainer, $('.chat-editing-session-list'));

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				this.onVisible();
			} else {
				this.renderDisposables.clear();
			}
		}));

		// Trigger initial render if already visible
		if (this.isBodyVisible()) {
			this.onVisible();
		}
	}

	private onVisible(): void {
		this.renderDisposables.clear();
		const activeSessionResource = this.activeSession.map(a => a?.resource);

		// Create observable for the active editing session
		// Note: We must read editingSessionsObs to establish a reactive dependency,
		// so that the view updates when a new editing session is added (e.g., cloud sessions)
		const activeEditingSessionObs = derived(reader => {
			const activeSession = this.activeSession.read(reader);
			if (!activeSession) {
				return undefined;
			}
			const sessions = this.chatEditingService.editingSessionsObs.read(reader);
			return sessions.find(candidate => isEqual(candidate.chatSessionResource, activeSession.resource));
		});

		// Create observable for edit session entries from the ACTIVE session only (local editing sessions)
		const editSessionEntriesObs = derived(reader => {
			const activeSession = this.activeSession.read(reader);

			// Background chat sessions render the working set based on the session files, not the editing session
			if (activeSession?.sessionType === AgentSessionProviders.Background) {
				return [];
			}

			const session = activeEditingSessionObs.read(reader);
			if (!session) {
				return [];
			}

			const entries = session.entries.read(reader);
			const items: IChangesFileItem[] = [];

			for (const entry of entries) {
				const isDeletion = entry.isDeletion ?? false;
				const linesAdded = entry.linesAdded?.read(reader) ?? 0;
				const linesRemoved = entry.linesRemoved?.read(reader) ?? 0;

				items.push({
					type: 'file',
					uri: entry.modifiedURI,
					originalUri: entry.originalURI,
					state: entry.state.read(reader),
					isDeletion,
					changeType: isDeletion ? 'deleted' : 'modified',
					linesAdded,
					linesRemoved,
				});
			}

			return items;
		});

		// Signal observable that triggers when sessions data changes
		const sessionsChangedSignal = observableFromEvent(
			this.renderDisposables,
			this.agentSessionsService.model.onDidChangeSessions,
			() => ({}),
		);

		// Observable for session file changes from agentSessionsService (cloud/background sessions)
		// Reactive to both activeSession changes AND session data changes
		const sessionFileChangesObs = derived(reader => {
			const sessionResource = activeSessionResource.read(reader);
			sessionsChangedSignal.read(reader);
			if (!sessionResource) {
				return Iterable.empty();
			}
			const model = this.agentSessionsService.getSession(sessionResource);
			return model?.changes instanceof Array ? model.changes : Iterable.empty();
		});

		// Convert session file changes to list items (cloud/background sessions)
		const sessionFilesObs = derived(reader =>
			[...sessionFileChangesObs.read(reader)].map((entry): IChangesFileItem => {
				const isDeletion = entry.modifiedUri === undefined;
				const isAddition = entry.originalUri === undefined;
				return {
					type: 'file',
					uri: isIChatSessionFileChange2(entry)
						? entry.modifiedUri ?? entry.uri
						: entry.modifiedUri,
					originalUri: entry.originalUri,
					state: ModifiedFileEntryState.Accepted,
					isDeletion,
					changeType: isDeletion ? 'deleted' : isAddition ? 'added' : 'modified',
					linesAdded: entry.insertions,
					linesRemoved: entry.deletions,
				};
			})
		);

		// Combine both entry sources for display
		const combinedEntriesObs = derived(reader => {
			const editEntries = editSessionEntriesObs.read(reader);
			const sessionFiles = sessionFilesObs.read(reader);
			return [...editEntries, ...sessionFiles];
		});

		// Calculate stats from combined entries
		const topLevelStats = derived(reader => {
			const editEntries = editSessionEntriesObs.read(reader);
			const sessionFiles = sessionFilesObs.read(reader);
			const entries = combinedEntriesObs.read(reader);

			let added = 0, removed = 0;

			for (const entry of entries) {
				added += entry.linesAdded;
				removed += entry.linesRemoved;
			}

			const files = entries.length;
			const isSessionMenu = editEntries.length === 0 && sessionFiles.length > 0;

			return { files, added, removed, isSessionMenu };
		});

		// Setup context keys and actions toolbar
		if (this.actionsContainer) {
			dom.clearNode(this.actionsContainer);

			const scopedContextKeyService = this.renderDisposables.add(this.contextKeyService.createScoped(this.actionsContainer));
			const scopedInstantiationService = this.renderDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));

			// Set the chat session type context key reactively so that menu items with
			// `chatSessionType == copilotcli` (e.g. Create Pull Request) are shown
			const chatSessionTypeKey = scopedContextKeyService.createKey<string>(ChatContextKeys.agentSessionType.key, '');
			this.renderDisposables.add(autorun(reader => {
				const activeSession = this.activeSession.read(reader);
				chatSessionTypeKey.set(activeSession?.sessionType ?? '');
			}));

			// Bind required context keys for the menu buttons
			this.renderDisposables.add(bindContextKey(hasUndecidedChatEditingResourceContextKey, scopedContextKeyService, r => {
				const session = activeEditingSessionObs.read(r);
				if (!session) {
					return false;
				}
				const entries = session.entries.read(r);
				return entries.some(entry => entry.state.read(r) === ModifiedFileEntryState.Modified);
			}));

			this.renderDisposables.add(bindContextKey(hasAppliedChatEditsContextKey, scopedContextKeyService, r => {
				const session = activeEditingSessionObs.read(r);
				if (!session) {
					return false;
				}
				const entries = session.entries.read(r);
				return entries.length > 0;
			}));

			this.renderDisposables.add(bindContextKey(ChatContextKeys.hasAgentSessionChanges, scopedContextKeyService, r => {
				const { files } = topLevelStats.read(r);
				return files > 0;
			}));

			this.renderDisposables.add(autorun(reader => {
				const { isSessionMenu, added, removed } = topLevelStats.read(reader);
				const sessionResource = activeSessionResource.read(reader);
				reader.store.add(scopedInstantiationService.createInstance(
					MenuWorkbenchButtonBar,
					this.actionsContainer!,
					isSessionMenu ? MenuId.ChatEditingSessionChangesToolbar : MenuId.ChatEditingWidgetToolbar,
					{
						telemetrySource: 'changesView',
						menuOptions: isSessionMenu && sessionResource
							? { args: [sessionResource, this.agentSessionsService.getSession(sessionResource)?.metadata] }
							: { shouldForwardArgs: true },
						buttonConfigProvider: (action) => {
							if (action.id === 'chatEditing.viewChanges' || action.id === 'chatEditing.viewPreviousEdits' || action.id === 'chatEditing.viewAllSessionChanges' || action.id === 'chat.openSessionWorktreeInVSCode') {
								const diffStatsLabel = new MarkdownString(
									`<span class="working-set-lines-added">+${added}</span>&nbsp;<span class="working-set-lines-removed">-${removed}</span>`,
									{ supportHtml: true }
								);
								return { showIcon: true, showLabel: true, isSecondary: true, customClass: 'working-set-diff-stats', customLabel: diffStatsLabel };
							}
							if (action.id === 'github.createPullRequest') {
								return { showIcon: true, showLabel: true, isSecondary: true, customClass: 'flex-grow' };
							}
							return undefined;
						}
					}
				));
			}));
		}

		// Update visibility based on entries
		this.renderDisposables.add(autorun(reader => {
			const { files } = topLevelStats.read(reader);
			const hasEntries = files > 0;

			dom.setVisibility(hasEntries, this.contentContainer!);
			dom.setVisibility(hasEntries, this.actionsContainer!);
			dom.setVisibility(!hasEntries, this.welcomeContainer!);
		}));

		// Update summary text (line counts only, file count is shown in badge)
		if (this.summaryContainer) {
			dom.clearNode(this.summaryContainer);

			const linesAddedSpan = dom.$('.working-set-lines-added');
			const linesRemovedSpan = dom.$('.working-set-lines-removed');

			this.summaryContainer.appendChild(linesAddedSpan);
			this.summaryContainer.appendChild(linesRemovedSpan);

			this.renderDisposables.add(autorun(reader => {
				const { added, removed } = topLevelStats.read(reader);

				linesAddedSpan.textContent = `+${added}`;
				linesRemovedSpan.textContent = `-${removed}`;
			}));
		}

		// Create the tree
		if (!this.tree && this.listContainer) {
			const resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility }));
			this.tree = this.instantiationService.createInstance(
				WorkbenchCompressibleObjectTree<ChangesTreeElement>,
				'ChangesViewTree',
				this.listContainer,
				new ChangesTreeDelegate(),
				[this.instantiationService.createInstance(ChangesTreeRenderer, resourceLabels, MenuId.ChatEditingWidgetModifiedFilesToolbar)],
				{
					alwaysConsumeMouseWheel: false,
					accessibilityProvider: {
						getAriaLabel: (element: ChangesTreeElement) => isChangesFileItem(element) ? basename(element.uri.path) : element.name,
						getWidgetAriaLabel: () => localize('changesViewTree', "Changes Tree")
					},
					dnd: {
						getDragURI: (element: ChangesTreeElement) => element.uri.toString(),
						getDragLabel: (elements) => {
							const uris = elements.map(e => e.uri);
							if (uris.length === 1) {
								return this.labelService.getUriLabel(uris[0], { relative: true });
							}
							return `${uris.length}`;
						},
						dispose: () => { },
						onDragOver: () => false,
						drop: () => { },
						onDragStart: (data, originalEvent) => {
							try {
								const elements = data.getData() as ChangesTreeElement[];
								const uris = elements.filter(isChangesFileItem).map(e => e.uri);
								this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, uris, originalEvent));
							} catch {
								// noop
							}
						},
					},
					identityProvider: {
						getId: (element: ChangesTreeElement) => element.uri.toString()
					},
					compressionEnabled: true,
					twistieAdditionalCssClass: (e: unknown) => {
						if (this.viewMode === ChangesViewMode.List) {
							return 'force-no-twistie';
						}
						// In tree mode, hide twistie for file items (they are never collapsible)
						return isChangesFileItem(e as ChangesTreeElement) ? 'force-no-twistie' : undefined;
					},
				}
			);
		}

		// Register tree event handlers
		if (this.tree) {
			const tree = this.tree;

			this.renderDisposables.add(tree.onDidOpen(async (e) => {
				if (!e.element) {
					return;
				}

				// Ignore folder elements - only open files
				if (!isChangesFileItem(e.element)) {
					return;
				}

				const { uri: modifiedFileUri, originalUri, isDeletion } = e.element;

				if (isDeletion && originalUri) {
					await this.editorService.openEditor({
						resource: originalUri,
						options: e.editorOptions
					}, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
					return;
				}

				if (originalUri) {
					await this.editorService.openEditor({
						original: { resource: originalUri },
						modified: { resource: modifiedFileUri },
						options: e.editorOptions
					}, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
					return;
				}

				await this.editorService.openEditor({
					resource: modifiedFileUri,
					options: e.editorOptions
				}, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
			}));
		}

		// Update tree data with combined entries
		this.renderDisposables.add(autorun(reader => {
			const entries = combinedEntriesObs.read(reader);
			const viewMode = this.viewModeObs.read(reader);

			if (!this.tree) {
				return;
			}

			// Toggle list-mode class to remove tree indentation in list mode
			this.listContainer?.classList.toggle('list-mode', viewMode === ChangesViewMode.List);

			if (viewMode === ChangesViewMode.Tree) {
				// Tree mode: build hierarchical tree from file entries
				const treeChildren = buildTreeChildren(entries);
				this.tree.setChildren(null, treeChildren);
			} else {
				// List mode: flat list of file items
				const listChildren: IObjectTreeElement<ChangesTreeElement>[] = entries.map(item => ({
					element: item,
					collapsible: false,
				}));
				this.tree.setChildren(null, listChildren);
			}

			this.layoutTree();
		}));
	}

	private layoutTree(): void {
		if (!this.tree || !this.listContainer) {
			return;
		}

		// Calculate remaining height for the tree by subtracting other elements
		const bodyHeight = this.currentBodyHeight;
		if (bodyHeight <= 0) {
			return;
		}

		// Measure non-list elements height (padding, actions, overview)
		const bodyPadding = 16; // 8px top + 8px bottom from .changes-view-body
		const actionsHeight = this.actionsContainer?.offsetHeight ?? 0;
		const actionsMargin = actionsHeight > 0 ? 8 : 0; // margin-bottom on actions container
		const overviewHeight = this.overviewContainer?.offsetHeight ?? 0;
		const containerPadding = 8; // 4px top + 4px bottom from .chat-editing-session-container
		const containerBorder = 2; // 1px top + 1px bottom border

		const usedHeight = bodyPadding + actionsHeight + actionsMargin + overviewHeight + containerPadding + containerBorder;
		const availableHeight = Math.max(0, bodyHeight - usedHeight);

		// Limit height to the content so the tree doesn't exceed its items
		const contentHeight = this.tree.contentHeight;
		const treeHeight = Math.min(availableHeight, contentHeight);

		this.tree.layout(treeHeight, this.currentBodyWidth);
		this.tree.getHTMLElement().style.height = `${treeHeight}px`;
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.currentBodyHeight = height;
		this.currentBodyWidth = width;
		this.layoutTree();
	}

	override focus(): void {
		super.focus();
		this.tree?.domFocus();
	}

	override dispose(): void {
		this.tree?.dispose();
		this.tree = undefined;
		super.dispose();
	}
}

export class ChangesViewPaneContainer extends ViewPaneContainer {
	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExtensionService extensionService: IExtensionService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@ILogService logService: ILogService,
	) {
		super(CHANGES_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
	}

	override create(parent: HTMLElement): void {
		super.create(parent);
		parent.classList.add('changes-viewlet');
	}
}

// --- Tree Delegate & Renderer

class ChangesTreeDelegate implements IListVirtualDelegate<ChangesTreeElement> {
	getHeight(_element: ChangesTreeElement): number {
		return 22;
	}

	getTemplateId(_element: ChangesTreeElement): string {
		return ChangesTreeRenderer.TEMPLATE_ID;
	}
}

interface IChangesTreeTemplate {
	readonly label: IResourceLabel;
	readonly templateDisposables: DisposableStore;
	readonly toolbar: MenuWorkbenchToolBar | undefined;
	readonly contextKeyService: IContextKeyService | undefined;
	readonly decorationBadge: HTMLElement;
	readonly addedSpan: HTMLElement;
	readonly removedSpan: HTMLElement;
	readonly lineCountsContainer: HTMLElement;
}

class ChangesTreeRenderer implements ICompressibleTreeRenderer<ChangesTreeElement, void, IChangesTreeTemplate> {
	static TEMPLATE_ID = 'changesTreeRenderer';
	readonly templateId: string = ChangesTreeRenderer.TEMPLATE_ID;

	constructor(
		private labels: ResourceLabels,
		private menuId: MenuId | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILabelService private readonly labelService: ILabelService,
	) { }

	renderTemplate(container: HTMLElement): IChangesTreeTemplate {
		const templateDisposables = new DisposableStore();
		const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));

		const lineCountsContainer = $('.working-set-line-counts');
		const addedSpan = dom.$('.working-set-lines-added');
		const removedSpan = dom.$('.working-set-lines-removed');
		lineCountsContainer.appendChild(addedSpan);
		lineCountsContainer.appendChild(removedSpan);
		label.element.appendChild(lineCountsContainer);

		const decorationBadge = dom.$('.changes-decoration-badge');
		label.element.appendChild(decorationBadge);

		let toolbar: MenuWorkbenchToolBar | undefined;
		let contextKeyService: IContextKeyService | undefined;
		if (this.menuId) {
			const actionBarContainer = $('.chat-collapsible-list-action-bar');
			contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(actionBarContainer));
			const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
			toolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, this.menuId, { menuOptions: { shouldForwardArgs: true, arg: undefined } }));
			label.element.appendChild(actionBarContainer);
		}

		return { templateDisposables, label, toolbar, contextKeyService, decorationBadge, addedSpan, removedSpan, lineCountsContainer };
	}

	renderElement(node: ITreeNode<ChangesTreeElement, void>, _index: number, templateData: IChangesTreeTemplate): void {
		const element = node.element;
		templateData.label.element.style.display = 'flex';

		if (isChangesFileItem(element)) {
			this.renderFileElement(element, templateData);
		} else {
			this.renderFolderElement(element, templateData);
		}
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ChangesTreeElement>, void>, _index: number, templateData: IChangesTreeTemplate): void {
		const compressed = node.element;
		const lastElement = compressed.elements[compressed.elements.length - 1];

		templateData.label.element.style.display = 'flex';

		if (isChangesFileItem(lastElement)) {
			// Shouldn't happen in practice - files don't get compressed
			this.renderFileElement(lastElement, templateData);
		} else {
			// Compressed folder chain - show joined folder names
			const label = compressed.elements.map(e => isChangesFileItem(e) ? basename(e.uri.path) : e.name);
			templateData.label.setResource({ resource: lastElement.uri, name: label }, {
				fileKind: FileKind.FOLDER,
				separator: this.labelService.getSeparator(lastElement.uri.scheme),
			});

			// Hide file-specific decorations for folders
			templateData.decorationBadge.style.display = 'none';
			templateData.lineCountsContainer.style.display = 'none';

			if (templateData.toolbar) {
				templateData.toolbar.context = undefined;
			}
			if (templateData.contextKeyService) {
				chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(undefined!);
			}
		}
	}

	private renderFileElement(data: IChangesFileItem, templateData: IChangesTreeTemplate): void {
		templateData.label.setFile(data.uri, {
			fileKind: FileKind.FILE,
			fileDecorations: undefined,
			strikethrough: data.changeType === 'deleted',
			hidePath: true,
		});

		// Show file-specific decorations
		templateData.lineCountsContainer.style.display = '';
		templateData.decorationBadge.style.display = '';

		// Update decoration badge (A/M/D)
		const badge = templateData.decorationBadge;
		badge.className = 'changes-decoration-badge';
		switch (data.changeType) {
			case 'added':
				badge.textContent = 'A';
				badge.classList.add('added');
				break;
			case 'deleted':
				badge.textContent = 'D';
				badge.classList.add('deleted');
				break;
			case 'modified':
			default:
				badge.textContent = 'M';
				badge.classList.add('modified');
				break;
		}

		templateData.addedSpan.textContent = `+${data.linesAdded}`;
		templateData.removedSpan.textContent = `-${data.linesRemoved}`;

		// eslint-disable-next-line no-restricted-syntax
		templateData.label.element.querySelector('.monaco-icon-name-container')?.classList.add('modified');

		if (templateData.toolbar) {
			templateData.toolbar.context = data.uri;
		}
		if (templateData.contextKeyService) {
			chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(data.state);
		}
	}

	private renderFolderElement(data: IChangesFolderItem, templateData: IChangesTreeTemplate): void {
		templateData.label.setFile(data.uri, {
			fileKind: FileKind.FOLDER,
		});

		// Hide file-specific decorations for folders
		templateData.decorationBadge.style.display = 'none';
		templateData.lineCountsContainer.style.display = 'none';

		if (templateData.toolbar) {
			templateData.toolbar.context = undefined;
		}
		if (templateData.contextKeyService) {
			chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(undefined!);
		}
	}

	disposeTemplate(templateData: IChangesTreeTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

// --- View Mode Actions

class SetChangesListViewModeAction extends ViewAction<ChangesViewPane> {
	constructor() {
		super({
			id: 'workbench.changesView.action.setListViewMode',
			title: localize('setListViewMode', "View as List"),
			viewId: CHANGES_VIEW_ID,
			f1: false,
			icon: Codicon.listTree,
			toggled: changesViewModeContextKey.isEqualTo(ChangesViewMode.List),
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', CHANGES_VIEW_ID),
				group: '1_viewmode',
				order: 1
			}
		});
	}

	async runInView(_: ServicesAccessor, view: ChangesViewPane): Promise<void> {
		view.viewMode = ChangesViewMode.List;
	}
}

class SetChangesTreeViewModeAction extends ViewAction<ChangesViewPane> {
	constructor() {
		super({
			id: 'workbench.changesView.action.setTreeViewMode',
			title: localize('setTreeViewMode', "View as Tree"),
			viewId: CHANGES_VIEW_ID,
			f1: false,
			icon: Codicon.listFlat,
			toggled: changesViewModeContextKey.isEqualTo(ChangesViewMode.Tree),
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', CHANGES_VIEW_ID),
				group: '1_viewmode',
				order: 2
			}
		});
	}

	async runInView(_: ServicesAccessor, view: ChangesViewPane): Promise<void> {
		view.viewMode = ChangesViewMode.Tree;
	}
}

registerAction2(SetChangesListViewModeAction);
registerAction2(SetChangesTreeViewModeAction);
