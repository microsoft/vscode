/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IErdosPlotSizingPolicy, IPlotSize } from './sizingPolicy.js';
import * as nls from '../../../../nls.js';
import { PlotUnit } from '../../languageRuntime/common/erdosPlotComm.js';
import { PlotClientInstance } from '../../languageRuntime/common/languageRuntimePlotClient.js';

/**
 * This sizing policy does not provide a size for the plot; the language runtime will use the
 * intrinsic size of the plot, if it is known.
 */
export class PlotSizingPolicyIntrinsic implements IErdosPlotSizingPolicy {
	public readonly id = 'intrinsic';

	private readonly _name = nls.localize('plotSizingPolicy.intrinsic.defaultName', "Intrinsic");

	public getName(plot: PlotClientInstance) {
		const intrinsicSize = plot.intrinsicSize;

		if (!intrinsicSize) {
			return this._name;
		}

		return nls.localize(
			'plotSizingPolicy.intrinsic.name',
			"{0} ({1}{3}×{2}{3})",
			intrinsicSize.source,
			intrinsicSize.width,
			intrinsicSize.height,
			formatPlotUnit(intrinsicSize.unit),
		);
	}

	public getPlotSize(viewportSize: IPlotSize): IPlotSize | undefined {
		// Don't specify a size; the language runtime will use the intrinsic size of the plot.
		return undefined;
	}
}

/**
 * Determine the user-facing unit of measurement.
 *
 * @param unit The unit of measurement.
 */
export function formatPlotUnit(unit: PlotUnit): string {
	switch (unit) {
		case PlotUnit.Inches:
			return nls.localize('plotSizingPolicy.intrinsic.unit.inches', 'in');
		case PlotUnit.Pixels:
			return nls.localize('plotSizingPolicy.intrinsic.unit.pixels', 'px');
		default:
			throw new Error(`Unknown plot unit: ${unit}`);
	}
}