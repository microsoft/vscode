/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IErdosPlotSizingPolicy, IPlotSize } from './erdosPlots.js';
import { PlotClientInstance } from '../../languageRuntime/common/languageRuntimePlotClient.js';

/**
 * Intrinsic sizing policy - uses the plot's natural size
 */
export class PlotSizingPolicyIntrinsic implements IErdosPlotSizingPolicy {
	readonly id = 'intrinsic';

	getName(plot: PlotClientInstance): string {
		return 'Intrinsic';
	}

	getPlotSize(viewportSize: IPlotSize): IPlotSize | undefined {
		// Use the natural size of the plot
		return undefined;
	}
}