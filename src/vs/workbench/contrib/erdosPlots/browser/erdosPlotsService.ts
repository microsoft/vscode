/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { IErdosPlotsService, IErdosPlotClient, HistoryPolicy, DarkFilter, PlotRenderSettings, PlotRenderFormat } from '../../../services/erdosPlots/common/erdosPlots.js';
import { IErdosPlotSizingPolicy, IPlotSize } from '../../../services/erdosPlots/common/erdosPlots.js';

/**
 * ErdosPlotsService - basic implementation for the plots service
 */
export class ErdosPlotsService extends Disposable implements IErdosPlotsService {
	readonly _serviceBrand: undefined;

	private readonly _plotClientsByPlotId = this._register(new DisposableMap<string, IErdosPlotClient>());
	private _selectedPlotId?: string;
	private _selectedSizingPolicy!: IErdosPlotSizingPolicy;
	private readonly _sizingPolicies: IErdosPlotSizingPolicy[] = [];
	private _selectedHistoryPolicy: HistoryPolicy = HistoryPolicy.Automatic;
	private _selectedDarkFilterMode: DarkFilter = DarkFilter.Auto;

	// Events
	private readonly _onDidEmitPlot = this._register(new Emitter<IErdosPlotClient>());
	readonly onDidEmitPlot: Event<IErdosPlotClient> = this._onDidEmitPlot.event;

	private readonly _onDidSelectPlot = this._register(new Emitter<string>());
	readonly onDidSelectPlot: Event<string> = this._onDidSelectPlot.event;

	private readonly _onDidRemovePlot = this._register(new Emitter<string>());
	readonly onDidRemovePlot: Event<string> = this._onDidRemovePlot.event;

	private readonly _onDidReplacePlots = this._register(new Emitter<IErdosPlotClient[]>());
	readonly onDidReplacePlots: Event<IErdosPlotClient[]> = this._onDidReplacePlots.event;

	private readonly _onDidChangeHistoryPolicy = this._register(new Emitter<HistoryPolicy>());
	readonly onDidChangeHistoryPolicy: Event<HistoryPolicy> = this._onDidChangeHistoryPolicy.event;

	private readonly _onDidChangeDarkFilterMode = this._register(new Emitter<DarkFilter>());
	readonly onDidChangeDarkFilterMode: Event<DarkFilter> = this._onDidChangeDarkFilterMode.event;

	private readonly _onDidChangeSizingPolicy = this._register(new Emitter<IErdosPlotSizingPolicy>());
	readonly onDidChangeSizingPolicy: Event<IErdosPlotSizingPolicy> = this._onDidChangeSizingPolicy.event;

	private readonly _onDidChangePlotsRenderSettings = this._register(new Emitter<PlotRenderSettings>());
	readonly onDidChangePlotsRenderSettings: Event<PlotRenderSettings> = this._onDidChangePlotsRenderSettings.event;

	get erdosPlotInstances(): IErdosPlotClient[] {
		return Array.from(this._plotClientsByPlotId.values());
	}

	get selectedPlotId(): string | undefined {
		return this._selectedPlotId;
	}

	get sizingPolicies(): IErdosPlotSizingPolicy[] {
		return this._sizingPolicies;
	}

	get selectedSizingPolicy(): IErdosPlotSizingPolicy {
		return this._selectedSizingPolicy;
	}

	get historyPolicy(): HistoryPolicy {
		return this._selectedHistoryPolicy;
	}

	get darkFilterMode(): DarkFilter {
		return this._selectedDarkFilterMode;
	}

	selectPlot(plotId: string): void {
		if (this._plotClientsByPlotId.has(plotId)) {
			this._selectedPlotId = plotId;
			this._onDidSelectPlot.fire(plotId);
		}
	}

	selectPreviousPlot(): void {
		const plots = this.erdosPlotInstances;
		if (plots.length === 0) return;

		const currentIndex = plots.findIndex(p => p.id === this._selectedPlotId);
		const previousIndex = currentIndex <= 0 ? plots.length - 1 : currentIndex - 1;
		this.selectPlot(plots[previousIndex].id);
	}

