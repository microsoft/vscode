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

	public static readonly ENABLED_EXT_VIEWLETS = 'workbench.viewlet.enabledExtViewlets';

	public _serviceBrand: any;

	private sidebarPart: ISidebar;
	private viewletRegistry: ViewletRegistry;
	private enabledExtViewletIds: string[];
	private extViewlets: ViewletDescriptor[];
	private _onDidExtViewletsLoad = new Emitter<void>();
	private _onDidViewletToggle = new Emitter<void>();

	public get onDidViewletOpen(): Event<IViewlet> { return this.sidebarPart.onDidViewletOpen; };
	public get onDidViewletClose(): Event<IViewlet> { return this.sidebarPart.onDidViewletClose; };
	public get onDidExtViewletsLoad(): Event<void> { return this._onDidExtViewletsLoad.event; };
	public get onDidViewletToggle(): Event<void> { return this._onDidViewletToggle.event; };

	constructor(
		sidebarPart: ISidebar,
		@IStorageService private storageService: IStorageService,
		@IExtensionService private extensionService: IExtensionService
	) {
		this.sidebarPart = sidebarPart;
		this.viewletRegistry = <ViewletRegistry>Registry.as(ViewletExtensions.Viewlets);

		const enabledExtViewletsJson = this.storageService.get(ViewletService.ENABLED_EXT_VIEWLETS);
		this.enabledExtViewletIds = enabledExtViewletsJson ? JSON.parse(enabledExtViewletsJson) : [];
		this.extViewlets = [];

		this.extensionService.onReady().then(() => {
			this.onExtensionServiceReady();
		});
	}

	private onExtensionServiceReady(): void {
		const viewlets = this.viewletRegistry.getViewlets();
		viewlets.forEach(v => {
			if (v.isExternal) {
				this.extViewlets.push(v);
			}
		});

		this._onDidExtViewletsLoad.fire();
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
				this.onDidExtViewletsLoad(() => {
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
		const index = this.enabledExtViewletIds.indexOf(id);
		if (index === -1) {
			this.enabledExtViewletIds.push(id);
		} else {
			this.enabledExtViewletIds.splice(index, 1);
		}

		this.setEnabledExtViewlets();
		this._onDidViewletToggle.fire();
		return TPromise.as(null);
	}

	public getActiveViewlet(): IViewlet {
		return this.sidebarPart.getActiveViewlet();
	}

	public getAllViewlets(): ViewletDescriptor[] {
		const stockViewlets = this.getStockViewlets();
		return stockViewlets.concat(this.extViewlets);
	}

	public getAllViewletsToDisplay(): ViewletDescriptor[] {
		const stockViewlets = this.getStockViewlets();
		const enabledExtViewlets = this.extViewlets
			.filter(v => this.enabledExtViewletIds.indexOf(v.id) !== -1)
			.sort((v1, v2) => {
				return this.enabledExtViewletIds.indexOf(v1.id) - this.enabledExtViewletIds.indexOf(v2.id);
			});
		return stockViewlets.concat(enabledExtViewlets);
	}

	public isViewletEnabled(id: string): boolean {
		return this.enabledExtViewletIds.indexOf(id) !== -1;
	}

	// Get an ordered list of all stock viewlets
	private getStockViewlets(): ViewletDescriptor[] {
		return this.viewletRegistry.getViewlets()
			.filter(viewlet => !viewlet.isExternal)
			.sort((v1, v2) => v1.order - v2.order);
	}

	private setEnabledExtViewlets(): void {
		this.storageService.store(ViewletService.ENABLED_EXT_VIEWLETS, JSON.stringify(this.enabledExtViewletIds));
	}
}