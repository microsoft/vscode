/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from 'vs/editor/common/modes';
import { UriComponents } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ITreeViewDataProvider } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { values, keys } from 'vs/base/common/map';
import { Registry } from 'vs/platform/registry/common/platform';
import { IKeybindings } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IAction } from 'vs/base/common/actions';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export const TEST_VIEW_CONTAINER_ID = 'workbench.view.extension.test';
export const FocusedViewContext = new RawContextKey<string>('focusedView', '');

export namespace Extensions {
	export const ViewContainersRegistry = 'workbench.registry.view.containers';
	export const ViewsRegistry = 'workbench.registry.view';
}

export interface IViewContainersRegistry {
	/**
	 * An event that is triggerred when a view container is registered.
	 */
	readonly onDidRegister: Event<ViewContainer>;

	/**
	 * An event that is triggerred when a view container is deregistered.
	 */
	readonly onDidDeregister: Event<ViewContainer>;

	/**
	 * All registered view containers
	 */
	readonly all: ViewContainer[];

	/**
	 * Registers a view container with given id
	 * No op if a view container is already registered with the given id.
	 *
	 * @param id of the view container.
	 *
	 * @returns the registered ViewContainer.
	 */
	registerViewContainer(id: string, hideIfEmpty?: boolean, extensionId?: ExtensionIdentifier, viewOrderDelegate?: ViewOrderDelegate): ViewContainer;

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
}

interface ViewOrderDelegate {
	getOrder(group?: string): number | undefined;
}

export class ViewContainer {
	protected constructor(readonly id: string, readonly hideIfEmpty: boolean, readonly extensionId?: ExtensionIdentifier, readonly orderDelegate?: ViewOrderDelegate) { }
}

class ViewContainersRegistryImpl extends Disposable implements IViewContainersRegistry {

	private readonly _onDidRegister = this._register(new Emitter<ViewContainer>());
	readonly onDidRegister: Event<ViewContainer> = this._onDidRegister.event;

	private readonly _onDidDeregister = this._register(new Emitter<ViewContainer>());
	readonly onDidDeregister: Event<ViewContainer> = this._onDidDeregister.event;

	private viewContainers: Map<string, ViewContainer> = new Map<string, ViewContainer>();

	get all(): ViewContainer[] {
		return values(this.viewContainers);
	}

	registerViewContainer(id: string, hideIfEmpty?: boolean, extensionId?: ExtensionIdentifier, viewOrderDelegate?: ViewOrderDelegate): ViewContainer {
		const existing = this.viewContainers.get(id);
		if (existing) {
			return existing;
		}

		const viewContainer = new class extends ViewContainer {
			constructor() {
				super(id, !!hideIfEmpty, extensionId, viewOrderDelegate);
			}
		};
		this.viewContainers.set(id, viewContainer);
		this._onDidRegister.fire(viewContainer);
		return viewContainer;
	}

	deregisterViewContainer(viewContainer: ViewContainer): void {
		const existing = this.viewContainers.get(viewContainer.id);
		if (existing) {
			this.viewContainers.delete(viewContainer.id);
			this._onDidDeregister.fire(viewContainer);
		}
	}

	get(id: string): ViewContainer | undefined {
		return this.viewContainers.get(id);
	}
}

Registry.add(Extensions.ViewContainersRegistry, new ViewContainersRegistryImpl());

export interface IViewDescriptor {

	readonly id: string;

	readonly name: string;

	readonly ctorDescriptor: { ctor: any, arguments?: any[] };

	readonly when?: ContextKeyExpr;

	readonly group?: string;

	readonly order?: number;

	readonly weight?: number;

	readonly collapsed?: boolean;

	readonly canToggleVisibility?: boolean;

	// Applies only to newly created views
	readonly hideByDefault?: boolean;

	readonly workspace?: boolean;

	readonly focusCommand?: { id: string, keybindings?: IKeybindings };
}

export interface IViewDescriptorCollection extends IDisposable {
	readonly onDidChangeActiveViews: Event<{ added: IViewDescriptor[], removed: IViewDescriptor[] }>;
	readonly activeViewDescriptors: IViewDescriptor[];
	readonly allViewDescriptors: IViewDescriptor[];
}

export interface IViewsRegistry {

	readonly onViewsRegistered: Event<{ views: IViewDescriptor[], viewContainer: ViewContainer }>;

	readonly onViewsDeregistered: Event<{ views: IViewDescriptor[], viewContainer: ViewContainer }>;

	readonly onDidChangeContainer: Event<{ views: IViewDescriptor[], from: ViewContainer, to: ViewContainer }>;

	registerViews(views: IViewDescriptor[], viewContainer: ViewContainer): void;

	deregisterViews(views: IViewDescriptor[], viewContainer: ViewContainer): void;

	moveViews(views: IViewDescriptor[], viewContainer: ViewContainer): void;

	getViews(viewContainer: ViewContainer): IViewDescriptor[];

	getView(id: string): IViewDescriptor | null;

	getViewContainer(id: string): ViewContainer | null;
}

class ViewsRegistry extends Disposable implements IViewsRegistry {

