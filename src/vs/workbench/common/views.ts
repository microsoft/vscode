/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../editor/common/languages.js';
import { UriComponents, URI } from '../../base/common/uri.js';
import { Event, Emitter } from '../../base/common/event.js';
import { ContextKeyExpression } from '../../platform/contextkey/common/contextkey.js';
import { localize } from '../../nls.js';
import { createDecorator } from '../../platform/instantiation/common/instantiation.js';
import { IDisposable, Disposable, toDisposable } from '../../base/common/lifecycle.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { getOrSet, SetMap } from '../../base/common/map.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { IKeybindings } from '../../platform/keybinding/common/keybindingsRegistry.js';
import { ExtensionIdentifier } from '../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import { IProgressIndicator } from '../../platform/progress/common/progress.js';
import Severity from '../../base/common/severity.js';
import { IAccessibilityInformation } from '../../platform/accessibility/common/accessibility.js';
import { IMarkdownString, MarkdownString } from '../../base/common/htmlContent.js';
import { mixin } from '../../base/common/objects.js';
import { Codicon } from '../../base/common/codicons.js';
import { registerIcon } from '../../platform/theme/common/iconRegistry.js';
import { CancellationToken } from '../../base/common/cancellation.js';
import { VSDataTransfer } from '../../base/common/dataTransfer.js';
import { ILocalizedString } from '../../platform/action/common/action.js';

export const VIEWS_LOG_ID = 'views';
export const VIEWS_LOG_NAME = localize('views log', "Views");
export const defaultViewIcon = registerIcon('default-view-icon', Codicon.window, localize('defaultViewIcon', 'Default view icon.'));

export namespace Extensions {
	export const ViewContainersRegistry = 'workbench.registry.view.containers';
	export const ViewsRegistry = 'workbench.registry.view';
}

export const enum ViewContainerLocation {
	Sidebar,
	Panel,
	AuxiliaryBar
}

export const ViewContainerLocations = [ViewContainerLocation.Sidebar, ViewContainerLocation.Panel, ViewContainerLocation.AuxiliaryBar];

export function ViewContainerLocationToString(viewContainerLocation: ViewContainerLocation) {
	switch (viewContainerLocation) {
		case ViewContainerLocation.Sidebar: return 'sidebar';
		case ViewContainerLocation.Panel: return 'panel';
		case ViewContainerLocation.AuxiliaryBar: return 'auxiliarybar';
	}
}

type OpenCommandActionDescriptor = {
	readonly id: string;
	readonly title?: ILocalizedString | string;
	readonly mnemonicTitle?: string;
	readonly order?: number;
	readonly keybindings?: IKeybindings & { when?: ContextKeyExpression };
};

/**
 * View Container Contexts
 */

export interface IViewContainerDescriptor {

	/**
	 * The id of the view container
	 */
	readonly id: string;

	/**
	 * The title of the view container
	 */
	readonly title: ILocalizedString;

	/**
	 * Icon representation of the View container
	 */
	readonly icon?: ThemeIcon | URI;

	/**
	 * Order of the view container.
	 */
	readonly order?: number;

	/**
	 * IViewPaneContainer Ctor to instantiate
	 */
	readonly ctorDescriptor: SyncDescriptor<IViewPaneContainer>;

	/**
	 * Descriptor for open view container command
	 * If not provided, view container info (id, title) is used.
	 *
	 * Note: To prevent registering open command, use `doNotRegisterOpenCommand` flag while registering the view container
	 */
	readonly openCommandActionDescriptor?: OpenCommandActionDescriptor;

	/**
	 * Storage id to use to store the view container state.
	 * If not provided, it will be derived.
	 */
	readonly storageId?: string;

	/**
	 * If enabled, view container is not shown if it has no active views.
	 */
	readonly hideIfEmpty?: boolean;

	/**
	 * Id of the extension that contributed the view container
	 */
	readonly extensionId?: ExtensionIdentifier;

