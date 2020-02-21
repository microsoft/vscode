/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/timelinePane';
import { localize } from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { DisposableStore, IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IListVirtualDelegate, IIdentityProvider, IKeyboardNavigationLabelProvider } from 'vs/base/browser/ui/list/list';
import { ITreeNode, ITreeRenderer, ITreeContextMenuEvent } from 'vs/base/browser/ui/tree/tree';
import { ViewPane, IViewPaneOptions } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { TreeResourceNavigator, WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITimelineService, TimelineChangeEvent, TimelineProvidersChangeEvent, TimelineRequest, TimelineItem } from 'vs/workbench/contrib/timeline/common/timeline';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { SideBySideEditor, toResource } from 'vs/workbench/common/editor';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IThemeService, LIGHT, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { basename } from 'vs/base/common/path';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { VIEWLET_ID } from 'vs/workbench/contrib/files/common/files';
import { debounce } from 'vs/base/common/decorators';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IActionViewItemProvider, ActionBar, ActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IAction, ActionRunner } from 'vs/base/common/actions';
import { ContextAwareMenuEntryActionViewItem, createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuItemAction, IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { fromNow } from 'vs/base/common/date';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

// TODO[ECA]: Localize all the strings

type TreeElement = TimelineItem;

interface TimelineActionContext {
	uri: URI | undefined;
	item: TreeElement;
}

export class TimelinePane extends ViewPane {
	static readonly ID = 'timeline';
	static readonly TITLE = localize('timeline', 'Timeline');

	private _container!: HTMLElement;
	private _messageElement!: HTMLDivElement;
	private _treeElement!: HTMLDivElement;
	private _tree!: WorkbenchObjectTree<TreeElement, FuzzyScore>;
	private _treeRenderer: TimelineTreeRenderer | undefined;
	private _menus: TimelineMenus;
	private _visibilityDisposables: DisposableStore | undefined;

	// private _excludedSources: Set<string> | undefined;
	private _items: TimelineItem[] = [];
	private _loadingMessageTimer: any | undefined;
	private _pendingRequests = new Map<string, TimelineRequest>();
	private _uri: URI | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IEditorService protected editorService: IEditorService,
		@ICommandService protected commandService: ICommandService,
		@IProgressService private readonly progressService: IProgressService,
		@ITimelineService protected timelineService: ITimelineService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super({ ...options, titleMenuId: MenuId.TimelineTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);

		this._menus = this._register(this.instantiationService.createInstance(TimelineMenus, this.id));

		const scopedContextKeyService = this._register(this.contextKeyService.createScoped());
		scopedContextKeyService.createKey('view', TimelinePane.ID);
	}

	private onActiveEditorChanged() {
		let uri;

		const editor = this.editorService.activeEditor;
		if (editor) {
			uri = toResource(editor, { supportSideBySide: SideBySideEditor.MASTER });
		}

		if ((uri?.toString(true) === this._uri?.toString(true) && uri !== undefined) ||
			// Fallback to match on fsPath if we are dealing with files or git schemes
			(uri?.fsPath === this._uri?.fsPath && (uri?.scheme === 'file' || uri?.scheme === 'git') && (this._uri?.scheme === 'file' || this._uri?.scheme === 'git'))) {
			return;
		}

		this._uri = uri;
		this._treeRenderer?.setUri(uri);
		this.loadTimeline();
	}

	private onProvidersChanged(e: TimelineProvidersChangeEvent) {
		if (e.removed) {
			for (const source of e.removed) {
				this.replaceItems(source);
			}
		}

		if (e.added) {
			this.loadTimeline(e.added);
		}
	}

	private onTimelineChanged(e: TimelineChangeEvent) {
		if (e.uri === undefined || e.uri.toString(true) !== this._uri?.toString(true)) {
			this.loadTimeline([e.id]);
		}
	}

	private _message: string | undefined;
	get message(): string | undefined {
		return this._message;
	}

	set message(message: string | undefined) {
		this._message = message;
		this.updateMessage();
	}

	private updateMessage(): void {
		if (this._message) {
			this.showMessage(this._message);
		} else {
			this.hideMessage();
		}
	}

	private showMessage(message: string): void {
		DOM.removeClass(this._messageElement, 'hide');
		this.resetMessageElement();

		this._messageElement.textContent = message;
	}

	private hideMessage(): void {
		this.resetMessageElement();
		DOM.addClass(this._messageElement, 'hide');
	}

	private resetMessageElement(): void {
		DOM.clearNode(this._messageElement);
	}

	private async loadTimeline(sources?: string[]) {
		// If we have no source, we are reseting all sources, so cancel everything in flight and reset caches
		if (sources === undefined) {
			this._items.length = 0;

			if (this._loadingMessageTimer) {
				clearTimeout(this._loadingMessageTimer);
				this._loadingMessageTimer = undefined;
			}

			for (const { tokenSource } of this._pendingRequests.values()) {
				tokenSource.dispose(true);
			}

			this._pendingRequests.clear();

			// TODO[ECA]: Are these the right the list of schemes to exclude? Is there a better way?
			if (this._uri && (this._uri.scheme === 'vscode-settings' || this._uri.scheme === 'webview-panel' || this._uri.scheme === 'walkThrough')) {
				this.message = 'The active editor cannot provide timeline information.';
				this._tree.setChildren(null, undefined);

				return;
			}

			if (this._uri !== undefined) {
				this._loadingMessageTimer = setTimeout((uri: URI) => {
					if (uri !== this._uri) {
						return;
					}

					this._tree.setChildren(null, undefined);
					this.message = `Loading timeline for ${basename(uri.fsPath)}...`;
				}, 500, this._uri);
			}
		}

		if (this._uri === undefined) {
			return;
		}

		for (const source of sources ?? this.timelineService.getSources()) {
			let request = this._pendingRequests.get(source);
			request?.tokenSource.dispose(true);

			request = this.timelineService.getTimeline(source, this._uri, {}, new CancellationTokenSource(), { cacheResults: true })!;

			this._pendingRequests.set(source, request);
			request.tokenSource.token.onCancellationRequested(() => this._pendingRequests.delete(source));

			this.handleRequest(request);
		}
	}

	private async handleRequest(request: TimelineRequest) {
		let items;
		try {
			items = await this.progressService.withProgress({ location: VIEWLET_ID }, () => request.result.then(r => r?.items ?? []));
		}
		catch { }

		this._pendingRequests.delete(request.source);
		if (request.tokenSource.token.isCancellationRequested || request.uri !== this._uri) {
			return;
		}

		this.replaceItems(request.source, items);
	}

	private replaceItems(source: string, items?: TimelineItem[]) {
		const hasItems = this._items.length !== 0;

		if (items?.length) {
			this._items.splice(0, this._items.length, ...this._items.filter(i => i.source !== source), ...items);
			this._items.sort((a, b) => (b.timestamp - a.timestamp) || b.source.localeCompare(a.source, undefined, { numeric: true, sensitivity: 'base' }));
		}
		else if (this._items.length && this._items.some(i => i.source === source)) {
			this._items = this._items.filter(i => i.source !== source);
		}
		else {
			return;
		}

		// If we have items already and there are other pending requests, debounce for a bit to wait for other requests
		if (hasItems && this._pendingRequests.size !== 0) {
			this.refreshDebounced();
		}
		else {
			this.refresh();
		}
	}

	private refresh() {
		if (this._loadingMessageTimer) {
			clearTimeout(this._loadingMessageTimer);
			this._loadingMessageTimer = undefined;
		}

		if (this._items.length === 0) {
			this.message = 'No timeline information was provided.';
		} else {
			this.message = undefined;
		}

		this._tree.setChildren(null, this._items.map(item => ({ element: item })));
	}

	@debounce(500)
	private refreshDebounced() {
		this.refresh();
	}

	focus(): void {
		super.focus();
		this._tree.domFocus();
	}

	setVisible(visible: boolean): void {
		if (visible) {
			this._visibilityDisposables = new DisposableStore();

			this.timelineService.onDidChangeProviders(this.onProvidersChanged, this, this._visibilityDisposables);
			this.timelineService.onDidChangeTimeline(this.onTimelineChanged, this, this._visibilityDisposables);
			this.editorService.onDidActiveEditorChange(this.onActiveEditorChanged, this, this._visibilityDisposables);

			this.onActiveEditorChanged();
		} else {
			this._visibilityDisposables?.dispose();
		}
	}

	protected layoutBody(height: number, width: number): void {
		this._tree.layout(height, width);
	}

	protected renderBody(container: HTMLElement): void {
		this._container = container;
		DOM.addClasses(container, 'tree-explorer-viewlet-tree-view', 'timeline-tree-view');

		this._messageElement = DOM.append(this._container, DOM.$('.message'));
		DOM.addClass(this._messageElement, 'timeline-subtle');

		this.message = 'The active editor cannot provide timeline information.';

		this._treeElement = document.createElement('div');
		DOM.addClasses(this._treeElement, 'customview-tree', 'file-icon-themable-tree', 'hide-arrows');
		// DOM.addClass(this._treeElement, 'show-file-icons');
		container.appendChild(this._treeElement);

		this._treeRenderer = this.instantiationService.createInstance(TimelineTreeRenderer, this._menus);
		this._tree = <WorkbenchObjectTree<TreeElement, FuzzyScore>>this.instantiationService.createInstance(WorkbenchObjectTree, 'TimelinePane',
			this._treeElement, new TimelineListVirtualDelegate(), [this._treeRenderer], {
			identityProvider: new TimelineIdentityProvider(),
			keyboardNavigationLabelProvider: new TimelineKeyboardNavigationLabelProvider(),
			overrideStyles: {
				listBackground: this.getBackgroundColor(),

			}
		});

		const customTreeNavigator = new TreeResourceNavigator(this._tree, { openOnFocus: false, openOnSelection: false });
		this._register(customTreeNavigator);
		this._register(this._tree.onContextMenu(e => this.onContextMenu(this._menus, e)));
		this._register(
			customTreeNavigator.onDidOpenResource(e => {
				if (!e.browserEvent) {
					return;
				}

				const selection = this._tree.getSelection();
				const command = selection.length === 1 ? selection[0]?.command : undefined;
				if (command) {
					this.commandService.executeCommand(command.id, ...(command.arguments || []));
				}
			})
		);
	}

	private onContextMenu(menus: TimelineMenus, treeEvent: ITreeContextMenuEvent<TreeElement | null>): void {
		const item = treeEvent.element;
		if (item === null) {
			return;
		}
		const event: UIEvent = treeEvent.browserEvent;

		event.preventDefault();
		event.stopPropagation();

		this._tree.setFocus([item]);
		const actions = menus.getResourceContextActions(item);
		if (!actions.length) {
			return;
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => treeEvent.anchor,
			getActions: () => actions,
			getActionViewItem: (action) => {
				const keybinding = this.keybindingService.lookupKeybinding(action.id);
				if (keybinding) {
					return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
				}
				return undefined;
			},
			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					this._tree.domFocus();
				}
			},
			getActionsContext: (): TimelineActionContext => ({ uri: this._uri, item: item }),
			actionRunner: new TimelineActionRunner()
		});
	}
}

