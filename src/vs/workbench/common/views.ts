/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Command } from 'vs/editor/common/modes';
import { UriComponents } from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ITreeViewDataProvider } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';

export class ViewLocation {

	static readonly Explorer = new ViewLocation('workbench.view.explorer');
	static readonly Debug = new ViewLocation('workbench.view.debug');
	static readonly Extensions = new ViewLocation('workbench.view.extensions');

	constructor(private _id: string) {
	}

	get id(): string {
		return this._id;
	}

	static getContributedViewLocation(value: string): ViewLocation {
		switch (value) {
			case 'explorer': return ViewLocation.Explorer;
			case 'debug': return ViewLocation.Debug;
		}
		return void 0;
	}
}

export interface IViewDescriptor {

	readonly id: string;

	readonly name: string;

	readonly location: ViewLocation;

	// TODO do we really need this?!
	readonly ctor: any;

	readonly when?: ContextKeyExpr;

	readonly order?: number;

	readonly weight?: number;

	readonly collapsed?: boolean;

	readonly canToggleVisibility?: boolean;
}

export interface IViewsRegistry {

	readonly onViewsRegistered: Event<IViewDescriptor[]>;

	readonly onViewsDeregistered: Event<IViewDescriptor[]>;

	registerViews(views: IViewDescriptor[]): void;

	deregisterViews(ids: string[], location: ViewLocation): void;

	getViews(loc: ViewLocation): IViewDescriptor[];

	getAllViews(): IViewDescriptor[];

	getView(id: string): IViewDescriptor;

}

export const ViewsRegistry: IViewsRegistry = new class implements IViewsRegistry {

	private _onViewsRegistered: Emitter<IViewDescriptor[]> = new Emitter<IViewDescriptor[]>();
	readonly onViewsRegistered: Event<IViewDescriptor[]> = this._onViewsRegistered.event;

	private _onViewsDeregistered: Emitter<IViewDescriptor[]> = new Emitter<IViewDescriptor[]>();
	readonly onViewsDeregistered: Event<IViewDescriptor[]> = this._onViewsDeregistered.event;

	private _viewLocations: ViewLocation[] = [];
	private _views: Map<ViewLocation, IViewDescriptor[]> = new Map<ViewLocation, IViewDescriptor[]>();

	registerViews(viewDescriptors: IViewDescriptor[]): void {
		if (viewDescriptors.length) {
			for (const viewDescriptor of viewDescriptors) {
				let views = this._views.get(viewDescriptor.location);
				if (!views) {
					views = [];
					this._views.set(viewDescriptor.location, views);
					this._viewLocations.push(viewDescriptor.location);
				}
				if (views.some(v => v.id === viewDescriptor.id)) {
					throw new Error(localize('duplicateId', "A view with id '{0}' is already registered in the location '{1}'", viewDescriptor.id, viewDescriptor.location.id));
				}
				views.push(viewDescriptor);
			}
			this._onViewsRegistered.fire(viewDescriptors);
		}
	}

	deregisterViews(ids: string[], location: ViewLocation): void {
		const views = this._views.get(location);

		if (!views) {
			return;
		}

		const viewsToDeregister = views.filter(view => ids.indexOf(view.id) !== -1);

		if (viewsToDeregister.length) {
			const remaningViews = views.filter(view => ids.indexOf(view.id) === -1);
			if (remaningViews.length) {
				this._views.set(location, remaningViews);
			} else {
				this._views.delete(location);
				this._viewLocations.splice(this._viewLocations.indexOf(location), 1);
			}
		}

		this._onViewsDeregistered.fire(viewsToDeregister);
	}

	getViews(loc: ViewLocation): IViewDescriptor[] {
		return this._views.get(loc) || [];
	}

	getAllViews(): IViewDescriptor[] {
		const result: IViewDescriptor[] = [];
		this._views.forEach(views => result.push(...views));
		return result;
	}

	getView(id: string): IViewDescriptor {
		for (const viewLocation of this._viewLocations) {
			const viewDescriptor = (this._views.get(viewLocation) || []).filter(v => v.id === id)[0];
			if (viewDescriptor) {
				return viewDescriptor;
			}
		}
		return null;
	}
};

export interface IViewsViewlet extends IViewlet {

	openView(id: string, focus?: boolean): TPromise<void>;

}

// Custom views

export interface ITreeViewer extends IDisposable {

	dataProvider: ITreeViewDataProvider;

	refresh(treeItems?: ITreeItem[]): TPromise<void>;

	setVisibility(visible: boolean): void;

	focus(): void;

	layout(height: number): void;

	show(container: HTMLElement);

	getOptimalWidth(): number;

	reveal(item: ITreeItem, parentChain: ITreeItem[], options: { donotSelect?: boolean }): TPromise<void>;
}

export interface ICustomViewDescriptor extends IViewDescriptor {

	treeView?: boolean;

}

export const ICustomViewsService = createDecorator<ICustomViewsService>('customViewsService');

export interface ICustomViewsService {
	_serviceBrand: any;

	getTreeViewer(id: string): ITreeViewer;

	openView(id: string, focus?: boolean): TPromise<void>;
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

export interface ITreeItem {

	handle: string;

	parentHandle: string;

	collapsibleState: TreeItemCollapsibleState;

	label?: string;

	icon?: string;

	iconDark?: string;

	themeIcon?: ThemeIcon;

	resourceUri?: UriComponents;

	tooltip?: string;

	contextValue?: string;

	command?: Command;

	children?: ITreeItem[];

}

export interface ITreeViewDataProvider {

	onDidChange: Event<ITreeItem[] | undefined | null>;

	onDispose: Event<void>;

	getChildren(element?: ITreeItem): TPromise<ITreeItem[]>;
}