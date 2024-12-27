/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IHostColorSchemeService } from '../common/hostColorSchemeService.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-sandbox/environmentService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { isBoolean, isObject } from '../../../../base/common/types.js';
import { IColorScheme } from '../../../../platform/window/common/window.js';
import { ILifecycleService, StartupKind } from '../../lifecycle/common/lifecycle.js';

export class NativeHostColorSchemeService extends Disposable implements IHostColorSchemeService {

	// we remember the last color scheme value to restore for reloaded window
	static readonly STORAGE_KEY = 'HostColorSchemeData';

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeColorScheme = this._register(new Emitter<void>());
	readonly onDidChangeColorScheme = this._onDidChangeColorScheme.event;

	public dark: boolean;
	public highContrast: boolean;

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IStorageService private storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		super();

		// register listener with the OS
		this._register(this.nativeHostService.onDidChangeColorScheme(scheme => this.update(scheme)));

		let initial = environmentService.window.colorScheme;
		if (lifecycleService.startupKind === StartupKind.ReloadedWindow) {
			initial = this.getStoredValue(initial);
		}
		this.dark = initial.dark;
		this.highContrast = initial.highContrast;

		// fetch the actual value from the OS
		this.nativeHostService.getOSColorScheme().then(scheme => this.update(scheme));
	}

	private getStoredValue(dftl: IColorScheme): IColorScheme {
		const stored = this.storageService.get(NativeHostColorSchemeService.STORAGE_KEY, StorageScope.APPLICATION);
		if (stored) {
			try {
				const scheme = JSON.parse(stored);
				if (isObject(scheme) && isBoolean(scheme.highContrast) && isBoolean(scheme.dark)) {
					return scheme as IColorScheme;
				}
			} catch (e) {
				// ignore
			}
		}
		return dftl;
	}

	private update({ highContrast, dark }: IColorScheme) {
		if (dark !== this.dark || highContrast !== this.highContrast) {

			this.dark = dark;
			this.highContrast = highContrast;
			this.storageService.store(NativeHostColorSchemeService.STORAGE_KEY, JSON.stringify({ highContrast, dark }), StorageScope.APPLICATION, StorageTarget.MACHINE);
			this._onDidChangeColorScheme.fire();
		}
	}

}

registerSingleton(IHostColorSchemeService, NativeHostColorSchemeService, InstantiationType.Delayed);