	private readonly _onViewsRegistered: Emitter<{ views: IViewDescriptor[], viewContainer: ViewContainer }> = this._register(new Emitter<{ views: IViewDescriptor[], viewContainer: ViewContainer }>());
	readonly onViewsRegistered: Event<{ views: IViewDescriptor[], viewContainer: ViewContainer }> = this._onViewsRegistered.event;

	private readonly _onViewsDeregistered: Emitter<{ views: IViewDescriptor[], viewContainer: ViewContainer }> = this._register(new Emitter<{ views: IViewDescriptor[], viewContainer: ViewContainer }>());
	readonly onViewsDeregistered: Event<{ views: IViewDescriptor[], viewContainer: ViewContainer }> = this._onViewsDeregistered.event;

	private readonly _onDidChangeContainer: Emitter<{ views: IViewDescriptor[], from: ViewContainer, to: ViewContainer }> = this._register(new Emitter<{ views: IViewDescriptor[], from: ViewContainer, to: ViewContainer }>());
	readonly onDidChangeContainer: Event<{ views: IViewDescriptor[], from: ViewContainer, to: ViewContainer }> = this._onDidChangeContainer.event;

	private _viewContainers: ViewContainer[] = [];
	private _views: Map<ViewContainer, IViewDescriptor[]> = new Map<ViewContainer, IViewDescriptor[]>();

	registerViews(views: IViewDescriptor[], viewContainer: ViewContainer): void {
		this.addViews(views, viewContainer);
		this._onViewsRegistered.fire({ views: views, viewContainer });
	}

	deregisterViews(viewDescriptors: IViewDescriptor[], viewContainer: ViewContainer): void {
		const views = this.removeViews(viewDescriptors, viewContainer);
		if (views.length) {
			this._onViewsDeregistered.fire({ views, viewContainer });
		}
	}

	moveViews(viewsToMove: IViewDescriptor[], viewContainer: ViewContainer): void {
		keys(this._views).forEach(container => {
			if (container !== viewContainer) {
				const views = this.removeViews(viewsToMove, container);
				if (views.length) {
					this.addViews(views, viewContainer);
					this._onDidChangeContainer.fire({ views, from: container, to: viewContainer });
				}
			}
		});
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

	private addViews(viewDescriptors: IViewDescriptor[], viewContainer: ViewContainer): void {
		let views = this._views.get(viewContainer);
		if (!views) {
			views = [];
			this._views.set(viewContainer, views);
			this._viewContainers.push(viewContainer);
		}
		for (const viewDescriptor of viewDescriptors) {
			if (views.some(v => v.id === viewDescriptor.id)) {
				throw new Error(localize('duplicateId', "A view with id '{0}' is already registered in the container '{1}'", viewDescriptor.id, viewContainer.id));
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
			if (viewDescriptors.indexOf(view) === -1) {
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

}

export interface IViewsViewlet extends IViewlet {

	openView(id: string, focus?: boolean): IView;

}

export const IViewsService = createDecorator<IViewsService>('viewsService');

export interface IViewsService {
	_serviceBrand: ServiceIdentifier<any>;

	openView(id: string, focus?: boolean): Promise<IView | null>;

	getViewDescriptors(container: ViewContainer): IViewDescriptorCollection | null;
}

// Custom views

export interface ITreeView extends IDisposable {

	dataProvider: ITreeViewDataProvider | undefined;

	showCollapseAllAction: boolean;

	canSelectMany: boolean;

	message?: string;

	readonly visible: boolean;

	readonly onDidExpandItem: Event<ITreeItem>;

	readonly onDidCollapseItem: Event<ITreeItem>;

	readonly onDidChangeSelection: Event<ITreeItem[]>;

	readonly onDidChangeVisibility: Event<boolean>;

	readonly onDidChangeActions: Event<void>;

	refresh(treeItems?: ITreeItem[]): Promise<void>;

	setVisibility(visible: boolean): void;

	focus(): void;

	layout(height: number, width: number): void;

	getOptimalWidth(): number;

	reveal(item: ITreeItem): Promise<void>;

	expand(itemOrItems: ITreeItem | ITreeItem[]): Promise<void>;

	setSelection(items: ITreeItem[]): void;

	setFocus(item: ITreeItem): void;

	getPrimaryActions(): IAction[];

	getSecondaryActions(): IAction[];
}

export interface IRevealOptions {

	select?: boolean;

	focus?: boolean;

	expand?: boolean | number;

}

export interface ITreeViewDescriptor extends IViewDescriptor {

	readonly treeView: ITreeView;

}

export type TreeViewItemHandleArg = {
	$treeViewId: string,
	$treeItemHandle: string
};

export enum TreeItemCollapsibleState {
	None = 0,
	Collapsed = 1,
	Expanded = 2
}

export interface ITreeItemLabel {

	label: string;

	highlights?: [number, number][];

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

	tooltip?: string;

	contextValue?: string;

	command?: Command;

	children?: ITreeItem[];
}

export interface ITreeViewDataProvider {

	getChildren(element?: ITreeItem): Promise<ITreeItem[]>;

}
