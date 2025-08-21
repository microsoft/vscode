/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { IErdosPlotClient } from '../../erdosPlots/common/erdosPlots.js';

export const ERDOS_IPYWIDGETS_SERVICE_ID = 'erdosIPyWidgetsService';
export const MIME_TYPE_WIDGET_STATE = 'application/vnd.jupyter.widget-state+json';
export const MIME_TYPE_WIDGET_VIEW = 'application/vnd.jupyter.widget-view+json';

export const IErdosIPyWidgetsService = createDecorator<IErdosIPyWidgetsService>(ERDOS_IPYWIDGETS_SERVICE_ID);

export interface IErdosIPyWidgetsService {
	readonly _serviceBrand: undefined;

	readonly onDidCreatePlot: Event<IErdosPlotClient>;

	initialize(): void;
}