export class TimelineElementTemplate implements IDisposable {
	static readonly id = 'TimelineElementTemplate';

	readonly actionBar: ActionBar;
	readonly icon: HTMLElement;
	readonly iconLabel: IconLabel;
	readonly timestamp: HTMLSpanElement;

	constructor(
		readonly container: HTMLElement,
		actionViewItemProvider: IActionViewItemProvider
	) {
		DOM.addClass(container, 'custom-view-tree-node-item');
		this.icon = DOM.append(container, DOM.$('.custom-view-tree-node-item-icon'));

		this.iconLabel = new IconLabel(container, { supportHighlights: true, supportCodicons: true });

		const timestampContainer = DOM.append(this.iconLabel.element, DOM.$('.timeline-timestamp-container'));
		this.timestamp = DOM.append(timestampContainer, DOM.$('span.timeline-timestamp'));

		const actionsContainer = DOM.append(this.iconLabel.element, DOM.$('.actions'));
		this.actionBar = new ActionBar(actionsContainer, { actionViewItemProvider: actionViewItemProvider });
	}

	dispose() {
		this.iconLabel.dispose();
		this.actionBar.dispose();
	}

	reset() {
		this.actionBar.clear();
	}
}

export class TimelineIdentityProvider implements IIdentityProvider<TreeElement> {
	getId(item: TreeElement): { toString(): string } {
		return item.handle;
	}
}

