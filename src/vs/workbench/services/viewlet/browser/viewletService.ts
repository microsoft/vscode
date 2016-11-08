/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { ISidebar } from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import { Registry } from 'vs/platform/platform';
import { ViewletDescriptor, ViewletRegistry, Extensions as ViewletExtensions } from 'vs/workbench/browser/viewlet';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';

export class ViewletService implements IViewletService {

	public static readonly ENABLED_EXT_VIEWLETS = 'workbench.viewlet.enabledExtViewlets';

	public _serviceBrand: any;

	private sidebarPart: ISidebar;
	private enabledExtViewletIds: string[];
	private extViewlets: ViewletDescriptor[];
	private _onDidExtensionViewletsLoad = new Emitter<void>();

	public get onDidViewletOpen(): Event<IViewlet> { return this.sidebarPart.onDidViewletOpen; };
	public get onDidViewletClose(): Event<IViewlet> { return this.sidebarPart.onDidViewletClose; };
	public get onDidExtensionViewletsLoad(): Event<void> { return this._onDidExtensionViewletsLoad.event; };

	constructor(
		sidebarPart: ISidebar,
		@IStorageService private storageService: IStorageService,
		@IExtensionService private extensionService: IExtensionService
	) {
		this.sidebarPart = sidebarPart;

		const enabledExtViewletsJson = this.storageService.get(ViewletService.ENABLED_EXT_VIEWLETS);
		this.enabledExtViewletIds = enabledExtViewletsJson ? JSON.parse(enabledExtViewletsJson) : [];
		this.extViewlets = [];

		this.extensionService.onReady().then(() => {
			this.onExtensionServiceReady();
		});
	}

	private onExtensionServiceReady(): void {
		const viewlets = (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets)).getViewlets();
		viewlets.forEach(v => {
			if (v.isExtension) {
				this.extViewlets.push(v);
			}
		});

		this._onDidExtensionViewletsLoad.fire(null);
	}

	public openViewlet(id: string, focus?: boolean): TPromise<IViewlet> {
		return this.sidebarPart.openViewlet(id, focus);
	}

	public toggleViewlet(id: string): TPromise<IViewlet> {
		const index = this.enabledExtViewletIds.indexOf(id);
		if (index === -1) {
			this.enabledExtViewletIds.push(id);
		} else {
			this.enabledExtViewletIds.splice(index, 1);
		}

		this.setEnabledExtViewlets();
		this._onDidExtensionViewletsLoad.fire();
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
		return (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets))
			.getViewlets()
			.filter(viewlet => !viewlet.isExtension)
			.sort((v1, v2) => v1.order - v2.order);
	}

	private setEnabledExtViewlets(): void {
		this.storageService.store(ViewletService.ENABLED_EXT_VIEWLETS, JSON.stringify(this.enabledExtViewletIds));
	}
}