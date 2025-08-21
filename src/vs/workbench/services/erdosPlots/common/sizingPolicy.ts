/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { PlotClientInstance } from '../../languageRuntime/common/languageRuntimePlotClient.js';
import { PlotUnit } from '../../languageRuntime/common/erdosPlotComm.js';
import * as nls from '../../../../nls.js';
import { IPlotSize, IErdosPlotSizingPolicy } from './erdosPlots.js';

class SizingPolicyFixedAspectRatio {

	constructor(public readonly aspectRatio: number) { }

	private static minimumPlotSize = 400;

	public getPlotSize(viewportSize: IPlotSize): IPlotSize | undefined {
		let plotWidth = Math.max(viewportSize.width, SizingPolicyFixedAspectRatio.minimumPlotSize);
		let plotHeight = Math.max(viewportSize.height, SizingPolicyFixedAspectRatio.minimumPlotSize);
		if (plotWidth / plotHeight > this.aspectRatio) {
			plotWidth = plotHeight * this.aspectRatio;
		} else {
			plotHeight = plotWidth / this.aspectRatio;
		}
		return { width: plotWidth, height: plotHeight };
	}
}

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
		const plotSize = viewportSize;

		const aspectRatio = viewportSize.width > viewportSize.height ?
			viewportSize.width / viewportSize.height :
			viewportSize.height / viewportSize.width;

		if (aspectRatio > PlotSizingPolicyAuto.goldenRatio) {
			if (viewportSize.width > viewportSize.height) {
				plotSize.width = viewportSize.height * PlotSizingPolicyAuto.goldenRatio;
			} else {
				plotSize.height = viewportSize.width * PlotSizingPolicyAuto.goldenRatio;
			}
		}

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

export class PlotSizingPolicyFill implements IErdosPlotSizingPolicy {
	public readonly id = 'fill';
	private readonly _name = nls.localize('plotSizingPolicy.fillViewport', "Fill");

	public getName(plot: PlotClientInstance): string {
		return this._name;
	}

	public getPlotSize(viewportSize: IPlotSize): IPlotSize | undefined {
		return viewportSize;
	}
}

export class PlotSizingPolicyIntrinsic implements IErdosPlotSizingPolicy {
	public readonly id = 'intrinsic';

	private readonly _name = nls.localize('plotSizingPolicy.intrinsic.defaultName', "Intrinsic");

	public getName(plot: PlotClientInstance) {
		return this._name;
	}

	public getPlotSize(viewportSize: IPlotSize): IPlotSize | undefined {
		return undefined;
	}
}

export class PlotSizingPolicyLandscape
	extends SizingPolicyFixedAspectRatio
	implements IErdosPlotSizingPolicy {

	constructor() {
		super(4 / 3);
	}

	public readonly id = 'landscape';
	private readonly _name = nls.localize('plotSizingPolicy.landscape', "Landscape");

	public getName(plot: PlotClientInstance) {
		return this._name;
	}
}

export class PlotSizingPolicyPortrait
	extends SizingPolicyFixedAspectRatio
	implements IErdosPlotSizingPolicy {

	constructor() {
		super(3 / 4);
	}

	public readonly id = 'portrait';
	private readonly _name = nls.localize('plotSizingPolicy.portrait', "Portrait");

	public getName(plot: PlotClientInstance) {
		return this._name;
	}
}

export class PlotSizingPolicySquare
	extends SizingPolicyFixedAspectRatio
	implements IErdosPlotSizingPolicy {

	constructor() {
		super(1);
	}

	public readonly id = 'square';
	private readonly _name = nls.localize('plotSizingPolicy.square', "Square");

	public getName(plot: PlotClientInstance) {
		return this._name;
	}
}

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
