/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { IAnchor } from '../../../../../base/browser/ui/contextview/contextview.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { AnchorPosition } from '../../../../../base/common/layout.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { TabbedActionListWidget } from '../../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IChatSessionRoutingProvider, IChatSessionRoutingWorkspace, IChatSessionRoutingWorkspaceBrowseAction, IChatSessionRoutingWorkspaceCatalog } from '../../common/sessionRouter.js';
import { withChatInputPickerMotion } from '../widget/input/chatInputPickerActionItem.js';

export interface IChatSessionRoutingFolderPickerHost {
	/** Prepare or release a host-owned action-widget surface. */
	onDidChangeActionWidgetVisibility?(visible: boolean, anchor?: HTMLElement): void | Promise<void>;
	/** Container used to render action widgets, when the host owns a separate surface. */
	getActionWidgetContainer?(): HTMLElement | undefined;
	/** Translate an element anchor into the host's action-widget coordinate space. */
	getActionWidgetAnchor?(anchor: HTMLElement): HTMLElement | IAnchor;
	/** Override the action-widget direction when the host renders it on a separate surface. */
	getActionWidgetAnchorPosition?(): AnchorPosition;
	/** Open the host's native folder picker for a standalone working directory. */
	pickFolder?(defaultUri: URI | undefined): Promise<URI | undefined>;
}

export interface IChatSessionRoutingFolderPickerTarget {
	readonly uri?: URI;
	readonly providerId?: string;
	readonly label?: string;
}

export interface IChatSessionRoutingFolderPickerOptions {
	readonly provider: IChatSessionRoutingProvider | undefined;
	readonly getCatalog: (token: CancellationToken) => Promise<IChatSessionRoutingWorkspaceCatalog | undefined>;
	readonly token: CancellationToken;
}

type FolderPickerItem =
	| { readonly id: string; readonly kind: 'workspace'; readonly folder: IWorkspaceFolder }
	| { readonly id: string; readonly kind: 'providerWorkspace'; readonly workspace: IChatSessionRoutingWorkspace }
	| { readonly id: string; readonly kind: 'providerBrowse'; readonly action: IChatSessionRoutingWorkspaceBrowseAction }
	| { readonly id: 'choose-folder'; readonly kind: 'choose' };

interface IActiveFolderPicker {
	readonly id: number;
	readonly options: IChatSessionRoutingFolderPickerOptions;
	readonly resolve: (target: IChatSessionRoutingFolderPickerTarget | undefined) => void;
	readonly store: DisposableStore;
	browsing: boolean;
	surfaceOpen: boolean;
	shown: 'flat' | 'tabbed' | undefined;
}

/**
 * Renders and owns the Change Folder action plus its action-widget picker.
 * Callers pause their own countdown while {@link pick} directly resolves the
 * selected provider-neutral workspace target.
 */
export class ChatSessionRoutingFolderPicker extends Disposable {

	readonly element: HTMLButtonElement;

	private readonly _tabbedFolderPicker: TabbedActionListWidget | undefined;
	private _target: IChatSessionRoutingFolderPickerTarget;
	private _active: IActiveFolderPicker | undefined;
	private _requestId = 0;
	private _isDisposed = false;

	get isActive(): boolean {
		return !!this._active;
	}

	constructor(
		parent: HTMLElement,
		private readonly host: IChatSessionRoutingFolderPickerHost,
		initialTarget: IChatSessionRoutingFolderPickerTarget,
		private readonly actionWidgetService: IActionWidgetService,
		private readonly workspaceContextService: IWorkspaceContextService,
		private readonly logService: ILogService,
		instantiationService: IInstantiationService,
	) {
		super();
		this._target = initialTarget;
		this.element = dom.append(parent, dom.$('button.chat-routing-badge-folder-action', {
			type: 'button',
			'aria-label': localize('chatSessionRouting.changeTargetFolderAria', "Change target folder for new session"),
			'aria-haspopup': 'menu',
			'aria-expanded': 'false',
		})) as HTMLButtonElement;
		this._tabbedFolderPicker = this._register(instantiationService.createInstance(TabbedActionListWidget));
		this._render(false);
	}

	setTarget(target: IChatSessionRoutingFolderPickerTarget): void {
		this._target = target;
		this._render(this.isActive);
	}

