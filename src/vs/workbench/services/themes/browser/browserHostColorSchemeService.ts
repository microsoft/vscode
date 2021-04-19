/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IHostColorSchemeService } from 'vs/workbench/services/themes/common/hostColorSchemeService';

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

		const matchPrefersColorSchemeDark = window.matchMedia('(prefers-color-scheme: dark)');
		const matchForcedColors = window.matchMedia('(forced-colors: active)');
		const listener = () => {
			this._onDidSchemeChangeEvent.fire();
		};
		if (typeof matchForcedColors.addEventListener === 'function') {
			matchPrefersColorSchemeDark.addEventListener('change', listener);
			matchForcedColors.addEventListener('change', listener);
		} else {
			matchPrefersColorSchemeDark.addListener(listener);
			matchForcedColors.addListener(listener);
		}
	}

	get onDidChangeColorScheme(): Event<void> {
		return this._onDidSchemeChangeEvent.event;
	}

	get dark(): boolean {
		if (window.matchMedia(`(prefers-color-scheme: light)`).matches) {
			return false;
		} else if (window.matchMedia(`(prefers-color-scheme: dark)`).matches) {
			return true;
		}
		return this.environmentService.configuration.colorScheme.dark;
	}

	get highContrast(): boolean {
		if (window.matchMedia(`(forced-colors: active)`).matches) {
			return true;
		}
		return this.environmentService.configuration.colorScheme.highContrast;
	}

}

registerSingleton(IHostColorSchemeService, BrowserHostColorSchemeService, true);
