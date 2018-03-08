/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise, ValueCallback } from 'vs/base/common/winjs.base';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import Event, { Emitter } from 'vs/base/common/event';
import { SidebarPart } from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewletDescriptor, ViewletRegistry, Extensions as ViewletExtensions } from 'vs/workbench/browser/viewlet';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';

const ActiveViewletContextId = 'activeViewlet';
export const ActiveViewletContext = new RawContextKey<string>(ActiveViewletContextId, '');

export class ViewletService implements IViewletService {

	public _serviceBrand: any;

	private sidebarPart: SidebarPart;
	private viewletRegistry: ViewletRegistry;

	private extensionViewlets: ViewletDescriptor[];
	private extensionViewletsLoaded: TPromise<void>;
	private extensionViewletsLoadedPromiseComplete: ValueCallback;
	private activeViewletContextKey: IContextKey<string>;
	private _onDidViewletEnable = new Emitter<{ id: string, enabled: boolean }>();
	private disposables: IDisposable[] = [];

	public get onDidViewletOpen(): Event<IViewlet> { return this.sidebarPart.onDidViewletOpen; }
	public get onDidViewletClose(): Event<IViewlet> { return this.sidebarPart.onDidViewletClose; }
	public get onDidViewletEnablementChange(): Event<{ id: string, enabled: boolean }> { return this._onDidViewletEnable.event; }

	constructor(
		sidebarPart: SidebarPart,
		@IExtensionService private extensionService: IExtensionService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.sidebarPart = sidebarPart;
		this.viewletRegistry = Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets);

		this.activeViewletContextKey = ActiveViewletContext.bindTo(contextKeyService);

		this.onDidViewletOpen(this._onDidViewletOpen, this, this.disposables);
		this.onDidViewletClose(this._onDidViewletClose, this, this.disposables);

		this.loadExtensionViewlets();
	}

	private _onDidViewletOpen(viewlet: IViewlet): void {
		this.activeViewletContextKey.set(viewlet.getId());
	}

	private _onDidViewletClose(viewlet: IViewlet): void {
		const id = viewlet.getId();

		if (this.activeViewletContextKey.get() === id) {
			this.activeViewletContextKey.set('');
		}
	}

	private loadExtensionViewlets(): void {
		this.extensionViewlets = [];

		this.extensionViewletsLoaded = new TPromise<void>(c => {
			this.extensionViewletsLoadedPromiseComplete = c;
		});

		this.extensionService.whenInstalledExtensionsRegistered().then(() => {
			const viewlets = this.viewletRegistry.getViewlets();
			viewlets.forEach(v => {
				if (!!v.extensionId) {
					this.extensionViewlets.push(v);
				}
			});

			this.extensionViewletsLoadedPromiseComplete(void 0);
		});
	}

	public setViewletEnablement(id: string, enabled: boolean): void {
		const descriptor = this.getBuiltInViewlets().filter(desc => desc.id === id).pop();
		if (descriptor && descriptor.enabled !== enabled) {
			descriptor.enabled = enabled;
			this._onDidViewletEnable.fire({ id, enabled });
		}
	}

	public openViewlet(id: string, focus?: boolean): TPromise<IViewlet> {

		// Built in viewlets do not need to wait for extensions to be loaded
		const builtInViewletIds = this.getBuiltInViewlets().map(v => v.id);
		const isBuiltInViewlet = builtInViewletIds.indexOf(id) !== -1;
		if (isBuiltInViewlet) {
			return this.sidebarPart.openViewlet(id, focus);
		}

		// Extension viewlets need to be loaded first which can take time
		return this.extensionViewletsLoaded.then(() => {
			if (this.viewletRegistry.getViewlet(id)) {
				return this.sidebarPart.openViewlet(id, focus);
			}

			// Fallback to default viewlet if extension viewlet is still not found (e.g. uninstalled)
			return this.sidebarPart.openViewlet(this.getDefaultViewletId(), focus);
		});
	}

	public getActiveViewlet(): IViewlet {
		return this.sidebarPart.getActiveViewlet();
	}

	public getViewlets(): ViewletDescriptor[] {
		const builtInViewlets = this.getBuiltInViewlets();
		const viewlets = builtInViewlets.concat(this.extensionViewlets);

		return viewlets.filter(v => v.enabled);
	}

	private getBuiltInViewlets(): ViewletDescriptor[] {
		return this.viewletRegistry.getViewlets()
			.filter(viewlet => !viewlet.extensionId)
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
