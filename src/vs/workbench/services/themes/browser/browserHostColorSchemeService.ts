/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { addMatchMediaChangeListener } from 'vs/base/browser/browser';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Disposable } from 'vs/base/common/lifecycle';
import { IHostColorSchemeService } from 'vs/workbench/services/themes/common/hostColorSchemeService';
import { mainWindow } from 'vs/base/browser/window';

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