	readonly alwaysUseContainerInfo?: boolean;

	readonly viewOrderDelegate?: ViewOrderDelegate;

	readonly rejectAddedViews?: boolean;

	requestedIndex?: number;
}

export interface IViewContainersRegistry {
	/**
	 * An event that is triggered when a view container is registered.
	 */
	readonly onDidRegister: Event<{ viewContainer: ViewContainer; viewContainerLocation: ViewContainerLocation }>;

	/**
	 * An event that is triggered when a view container is deregistered.
	 */
	readonly onDidDeregister: Event<{ viewContainer: ViewContainer; viewContainerLocation: ViewContainerLocation }>;

	/**
	 * All registered view containers
	 */
	readonly all: ViewContainer[];

	/**
	 * Registers a view container to given location.
	 * No op if a view container is already registered.
	 *
	 * @param viewContainerDescriptor descriptor of view container
	 * @param location location of the view container
	 *
	 * @returns the registered ViewContainer.
	 */
	registerViewContainer(viewContainerDescriptor: IViewContainerDescriptor, location: ViewContainerLocation, options?: { isDefault?: boolean; doNotRegisterOpenCommand?: boolean }): ViewContainer;

	/**
	 * Deregisters the given view container
	 * No op if the view container is not registered
	 */
	deregisterViewContainer(viewContainer: ViewContainer): void;

	/**
	 * Returns the view container with given id.
	 *
	 * @returns the view container with given id.
	 */
	get(id: string): ViewContainer | undefined;

	/**
	 * Returns all view containers in the given location
	 */
	getViewContainers(location: ViewContainerLocation): ViewContainer[];

	/**
	 * Returns the view container location
	 */
	getViewContainerLocation(container: ViewContainer): ViewContainerLocation;

	/**
	 * Return the default view container from the given location
	 */
	getDefaultViewContainer(location: ViewContainerLocation): ViewContainer | undefined;
}

interface ViewOrderDelegate {
	getOrder(group?: string): number | undefined;
}

export interface ViewContainer extends IViewContainerDescriptor { }

interface RelaxedViewContainer extends ViewContainer {

	openCommandActionDescriptor?: OpenCommandActionDescriptor;
}

class ViewContainersRegistryImpl extends Disposable implements IViewContainersRegistry {

	private readonly _onDidRegister = this._register(new Emitter<{ viewContainer: ViewContainer; viewContainerLocation: ViewContainerLocation }>());
	readonly onDidRegister: Event<{ viewContainer: ViewContainer; viewContainerLocation: ViewContainerLocation }> = this._onDidRegister.event;

	private readonly _onDidDeregister = this._register(new Emitter<{ viewContainer: ViewContainer; viewContainerLocation: ViewContainerLocation }>());
	readonly onDidDeregister: Event<{ viewContainer: ViewContainer; viewContainerLocation: ViewContainerLocation }> = this._onDidDeregister.event;

	private readonly viewContainers: Map<ViewContainerLocation, ViewContainer[]> = new Map<ViewContainerLocation, ViewContainer[]>();
	private readonly defaultViewContainers: ViewContainer[] = [];

	get all(): ViewContainer[] {
		return [...this.viewContainers.values()].flat();
	}

	registerViewContainer(viewContainerDescriptor: IViewContainerDescriptor, viewContainerLocation: ViewContainerLocation, options?: { isDefault?: boolean; doNotRegisterOpenCommand?: boolean }): ViewContainer {
		const existing = this.get(viewContainerDescriptor.id);
		if (existing) {
			return existing;
		}

		const viewContainer: RelaxedViewContainer = viewContainerDescriptor;
		viewContainer.openCommandActionDescriptor = options?.doNotRegisterOpenCommand ? undefined : (viewContainer.openCommandActionDescriptor ?? { id: viewContainer.id });
		const viewContainers = getOrSet(this.viewContainers, viewContainerLocation, []);
		viewContainers.push(viewContainer);
		if (options?.isDefault) {
			this.defaultViewContainers.push(viewContainer);
		}
		this._onDidRegister.fire({ viewContainer, viewContainerLocation });
		return viewContainer;
	}

