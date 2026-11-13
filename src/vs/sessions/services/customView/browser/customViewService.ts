/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, ITransaction, observableValue } from '../../../../base/common/observable.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ICustomViewDescriptor, ICustomViewService, ICustomViewOpenRequest } from '../../../../workbench/contrib/sessions/browser/customView.js';

const ACTIVE_CUSTOM_VIEW_STORAGE_KEY = 'sessions.activeCustomView';

export class CustomViewService extends Disposable implements ICustomViewService {

	declare readonly _serviceBrand: undefined;

	private readonly _descriptors = new Map<string, ICustomViewDescriptor>();
	private _desiredCustomViewId: string | undefined;

	private readonly _activeCustomViewOpen = observableValue<ICustomViewOpenRequest | undefined>(this, undefined);
	readonly activeCustomViewOpen: IObservable<ICustomViewOpenRequest | undefined> = this._activeCustomViewOpen;
	readonly activeCustomView: IObservable<ICustomViewDescriptor | undefined> = derived(this, reader => this._activeCustomViewOpen.read(reader)?.descriptor);

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._desiredCustomViewId = this._storageService.get(ACTIVE_CUSTOM_VIEW_STORAGE_KEY, StorageScope.WORKSPACE);
	}

	registerCustomView(descriptor: ICustomViewDescriptor, options?: { readonly restore?: boolean }): IDisposable {
		if (this._descriptors.has(descriptor.id)) {
			throw new Error(`A custom view with id '${descriptor.id}' is already registered`);
		}

		this._descriptors.set(descriptor.id, descriptor);
		if (this._desiredCustomViewId === descriptor.id) {
			if (options?.restore === false) {
				this._desiredCustomViewId = undefined;
				this._storageService.remove(ACTIVE_CUSTOM_VIEW_STORAGE_KEY, StorageScope.WORKSPACE);
			} else {
				this._activeCustomViewOpen.set({ descriptor, source: 'restore' }, undefined);
			}
		}

		return toDisposable(() => {
			this._descriptors.delete(descriptor.id);
			if (this.activeCustomView.get() === descriptor) {
				this._activeCustomViewOpen.set(undefined, undefined);
			}
		});
	}

	showCustomView(id: string, options?: { readonly source?: 'history'; readonly state?: string }): void {
		const descriptor = this._descriptors.get(id);
		if (!descriptor) {
			this._logService.warn(`[CustomViewService] showCustomView: no custom view registered with id '${id}'`);
			return;
		}

		const state = options?.state;
		if (state !== undefined && descriptor.acceptsState?.(state) === false) {
			this._logService.trace(`[CustomViewService] showCustomView: custom view '${id}' declined its state`);
			return;
		}

		this._desiredCustomViewId = id;
		this._storageService.store(ACTIVE_CUSTOM_VIEW_STORAGE_KEY, id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this._activeCustomViewOpen.set({ descriptor, source: options?.source ?? 'explicit', ...(state !== undefined ? { state } : {}) }, undefined);
	}

	hideCustomView(tx?: ITransaction): void {
		this._desiredCustomViewId = undefined;
		this._storageService.remove(ACTIVE_CUSTOM_VIEW_STORAGE_KEY, StorageScope.WORKSPACE);
		this._activeCustomViewOpen.set(undefined, tx);
	}
}
