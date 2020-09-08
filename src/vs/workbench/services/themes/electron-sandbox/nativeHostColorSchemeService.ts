/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IElectronService } from 'vs/platform/electron/electron-sandbox/electron';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { Disposable } from 'vs/base/common/lifecycle';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { IHostColorSchemeService } from 'vs/workbench/services/themes/common/hostColorSchemeService';

export class NativeHostColorSchemeService extends Disposable implements IHostColorSchemeService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IElectronService private readonly electronService: IElectronService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Color Scheme
		this._register(this.electronService.onColorSchemeChange(scheme => {
			this._colorScheme = scheme;

			this._onDidChangeColorScheme.fire();
		}));
	}

	private readonly _onDidChangeColorScheme = this._register(new Emitter<void>());
	readonly onDidChangeColorScheme = this._onDidChangeColorScheme.event;

	private _colorScheme: ColorScheme = this.environmentService.configuration.colorScheme;
	get colorScheme() { return this._colorScheme; }

}

registerSingleton(IHostColorSchemeService, NativeHostColorSchemeService, true);
