/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise, ValueCallback } from 'vs/base/common/winjs.base';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import Event, { Emitter } from 'vs/base/common/event';
import { ISidebar } from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import { Registry } from 'vs/platform/platform';
import { ViewletDescriptor, ViewletRegistry, Extensions as ViewletExtensions } from 'vs/workbench/browser/viewlet';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';

export class ViewletService implements IViewletService {

	private static readonly ENABLED_EXTENSION_VIEWLETS = 'workbench.viewlet.enabledExtViewlets';

	public _serviceBrand: any;

	private sidebarPart: ISidebar;
	private viewletRegistry: ViewletRegistry;
	private enabledExtensionViewletIds: string[];
	private extensionViewlets: ViewletDescriptor[];
	private extensionViewletsLoaded: TPromise<void>;
	private extensionViewletsLoadedPromiseComplete: ValueCallback;
	private _onDidExtensionViewletsLoad = new Emitter<void>();
	private _onDidViewletToggle = new Emitter<void>();

	public get onDidViewletOpen(): Event<IViewlet> { return this.sidebarPart.onDidViewletOpen; };
	public get onDidViewletClose(): Event<IViewlet> { return this.sidebarPart.onDidViewletClose; };
	public get onDidViewletToggle(): Event<void> { return this._onDidViewletToggle.event; };

	constructor(
		sidebarPart: ISidebar,
		@IStorageService private storageService: IStorageService,
		@IExtensionService private extensionService: IExtensionService
	) {
		this.sidebarPart = sidebarPart;
		this.viewletRegistry = Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets);

		const enabledExtensionViewletsJson = this.storageService.get(ViewletService.ENABLED_EXTENSION_VIEWLETS);
		this.enabledExtensionViewletIds = enabledExtensionViewletsJson ? JSON.parse(enabledExtensionViewletsJson) : [];
		this.extensionViewlets = [];

		this.loadExtensionViewlets();
	}

	public onReady(): TPromise<void> {
		return this.extensionViewletsLoaded;
	}

	private loadExtensionViewlets(): void {
		this.extensionViewletsLoaded = new TPromise<void>(c => {
			this.extensionViewletsLoadedPromiseComplete = c;
		});

		this.extensionService.onReady().then(() => {
			const viewlets = this.viewletRegistry.getViewlets();
			viewlets.forEach(v => {
				if (v.fromExtension) {
					this.extensionViewlets.push(v);
				}
			});

			this.extensionViewletsLoadedPromiseComplete(void 0);

			this._onDidExtensionViewletsLoad.fire();
		});
	}

	public openViewlet(id: string, focus?: boolean): TPromise<IViewlet> {

		// Built in viewlets do not need to wait for extensions to be loaded
		const builtInViewletIds = this.getBuiltInViewlets().map(v => v.id);
		const isBuiltInViewlet = builtInViewletIds.indexOf(id) !== -1;
		if (isBuiltInViewlet) {
			return this.sidebarPart.openViewlet(id, focus);
		}

		// Extension viewlets need to be loaded first which can take time
		return this.onReady().then(() => {
			if (this.viewletRegistry.getViewlet(id)) {
				return this.sidebarPart.openViewlet(id, focus);
			}

			// Fallback to default viewlet if extension viewlet is still not found (e.g. uninstalled)
			return this.sidebarPart.openViewlet(this.viewletRegistry.getDefaultViewletId(), focus);
		});
	}

	public toggleViewlet(id: string): void {
		const index = this.enabledExtensionViewletIds.indexOf(id);
		if (index === -1) {
			this.enabledExtensionViewletIds.push(id);
		} else {
			this.enabledExtensionViewletIds.splice(index, 1);
		}

		this.storageService.store(ViewletService.ENABLED_EXTENSION_VIEWLETS, JSON.stringify(this.enabledExtensionViewletIds));
		this._onDidViewletToggle.fire();
	}

	public getActiveViewlet(): IViewlet {
		return this.sidebarPart.getActiveViewlet();
	}

	public getViewlets(): ViewletDescriptor[] {
		const builtInViewlets = this.getBuiltInViewlets();

		return builtInViewlets.concat(this.extensionViewlets);
	}

	public getAllViewletsToDisplay(): ViewletDescriptor[] {
		const builtInViewlets = this.getBuiltInViewlets();
		const enabledExtensionViewlets = this.extensionViewlets
			.filter(v => this.enabledExtensionViewletIds.indexOf(v.id) !== -1)
			.sort((v1, v2) => {
				return this.enabledExtensionViewletIds.indexOf(v1.id) - this.enabledExtensionViewletIds.indexOf(v2.id);
			});

		return builtInViewlets.concat(enabledExtensionViewlets);
	}

	public isViewletEnabled(id: string): boolean {
		return this.enabledExtensionViewletIds.indexOf(id) !== -1;
	}

	// Get an ordered list of all built in viewlets
	private getBuiltInViewlets(): ViewletDescriptor[] {
		return this.viewletRegistry.getViewlets()
			.filter(viewlet => !viewlet.fromExtension)
			.sort((v1, v2) => v1.order - v2.order);
	}
}