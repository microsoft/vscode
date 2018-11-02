/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewlet } from 'vs/workbench/common/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { Event, Emitter } from 'vs/base/common/event';
import { SidebarPart } from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewletDescriptor, ViewletRegistry, Extensions as ViewletExtensions } from 'vs/workbench/browser/viewlet';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { Disposable } from 'vs/base/common/lifecycle';

const ActiveViewletContextId = 'activeViewlet';
export const ActiveViewletContext = new RawContextKey<string>(ActiveViewletContextId, '');

export class ViewletService extends Disposable implements IViewletService {

	_serviceBrand: any;

	private sidebarPart: SidebarPart;
	private viewletRegistry: ViewletRegistry;

	private activeViewletContextKey: IContextKey<string>;
	private _onDidViewletEnable = new Emitter<{ id: string, enabled: boolean }>();

	get onDidViewletRegister(): Event<ViewletDescriptor> { return <Event<ViewletDescriptor>>this.viewletRegistry.onDidRegister; }
	get onDidViewletOpen(): Event<IViewlet> { return this.sidebarPart.onDidViewletOpen; }
	get onDidViewletClose(): Event<IViewlet> { return this.sidebarPart.onDidViewletClose; }
	get onDidViewletEnablementChange(): Event<{ id: string, enabled: boolean }> { return this._onDidViewletEnable.event; }

	constructor(
		sidebarPart: SidebarPart,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionService private extensionService: IExtensionService
	) {
		super();

		this.sidebarPart = sidebarPart;
		this.viewletRegistry = Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets);

		this.activeViewletContextKey = ActiveViewletContext.bindTo(contextKeyService);

		this._register(this.onDidViewletOpen(this._onDidViewletOpen, this));
		this._register(this.onDidViewletClose(this._onDidViewletClose, this));
	}

	private _onDidViewletOpen(viewlet: IViewlet): void {
		this.activeViewletContextKey.set(viewlet.getId());
	}

	private _onDidViewletClose(viewlet: IViewlet): void {
		const id = viewlet.getId();

		if (this.activeViewletContextKey.get() === id) {
			this.activeViewletContextKey.reset();
		}
	}

	setViewletEnablement(id: string, enabled: boolean): void {
		const descriptor = this.getAllViewlets().filter(desc => desc.id === id).pop();
		if (descriptor && descriptor.enabled !== enabled) {
			descriptor.enabled = enabled;
			this._onDidViewletEnable.fire({ id, enabled });
		}
	}

	openViewlet(id: string, focus?: boolean): Thenable<IViewlet> {
		if (this.getViewlet(id)) {
			return Promise.resolve(this.sidebarPart.openViewlet(id, focus));
		}
		return this.extensionService.whenInstalledExtensionsRegistered()
			.then(() => {
				if (this.getViewlet(id)) {
					return this.sidebarPart.openViewlet(id, focus);
				}
				return null;
			});
	}

	getActiveViewlet(): IViewlet {
		return this.sidebarPart.getActiveViewlet();
	}

	getViewlets(): ViewletDescriptor[] {
		return this.getAllViewlets()
			.filter(v => v.enabled);
	}

	getAllViewlets(): ViewletDescriptor[] {
		return this.viewletRegistry.getViewlets()
			.sort((v1, v2) => v1.order - v2.order);
	}

	getDefaultViewletId(): string {
		return this.viewletRegistry.getDefaultViewletId();
	}

	getViewlet(id: string): ViewletDescriptor {
		return this.getViewlets().filter(viewlet => viewlet.id === id)[0];
	}

	getProgressIndicator(id: string): IProgressService {
		return this.sidebarPart.getProgressIndicator(id);
	}
}
