/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { TestErdosPlotsService } from './testErdosPlotsService.js';
import { TestErdosPlotClient } from './testErdosPlotClient.js';
import { HistoryPolicy, ZoomLevel } from '../../common/erdosPlots.js';

export function createTestPlotsServiceWithPlots(): TestErdosPlotsService {
	const plotsService = new TestErdosPlotsService();

	const plotClient1 = new TestErdosPlotClient({
		id: 'test-plot-1',
		session_id: 'test-session',
		created: Date.now(),
		parent_id: '',
		code: 'plot(1:10)',
		zoom_level: ZoomLevel.Fit,
	});

	const plotClient2 = new TestErdosPlotClient({
		id: 'test-plot-2',
		session_id: 'test-session',
		created: Date.now() + 1000,
		parent_id: '',
		code: 'hist(rnorm(100))',
		zoom_level: ZoomLevel.Fit,
	});

	plotsService.addPlotClient(plotClient1);
	plotsService.addPlotClient(plotClient2, true);

	plotsService.selectHistoryPolicy(HistoryPolicy.Automatic);

	return plotsService;
}
