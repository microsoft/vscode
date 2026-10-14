/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, ITransaction, observableValue } from '../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ICustomViewDescriptor } from './customView.js';

export const ICustomViewService = createDecorator<ICustomViewService>('customViewService');
const ACTIVE_CUSTOM_VIEW_STORAGE_KEY = 'sessions.activeCustomView';

export interface ICustomViewOpenRequest {
	readonly descriptor: ICustomViewDescriptor;
	readonly source: 'explicit' | 'history' | 'restore';
}

/**
 * Owns which custom view (if any) should be rendered in place of the sessions
 * grid. Only one view can be shown at a time. The Agents workbench observes
 * {@link activeCustomView} and, while it is set, renders the custom view grid
 * and hides the sessions grid, the side panel and the bottom panel.
 */
export interface ICustomViewService {

	readonly _serviceBrand: undefined;

	/** The view that should currently be rendered, or `undefined` for none. */
	readonly activeCustomView: IObservable<ICustomViewDescriptor | undefined>;

	/** The current opening, including repeated explicit opens of the same view. */
	readonly activeCustomViewOpen: IObservable<ICustomViewOpenRequest | undefined>;

	registerCustomView(descriptor: ICustomViewDescriptor, options?: { readonly restore?: boolean }): IDisposable;

	/** Shows the registered view with the given id, replacing any shown view. */
	showCustomView(id: string, options?: { readonly source: 'history' }): void;

	hideCustomView(tx?: ITransaction): void;
}

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

	showCustomView(id: string, options?: { readonly source: 'history' }): void {
		const descriptor = this._descriptors.get(id);
		if (!descriptor) {
			this._logService.warn(`[CustomViewService] showCustomView: no custom view registered with id '${id}'`);
			return;
		}

		this._desiredCustomViewId = id;
		this._storageService.store(ACTIVE_CUSTOM_VIEW_STORAGE_KEY, id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this._activeCustomViewOpen.set({ descriptor, source: options?.source ?? 'explicit' }, undefined);
	}

	hideCustomView(tx?: ITransaction): void {
		this._desiredCustomViewId = undefined;
		this._storageService.remove(ACTIVE_CUSTOM_VIEW_STORAGE_KEY, StorageScope.WORKSPACE);
		this._activeCustomViewOpen.set(undefined, tx);
	}
}

registerSingleton(ICustomViewService, CustomViewService, InstantiationType.Delayed);
