/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPlotSize, IErdosPlotSizingPolicy } from './sizingPolicy.js';
import * as nls from '../../../../nls.js';
import { PlotClientInstance } from '../../languageRuntime/common/languageRuntimePlotClient.js';

/**
 * The custom sizing policy. The plot is given a fixed size, specified by the
 * user, in pixels. The viewport size is ignored.
 */
export class PlotSizingPolicyCustom implements IErdosPlotSizingPolicy {
	public static ID = 'custom';

	public readonly id = PlotSizingPolicyCustom.ID;
	private readonly _name: string;

	constructor(public readonly size: IPlotSize, slow: boolean = false) {
		const name = slow
			? nls.localize('plotSizingPolicy.CustomSlow', "{0}×{1} (frozen)", size.width, size.height)
			: nls.localize('plotSizingPolicy.Custom', "{0}×{1} (custom)", size.width, size.height);

		this._name = name;
	}

	public getName(plot: PlotClientInstance): string {
		return this._name;
	}

	public getPlotSize(viewportSize: IPlotSize): IPlotSize | undefined {
		return this.size;
	}
}


