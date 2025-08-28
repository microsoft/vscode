/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IErdosPlotSizingPolicy, IPlotSize } from './erdosPlots.js';
import { PlotClientInstance } from '../../languageRuntime/common/languageRuntimePlotClient.js';

/**
 * Auto sizing policy - automatically sizes plots to fit the viewport
 */
export class PlotSizingPolicyAuto implements IErdosPlotSizingPolicy {
	readonly id = 'auto';

	getName(plot: PlotClientInstance): string {
		return 'Auto';
	}

	getPlotSize(viewportSize: IPlotSize): IPlotSize {
		// Use the viewport size
		return viewportSize;
	}
}