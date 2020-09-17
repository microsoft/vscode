/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IHostColorSchemeService } from 'vs/workbench/services/themes/common/hostColorSchemeService';
import { ColorScheme } from 'vs/platform/theme/common/theme';

export class BrowserHostColorSchemeService extends Disposable implements IHostColorSchemeService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidSchemeChangeEvent = this._register(new Emitter<void>());

	constructor(
		@IWorkbenchEnvironmentService private environmentService: IWorkbenchEnvironmentService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		window.matchMedia('(prefers-color-scheme: dark)').addListener(() => {
			this._onDidSchemeChangeEvent.fire();
		});
		window.matchMedia('(forced-colors: active)').addListener(() => {
			this._onDidSchemeChangeEvent.fire();
		});
	}

	get onDidChangeColorScheme(): Event<void> {
		return this._onDidSchemeChangeEvent.event;
	}

	get colorScheme(): ColorScheme {
		if (window.matchMedia(`(forced-colors: active)`).matches) {
			return ColorScheme.HIGH_CONTRAST;
		} else if (window.matchMedia(`(prefers-color-scheme: light)`).matches) {
			return ColorScheme.LIGHT;
		} else if (window.matchMedia(`(prefers-color-scheme: dark)`).matches) {
			return ColorScheme.DARK;
		}
		return this.environmentService.configuration.colorScheme;
	}

}

registerSingleton(IHostColorSchemeService, BrowserHostColorSchemeService, true);