	async pick(options: IChatSessionRoutingFolderPickerOptions): Promise<IChatSessionRoutingFolderPickerTarget | undefined> {
		if (options.token.isCancellationRequested || this._isDisposed) {
			return undefined;
		}
		if (this._active) {
			this._finish(this._active, undefined);
			return undefined;
		}

		let resolve!: (target: IChatSessionRoutingFolderPickerTarget | undefined) => void;
		const result = new Promise<IChatSessionRoutingFolderPickerTarget | undefined>(r => resolve = r);
		const active: IActiveFolderPicker = {
			id: ++this._requestId,
			options,
			resolve,
			store: new DisposableStore(),
			browsing: false,
			surfaceOpen: false,
			shown: undefined,
		};
		this._active = active;
		active.store.add(options.token.onCancellationRequested(() => this._finish(active, undefined, false)));
		this._render(true);
		void this._open(active);
		return result;
	}

	private async _open(active: IActiveFolderPicker): Promise<void> {
		try {
			const catalog = await active.options.getCatalog(active.options.token);
			if (!this._isCurrent(active)) {
				return;
			}
			active.surfaceOpen = true;
			await this.host.onDidChangeActionWidgetVisibility?.(true, this.element);
			if (!this._isCurrent(active)) {
				return;
			}
			this._show(active, catalog);
		} catch (error) {
			if (this._isCurrent(active)) {
				this.logService.error('[chatSessionRouting] Failed to show folder picker', error);
				this._finish(active, undefined);
			}
		}
	}

	private _show(active: IActiveFolderPicker, catalog: IChatSessionRoutingWorkspaceCatalog | undefined): void {
		const groups = catalog?.groups ?? [];
		const selectedWorkspace = catalog?.workspaces.find(workspace => this._isSelectedWorkspace(workspace)) ?? catalog?.defaultWorkspace;
		const initialGroup = selectedWorkspace?.group && groups.some(group => group.id === selectedWorkspace.group)
			? selectedWorkspace.group
			: groups[0]?.id;
		const anchor = this.host.getActionWidgetAnchor?.(this.element) ?? this.element;
		const container = this.host.getActionWidgetContainer?.();
		const getItems = (group?: string) => this._getItems(catalog, group);
		const accessibilityProvider = {
			getAriaLabel: (item: IActionListItem<FolderPickerItem>) => item.item
				? item.item.kind === 'workspace'
					? localize('chatSessionRouting.folderPickerItem', "{0}, {1}", item.item.folder.name, item.item.folder.uri.fsPath)
					: item.item.kind === 'providerWorkspace'
						? localize('chatSessionRouting.folderPickerItem', "{0}, {1}", item.item.workspace.label, item.item.workspace.description ?? item.item.workspace.uri.path)
						: item.label ?? ''
				: '',
			getWidgetAriaLabel: () => localize('chatSessionRouting.selectTargetFolder', "Select the folder for the new session"),
			getWidgetRole: () => 'menu' as const,
			getRole: (item: IActionListItem<FolderPickerItem>) => item.item?.kind === 'providerBrowse' || item.item?.kind === 'choose' ? 'menuitem' as const : 'menuitemradio' as const,
			isChecked: (item: IActionListItem<FolderPickerItem>) => item.item?.kind === 'workspace'
				? isEqual(item.item.folder.uri, this._target.uri)
				: item.item?.kind === 'providerWorkspace'
					? this._isSelectedWorkspace(item.item.workspace)
					: undefined,
		};
		const listOptions = (items: readonly IActionListItem<FolderPickerItem>[]) => withChatInputPickerMotion({
			className: 'chat-folder-picker-dropdown',
			anchorPosition: this.host.getActionWidgetAnchorPosition?.() ?? AnchorPosition.ABOVE,
			minWidth: groups.length > 1 ? 360 : 280,
			maxWidth: 420,
			showFilter: catalog
				? items.filter(item => item.kind === ActionListItemKind.Action).length > 10
				: true,
			filterPlaceholder: catalog
				? localize('chatSessionRouting.searchWorkspaces', "Search workspaces")
				: localize('chatSessionRouting.searchFolders', "Search folders"),
			focusFilterOnOpen: true,
			initialFocusItemId: this._target.providerId && this._target.uri
				? `${this._target.providerId}:${this._target.uri.toString()}`
				: this._target.uri?.toString(),
			inlineDescription: true,
			showGroupTitleOnFirstItem: true,
			hideDefaultKeybindingTooltip: true,
		});
		const delegate = {
			onSelect: (item: FolderPickerItem) => this._select(active, item),
			onHide: () => this._onHide(active),
		};

		if (groups.length > 1 && initialGroup && this._tabbedFolderPicker) {
			active.shown = 'tabbed';
			this._tabbedFolderPicker.show<FolderPickerItem>({
				user: 'chat-folder-picker',
				anchor,
				container,
				tabs: groups,
				initialTab: initialGroup,
				createActionList: group => {
					const items = getItems(group);
					return { items, listOptions: listOptions(items) };
				},
				delegate,
				accessibilityProvider,
				width: 360,
			});
			return;
		}

		const items = getItems();
		active.shown = 'flat';
		this.actionWidgetService.show(
			'chat-folder-picker',
			false,
			items,
			delegate,
			anchor,
			container,
			undefined,
			accessibilityProvider,
			listOptions(items),
		);
	}

