/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHostService } from 'vs/workbench/services/host/browser/host';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';

export class BrowserHostService implements IHostService {

	_serviceBrand: undefined;

	constructor(@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService) { }

	//#region Window

	readonly windowCount = Promise.resolve(1);

	async openEmptyWindow(options?: { reuse?: boolean }): Promise<void> {
		// TODO@Ben delegate to embedder
		const targetHref = `${document.location.origin}${document.location.pathname}?ew=true`;
		if (options && options.reuse) {
			window.location.href = targetHref;
		} else {
			window.open(targetHref);
		}
	}

	async toggleFullScreen(): Promise<void> {
		const target = this.layoutService.getWorkbenchElement();

		// Chromium
		if (document.fullscreen !== undefined) {
			if (!document.fullscreen) {
				try {
					return await target.requestFullscreen();
				} catch (error) {
					console.warn('Toggle Full Screen failed'); // https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen
				}
			} else {
				try {
					return await document.exitFullscreen();
				} catch (error) {
					console.warn('Exit Full Screen failed');
				}
			}
		}

		// Safari and Edge 14 are all using webkit prefix
		if ((<any>document).webkitIsFullScreen !== undefined) {
			try {
				if (!(<any>document).webkitIsFullScreen) {
					(<any>target).webkitRequestFullscreen(); // it's async, but doesn't return a real promise.
				} else {
					(<any>document).webkitExitFullscreen(); // it's async, but doesn't return a real promise.
				}
			} catch {
				console.warn('Enter/Exit Full Screen failed');
			}
		}
	}

	//#endregion

	async restart(): Promise<void> {
		this.reload();
	}

	async reload(): Promise<void> {
		window.location.reload();
	}
}

registerSingleton(IHostService, BrowserHostService, true);
