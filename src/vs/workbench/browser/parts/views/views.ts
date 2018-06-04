/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/views';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import { IViewsService, ViewsRegistry, IViewsViewlet, ViewLocation } from 'vs/workbench/common/views';
import { ViewDescriptorCollection } from './contributableViews';
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewletRegistry, Extensions as ViewletExtensions } from 'vs/workbench/browser/viewlet';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';

export class ViewsService extends Disposable implements IViewsService {

	_serviceBrand: any;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IViewletService private viewletService: IViewletService,
		@IStorageService private storageService: IStorageService
	) {
		super();

		ViewLocation.all.forEach(viewLocation => this.onDidRegisterViewLocation(viewLocation));
		this._register(ViewLocation.onDidRegister(viewLocation => this.onDidRegisterViewLocation(viewLocation)));
		this._register(Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).onDidRegister(viewlet => this.viewletService.setViewletEnablement(viewlet.id, this.storageService.getBoolean(`viewservice.${viewlet.id}.enablement`, StorageScope.GLOBAL, viewlet.id !== ViewLocation.TEST.id))));
	}

	openView(id: string, focus: boolean): TPromise<void> {
		const viewDescriptor = ViewsRegistry.getView(id);
		if (viewDescriptor) {
			const viewletId = viewDescriptor.location === ViewLocation.SCM ? 'workbench.view.scm' : viewDescriptor.location.id;
			const viewletDescriptor = this.viewletService.getViewlet(viewletId);
			if (viewletDescriptor) {
				return this.viewletService.openViewlet(viewletDescriptor.id)
					.then((viewlet: IViewsViewlet) => {
						if (viewlet && viewlet.openView) {
							return viewlet.openView(id, focus);
						}
						return null;
					});
			}
		}
		return TPromise.as(null);
	}

	private onDidRegisterViewLocation(viewLocation: ViewLocation): void {
		const viewDescriptorCollection = this._register(this.instantiationService.createInstance(ViewDescriptorCollection, viewLocation));
		this._register(viewDescriptorCollection.onDidChange(() => this.updateViewletEnablement(viewLocation, viewDescriptorCollection)));
		this.lifecycleService.when(LifecyclePhase.Eventually).then(() => this.updateViewletEnablement(viewLocation, viewDescriptorCollection));
	}

	private updateViewletEnablement(viewLocation: ViewLocation, viewDescriptorCollection: ViewDescriptorCollection): void {
		const enabled = viewDescriptorCollection.viewDescriptors.length > 0;
		this.viewletService.setViewletEnablement(viewLocation.id, enabled);
		this.storageService.store(`viewservice.${viewLocation.id}.enablement`, enabled, StorageScope.GLOBAL);
	}
}