	private _getItems(catalog: IChatSessionRoutingWorkspaceCatalog | undefined, group?: string): IActionListItem<FolderPickerItem>[] {
		if (!catalog) {
			const items: IActionListItem<FolderPickerItem>[] = this.workspaceContextService.getWorkspace().folders.map(folder => ({
				kind: ActionListItemKind.Action,
				item: { id: folder.uri.toString(), kind: 'workspace', folder },
				group: {
					title: '',
					icon: isEqual(folder.uri, this._target.uri) ? Codicon.check : Codicon.folder,
				},
				label: folder.name,
				description: folder.uri.fsPath,
			}));
			if (this.host.pickFolder) {
				items.push({
					kind: ActionListItemKind.Action,
					item: { id: 'choose-folder', kind: 'choose' },
					group: { title: '', icon: Codicon.folderOpened },
					label: localize('chatSessionRouting.chooseExternalFolder', "Choose Folder…"),
				});
			}
			return items;
		}

		const workspaces = catalog.workspaces.filter(workspace => !group || workspace.group === group);
		const browseActions = catalog.browseActions.filter(action => !group || action.group === group);
		const items: IActionListItem<FolderPickerItem>[] = workspaces.map(workspace => ({
			kind: ActionListItemKind.Action,
			item: { id: `${workspace.providerId}:${workspace.uri.toString()}`, kind: 'providerWorkspace', workspace },
			group: { title: '', icon: this._isSelectedWorkspace(workspace) ? Codicon.check : workspace.icon ?? Codicon.folder },
			label: workspace.label,
			description: workspace.description,
			disabled: workspace.disabled,
		}));
		if (items.length && browseActions.length) {
			items.push({ kind: ActionListItemKind.Separator, label: '' });
		}
		for (const action of browseActions) {
			items.push({
				kind: ActionListItemKind.Action,
				item: { id: action.id, kind: 'providerBrowse', action },
				group: { title: '', icon: action.icon ?? Codicon.folderOpened },
				label: action.label,
				description: action.description,
				disabled: action.disabled,
			});
		}
		return items;
	}

	private _select(active: IActiveFolderPicker, item: FolderPickerItem): void {
		if (!this._isCurrent(active)) {
			return;
		}
		switch (item.kind) {
			case 'workspace':
				this._finish(active, { uri: item.folder.uri, label: item.folder.name });
				return;
			case 'providerWorkspace':
				void this._selectProviderWorkspace(active, item.workspace);
				return;
			case 'providerBrowse':
				void this._browseProviderWorkspace(active, item.action);
				return;
			case 'choose':
				void this._browseLocalFolder(active);
		}
	}

	private async _selectProviderWorkspace(active: IActiveFolderPicker, workspace: IChatSessionRoutingWorkspace): Promise<void> {
		this._beginBrowsing(active);
		try {
			await active.options.provider?.selectNewSessionWorkspace?.(workspace);
			if (this._isCurrent(active)) {
				this._finish(active, { uri: workspace.uri, providerId: workspace.providerId, label: workspace.label });
			}
		} catch (error) {
			if (this._isCurrent(active)) {
				this.logService.error('[chatSessionRouting] Failed to select workspace', error);
				this._finish(active, undefined);
			}
		}
	}

