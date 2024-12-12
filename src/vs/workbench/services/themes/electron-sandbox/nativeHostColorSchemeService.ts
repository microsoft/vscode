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
import { IColorScheme } from '../../../../platform/window/common/window.js';

export class NativeHostColorSchemeService extends Disposable implements IHostColorSchemeService {

	static readonly STORAGE_KEY = 'HostColorSchemeData';

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeColorScheme = this._register(new Emitter<void>());
	readonly onDidChangeColorScheme = this._onDidChangeColorScheme.event;

	public dark: boolean;
	public highContrast: boolean;

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
	) {
		super();

		// register listener with the OS
		this._register(this.nativeHostService.onDidChangeColorScheme(scheme => this.update(scheme)));

		const initial = environmentService.window.colorScheme;
		this.dark = initial.dark;
		this.highContrast = initial.highContrast;

		// fetch the actual value from the OS
		this.nativeHostService.getOSColorScheme().then(scheme => this.update(scheme));
	}


	private update({ highContrast, dark }: IColorScheme) {
		if (dark !== this.dark || highContrast !== this.highContrast) {

			this.dark = dark;
			this.highContrast = highContrast;
			this._onDidChangeColorScheme.fire();
		}
	}

}

registerSingleton(IHostColorSchemeService, NativeHostColorSchemeService, InstantiationType.Delayed);
