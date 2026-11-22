/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../base/browser/dom.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService, isConfigured } from '../../configuration/common/configuration.js';
import { logSettingExperimentTrigger } from '../../telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING } from '../common/chatSettings.js';

export function observeAgentsWindowTitleBarIconExposure(element: HTMLElement, configurationService: IConfigurationService, telemetryService: ITelemetryService): IDisposable {
	const store = new DisposableStore();
	let observer: IntersectionObserver | undefined;
	let disposed = false;
	store.add(toDisposable(() => {
		disposed = true;
		observer?.disconnect();
	}));
	store.add(configurationService.onDidChangeConfiguration(e => {
		if (observer && e.affectsConfiguration(AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING)) {
			observer.takeRecords();
			observer.unobserve(element);
			observer.observe(element);
		}
	}));
	// ActionBar attaches the item after rendering, so resolve its window afterwards.
	queueMicrotask(() => {
		if (disposed) {
			return;
		}
		const targetWindow = getWindow(element);
		observer = new targetWindow.IntersectionObserver(entries => {
			const entry = entries.findLast(entry => entry.target === element);
			if (!disposed && entry?.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0
				&& element.isConnected && element.getClientRects().length > 0
				&& !isConfigured(configurationService.inspect<boolean>(AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING))) {
				logSettingExperimentTrigger(telemetryService, AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING);
			}
		});
		observer.observe(element);
	});
	return store;
}
