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

	private static ENABLED_EXT_VIEWLETS = 'workbench.viewlet.enabledExtViewlets';

	public _serviceBrand: any;

	private sidebarPart: ISidebar;
	private enabledExtViewletIds: string[];
	private extViewlets: { [viewletId: string]: ViewletDescriptor; };
	private _onDidViewletRegister = new Emitter<ViewletDescriptor>();

	public get onDidViewletOpen(): Event<IViewlet> { return this.sidebarPart.onDidViewletOpen; };
	public get onDidViewletClose(): Event<IViewlet> { return this.sidebarPart.onDidViewletClose; };
	public get onDidViewletRegister(): Event<ViewletDescriptor> { return this._onDidViewletRegister.event; };

	constructor(
		sidebarPart: ISidebar,
		@IStorageService private storageService: IStorageService,
		@IExtensionService private extensionService: IExtensionService
	) {
		this.sidebarPart = sidebarPart;

		const enabledExtViewletsJson = this.storageService.get(ViewletService.ENABLED_EXT_VIEWLETS);
		this.enabledExtViewletIds = enabledExtViewletsJson ? JSON.parse(enabledExtViewletsJson) : [];
		this.extViewlets = {};

		this.extensionService.onReady().then(() => {
			const viewlets = (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets)).getViewlets();
			this.onExtensionServiceReady(viewlets);
		});
	}

	private onExtensionServiceReady(viewlets: ViewletDescriptor[]): void {
		viewlets.forEach(v => {
			if (v.isExtension) {
				this.extViewlets[v.id] = v;
			}
		});

		this._onDidViewletRegister.fire(null);
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
		this._onDidViewletRegister.fire();
		return TPromise.as(null);
	}

	public getActiveViewlet(): IViewlet {
		return this.sidebarPart.getActiveViewlet();
	}

	public getAllViewlets(): ViewletDescriptor[] {
		const stockViewlets = this.getStockViewlets();
		const extViewlets = this.getExtViewlets();
		return stockViewlets.concat(extViewlets);
	}

	// Get an ordered list of all stock viewlets
	public getStockViewlets(): ViewletDescriptor[] {
		return (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets))
			.getViewlets()
			.filter(viewlet => !viewlet.isExtension)
			.sort((v1, v2) => v1.order - v2.order);
	}

	public getExtViewlets(): ViewletDescriptor[] {
		const result = [];
		for (let id in this.extViewlets) {
			result.push(this.extViewlets[id]);
		}
		return result;
	}

	public getEnabledViewletIds(): string[] {
		return this.enabledExtViewletIds;
	}

	private setEnabledExtViewlets(): void {
		this.storageService.store(ViewletService.ENABLED_EXT_VIEWLETS, JSON.stringify(this.enabledExtViewletIds));
	}
}