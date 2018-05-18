/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { Event, Emitter } from 'vs/base/common/event';
import { SidebarPart } from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewletDescriptor, ViewletRegistry, Extensions as ViewletExtensions } from 'vs/workbench/browser/viewlet';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

const ActiveViewletContextId = 'activeViewlet';
export const ActiveViewletContext = new RawContextKey<string>(ActiveViewletContextId, '');

export class ViewletService implements IViewletService {

	public _serviceBrand: any;

	private sidebarPart: SidebarPart;
	private viewletRegistry: ViewletRegistry;

	private activeViewletContextKey: IContextKey<string>;
	private _onDidViewletEnable = new Emitter<{ id: string, enabled: boolean }>();
	private disposables: IDisposable[] = [];

	public get onDidViewletRegister(): Event<ViewletDescriptor> { return <Event<ViewletDescriptor>>this.viewletRegistry.onDidRegister; }
	public get onDidViewletOpen(): Event<IViewlet> { return this.sidebarPart.onDidViewletOpen; }
	public get onDidViewletClose(): Event<IViewlet> { return this.sidebarPart.onDidViewletClose; }
	public get onDidViewletEnablementChange(): Event<{ id: string, enabled: boolean }> { return this._onDidViewletEnable.event; }

	constructor(
		sidebarPart: SidebarPart,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionService private extensionService: IExtensionService
	) {
		this.sidebarPart = sidebarPart;
		this.viewletRegistry = Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets);

		this.activeViewletContextKey = ActiveViewletContext.bindTo(contextKeyService);

		this.onDidViewletOpen(this._onDidViewletOpen, this, this.disposables);
		this.onDidViewletClose(this._onDidViewletClose, this, this.disposables);
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

	public setViewletEnablement(id: string, enabled: boolean): void {
		const descriptor = this.getBuiltInViewlets().filter(desc => desc.id === id).pop();
		if (descriptor && descriptor.enabled !== enabled) {
			descriptor.enabled = enabled;
			this._onDidViewletEnable.fire({ id, enabled });
		}
	}

	public openViewlet(id: string, focus?: boolean): TPromise<IViewlet> {
		if (this.getViewlet(id)) {
			return this.sidebarPart.openViewlet(id, focus);
		}
		return this.extensionService.whenInstalledExtensionsRegistered()
			.then(() => this.sidebarPart.openViewlet(id, focus));
	}

	public getActiveViewlet(): IViewlet {
		return this.sidebarPart.getActiveViewlet();
	}

	public getViewlets(): ViewletDescriptor[] {
		return this.getBuiltInViewlets()
			.filter(v => v.enabled);
	}

	private getBuiltInViewlets(): ViewletDescriptor[] {
		return this.viewletRegistry.getViewlets()
			.sort((v1, v2) => v1.order - v2.order);
	}

	public getDefaultViewletId(): string {
		return this.viewletRegistry.getDefaultViewletId();
	}

	public getViewlet(id: string): ViewletDescriptor {
		return this.getViewlets().filter(viewlet => viewlet.id === id)[0];
	}

	public getProgressIndicator(id: string): IProgressService {
		return this.sidebarPart.getProgressIndicator(id);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
