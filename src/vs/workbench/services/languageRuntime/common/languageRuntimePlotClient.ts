/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IRenderedPlot } from './erdosPlotRenderQueue.js';
import { ZoomLevel, PlotRenderSettings } from '../../erdosPlots/common/erdosPlots.js';
import { PlotUnit } from './erdosPlotComm.js';

export const FreezeSlowPlotsConfigKey = 'erdos.plots.freezeSlowPlots';

export enum PlotClientLocation {
	Editor,
	View
}

export enum PlotClientState {
	Unrendered = 'unrendered',
	RenderPending = 'render_pending',
	Rendering = 'rendering',
	Rendered = 'rendered',
	Closed = 'closed',
}

export interface IErdosPlotMetadata {
	id: string;
	created: number;
	parent_id: string;
	code: string;
	session_id: string;
	zoom_level?: ZoomLevel;
}

interface IErdosPlotClient {
	readonly id: string;
	readonly location: PlotClientLocation;
	readonly metadata: IErdosPlotMetadata;
	readonly onDidClose: Event<void>;
	readonly onDidRender: Event<IRenderedPlot>;
	close(): void;
}

interface IZoomablePlotClient {
	readonly onDidChangeZoomLevel: Event<ZoomLevel>;
	readonly zoomLevel: ZoomLevel;
	zoomIn(): void;
	zoomOut(): void;
	zoomToFit(): void;
}

export class PlotClientInstance extends Disposable implements IErdosPlotClient, IZoomablePlotClient {
	private readonly _id: string;
	private readonly _location: PlotClientLocation;
	private readonly _metadata: IErdosPlotMetadata;
	private readonly _onDidClose = this._register(new Emitter<void>());
	private readonly _onDidRender = this._register(new Emitter<IRenderedPlot>());
	private readonly _onDidChangeZoomLevel = this._register(new Emitter<ZoomLevel>());
	private _zoomLevel: ZoomLevel = ZoomLevel.Fit;
	private _plotData?: IRenderedPlot;
	private _renderPromise?: Promise<IRenderedPlot>;

	readonly onDidClose = this._onDidClose.event;
	readonly onDidRender = this._onDidRender.event;
	readonly onDidChangeZoomLevel = this._onDidChangeZoomLevel.event;

	constructor(
		id: string,
		location: PlotClientLocation,
		metadata: IErdosPlotMetadata,
	) {
		super();
		this._id = id;
		this._location = location;
		this._metadata = metadata;
	}

	get id(): string {
		return this._id;
	}

	get location(): PlotClientLocation {
		return this._location;
	}

	get metadata(): IErdosPlotMetadata {
		return this._metadata;
	}

	get zoomLevel(): ZoomLevel {
		return this._zoomLevel;
	}

	get intrinsicSize(): { width: number; height: number; source: string; unit: PlotUnit } | undefined {
		// Return actual plot dimensions from plot data
		if (this._plotData?.intrinsic_size) {
			return this._plotData.intrinsic_size;
		}
		return undefined;
	}

	get lastRender(): IRenderedPlot | undefined {
		return this._plotData;
	}

	async requestRender(settings: PlotRenderSettings): Promise<IRenderedPlot> {
		// If we already have a render promise for these settings, return it
		if (this._renderPromise) {
			return this._renderPromise;
		}

		// Create a new render promise
		this._renderPromise = this.performRender(settings);
		
		try {
			const result = await this._renderPromise;
			this._plotData = result;
			this._onDidRender.fire(result);
			return result;
		} finally {
			this._renderPromise = undefined;
		}
	}

	private async performRender(settings: PlotRenderSettings): Promise<IRenderedPlot> {
		// For now, return a mock rendered plot
		// This will be replaced with actual communication to language runtime
		const mockImageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
		
		return {
			uri: mockImageData,
			size: {
				width: settings.size.width,
				height: settings.size.height,
				unit: PlotUnit.Pixels
			},
			pixel_ratio: settings.pixel_ratio,
			renderTimeMs: 100,
			intrinsic_size: {
				width: settings.size.width,
				height: settings.size.height,
				source: 'mock',
				unit: PlotUnit.Pixels
			}
		};
	}

	close(): void {
		this._onDidClose.fire();
		this.dispose();
	}

	zoomIn(): void {
		this._zoomLevel = ZoomLevel.OneHundred;
		this._onDidChangeZoomLevel.fire(this._zoomLevel);
	}

	zoomOut(): void {
		this._zoomLevel = ZoomLevel.OneHundred;
		this._onDidChangeZoomLevel.fire(this._zoomLevel);
	}

	zoomToFit(): void {
		this._zoomLevel = ZoomLevel.Fit;
		this._onDidChangeZoomLevel.fire(this._zoomLevel);
	}
}
