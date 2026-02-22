/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/fileTreeView.css';
import * as dom from '../../../../base/browser/dom.js';
import { IAsyncDataSource, ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { ICompressedTreeNode } from '../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { FileKind, IFileService, IFileStat } from '../../../../platform/files/common/files.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IResourceLabel, ResourceLabels } from '../../../../workbench/browser/labels.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { createFileIconThemableTreeContainerScope } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../workbench/services/editor/common/editorService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ISessionsManagementService, IActiveSessionItem } from '../../sessions/browser/sessionsManagementService.js';
import { GITHUB_REMOTE_FILE_SCHEME } from './githubFileSystemProvider.js';
import { basename } from '../../../../base/common/path.js';
import { isEqual } from '../../../../base/common/resources.js';

const $ = dom.$;

// --- Constants

export const FILE_TREE_VIEW_CONTAINER_ID = 'workbench.view.agentSessions.fileTreeContainer';
export const FILE_TREE_VIEW_ID = 'workbench.view.agentSessions.fileTree';

// --- Tree Item

interface IFileTreeItem {
	readonly uri: URI;
	readonly name: string;
	readonly isDirectory: boolean;
}

// --- Data Source

class FileTreeDataSource implements IAsyncDataSource<URI, IFileTreeItem> {

	constructor(
		private readonly fileService: IFileService,
		private readonly logService: ILogService,
	) { }

	hasChildren(element: URI | IFileTreeItem): boolean {
		if (URI.isUri(element)) {
			return true; // root
		}
		return element.isDirectory;
	}

	async getChildren(element: URI | IFileTreeItem): Promise<IFileTreeItem[]> {
		const uri = URI.isUri(element) ? element : element.uri;

		try {
			const stat = await this.fileService.resolve(uri);
			if (!stat.children) {
				return [];
			}

			return stat.children
				.map((child: IFileStat): IFileTreeItem => ({
					uri: child.resource,
					name: child.name,
					isDirectory: child.isDirectory,
				}))
				.sort((a, b) => {
					// Directories first, then alphabetical
					if (a.isDirectory !== b.isDirectory) {
						return a.isDirectory ? -1 : 1;
					}
					return a.name.localeCompare(b.name);
				});
		} catch (e) {
			this.logService.warn(`[FileTreeView] Error fetching children for ${uri.toString()}:`, e);
			return [];
		}
	}
}

// --- Delegate

class FileTreeDelegate implements IListVirtualDelegate<IFileTreeItem> {
	getHeight(): number {
		return 22;
	}

	getTemplateId(): string {
		return FileTreeRenderer.TEMPLATE_ID;
	}
}

// --- Renderer

interface IFileTreeTemplate {
	readonly label: IResourceLabel;
	readonly templateDisposables: DisposableStore;
}

class FileTreeRenderer implements ICompressibleTreeRenderer<IFileTreeItem, void, IFileTreeTemplate> {
	static readonly TEMPLATE_ID = 'fileTreeRenderer';
	readonly templateId = FileTreeRenderer.TEMPLATE_ID;

	constructor(
		private readonly labels: ResourceLabels,
		@ILabelService private readonly labelService: ILabelService,
	) { }

