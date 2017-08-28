/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter } from 'vs/base/common/event';
import { IViewConstructorSignature } from 'vs/workbench/parts/views/browser/views';
import { ITreeViewDataProvider } from 'vs/workbench/parts/views/common/views';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

export class ViewLocation {

	static readonly Explorer = new ViewLocation('explorer');
	static readonly Debug = new ViewLocation('debug');
	static readonly Extensions = new ViewLocation('extensions');
	static readonly SCM = new ViewLocation('scm');

	constructor(private _id: string) {
	}

	get id(): string {
		return this._id;
	}

	static getContributedViewLocation(value: string): ViewLocation {
		switch (value) {
			case ViewLocation.Explorer.id: return ViewLocation.Explorer;
			case ViewLocation.Debug.id: return ViewLocation.Debug;
		}
		return void 0;
	}
}

export interface IViewDescriptor {

	readonly id: string;

	readonly name: string;

	readonly location: ViewLocation;

	readonly ctor: IViewConstructorSignature;

	readonly when?: ContextKeyExpr;

	readonly order?: number;

	readonly size?: number;

	readonly canToggleVisibility?: boolean;
}

export interface IViewsRegistry {

	readonly onViewsRegistered: Event<IViewDescriptor[]>;

	readonly onViewsDeregistered: Event<IViewDescriptor[]>;

	readonly onTreeViewDataProviderRegistered: Event<string>;

	registerViews(views: IViewDescriptor[]): void;

	deregisterViews(ids: string[], location: ViewLocation): void;

	registerTreeViewDataProvider(id: string, factory: ITreeViewDataProvider): void;

	deregisterTreeViewDataProviders(): void;

	getViews(loc: ViewLocation): IViewDescriptor[];

	getTreeViewDataProvider(id: string): ITreeViewDataProvider;

}

export const ViewsRegistry: IViewsRegistry = new class {

	private _onViewsRegistered: Emitter<IViewDescriptor[]> = new Emitter<IViewDescriptor[]>();
	readonly onViewsRegistered: Event<IViewDescriptor[]> = this._onViewsRegistered.event;

	private _onViewsDeregistered: Emitter<IViewDescriptor[]> = new Emitter<IViewDescriptor[]>();
	readonly onViewsDeregistered: Event<IViewDescriptor[]> = this._onViewsDeregistered.event;

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

	deregisterViews(ids: string[], location: ViewLocation): void {
		const views = this._views.get(location);

		if (!views) {
			return;
		}

		const viewsToDeregister = views.filter(view => ids.indexOf(view.id) !== -1);

		if (viewsToDeregister.length) {
			this._views.set(location, views.filter(view => ids.indexOf(view.id) === -1));
		}

		this._onViewsDeregistered.fire(viewsToDeregister);
	}

	registerTreeViewDataProvider<T>(id: string, factory: ITreeViewDataProvider) {
		if (!this.isViewRegistered(id)) {
			// TODO: throw error
		}
		this._treeViewDataPoviders.set(id, factory);
		this._onTreeViewDataProviderRegistered.fire(id);
	}

	deregisterTreeViewDataProviders(): void {
		this._treeViewDataPoviders.clear();
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