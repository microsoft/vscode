/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { IActionRunner } from 'vs/base/common/actions';
import { IViewletView as IView } from 'vs/workbench/browser/viewlet';

export class ViewLocation {

	static readonly Explorer = new ViewLocation('explorer');

	constructor(private _id: string) {
	}

	get id(): string {
		return this._id;
	}
}

export enum TreeItemCollapsibleState {
	Collapsed = 1,
	Expanded = 2
}

export interface IViewOptions {
	name: string;
	actionRunner: IActionRunner;
	collapsed: boolean;
}

export interface IViewConstructorSignature {

	new (id: string, options: IViewOptions, ...services: { _serviceBrand: any; }[]): IView;

}

export interface IViewDescriptor {

	readonly id: string;

	readonly name: string;

	readonly location: ViewLocation;

	readonly ctor: IViewConstructorSignature;

	readonly order?: number;

}

export interface ITreeItem {

	handle: number;

	label: string;

	icon?: string;

	iconDark?: string;

	contextValue?: string;

	commandId?: string;

	children?: ITreeItem[];

	collapsibleState?: TreeItemCollapsibleState;
}

export interface ITreeViewDataProvider {

	onDidChange: Event<ITreeItem | undefined | null>;

	getElements(): TPromise<ITreeItem[]>;

	getChildren(element: ITreeItem): TPromise<ITreeItem[]>;

}

export interface IViewsRegistry {

	readonly onViewsRegistered: Event<IViewDescriptor[]>;

	readonly onTreeViewDataProviderRegistered: Event<string>;

	registerViews(views: IViewDescriptor[]): void;

	registerTreeViewDataProvider(id: string, factory: ITreeViewDataProvider): void;

	getViews(loc: ViewLocation): IViewDescriptor[];

	getTreeViewDataProvider(id: string): ITreeViewDataProvider;

}

export const ViewsRegistry: IViewsRegistry = new class {

	private _onViewsRegistered: Emitter<IViewDescriptor[]> = new Emitter<IViewDescriptor[]>();
	readonly onViewsRegistered: Event<IViewDescriptor[]> = this._onViewsRegistered.event;

	private _onTreeViewDataProviderRegistered: Emitter<string> = new Emitter<string>();
	readonly onTreeViewDataProviderRegistered: Event<string> = this._onTreeViewDataProviderRegistered.event;

	private _views: Map<ViewLocation, IViewDescriptor[]> = new Map<ViewLocation, IViewDescriptor[]>();
	private _treeViewDataPoviders: Map<string, ITreeViewDataProvider> = new Map<string, ITreeViewDataProvider>();

	registerViews(viewDescriptors: IViewDescriptor[]): void {
		if (viewDescriptors.length) {
			for (const viewDescriptor of viewDescriptors) {
				let views = this._views.get(viewDescriptor.location);
				if (!views) {
					views = [];
					this._views.set(viewDescriptor.location, views);
				}
				views.push(viewDescriptor);
			}
			this._onViewsRegistered.fire(viewDescriptors);
		}
	}

	registerTreeViewDataProvider<T>(id: string, factory: ITreeViewDataProvider) {
		if (!this.isViewRegistered(id)) {
			// TODO: throw error
		}
		this._treeViewDataPoviders.set(id, factory);
		this._onTreeViewDataProviderRegistered.fire(id);
	}

	getViews(loc: ViewLocation): IViewDescriptor[] {
		return this._views.get(loc) || [];
	}

	getTreeViewDataProvider(id: string): ITreeViewDataProvider {
		return this._treeViewDataPoviders.get(id);
	}

	private isViewRegistered(id: string): boolean {
		let registered = false;
		this._views.forEach(views => registered = registered || views.some(view => view.id === id));
		return registered;
	}
};