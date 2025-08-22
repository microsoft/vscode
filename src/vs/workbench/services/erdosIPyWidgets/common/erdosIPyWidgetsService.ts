/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024-2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IErdosIPyWidgetsService = createDecorator<IErdosIPyWidgetsService>('erdosIPyWidgetsService');

export interface IErdosPlotClient {
	readonly id: string;
	readonly title: string;
}

export interface IErdosIPyWidgetsService {
	readonly _serviceBrand: undefined;

	readonly onDidCreatePlot: Event<IErdosPlotClient>;

	/**
	 * Initialize the service
	 */
	initialize(): void;

	/**
	 * Initialize widget rendering for a given container
	 */
	initializeWidgets(containerId: string): void;

	/**
	 * Render a widget in the specified container
	 */
	renderWidget(widgetId: string, containerId: string, widgetData: any): void;

	/**
	 * Clean up widgets in a container
	 */
	cleanupWidgets(containerId: string): void;
}