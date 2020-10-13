/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { Disposable } from 'vs/base/common/lifecycle';
import { IHostColorSchemeService } from 'vs/workbench/services/themes/common/hostColorSchemeService';

export class NativeHostColorSchemeService extends Disposable implements IHostColorSchemeService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Color Scheme
		this._register(this.nativeHostService.onDidChangeColorScheme(({ highContrast, dark }) => {
			this.dark = dark;
			this.highContrast = highContrast;
			this._onDidChangeColorScheme.fire();
		}));
	}

	private readonly _onDidChangeColorScheme = this._register(new Emitter<void>());
	readonly onDidChangeColorScheme = this._onDidChangeColorScheme.event;

	public dark: boolean = this.environmentService.configuration.colorScheme.dark;
	public highContrast: boolean = this.environmentService.configuration.colorScheme.highContrast;

}

registerSingleton(IHostColorSchemeService, NativeHostColorSchemeService, true);