	renderTemplate(container: HTMLElement): IFileTreeTemplate {
		const templateDisposables = new DisposableStore();
		const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));
		return { label, templateDisposables };
	}

	renderElement(node: ITreeNode<IFileTreeItem, void>, _index: number, templateData: IFileTreeTemplate): void {
		const element = node.element;
		templateData.label.element.style.display = 'flex';
		templateData.label.setFile(element.uri, {
			fileKind: element.isDirectory ? FileKind.FOLDER : FileKind.FILE,
			hidePath: true,
		});
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<IFileTreeItem>, void>, _index: number, templateData: IFileTreeTemplate): void {
		const compressed = node.element;
		const lastElement = compressed.elements[compressed.elements.length - 1];

		templateData.label.element.style.display = 'flex';

		const label = compressed.elements.map(e => e.name);
		templateData.label.setResource({ resource: lastElement.uri, name: label }, {
			fileKind: lastElement.isDirectory ? FileKind.FOLDER : FileKind.FILE,
			separator: this.labelService.getSeparator(lastElement.uri.scheme),
		});
	}

	disposeTemplate(templateData: IFileTreeTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

// --- Compression Delegate

class FileTreeCompressionDelegate {
	isIncompressible(element: IFileTreeItem): boolean {
		return !element.isDirectory;
	}
}

// --- View Pane

export class FileTreeViewPane extends ViewPane {

	private bodyContainer: HTMLElement | undefined;
	private welcomeContainer: HTMLElement | undefined;
	private treeContainer: HTMLElement | undefined;

	private tree: WorkbenchCompressibleAsyncDataTree<URI, IFileTreeItem> | undefined;

	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly treeInputDisposable = this._register(new MutableDisposable());

	private currentBodyHeight = 0;
	private currentBodyWidth = 0;

	/**
	 * Observable that tracks the root URI for the file tree.
	 * - For background sessions: the worktree or repository local path
	 * - For cloud sessions: a github-remote-file:// URI derived from the session's repository metadata
	 * - For local sessions: the workspace folder
	 */
	private readonly treeRootUri: IObservable<URI | undefined>;

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
		@IFileService private readonly fileService: IFileService,
		@IEditorService private readonly editorService: IEditorService,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ILogService private readonly logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Track active session changes AND session model updates (metadata/changes can arrive later)
		const sessionsChangedSignal = observableFromEvent(
			this,
			this.agentSessionsService.model.onDidChangeSessions,
			() => ({}),
		);

		this.treeRootUri = derived(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			sessionsChangedSignal.read(reader); // re-evaluate when sessions data updates
			return this.resolveTreeRoot(activeSession);
		});
	}

	/**
	 * Determines the root URI for the file tree based on the active session type.
	 * Tries multiple data sources: IActiveSessionItem fields, agent session model metadata,
	 * and file change URIs as a last resort.
	 */
	private resolveTreeRoot(activeSession: IActiveSessionItem | undefined): URI | undefined {
		if (!activeSession) {
			return undefined;
		}

		const sessionType = getChatSessionType(activeSession.resource);

		// 1. Try the direct worktree/repository fields from IActiveSessionItem
		if (activeSession.worktree) {
			this.logService.info(`[FileTreeView] Using worktree: ${activeSession.worktree.toString()}`);
			return activeSession.worktree;
		}
		if (activeSession.repository && activeSession.repository.scheme === 'file') {
			this.logService.info(`[FileTreeView] Using repository: ${activeSession.repository.toString()}`);
			return activeSession.repository;
		}

		// 2. Query the agent session model directly for metadata
		const agentSession = this.agentSessionsService.getSession(activeSession.resource);
		if (agentSession?.metadata) {
			const metadata = agentSession.metadata;

			// Background sessions: local paths (try multiple known metadata keys)
			const workingDir = metadata.workingDirectoryPath as string | undefined;
			if (workingDir) {
				this.logService.info(`[FileTreeView] Using metadata.workingDirectoryPath: ${workingDir}`);
				return URI.file(workingDir);
			}
			const worktreePath = metadata.worktreePath as string | undefined;
			if (worktreePath) {
				this.logService.info(`[FileTreeView] Using metadata.worktreePath: ${worktreePath}`);
				return URI.file(worktreePath);
			}
			const repositoryPath = metadata.repositoryPath as string | undefined;
			if (repositoryPath) {
				this.logService.info(`[FileTreeView] Using metadata.repositoryPath: ${repositoryPath}`);
				return URI.file(repositoryPath);
			}

			// Cloud sessions: GitHub repo info in metadata
			const repoUri = this.extractRepoUriFromMetadata(metadata);
			if (repoUri) {
				return repoUri;
			}
		}

		// 3. For cloud/remote sessions: try to infer repo from file change URIs
		if (sessionType === AgentSessionProviders.Cloud || sessionType === AgentSessionProviders.Codex) {
			const repoUri = this.inferRepoFromChanges(activeSession.resource);
			if (repoUri) {
				this.logService.info(`[FileTreeView] Inferred repo from changes: ${repoUri.toString()}`);
				return repoUri;
			}
		}

		// 4. Try to parse the repository URI as a GitHub URL
		if (activeSession.repository) {
			const repoStr = activeSession.repository.toString();
			const parsed = this.parseGitHubUrl(repoStr);
			if (parsed) {
				this.logService.info(`[FileTreeView] Parsed repository URI as GitHub: ${parsed.owner}/${parsed.repo}`);
				return URI.from({
					scheme: GITHUB_REMOTE_FILE_SCHEME,
					authority: 'github',
					path: `/${parsed.owner}/${parsed.repo}/HEAD`,
				});
			}
		}

		this.logService.trace(`[FileTreeView] No tree root resolved for session ${activeSession.resource.toString()} (type: ${sessionType})`);
		return undefined;
	}

	/**
	 * Extracts a github-remote-file:// URI from session metadata, trying various known fields.
	 */
	private extractRepoUriFromMetadata(metadata: { readonly [key: string]: unknown }): URI | undefined {
		// repositoryNwo: "owner/repo"
		const repositoryNwo = metadata.repositoryNwo as string | undefined;
		if (repositoryNwo && repositoryNwo.includes('/')) {
			this.logService.info(`[FileTreeView] Using metadata.repositoryNwo: ${repositoryNwo}`);
			return URI.from({
				scheme: GITHUB_REMOTE_FILE_SCHEME,
				authority: 'github',
				path: `/${repositoryNwo}/HEAD`,
			});
		}

		// repositoryUrl: "https://github.com/owner/repo"
		const repositoryUrl = metadata.repositoryUrl as string | undefined;
		if (repositoryUrl) {
			const parsed = this.parseGitHubUrl(repositoryUrl);
			if (parsed) {
				this.logService.info(`[FileTreeView] Using metadata.repositoryUrl: ${repositoryUrl}`);
				return URI.from({
					scheme: GITHUB_REMOTE_FILE_SCHEME,
					authority: 'github',
					path: `/${parsed.owner}/${parsed.repo}/HEAD`,
				});
			}
		}

		// repository: could be "owner/repo" or a URL
		const repository = metadata.repository as string | undefined;
		if (repository) {
			if (repository.includes('/') && !repository.includes(':')) {
				// Looks like "owner/repo"
				this.logService.info(`[FileTreeView] Using metadata.repository as nwo: ${repository}`);
				return URI.from({
					scheme: GITHUB_REMOTE_FILE_SCHEME,
					authority: 'github',
					path: `/${repository}/HEAD`,
				});
			}
			const parsed = this.parseGitHubUrl(repository);
			if (parsed) {
				this.logService.info(`[FileTreeView] Using metadata.repository as URL: ${repository}`);
				return URI.from({
					scheme: GITHUB_REMOTE_FILE_SCHEME,
					authority: 'github',
					path: `/${parsed.owner}/${parsed.repo}/HEAD`,
				});
			}
		}

		return undefined;
	}

	/**
	 * Attempts to infer the repository from the session's file change URIs.
	 * Cloud sessions have changes with URIs that reveal the repository.
	 */
	private inferRepoFromChanges(sessionResource: URI): URI | undefined {
		const agentSession = this.agentSessionsService.getSession(sessionResource);
		if (!agentSession?.changes || !(agentSession.changes instanceof Array)) {
			return undefined;
		}

		for (const change of agentSession.changes) {
			const fileUri = isIChatSessionFileChange2(change)
				? (change.modifiedUri ?? change.uri)
				: change.modifiedUri;

			if (!fileUri) {
				continue;
			}

			const parsed = this.parseRepoFromFileUri(fileUri);
			if (parsed) {
				return URI.from({
					scheme: GITHUB_REMOTE_FILE_SCHEME,
					authority: 'github',
					path: `/${parsed.owner}/${parsed.repo}/${parsed.ref}`,
				});
			}
		}

		return undefined;
	}

	/**
	 * Tries to extract GitHub owner/repo from a file change URI.
	 * Handles various URI formats used by cloud sessions.
	 */
	private parseRepoFromFileUri(uri: URI): { owner: string; repo: string; ref: string } | undefined {
		// Pattern: vscode-vfs://github/{owner}/{repo}/...
		if (uri.authority === 'github' || uri.authority?.startsWith('github')) {
			const parts = uri.path.split('/').filter(Boolean);
			if (parts.length >= 2) {
				return { owner: parts[0], repo: parts[1], ref: 'HEAD' };
			}
		}

		// Pattern: github://{owner}/{repo}/... or github1s://{owner}/{repo}/...
		if (uri.scheme === 'github' || uri.scheme === 'github1s') {
			const parts = uri.authority ? uri.authority.split('/') : uri.path.split('/').filter(Boolean);
			if (parts.length >= 2) {
				return { owner: parts[0], repo: parts[1], ref: 'HEAD' };
			}
		}

		// Pattern: https://github.com/{owner}/{repo}/...
		return this.parseGitHubUrl(uri.toString());
	}

	private parseGitHubUrl(url: string): { owner: string; repo: string; ref: string } | undefined {
		const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(url)
			|| /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(url);
		return match ? { owner: match[1], repo: match[2], ref: 'HEAD' } : undefined;
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.bodyContainer = dom.append(container, $('.file-tree-view-body'));

		// Welcome message for empty state
		this.welcomeContainer = dom.append(this.bodyContainer, $('.file-tree-welcome'));
		const welcomeIcon = dom.append(this.welcomeContainer, $('.file-tree-welcome-icon'));
		welcomeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.repoClone));
		const welcomeMessage = dom.append(this.welcomeContainer, $('.file-tree-welcome-message'));
		welcomeMessage.textContent = localize('fileTreeView.noRepository', "No repository available for this session.");

		// Tree container
		this.treeContainer = dom.append(this.bodyContainer, $('.file-tree-container.show-file-icons'));
		this._register(createFileIconThemableTreeContainerScope(this.treeContainer, this.themeService));

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				this.onVisible();
			} else {
				this.renderDisposables.clear();
			}
		}));

		if (this.isBodyVisible()) {
			this.onVisible();
		}
	}

	private onVisible(): void {
		this.renderDisposables.clear();
		this.logService.info('[FileTreeView] onVisible called');

		// Create tree if needed
		if (!this.tree && this.treeContainer) {
			const resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility }));
			const dataSource = new FileTreeDataSource(this.fileService, this.logService);

			this.tree = this.instantiationService.createInstance(
				WorkbenchCompressibleAsyncDataTree<URI, IFileTreeItem>,
				'FileTreeView',
				this.treeContainer,
				new FileTreeDelegate(),
				new FileTreeCompressionDelegate(),
				[this.instantiationService.createInstance(FileTreeRenderer, resourceLabels)],
				dataSource,
				{
					accessibilityProvider: {
						getAriaLabel: (element: IFileTreeItem) => element.name,
						getWidgetAriaLabel: () => localize('fileTreeView', "File Tree")
					},
					identityProvider: {
						getId: (element: IFileTreeItem) => element.uri.toString()
					},
					compressionEnabled: true,
					collapseByDefault: (_e: IFileTreeItem) => true,
				}
			);
		}

		// Handle tree open events (open files in editor)
		if (this.tree) {
			this.renderDisposables.add(this.tree.onDidOpen(async (e) => {
				if (!e.element || e.element.isDirectory) {
					return;
				}

				await this.editorService.openEditor({
					resource: e.element.uri,
					options: e.editorOptions,
				}, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
			}));
		}

		// React to active session changes
		let lastRootUri: URI | undefined;
		this.renderDisposables.add(autorun(reader => {
			const rootUri = this.treeRootUri.read(reader);
			const hasRoot = !!rootUri;

			dom.setVisibility(hasRoot, this.treeContainer!);
			dom.setVisibility(!hasRoot, this.welcomeContainer!);

			if (this.tree && rootUri && !isEqual(rootUri, lastRootUri)) {
				lastRootUri = rootUri;
				this.updateTitle(basename(rootUri.path) || rootUri.toString());
				this.treeInputDisposable.clear();
				this.tree.setInput(rootUri).then(() => {
					this.layoutTree();
				});
			} else if (!rootUri && lastRootUri) {
				lastRootUri = undefined;
			}
		}));
	}

	private layoutTree(): void {
		if (!this.tree) {
			return;
		}
		this.tree.layout(this.currentBodyHeight, this.currentBodyWidth);
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

// --- View Pane Container

export class FileTreeViewPaneContainer extends ViewPaneContainer {
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
		super(FILE_TREE_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
	}

	override create(parent: HTMLElement): void {
		super.create(parent);
		parent.classList.add('file-tree-viewlet');
	}
}