	deregisterViewContainer(viewContainer: ViewContainer): void {
		for (const viewContainerLocation of this.viewContainers.keys()) {
			const viewContainers = this.viewContainers.get(viewContainerLocation)!;
			const index = viewContainers?.indexOf(viewContainer);
			if (index !== -1) {
				viewContainers?.splice(index, 1);
				if (viewContainers.length === 0) {
					this.viewContainers.delete(viewContainerLocation);
				}
				this._onDidDeregister.fire({ viewContainer, viewContainerLocation });
				return;
			}
		}
	}

	get(id: string): ViewContainer | undefined {
		return this.all.filter(viewContainer => viewContainer.id === id)[0];
	}

	getViewContainers(location: ViewContainerLocation): ViewContainer[] {
		return [...(this.viewContainers.get(location) || [])];
	}

	getViewContainerLocation(container: ViewContainer): ViewContainerLocation {
		return [...this.viewContainers.keys()].filter(location => this.getViewContainers(location).filter(viewContainer => viewContainer?.id === container.id).length > 0)[0];
	}

	getDefaultViewContainer(location: ViewContainerLocation): ViewContainer | undefined {
		return this.defaultViewContainers.find(viewContainer => this.getViewContainerLocation(viewContainer) === location);
	}
}

Registry.add(Extensions.ViewContainersRegistry, new ViewContainersRegistryImpl());

export interface IViewDescriptor {

	readonly type?: string;

	readonly id: string;

	readonly name: ILocalizedString;

	readonly ctorDescriptor: SyncDescriptor<IView>;

	readonly when?: ContextKeyExpression;

	readonly order?: number;

	readonly weight?: number;

	readonly collapsed?: boolean;

	readonly canToggleVisibility?: boolean;

	readonly canMoveView?: boolean;

	readonly containerIcon?: ThemeIcon | URI;

	readonly containerTitle?: string;

	readonly singleViewPaneContainerTitle?: string;

	// Applies only to newly created views
	readonly hideByDefault?: boolean;

	readonly workspace?: boolean;

	readonly focusCommand?: { id: string; keybindings?: IKeybindings };

	// For contributed remote explorer views
	readonly group?: string;

	readonly remoteAuthority?: string | string[];
	readonly virtualWorkspace?: string;

	readonly openCommandActionDescriptor?: OpenCommandActionDescriptor;

	readonly accessibilityHelpContent?: MarkdownString;
}

export interface ICustomViewDescriptor extends IViewDescriptor {
	readonly extensionId: ExtensionIdentifier;
	readonly originalContainerId: string;
	readonly treeView?: ITreeView;
}

export interface IViewDescriptorRef {
	viewDescriptor: IViewDescriptor;
	index: number;
}

export interface IAddedViewDescriptorRef extends IViewDescriptorRef {
	collapsed: boolean;
	size?: number;
}

export interface IAddedViewDescriptorState {
	viewDescriptor: IViewDescriptor;
	collapsed?: boolean;
	visible?: boolean;
}

export interface IViewContainerModel {

	readonly viewContainer: ViewContainer;

	readonly title: string;
	readonly icon: ThemeIcon | URI | undefined;
	readonly keybindingId: string | undefined;
	readonly onDidChangeContainerInfo: Event<{ title?: boolean; icon?: boolean; keybindingId?: boolean; badgeEnablement?: boolean }>;

	readonly allViewDescriptors: ReadonlyArray<IViewDescriptor>;
	readonly onDidChangeAllViewDescriptors: Event<{ added: ReadonlyArray<IViewDescriptor>; removed: ReadonlyArray<IViewDescriptor> }>;