class TimelineActionRunner extends ActionRunner {

	runAction(action: IAction, { uri, item }: TimelineActionContext): Promise<any> {
		return action.run(...[
			{
				$mid: 11,
				handle: item.handle,
				source: item.source,
				uri: uri
			},
			uri,
			item.source,
		]);
	}
}

export class TimelineKeyboardNavigationLabelProvider implements IKeyboardNavigationLabelProvider<TreeElement> {
	getKeyboardNavigationLabel(element: TreeElement): { toString(): string } {
		return element.label;
	}
}

export class TimelineListVirtualDelegate implements IListVirtualDelegate<TreeElement> {
	getHeight(_element: TreeElement): number {
		return 22;
	}

	getTemplateId(element: TreeElement): string {
		return TimelineElementTemplate.id;
	}
}

class TimelineTreeRenderer implements ITreeRenderer<TreeElement, FuzzyScore, TimelineElementTemplate> {
	readonly templateId: string = TimelineElementTemplate.id;

	private _actionViewItemProvider: IActionViewItemProvider;

	constructor(
		private readonly _menus: TimelineMenus,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IThemeService private _themeService: IThemeService
	) {
		this._actionViewItemProvider = (action: IAction) => action instanceof MenuItemAction
			? this.instantiationService.createInstance(ContextAwareMenuEntryActionViewItem, action)
			: undefined;
	}

