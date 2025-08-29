/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPlotSize, IErdosPlotSizingPolicy } from './sizingPolicy.js';
import * as nls from '../../../../nls.js';
import { PlotClientInstance } from '../../languageRuntime/common/languageRuntimePlotClient.js';

/**
 * The default plot sizing policy. If the language runtime specifies a preferred
 * size, it is used. Otherwise, the policy automatically sizes the plot to fill
 * the viewport, subject to a few constraints that are intended to make sure we
 * generate a reasonable plot even with very small or tall/narrow viewports.
 *
 * - The plot's aspect ratio will not exceed the golden ratio (~1.6)
 * - The plot's size will not be less than 400px
 */
export class PlotSizingPolicyAuto implements IErdosPlotSizingPolicy {
	public static ID = 'auto';

	public readonly id = PlotSizingPolicyAuto.ID;
	private readonly _name = nls.localize('plotSizingPolicy.automatic', "Auto");

	private static goldenRatio = 1.61803398875;

	private static minimumPlotSize = 400;

	public getName(plot: PlotClientInstance): string {
		return this._name;
	}

	public getPlotSize(viewportSize: IPlotSize): IPlotSize | undefined {
		// Start with the assumption that the plot will fill the viewport.
		const plotSize = viewportSize;

		// Compute the aspect ratio of the viewport.
		const aspectRatio = viewportSize.width > viewportSize.height ?
			viewportSize.width / viewportSize.height :
			viewportSize.height / viewportSize.width;

		// If the viewport is very tall or very wide, then use the golden ratio to determine the
		// plot size.
		if (aspectRatio > PlotSizingPolicyAuto.goldenRatio) {
			if (viewportSize.width > viewportSize.height) {
				plotSize.width = viewportSize.height * PlotSizingPolicyAuto.goldenRatio;
			} else {
				plotSize.height = viewportSize.width * PlotSizingPolicyAuto.goldenRatio;
			}
		}

		// If the longest edge of the plot is less than the minimum plot size, then increase the
		// plot size to the minimum.
		if (plotSize.width > plotSize.height) {
			if (plotSize.width < PlotSizingPolicyAuto.minimumPlotSize) {
				plotSize.width = PlotSizingPolicyAuto.minimumPlotSize;
				plotSize.height = plotSize.width / PlotSizingPolicyAuto.goldenRatio;
			}
		} else if (plotSize.height < PlotSizingPolicyAuto.minimumPlotSize) {
			if (plotSize.height < PlotSizingPolicyAuto.minimumPlotSize) {
				plotSize.height = PlotSizingPolicyAuto.minimumPlotSize;
				plotSize.width = plotSize.height / PlotSizingPolicyAuto.goldenRatio;
			}
		}

		plotSize.height = Math.floor(plotSize.height);
		plotSize.width = Math.floor(plotSize.width);

		return plotSize;
	}
}