	readonly activeViewDescriptors: ReadonlyArray<IViewDescriptor>;
	readonly onDidChangeActiveViewDescriptors: Event<{ added: ReadonlyArray<IViewDescriptor>; removed: ReadonlyArray<IViewDescriptor> }>;

	readonly visibleViewDescriptors: ReadonlyArray<IViewDescriptor>;
	readonly onDidAddVisibleViewDescriptors: Event<IAddedViewDescriptorRef[]>;
	readonly onDidRemoveVisibleViewDescriptors: Event<IViewDescriptorRef[]>;
	readonly onDidMoveVisibleViewDescriptors: Event<{ from: IViewDescriptorRef; to: IViewDescriptorRef }>;

	isVisible(id: string): boolean;
	setVisible(id: string, visible: boolean): void;

	isCollapsed(id: string): boolean;
	setCollapsed(id: string, collapsed: boolean): void;

	getSize(id: string): number | undefined;
	setSizes(newSizes: readonly { id: string; size: number }[]): void;

	move(from: string, to: string): void;
}

export enum ViewContentGroups {
	Open = '2_open',
	Debug = '4_debug',
	SCM = '5_scm',
	More = '9_more'
}

export interface IViewContentDescriptor {
	readonly content: string;
	/**
	 * Whether to render all but the first button as secondary
	 * if there are buttons in the `content` property.
	 */
	readonly renderSecondaryButtons?: boolean;
	readonly when?: ContextKeyExpression | 'default';
	readonly group?: string;
	readonly order?: number;
	readonly precondition?: ContextKeyExpression | undefined;
}

export interface IViewsRegistry {

	readonly onViewsRegistered: Event<{ views: IViewDescriptor[]; viewContainer: ViewContainer }[]>;

	readonly onViewsDeregistered: Event<{ views: IViewDescriptor[]; viewContainer: ViewContainer }>;

	readonly onDidChangeContainer: Event<{ views: IViewDescriptor[]; from: ViewContainer; to: ViewContainer }>;

	registerViews(views: IViewDescriptor[], viewContainer: ViewContainer): void;

	registerViews2(views: { views: IViewDescriptor[]; viewContainer: ViewContainer }[]): void;

	deregisterViews(views: IViewDescriptor[], viewContainer: ViewContainer): void;

	moveViews(views: IViewDescriptor[], viewContainer: ViewContainer): void;

	getViews(viewContainer: ViewContainer): IViewDescriptor[];

	getView(id: string): IViewDescriptor | null;

	getViewContainer(id: string): ViewContainer | null;

	readonly onDidChangeViewWelcomeContent: Event<string>;
	registerViewWelcomeContent(id: string, viewContent: IViewContentDescriptor): IDisposable;
	registerViewWelcomeContent2<TKey>(id: string, viewContentMap: Map<TKey, IViewContentDescriptor>): Map<TKey, IDisposable>;
	getViewWelcomeContent(id: string): IViewContentDescriptor[];
}

function compareViewContentDescriptors(a: IViewContentDescriptor, b: IViewContentDescriptor): number {
	const aGroup = a.group ?? ViewContentGroups.More;
	const bGroup = b.group ?? ViewContentGroups.More;
	if (aGroup !== bGroup) {
		return aGroup.localeCompare(bGroup);
	}
	return (a.order ?? 5) - (b.order ?? 5);
}

class ViewsRegistry extends Disposable implements IViewsRegistry {

	private readonly _onViewsRegistered = this._register(new Emitter<{ views: IViewDescriptor[]; viewContainer: ViewContainer }[]>());
	readonly onViewsRegistered = this._onViewsRegistered.event;

	private readonly _onViewsDeregistered: Emitter<{ views: IViewDescriptor[]; viewContainer: ViewContainer }> = this._register(new Emitter<{ views: IViewDescriptor[]; viewContainer: ViewContainer }>());
	readonly onViewsDeregistered: Event<{ views: IViewDescriptor[]; viewContainer: ViewContainer }> = this._onViewsDeregistered.event;

