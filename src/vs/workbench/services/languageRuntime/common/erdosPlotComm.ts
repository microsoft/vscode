/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

//
// AUTO-GENERATED from plot.json; do not edit.
//

import { Event } from '../../../../base/common/event.js';
import { ErdosBaseComm, ErdosCommOptions } from './erdosBaseComm.js';
import { IRuntimeClientInstance } from './languageRuntimeClientInstance.js';

export interface IntrinsicSize {
	width: number;

	height: number;

	unit: PlotUnit;

	source: string;

}

export interface RenderResult {
	data: string;

	mime_type: string;

}

export interface PlotSize {
	width: number;

	height: number;

	unit: PlotUnit;

}

export interface PlotRenderSettings {
	size: PlotSize;

	pixel_ratio: number;

	format: PlotRenderFormat;

}

export enum RenderFormat {
	Png = 'png',
	Svg = 'svg',
	Pdf = 'pdf',
	Jpeg = 'jpeg'
}

export enum PlotUnit {
	Pixels = 'pixels',
	Inches = 'inches',
	Cm = 'cm'
}

export enum PlotRenderFormat {
	Png = 'png',
	Jpeg = 'jpeg',
	Svg = 'svg',
	Pdf = 'pdf',
	Tiff = 'tiff'
}

export interface RenderParams {
	size?: PlotSize;

	pixel_ratio?: number;

	format: RenderFormat;
}

export interface ShowPlotParams {
	id: string;

	parent_id?: string;

	data: string;

	mime_type: string;
}

export interface UpdatePlotParams {
	id: string;

	data: string;

	mime_type: string;
}

export interface ShowPlotEvent {
	id: string;

	parent_id?: string;

	data: string;

	mime_type: string;

}

export interface UpdatePlotEvent {
	id: string;

	data: string;

	mime_type: string;

}

export interface ClearPlotsEvent {
}

export enum PlotFrontendEvent {
	ShowPlot = 'show_plot',
	UpdatePlot = 'update_plot',
	ClearPlots = 'clear_plots'
}

export enum PlotBackendRequest {
	GetIntrinsicSize = 'get_intrinsic_size',
	Render = 'render'
}

export class ErdosPlotComm extends ErdosBaseComm {
	constructor(
		instance: IRuntimeClientInstance<any, any>,
		options?: ErdosCommOptions<PlotBackendRequest>,
	) {
		super(instance, options);
		this.onDidShowPlot = super.createEventEmitter('show_plot', ['id', 'parent_id', 'data', 'mime_type']);
		this.onDidUpdatePlot = super.createEventEmitter('update_plot', ['id', 'data', 'mime_type']);
		this.onDidClearPlots = super.createEventEmitter('clear_plots', []);
	}

	getIntrinsicSize(): Promise<IntrinsicSize | undefined> {
		return super.performRpc('get_intrinsic_size', [], []);
	}

	render(size: PlotSize | undefined, pixelRatio: number | undefined, format: RenderFormat): Promise<RenderResult> {
		return super.performRpc('render', ['size', 'pixel_ratio', 'format'], [size, pixelRatio, format]);
	}


	onDidShowPlot: Event<ShowPlotEvent>;
	onDidUpdatePlot: Event<UpdatePlotEvent>;
	onDidClearPlots: Event<ClearPlotsEvent>;
}