	private async _browseProviderWorkspace(active: IActiveFolderPicker, action: IChatSessionRoutingWorkspaceBrowseAction): Promise<void> {
		this._beginBrowsing(active);
		try {
			const workspace = await active.options.provider?.browseNewSessionWorkspace?.(action.id, active.options.token);
			if (!workspace || !this._isCurrent(active)) {
				if (this._isCurrent(active)) {
					this._finish(active, undefined);
				}
				return;
			}
			await active.options.provider?.selectNewSessionWorkspace?.(workspace);
			if (this._isCurrent(active)) {
				this._finish(active, { uri: workspace.uri, providerId: workspace.providerId, label: workspace.label });
			}
		} catch (error) {
			if (this._isCurrent(active)) {
				this.logService.error('[chatSessionRouting] Failed to browse for workspace', error);
				this._finish(active, undefined);
			}
		}
	}

	private async _browseLocalFolder(active: IActiveFolderPicker): Promise<void> {
		const pickFolder = this.host.pickFolder;
		if (!pickFolder) {
			return;
		}
		this._beginBrowsing(active);
		try {
			const folder = await pickFolder(this._target.uri);
			if (folder && this._isCurrent(active)) {
				this._finish(active, { uri: folder, label: basename(folder) });
			} else if (this._isCurrent(active)) {
				this._finish(active, undefined);
			}
		} catch (error) {
			if (this._isCurrent(active)) {
				this.logService.error('[chatSessionRouting] Failed to choose folder', error);
				this._finish(active, undefined);
			}
		}
	}

	private _beginBrowsing(active: IActiveFolderPicker): void {
		active.browsing = true;
		this._hideWidget(active);
		this._closeSurface(active);
	}

	private _onHide(active: IActiveFolderPicker): void {
		if (!this._isCurrent(active)) {
			return;
		}
		active.shown = undefined;
		this._closeSurface(active);
		if (!active.browsing) {
			this._finish(active, undefined, true, false);
		}
	}

	private _finish(
		active: IActiveFolderPicker,
		target: IChatSessionRoutingFolderPickerTarget | undefined,
		focus = true,
		hideWidget = true,
	): void {
		if (!this._isCurrent(active)) {
			return;
		}
		this._active = undefined;
		this._requestId++;
		if (hideWidget) {
			this._hideWidget(active);
		}
		this._closeSurface(active);
		active.store.dispose();
		this._render(false);
		if (focus && !this._isDisposed && !active.options.token.isCancellationRequested) {
			this.element.focus();
		}
		active.resolve(target);
	}

	private _hideWidget(active: IActiveFolderPicker): void {
		const shown = active.shown;
		active.shown = undefined;
		if (shown === 'tabbed' && this._tabbedFolderPicker?.isVisible) {
			this._tabbedFolderPicker.hide();
		} else if (shown === 'flat') {
			this.actionWidgetService.hide(true);
		}
	}

	private _closeSurface(active: IActiveFolderPicker): void {
		if (active.surfaceOpen) {
			active.surfaceOpen = false;
			void this.host.onDidChangeActionWidgetVisibility?.(false);
		}
	}

	private _isSelectedWorkspace(workspace: IChatSessionRoutingWorkspace): boolean {
		return isEqual(workspace.uri, this._target.uri)
			&& (!this._target.providerId || workspace.providerId === this._target.providerId);
	}

	private _isCurrent(active: IActiveFolderPicker): boolean {
		return this._active === active
			&& active.id <= this._requestId
			&& !this._isDisposed
			&& !active.options.token.isCancellationRequested;
	}

	private _render(expanded: boolean): void {
		this.element.replaceChildren();
		const folderIcon = dom.append(this.element, renderIcon(Codicon.folder));
		folderIcon.setAttribute('aria-hidden', 'true');
		const label = dom.append(this.element, dom.$('span.chat-routing-badge-folder-action-label'));
		label.textContent = this._target.label ?? localize('chatSessionRouting.chooseFolder', "Choose Folder");
		const chevron = dom.append(this.element, renderIcon(expanded ? Codicon.chevronLeft : Codicon.chevronRight));
		chevron.setAttribute('aria-hidden', 'true');
		this.element.title = this._target.label
			? localize('chatSessionRouting.changeTargetFolderWithName', "Change target folder ({0})", this._target.label)
			: localize('chatSessionRouting.changeTargetFolder', "Choose Folder");
		this.element.setAttribute('aria-label', this.element.title);
		this.element.setAttribute('aria-expanded', String(expanded));
	}

	override dispose(): void {
		if (this._active) {
			this._finish(this._active, undefined, false);
		}
		this._isDisposed = true;
		super.dispose();
	}
}
