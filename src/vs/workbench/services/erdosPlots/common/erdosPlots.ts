/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IErdosPlotMetadata, PlotClientLocation, PlotClientInstance } from '../../languageRuntime/common/languageRuntimePlotClient.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export const ERDOS_PLOTS_VIEW_ID = 'workbench.panel.erdosPlots';

export const ERDOS_PLOTS_SERVICE_ID = 'erdosPlotsService';

export const IErdosPlotsService = createDecorator<IErdosPlotsService>(ERDOS_PLOTS_SERVICE_ID);

export interface IPlotSize {
	height: number;
	width: number;
}

export interface IErdosPlotSizingPolicy {
	id: string;

	getName(plot: PlotClientInstance): string;

	getPlotSize(viewportSize: IPlotSize): IPlotSize | undefined;
}

export interface IExtendedErdosPlotMetadata extends IErdosPlotMetadata {
	session_id: string;
	suggested_file_name?: string;
	output_id?: string;
	zoom_level?: ZoomLevel;
	location?: PlotClientLocation;
	language?: string;
	sizing_policy?: { id: string; size?: IPlotSize };
	pre_render?: boolean;
}

export interface IErdosPlotClient extends IDisposable {
	readonly id: string;
	readonly metadata: IExtendedErdosPlotMetadata;
}

export interface IZoomablePlotClient {
	zoomLevel: ZoomLevel;

	onDidChangeZoomLevel: Event<ZoomLevel>;
}

export enum ZoomLevel {
	Fit = 0,
	Fifty = 0.5,
	SeventyFive = 0.75,
	OneHundred = 1,
	TwoHundred = 2,
}

export interface PlotRenderSettings {
	size: {
		width: number;
		height: number;
	};
	pixel_ratio: number;
	format: PlotRenderFormat;
}

export enum PlotRenderFormat {
	Png = 'png',
	Jpeg = 'jpeg',
	Svg = 'svg',
	Pdf = 'pdf',
	Tiff = 'tiff'
}

export enum HistoryPolicy {
	AlwaysVisible = 'always',
	Automatic = 'auto',
	NeverVisible = 'never'
}

export enum DarkFilter {
	On = 'on',
	Off = 'off',
	Auto = 'auto'
}

export const isZoomablePlotClient = (obj: any): obj is IZoomablePlotClient => {
	return 'zoomLevel' in obj && typeof obj.zoomLevel === 'number' &&
		'onDidChangeZoomLevel' in obj && typeof obj.onDidChangeZoomLevel === 'function';
};

export const createSuggestedFileNameForPlot = (storageService: IStorageService) => {
	const key = 'erdos.plotNumber';
	const plotNumber = storageService.getNumber(key, StorageScope.APPLICATION, 0) + 1;
	storageService.store(key, plotNumber, StorageScope.APPLICATION, StorageTarget.MACHINE);
	return `plot-${plotNumber}`;
};

export interface IErdosPlotsService {
	readonly _serviceBrand: undefined;

	readonly erdosPlotInstances: IErdosPlotClient[];

	readonly selectedPlotId: string | undefined;

	readonly sizingPolicies: IErdosPlotSizingPolicy[];

	readonly selectedSizingPolicy: IErdosPlotSizingPolicy;

	readonly historyPolicy: HistoryPolicy;

	readonly onDidChangeHistoryPolicy: Event<HistoryPolicy>;

	readonly darkFilterMode: DarkFilter;

	readonly onDidChangeDarkFilterMode: Event<DarkFilter>;

	readonly onDidEmitPlot: Event<IErdosPlotClient>;

	readonly onDidSelectPlot: Event<string>;

	readonly onDidRemovePlot: Event<string>;

	readonly onDidReplacePlots: Event<IErdosPlotClient[]>;

	readonly onDidChangePlotsRenderSettings: Event<PlotRenderSettings>;

	readonly onDidChangeSizingPolicy: Event<IErdosPlotSizingPolicy>;

	getCachedPlotThumbnailURI(plotId: string): string | undefined;

	selectPlot(id: string): void;

	selectNextPlot(): void;

	selectPreviousPlot(): void;

	removePlot(id: string): void;

	removeEditorPlot(id: string): void;

	removeSelectedPlot(): void;

	removeAllPlots(): void;

	selectSizingPolicy(id: string): void;

	setEditorSizingPolicy(plotId: string, policyId: string): void;

	setCustomPlotSize(size: IPlotSize): void;

	clearCustomPlotSize(): void;

	selectHistoryPolicy(policy: HistoryPolicy): void;

	setDarkFilterMode(mode: DarkFilter): void;

	copyViewPlotToClipboard(): Promise<void>;

	copyEditorPlotToClipboard(plotId: string): Promise<void>;

	openPlotInNewWindow(): void;

	saveViewPlot(): void;

	saveEditorPlot(plotId: string): void;

	openEditor(plotId: string, groupType?: number, metadata?: IExtendedErdosPlotMetadata): Promise<void>;

	getPreferredEditorGroup(): number;

	getEditorInstance(id: string): IErdosPlotClient | undefined;

	unregisterPlotClient(plotClient: IErdosPlotClient): void;

	getPlotsRenderSettings(): PlotRenderSettings;

	setPlotsRenderSettings(settings: PlotRenderSettings): void;

	initialize(): void;
}
