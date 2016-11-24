/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
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
	private _onDidExtensionViewletsLoad = new Emitter<void>();
	private _onDidViewletToggle = new Emitter<void>();

	public get onDidViewletOpen(): Event<IViewlet> { return this.sidebarPart.onDidViewletOpen; };
	public get onDidViewletClose(): Event<IViewlet> { return this.sidebarPart.onDidViewletClose; };
	public get onDidExtensionViewletsLoad(): Event<void> { return this._onDidExtensionViewletsLoad.event; };
	public get onDidViewletToggle(): Event<void> { return this._onDidViewletToggle.event; };

	constructor(
		sidebarPart: ISidebar,
		@IStorageService private storageService: IStorageService,
		@IExtensionService private extensionService: IExtensionService
	) {
		this.sidebarPart = sidebarPart;
		this.viewletRegistry = <ViewletRegistry>Registry.as(ViewletExtensions.Viewlets);

		const enabledExtensionViewletsJson = this.storageService.get(ViewletService.ENABLED_EXTENSION_VIEWLETS);
		this.enabledExtensionViewletIds = enabledExtensionViewletsJson ? JSON.parse(enabledExtensionViewletsJson) : [];
		this.extensionViewlets = [];

		this.extensionService.onReady().then(() => {
			this.onExtensionServiceReady();
		});
	}

	private onExtensionServiceReady(): void {
		const viewlets = this.viewletRegistry.getViewlets();
		viewlets.forEach(v => {
			if (v.fromExtension) {
				this.extensionViewlets.push(v);
			}
		});

		this._onDidExtensionViewletsLoad.fire();
	}

	public openViewlet(id: string, focus?: boolean): TPromise<IViewlet> {
		return this.sidebarPart.openViewlet(id, focus);
	}

	public restoreViewlet(id: string): TPromise<IViewlet> {
		const shouldFocus = false;

		const stockViewletIds = this.getStockViewlets().map(v => v.id);
		const isStockViewlet = stockViewletIds.indexOf(id) !== -1;
		if (isStockViewlet) {
			return this.sidebarPart.openViewlet(id, shouldFocus);
		} else {
			return new TPromise<IViewlet>(c => {
				this.onDidExtensionViewletsLoad(() => {
					// It's possible the external viewlet is uninstalled and not available.
					// Restore file explorer in that case.
					if (!this.viewletRegistry.getViewlet(id)) {
						const defaultViewletId = this.viewletRegistry.getDefaultViewletId();
						this.sidebarPart.openViewlet(defaultViewletId, shouldFocus).then(viewlet => c(viewlet));
					} else {
						this.sidebarPart.openViewlet(id, shouldFocus).then(viewlet => c(viewlet));
					}
				});
			});
		}
	}

	public toggleViewlet(id: string): TPromise<void> {
		const index = this.enabledExtensionViewletIds.indexOf(id);
		if (index === -1) {
			this.enabledExtensionViewletIds.push(id);
		} else {
			this.enabledExtensionViewletIds.splice(index, 1);
		}

		this.setEnabledExtensionViewlets();
		this._onDidViewletToggle.fire();
		return TPromise.as(null);
	}

	public getActiveViewlet(): IViewlet {
		return this.sidebarPart.getActiveViewlet();
	}

	public getAllViewlets(): ViewletDescriptor[] {
		const stockViewlets = this.getStockViewlets();
		return stockViewlets.concat(this.extensionViewlets);
	}

	public getAllViewletsToDisplay(): ViewletDescriptor[] {
		const stockViewlets = this.getStockViewlets();
		const enabledExtensionViewlets = this.extensionViewlets
			.filter(v => this.enabledExtensionViewletIds.indexOf(v.id) !== -1)
			.sort((v1, v2) => {
				return this.enabledExtensionViewletIds.indexOf(v1.id) - this.enabledExtensionViewletIds.indexOf(v2.id);
			});
		return stockViewlets.concat(enabledExtensionViewlets);
	}

	public isViewletEnabled(id: string): boolean {
		return this.enabledExtensionViewletIds.indexOf(id) !== -1;
	}

	// Get an ordered list of all stock viewlets
	private getStockViewlets(): ViewletDescriptor[] {
		return this.viewletRegistry.getViewlets()
			.filter(viewlet => !viewlet.fromExtension)
			.sort((v1, v2) => v1.order - v2.order);
	}

	private setEnabledExtensionViewlets(): void {
		this.storageService.store(ViewletService.ENABLED_EXTENSION_VIEWLETS, JSON.stringify(this.enabledExtensionViewletIds));
	}
}