	private readonly _onDidChangeContainer: Emitter<{ views: IViewDescriptor[]; from: ViewContainer; to: ViewContainer }> = this._register(new Emitter<{ views: IViewDescriptor[]; from: ViewContainer; to: ViewContainer }>());
	readonly onDidChangeContainer: Event<{ views: IViewDescriptor[]; from: ViewContainer; to: ViewContainer }> = this._onDidChangeContainer.event;

	private readonly _onDidChangeViewWelcomeContent: Emitter<string> = this._register(new Emitter<string>());
	readonly onDidChangeViewWelcomeContent: Event<string> = this._onDidChangeViewWelcomeContent.event;

	private _viewContainers: ViewContainer[] = [];
	private _views: Map<ViewContainer, IViewDescriptor[]> = new Map<ViewContainer, IViewDescriptor[]>();
	private _viewWelcomeContents = new SetMap<string, IViewContentDescriptor>();

	registerViews(views: IViewDescriptor[], viewContainer: ViewContainer): void {
		this.registerViews2([{ views, viewContainer }]);
	}

	registerViews2(views: { views: IViewDescriptor[]; viewContainer: ViewContainer }[]): void {
		views.forEach(({ views, viewContainer }) => this.addViews(views, viewContainer));
		this._onViewsRegistered.fire(views);
	}

	deregisterViews(viewDescriptors: IViewDescriptor[], viewContainer: ViewContainer): void {
		const views = this.removeViews(viewDescriptors, viewContainer);
		if (views.length) {
			this._onViewsDeregistered.fire({ views, viewContainer });
		}
	}

	moveViews(viewsToMove: IViewDescriptor[], viewContainer: ViewContainer): void {
		for (const container of this._views.keys()) {
			if (container !== viewContainer) {
				const views = this.removeViews(viewsToMove, container);
				if (views.length) {
					this.addViews(views, viewContainer);
					this._onDidChangeContainer.fire({ views, from: container, to: viewContainer });
				}
			}
		}
	}

	getViews(loc: ViewContainer): IViewDescriptor[] {
		return this._views.get(loc) || [];
	}

	getView(id: string): IViewDescriptor | null {
		for (const viewContainer of this._viewContainers) {
			const viewDescriptor = (this._views.get(viewContainer) || []).filter(v => v.id === id)[0];
			if (viewDescriptor) {
				return viewDescriptor;
			}
		}
		return null;
	}

	getViewContainer(viewId: string): ViewContainer | null {
		for (const viewContainer of this._viewContainers) {
			const viewDescriptor = (this._views.get(viewContainer) || []).filter(v => v.id === viewId)[0];
			if (viewDescriptor) {
				return viewContainer;
			}
		}
		return null;
	}

	registerViewWelcomeContent(id: string, viewContent: IViewContentDescriptor): IDisposable {
		this._viewWelcomeContents.add(id, viewContent);
		this._onDidChangeViewWelcomeContent.fire(id);

		return toDisposable(() => {
			this._viewWelcomeContents.delete(id, viewContent);
			this._onDidChangeViewWelcomeContent.fire(id);
		});
	}

	registerViewWelcomeContent2<TKey>(id: string, viewContentMap: Map<TKey, IViewContentDescriptor>): Map<TKey, IDisposable> {
		const disposables = new Map<TKey, IDisposable>();

		for (const [key, content] of viewContentMap) {
			this._viewWelcomeContents.add(id, content);

			disposables.set(key, toDisposable(() => {
				this._viewWelcomeContents.delete(id, content);
				this._onDidChangeViewWelcomeContent.fire(id);
			}));
		}
		this._onDidChangeViewWelcomeContent.fire(id);

		return disposables;
	}