	selectNextPlot(): void {
		const plots = this.erdosPlotInstances;
		if (plots.length === 0) return;

		const currentIndex = plots.findIndex(p => p.id === this._selectedPlotId);
		const nextIndex = currentIndex >= plots.length - 1 ? 0 : currentIndex + 1;
		this.selectPlot(plots[nextIndex].id);
	}

	removePlot(plotId: string): void {
		if (this._plotClientsByPlotId.has(plotId)) {
			this._plotClientsByPlotId.deleteAndDispose(plotId);
			if (this._selectedPlotId === plotId) {
				this._selectedPlotId = undefined;
			}
			this._onDidRemovePlot.fire(plotId);
		}
	}

	clearPlots(): void {
		this._plotClientsByPlotId.clearAndDisposeAll();
		this._selectedPlotId = undefined;
		this._onDidReplacePlots.fire([]);
	}

	// Plot rendering methods
	getPlotsRenderSettings(): PlotRenderSettings {
		return {
			size: { width: 800, height: 600 },
			pixel_ratio: 1,
			format: PlotRenderFormat.Png
		};
	}

	setPlotsRenderSettings(settings: PlotRenderSettings): void {
		// TODO: Implement when connected to backend
	}

	// Cache methods
	getCachedPlotThumbnailURI(plotId: string): string | undefined {
		// TODO: Implement thumbnail caching
		return undefined;
	}

	// Plot management methods
	removeSelectedPlot(): void {
		if (this._selectedPlotId) {
			this.removePlot(this._selectedPlotId);
		}
	}

	removeAllPlots(): void {
		this.clearPlots();
	}

	removeEditorPlot(id: string): void {
		// TODO: Implement editor plot removal
	}

	// Sizing policy methods
	selectSizingPolicy(id: string): void {
		const policy = this._sizingPolicies.find(p => p.id === id);
		if (policy) {
			this._selectedSizingPolicy = policy;
			this._onDidChangeSizingPolicy.fire(policy);
		}
	}

	setEditorSizingPolicy(plotId: string, policyId: string): void {
		// TODO: Implement editor-specific sizing policy
	}

	setCustomPlotSize(size: IPlotSize): void {
		// TODO: Implement custom sizing
	}

	clearCustomPlotSize(): void {
		// TODO: Implement clearing custom sizing
	}

	// History and filter methods
	selectHistoryPolicy(policy: HistoryPolicy): void {
		this._selectedHistoryPolicy = policy;
		this._onDidChangeHistoryPolicy.fire(policy);
	}

	setDarkFilterMode(mode: DarkFilter): void {
		this._selectedDarkFilterMode = mode;
		this._onDidChangeDarkFilterMode.fire(mode);
	}

	// Clipboard and file operations
	async copyViewPlotToClipboard(): Promise<void> {
		// TODO: Implement clipboard operations
		throw new Error('Clipboard operations not implemented');
	}

	async copyEditorPlotToClipboard(plotId: string): Promise<void> {
		// TODO: Implement editor plot clipboard operations
		throw new Error('Editor plot clipboard operations not implemented');
	}

	openPlotInNewWindow(): void {
		// TODO: Implement opening plot in new window
	}

	saveViewPlot(): void {
		// TODO: Implement save plot functionality
	}

	saveEditorPlot(plotId: string): void {
		// TODO: Implement save editor plot functionality
	}

	// Editor operations
	async openEditor(plotId: string, groupType?: number, metadata?: any): Promise<void> {
		// TODO: Implement opening plot in editor
	}

	getPreferredEditorGroup(): number {
		// TODO: Implement preferred editor group logic
		return 0;
	}

	getEditorInstance(id: string): IErdosPlotClient | undefined {
		// TODO: Implement editor instance retrieval
		return undefined;
	}

	unregisterPlotClient(plotClient: IErdosPlotClient): void {
		this.removePlot(plotClient.id);
	}

	initialize(): void {
		// TODO: Implement initialization when connected to backend
	}
}