	private _uri: URI | undefined;
	setUri(uri: URI | undefined) {
		this._uri = uri;
	}

	renderTemplate(container: HTMLElement): TimelineElementTemplate {
		return new TimelineElementTemplate(container, this._actionViewItemProvider);
	}

	renderElement(
		node: ITreeNode<TreeElement, FuzzyScore>,
		index: number,
		template: TimelineElementTemplate,
		height: number | undefined
	): void {
		template.reset();

		const { element: item } = node;

		const icon = this._themeService.getTheme().type === LIGHT ? item.icon : item.iconDark;
		const iconUrl = icon ? URI.revive(icon) : null;

		if (iconUrl) {
			template.icon.className = 'custom-view-tree-node-item-icon';
			template.icon.style.backgroundImage = DOM.asCSSUrl(iconUrl);
		} else {
			let iconClass: string | undefined;
			if (item.themeIcon /*&& !this.isFileKindThemeIcon(element.themeIcon)*/) {
				iconClass = ThemeIcon.asClassName(item.themeIcon);
			}
			template.icon.className = iconClass ? `custom-view-tree-node-item-icon ${iconClass}` : '';
		}

		template.iconLabel.setLabel(item.label, item.description, {
			title: item.detail,
			matches: createMatches(node.filterData)
		});

		template.timestamp.textContent = fromNow(item.timestamp);

		template.actionBar.context = { uri: this._uri, item: item } as TimelineActionContext;
		template.actionBar.actionRunner = new TimelineActionRunner();
		template.actionBar.push(this._menus.getResourceActions(item), { icon: true, label: false });
	}

	disposeTemplate(template: TimelineElementTemplate): void {
		template.iconLabel.dispose();
	}
}

class TimelineMenus extends Disposable {

	constructor(
		private id: string,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		super();
	}

	getResourceActions(element: TreeElement): IAction[] {
		return this.getActions(MenuId.TimelineItemContext, { key: 'timelineItem', value: element.contextValue }).primary;
	}

	getResourceContextActions(element: TreeElement): IAction[] {
		return this.getActions(MenuId.TimelineItemContext, { key: 'timelineItem', value: element.contextValue }).secondary;
	}

	private getActions(menuId: MenuId, context: { key: string, value?: string }): { primary: IAction[]; secondary: IAction[]; } {
		const contextKeyService = this.contextKeyService.createScoped();
		contextKeyService.createKey('view', this.id);
		contextKeyService.createKey(context.key, context.value);

		const menu = this.menuService.createMenu(menuId, contextKeyService);
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };
		createAndFillInContextMenuActions(menu, { shouldForwardArgs: true }, result, this.contextMenuService, g => /^inline/.test(g));

		menu.dispose();
		contextKeyService.dispose();

		return result;
	}
}