	getViewWelcomeContent(id: string): IViewContentDescriptor[] {
		const result: IViewContentDescriptor[] = [];
		this._viewWelcomeContents.forEach(id, descriptor => result.push(descriptor));
		return result.sort(compareViewContentDescriptors);
	}

	private addViews(viewDescriptors: IViewDescriptor[], viewContainer: ViewContainer): void {
		let views = this._views.get(viewContainer);
		if (!views) {
			views = [];
			this._views.set(viewContainer, views);
			this._viewContainers.push(viewContainer);
		}
		for (const viewDescriptor of viewDescriptors) {
			if (this.getView(viewDescriptor.id) !== null) {
				throw new Error(localize('duplicateId', "A view with id '{0}' is already registered", viewDescriptor.id));
			}
			views.push(viewDescriptor);
		}
	}

	private removeViews(viewDescriptors: IViewDescriptor[], viewContainer: ViewContainer): IViewDescriptor[] {
		const views = this._views.get(viewContainer);
		if (!views) {
			return [];
		}
		const viewsToDeregister: IViewDescriptor[] = [];
		const remaningViews: IViewDescriptor[] = [];
		for (const view of views) {
			if (!viewDescriptors.includes(view)) {
				remaningViews.push(view);
			} else {
				viewsToDeregister.push(view);
			}
		}
		if (viewsToDeregister.length) {
			if (remaningViews.length) {
				this._views.set(viewContainer, remaningViews);
			} else {
				this._views.delete(viewContainer);
				this._viewContainers.splice(this._viewContainers.indexOf(viewContainer), 1);
			}
		}
		return viewsToDeregister;
	}
}

Registry.add(Extensions.ViewsRegistry, new ViewsRegistry());

export interface IView {

	readonly id: string;

	focus(): void;

	isVisible(): boolean;

	isBodyVisible(): boolean;

	setExpanded(expanded: boolean): boolean;

	getProgressIndicator(): IProgressIndicator | undefined;
}

export const IViewDescriptorService = createDecorator<IViewDescriptorService>('viewDescriptorService');

export enum ViewVisibilityState {
	Default = 0,
	Expand = 1
}

export interface IViewDescriptorService {

	readonly _serviceBrand: undefined;

	// ViewContainers
	readonly viewContainers: ReadonlyArray<ViewContainer>;
	readonly onDidChangeViewContainers: Event<{ added: ReadonlyArray<{ container: ViewContainer; location: ViewContainerLocation }>; removed: ReadonlyArray<{ container: ViewContainer; location: ViewContainerLocation }> }>;

	getDefaultViewContainer(location: ViewContainerLocation): ViewContainer | undefined;
	getViewContainerById(id: string): ViewContainer | null;
	isViewContainerRemovedPermanently(id: string): boolean;
	getDefaultViewContainerLocation(viewContainer: ViewContainer): ViewContainerLocation | null;
	getViewContainerLocation(viewContainer: ViewContainer): ViewContainerLocation | null;
	getViewContainersByLocation(location: ViewContainerLocation): ViewContainer[];
	getViewContainerModel(viewContainer: ViewContainer): IViewContainerModel;

	readonly onDidChangeContainerLocation: Event<{ viewContainer: ViewContainer; from: ViewContainerLocation; to: ViewContainerLocation }>;
	moveViewContainerToLocation(viewContainer: ViewContainer, location: ViewContainerLocation, requestedIndex?: number, reason?: string): void;

	getViewContainerBadgeEnablementState(id: string): boolean;
	setViewContainerBadgeEnablementState(id: string, badgesEnabled: boolean): void;

	// Views
	getViewDescriptorById(id: string): IViewDescriptor | null;
	getViewContainerByViewId(id: string): ViewContainer | null;
	getDefaultContainerById(id: string): ViewContainer | null;
	getViewLocationById(id: string): ViewContainerLocation | null;

