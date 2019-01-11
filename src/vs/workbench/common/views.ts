/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from 'vs/editor/common/modes';
import { UriComponents } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ITreeViewDataProvider } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { values } from 'vs/base/common/map';
import { Registry } from 'vs/platform/registry/common/platform';
import { IKeybindings } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IAction } from 'vs/base/common/actions';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export const TEST_VIEW_CONTAINER_ID = 'workbench.view.extension.test';

export namespace Extensions {
	export const ViewContainersRegistry = 'workbench.registry.view.containers';
}

export interface IViewContainersRegistry {
	/**
	 * An event that is triggerred when a view container is registered.
	 */
	readonly onDidRegister: Event<ViewContainer>;

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
	registerViewContainer(id: string, extensionId?: ExtensionIdentifier): ViewContainer;

	/**
	 * Returns the view container with given id.
	 *
	 * @returns the view container with given id.
	 */
	get(id: string): ViewContainer | undefined;
}

export class ViewContainer {
	protected constructor(readonly id: string, readonly extensionId: ExtensionIdentifier) { }
}

class ViewContainersRegistryImpl implements IViewContainersRegistry {

	private readonly _onDidRegister = new Emitter<ViewContainer>();
	readonly onDidRegister: Event<ViewContainer> = this._onDidRegister.event;

	private viewContainers: Map<string, ViewContainer> = new Map<string, ViewContainer>();

	get all(): ViewContainer[] {
		return values(this.viewContainers);
	}

	registerViewContainer(id: string, extensionId: ExtensionIdentifier): ViewContainer {
		const existing = this.viewContainers.get(id);
		if (existing) {
			return existing;
		}

		const viewContainer = new class extends ViewContainer {
			constructor() {
				super(id, extensionId);
			}
		};
		this.viewContainers.set(id, viewContainer);
		this._onDidRegister.fire(viewContainer);
		return viewContainer;
	}

	get(id: string): ViewContainer | undefined {
		return this.viewContainers.get(id);
	}
}

Registry.add(Extensions.ViewContainersRegistry, new ViewContainersRegistryImpl());

export interface IViewDescriptor {

	readonly id: string;

	readonly name: string;

	readonly container: ViewContainer;

	// TODO@Sandeep do we really need this?!
	readonly ctor: any;

	readonly when?: ContextKeyExpr;

	readonly order?: number;

	readonly weight?: number;

	readonly collapsed?: boolean;

	readonly canToggleVisibility?: boolean;

	// Applies only to newly created views
	readonly hideByDefault?: boolean;

	readonly focusCommand?: { id: string, keybindings?: IKeybindings };
}

export interface IViewDescriptorCollection {
	readonly onDidChangeActiveViews: Event<{ added: IViewDescriptor[], removed: IViewDescriptor[] }>;
	readonly activeViewDescriptors: IViewDescriptor[];
	readonly allViewDescriptors: IViewDescriptor[];
}

export interface IViewsRegistry {

	readonly onViewsRegistered: Event<IViewDescriptor[]>;

	readonly onViewsDeregistered: Event<IViewDescriptor[]>;

	registerViews(views: IViewDescriptor[]): void;

	deregisterViews(ids: string[], container: ViewContainer): void;

	getViews(loc: ViewContainer): IViewDescriptor[];

	getView(id: string): IViewDescriptor | null;

	getAllViews(): IViewDescriptor[];
}

export const ViewsRegistry: IViewsRegistry = new class implements IViewsRegistry {

	private readonly _onViewsRegistered: Emitter<IViewDescriptor[]> = new Emitter<IViewDescriptor[]>();
	readonly onViewsRegistered: Event<IViewDescriptor[]> = this._onViewsRegistered.event;

	private readonly _onViewsDeregistered: Emitter<IViewDescriptor[]> = new Emitter<IViewDescriptor[]>();
	readonly onViewsDeregistered: Event<IViewDescriptor[]> = this._onViewsDeregistered.event;

	private _viewContainer: ViewContainer[] = [];
	private _views: Map<ViewContainer, IViewDescriptor[]> = new Map<ViewContainer, IViewDescriptor[]>();

	registerViews(viewDescriptors: IViewDescriptor[]): void {
		if (viewDescriptors.length) {
			for (const viewDescriptor of viewDescriptors) {
				let views = this._views.get(viewDescriptor.container);
				if (!views) {
					views = [];
					this._views.set(viewDescriptor.container, views);
					this._viewContainer.push(viewDescriptor.container);
				}
				if (views.some(v => v.id === viewDescriptor.id)) {
					throw new Error(localize('duplicateId', "A view with id '{0}' is already registered in the container '{1}'", viewDescriptor.id, viewDescriptor.container.id));
				}
				views.push(viewDescriptor);
			}
			this._onViewsRegistered.fire(viewDescriptors);
		}
	}

	deregisterViews(ids: string[], container: ViewContainer): void {
		const views = this._views.get(container);

		if (!views) {
			return;
		}

		const viewsToDeregister = views.filter(view => ids.indexOf(view.id) !== -1);

		if (viewsToDeregister.length) {
			const remaningViews = views.filter(view => ids.indexOf(view.id) === -1);
			if (remaningViews.length) {
				this._views.set(container, remaningViews);
			} else {
				this._views.delete(container);
				this._viewContainer.splice(this._viewContainer.indexOf(container), 1);
			}
			this._onViewsDeregistered.fire(viewsToDeregister);
		}

	}

	getViews(loc: ViewContainer): IViewDescriptor[] {
		return this._views.get(loc) || [];
	}

	getView(id: string): IViewDescriptor | null {
		for (const viewContainer of this._viewContainer) {
			const viewDescriptor = (this._views.get(viewContainer) || []).filter(v => v.id === id)[0];
			if (viewDescriptor) {
				return viewDescriptor;
			}
		}
		return null;
	}

	getAllViews(): IViewDescriptor[] {
		const allViews: IViewDescriptor[] = [];
		this._views.forEach(views => allViews.push(...views));
		return allViews;
	}
};

export interface IView {

	readonly id: string;

}

export interface IViewsViewlet extends IViewlet {

	openView(id: string, focus?: boolean): IView;

}

export const IViewsService = createDecorator<IViewsService>('viewsService');

export interface IViewsService {
	_serviceBrand: any;

	openView(id: string, focus?: boolean): Promise<IView | null>;

	getViewDescriptors(container: ViewContainer): IViewDescriptorCollection;
}

// Custom views

export interface ITreeView extends IDisposable {

	dataProvider: ITreeViewDataProvider;

	showCollapseAllAction: boolean;

	message: string | IMarkdownString;

	readonly visible: boolean;

	readonly onDidExpandItem: Event<ITreeItem>;

	readonly onDidCollapseItem: Event<ITreeItem>;

	readonly onDidChangeSelection: Event<ITreeItem[]>;

	readonly onDidChangeVisibility: Event<boolean>;

	readonly onDidChangeActions: Event<void>;

	refresh(treeItems?: ITreeItem[]): Promise<void>;

	setVisibility(visible: boolean): void;

	focus(): void;

	layout(height: number): void;

	show(container: HTMLElement);

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

export interface ICustomViewDescriptor extends IViewDescriptor {

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

	parentHandle: string;

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
