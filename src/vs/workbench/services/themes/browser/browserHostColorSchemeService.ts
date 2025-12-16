/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { addMatchMediaChangeListener } from '../../../../base/browser/browser.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IHostColorSchemeService } from '../common/hostColorSchemeService.js';
import { mainWindow } from '../../../../base/browser/window.js';

export class BrowserHostColorSchemeService extends Disposable implements IHostColorSchemeService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidSchemeChangeEvent = this._register(new Emitter<void>());

	constructor(
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		addMatchMediaChangeListener(mainWindow, '(prefers-color-scheme: dark)', () => {
			this._onDidSchemeChangeEvent.fire();
		});
		addMatchMediaChangeListener(mainWindow, '(forced-colors: active)', () => {
			this._onDidSchemeChangeEvent.fire();
		});
	}

	get onDidChangeColorScheme(): Event<void> {
		return this._onDidSchemeChangeEvent.event;
	}

	get dark(): boolean {
		if (mainWindow.matchMedia(`(prefers-color-scheme: light)`).matches) {
			return false;
		} else if (mainWindow.matchMedia(`(prefers-color-scheme: dark)`).matches) {
			return true;
		}
		return false;
	}

	get highContrast(): boolean {
		if (mainWindow.matchMedia(`(forced-colors: active)`).matches) {
			return true;
		}
		return false;
	}

}

registerSingleton(IHostColorSchemeService, BrowserHostColorSchemeService, InstantiationType.Delayed);