	readonly onDidChangeContainer: Event<{ views: IViewDescriptor[]; from: ViewContainer; to: ViewContainer }>;
	moveViewsToContainer(views: IViewDescriptor[], viewContainer: ViewContainer, visibilityState?: ViewVisibilityState, reason?: string): void;

	readonly onDidChangeLocation: Event<{ views: IViewDescriptor[]; from: ViewContainerLocation; to: ViewContainerLocation }>;
	moveViewToLocation(view: IViewDescriptor, location: ViewContainerLocation, reason?: string): void;

	reset(): void;
}

// Custom views

export interface ITreeView extends IDisposable {

	dataProvider: ITreeViewDataProvider | undefined;

	dragAndDropController?: ITreeViewDragAndDropController;

	showCollapseAllAction: boolean;

	canSelectMany: boolean;

	manuallyManageCheckboxes: boolean;

	message?: string | IMarkdownString;

	title: string;

	description: string | undefined;

	badge: IViewBadge | undefined;

	readonly visible: boolean;

	readonly onDidExpandItem: Event<ITreeItem>;

	readonly onDidCollapseItem: Event<ITreeItem>;

	readonly onDidChangeSelectionAndFocus: Event<{ selection: readonly ITreeItem[]; focus: ITreeItem }>;

	readonly onDidChangeVisibility: Event<boolean>;

	readonly onDidChangeActions: Event<void>;

	readonly onDidChangeTitle: Event<string>;

	readonly onDidChangeDescription: Event<string | undefined>;

	readonly onDidChangeWelcomeState: Event<void>;

	readonly onDidChangeCheckboxState: Event<readonly ITreeItem[]>;

	readonly container: any | undefined;

	// checkboxesChanged is a subset of treeItems
	refresh(treeItems?: readonly ITreeItem[], checkboxesChanged?: readonly ITreeItem[]): Promise<void>;

	setVisibility(visible: boolean): void;

	focus(): void;

	layout(height: number, width: number): void;

	getOptimalWidth(): number;

	reveal(item: ITreeItem): Promise<void>;

	expand(itemOrItems: ITreeItem | ITreeItem[]): Promise<void>;

	isCollapsed(item: ITreeItem): boolean;

	setSelection(items: ITreeItem[]): void;

	getSelection(): ITreeItem[];

	setFocus(item?: ITreeItem): void;

	show(container: any): void;
}

export interface IRevealOptions {

	select?: boolean;

	focus?: boolean;

	expand?: boolean | number;

}

export interface ITreeViewDescriptor extends IViewDescriptor {
	treeView: ITreeView;
}

export type TreeViewPaneHandleArg = {
	$treeViewId: string;
	$selectedTreeItems?: boolean;
	$focusedTreeItem?: boolean;
};

export type TreeViewItemHandleArg = {
	$treeViewId: string;
	$treeItemHandle: string;
};

export enum TreeItemCollapsibleState {
	None = 0,
	Collapsed = 1,
	Expanded = 2
}

export interface ITreeItemLabel {

	label: string;

	highlights?: [number, number][];

	strikethrough?: boolean;

}

export type TreeCommand = Command & { originalId?: string };

export interface ITreeItemCheckboxState {
	isChecked: boolean;
	tooltip?: string;
	accessibilityInformation?: IAccessibilityInformation;
}

export interface ITreeItem {

	handle: string;

	parentHandle?: string;

	collapsibleState: TreeItemCollapsibleState;

	label?: ITreeItemLabel;

	description?: string | boolean;

	icon?: UriComponents;

	iconDark?: UriComponents;

	themeIcon?: ThemeIcon;

	resourceUri?: UriComponents;

	tooltip?: string | IMarkdownString;

	contextValue?: string;

	command?: TreeCommand;

	children?: ITreeItem[];

	parent?: ITreeItem;

	accessibilityInformation?: IAccessibilityInformation;

	checkbox?: ITreeItemCheckboxState;
}

