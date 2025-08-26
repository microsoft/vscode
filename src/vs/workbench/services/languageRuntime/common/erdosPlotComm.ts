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

export interface PlotResult {
	data: string;

	mime_type: string;

	settings?: PlotRenderSettings;

}

export interface PlotSize {
	height: number;
	width: number;
	unit: PlotUnit;
}

export interface PlotRenderSettings {
	size: PlotSize;

	pixel_ratio: number;

	format: PlotRenderFormat;

}

export enum PlotUnit {
	Pixels = 'pixels',
	Inches = 'inches'
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

	pixel_ratio: number;

	format: PlotRenderFormat;
}

export interface UpdateEvent {
}

export interface ShowEvent {
}

export enum PlotFrontendEvent {
	Update = 'update',
	Show = 'show'
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
		this.onDidUpdate = super.createEventEmitter('update', []);
		this.onDidShow = super.createEventEmitter('show', []);
	}

	getIntrinsicSize(): Promise<IntrinsicSize | undefined> {
		return super.performRpc('get_intrinsic_size', [], []);
	}

	render(size: PlotSize | undefined, pixelRatio: number, format: PlotRenderFormat): Promise<PlotResult> {
		return super.performRpc('render', ['size', 'pixel_ratio', 'format'], [size, pixelRatio, format]);
	}


	onDidUpdate: Event<UpdateEvent>;
	onDidShow: Event<ShowEvent>;
}