export class ResolvableTreeItem implements ITreeItem {
	handle!: string;
	parentHandle?: string;
	collapsibleState!: TreeItemCollapsibleState;
	label?: ITreeItemLabel;
	description?: string | boolean;
	icon?: UriComponents;
	iconDark?: UriComponents;
	themeIcon?: ThemeIcon;
	resourceUri?: UriComponents;
	tooltip?: string | IMarkdownString;
	contextValue?: string;
	command?: Command & { originalId?: string };
	children?: ITreeItem[];
	accessibilityInformation?: IAccessibilityInformation;
	resolve: (token: CancellationToken) => Promise<void>;
	private resolved: boolean = false;
	private _hasResolve: boolean = false;
	constructor(treeItem: ITreeItem, resolve?: ((token: CancellationToken) => Promise<ITreeItem | undefined>)) {
		mixin(this, treeItem);
		this._hasResolve = !!resolve;
		this.resolve = async (token: CancellationToken) => {
			if (resolve && !this.resolved) {
				const resolvedItem = await resolve(token);
				if (resolvedItem) {
					// Resolvable elements. Currently tooltip and command.
					this.tooltip = this.tooltip ?? resolvedItem.tooltip;
					this.command = this.command ?? resolvedItem.command;
				}
			}
			if (!token.isCancellationRequested) {
				this.resolved = true;
			}
		};
	}
	get hasResolve(): boolean {
		return this._hasResolve;
	}
	public resetResolve() {
		this.resolved = false;
	}
	public asTreeItem(): ITreeItem {
		return {
			handle: this.handle,
			parentHandle: this.parentHandle,
			collapsibleState: this.collapsibleState,
			label: this.label,
			description: this.description,
			icon: this.icon,
			iconDark: this.iconDark,
			themeIcon: this.themeIcon,
			resourceUri: this.resourceUri,
			tooltip: this.tooltip,
			contextValue: this.contextValue,
			command: this.command,
			children: this.children,
			accessibilityInformation: this.accessibilityInformation
		};
	}
}

export class NoTreeViewError extends Error {
	override readonly name = 'NoTreeViewError';
	constructor(treeViewId: string) {
		super(localize('treeView.notRegistered', 'No tree view with id \'{0}\' registered.', treeViewId));
	}
	static is(err: unknown): err is NoTreeViewError {
		return !!err && (err as Error).name === 'NoTreeViewError';
	}
}

export interface ITreeViewDataProvider {
	readonly isTreeEmpty?: boolean;
	onDidChangeEmpty?: Event<void>;
	getChildren(element?: ITreeItem): Promise<ITreeItem[] | undefined>;
	getChildrenBatch?(element?: ITreeItem[]): Promise<ITreeItem[][] | undefined>;
}

export interface ITreeViewDragAndDropController {
	readonly dropMimeTypes: string[];
	readonly dragMimeTypes: string[];
	handleDrag(sourceTreeItemHandles: string[], operationUuid: string, token: CancellationToken): Promise<VSDataTransfer | undefined>;
	handleDrop(elements: VSDataTransfer, target: ITreeItem | undefined, token: CancellationToken, operationUuid?: string, sourceTreeId?: string, sourceTreeItemHandles?: string[]): Promise<void>;
}

export interface IEditableData {
	validationMessage: (value: string) => { content: string; severity: Severity } | null;
	placeholder?: string | null;
	startingValue?: string | null;
	onFinish: (value: string, success: boolean) => Promise<void>;
}

export interface IViewPaneContainer {
	onDidAddViews: Event<IView[]>;
	onDidRemoveViews: Event<IView[]>;
	onDidChangeViewVisibility: Event<IView>;

	readonly views: IView[];

	setVisible(visible: boolean): void;
	isVisible(): boolean;
	focus(): void;
	getActionsContext(): unknown;
	getView(viewId: string): IView | undefined;
	toggleViewVisibility(viewId: string): void;
}

export interface IViewBadge {
	readonly tooltip: string;
	readonly value: number;
}
