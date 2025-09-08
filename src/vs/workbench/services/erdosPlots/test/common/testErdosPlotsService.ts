/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { IErdosPlotsService, IErdosPlotClient, HistoryPolicy, DarkFilter, PlotRenderSettings } from '../../common/erdosPlots.js';
import { IErdosPlotSizingPolicy } from '../../common/sizingPolicy.js';
import { IErdosPlotMetadata } from '../../../languageRuntime/common/languageRuntimePlotClient.js';

export class TestErdosPlotsService extends Disposable implements IErdosPlotsService {
	private readonly _plotClientsByPlotId =
		this._register(new DisposableMap<string, IErdosPlotClient>());

	private readonly _editorPlots = new Map<string, IErdosPlotClient>();

	private _selectedPlotId?: string;

	private _selectedSizingPolicy!: IErdosPlotSizingPolicy;

	private readonly _sizingPolicies: IErdosPlotSizingPolicy[] = [];

	private _selectedHistoryPolicy: HistoryPolicy = HistoryPolicy.Automatic;

	private _selectedDarkFilterMode: DarkFilter = DarkFilter.Auto;

	private readonly _onDidEmitPlotEmitter =
		this._register(new Emitter<IErdosPlotClient>());

	private readonly _onDidSelectPlotEmitter =
		this._register(new Emitter<string>());

	private readonly _onDidRemovePlotEmitter =
		this._register(new Emitter<string>());

	private readonly _onDidReplacePlotsEmitter =
		this._register(new Emitter<IErdosPlotClient[]>());

	private readonly _onDidUpdatePlotMetadataEmitter =
		this._register(new Emitter<IErdosPlotClient>());

	private readonly _onDidChangeHistoryPolicyEmitter =
		this._register(new Emitter<HistoryPolicy>());

	private readonly _onDidChangeDarkFilterModeEmitter =
		this._register(new Emitter<DarkFilter>());

	private readonly _onDidChangePlotsRenderSettingsEmitter =
		this._register(new Emitter<PlotRenderSettings>());

	private readonly _onDidChangeSizingPolicyEmitter =
		this._register(new Emitter<IErdosPlotSizingPolicy>());

	constructor() {
		super();
	}

	getPlotsRenderSettings(): PlotRenderSettings {
		throw new Error('Method not implemented.');
	}
	setPlotsRenderSettings(settings: PlotRenderSettings): void {
		throw new Error('Method not implemented.');
	}

	readonly _serviceBrand: undefined;

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

	readonly onDidEmitPlot = this._onDidEmitPlotEmitter.event;

	readonly onDidSelectPlot = this._onDidSelectPlotEmitter.event;

	readonly onDidRemovePlot = this._onDidRemovePlotEmitter.event;

	readonly onDidReplacePlots = this._onDidReplacePlotsEmitter.event;

	readonly onDidUpdatePlotMetadata = this._onDidUpdatePlotMetadataEmitter.event;

	readonly onDidChangeHistoryPolicy = this._onDidChangeHistoryPolicyEmitter.event;

	readonly onDidChangeDarkFilterMode = this._onDidChangeDarkFilterModeEmitter.event;

	readonly onDidChangePlotsRenderSettings = this._onDidChangePlotsRenderSettingsEmitter.event;

	readonly onDidChangeSizingPolicy = this._onDidChangeSizingPolicyEmitter.event;

	getCachedPlotThumbnailURI(plotId: string) {
		return undefined;
	}

	selectPlot(id: string): void {
		this._selectedPlotId = id;
		this._onDidSelectPlotEmitter.fire(id);
	}

	selectNextPlot(): void {
		const plots = this.erdosPlotInstances;
		if (plots.length === 0) {
			return;
		}

		const currentIndex = this._selectedPlotId
			? plots.findIndex(plot => plot.id === this._selectedPlotId)
			: -1;

		const nextIndex = (currentIndex + 1) % plots.length;
		this.selectPlot(plots[nextIndex].id);
	}

	selectPreviousPlot(): void {
		const plots = this.erdosPlotInstances;
		if (plots.length === 0) {
			return;
		}

		const currentIndex = this._selectedPlotId
			? plots.findIndex(plot => plot.id === this._selectedPlotId)
			: -1;

		const prevIndex = currentIndex < 0
			? plots.length - 1
			: (currentIndex - 1 + plots.length) % plots.length;
		this.selectPlot(plots[prevIndex].id);
	}

	removePlot(id: string): void {
		const plot = this._plotClientsByPlotId.get(id);
		if (plot) {
			this._plotClientsByPlotId.deleteAndDispose(id);

			if (this._selectedPlotId === id) {
				const plots = this.erdosPlotInstances;
				if (plots.length > 0) {
					this._selectedPlotId = plots[0].id;
				} else {
					this._selectedPlotId = undefined;
				}
			}

			this._onDidRemovePlotEmitter.fire(id);
		}
	}

	removeEditorPlot(id: string): void {
		const plot = this._editorPlots.get(id);
		if (plot) {
			this.unregisterPlotClient(plot);
			this._editorPlots.delete(id);
		}
	}

	removeSelectedPlot(): void {
		if (this._selectedPlotId) {
			this.removePlot(this._selectedPlotId);
		}
	}

	removeAllPlots(): void {
		const plotIds = Array.from(this._plotClientsByPlotId.keys());
		for (const id of plotIds) {
			this.removePlot(id);
		}
		this._onDidReplacePlotsEmitter.fire([]);
	}

	selectSizingPolicy(id: string): void {
		const policy = this._sizingPolicies.find(policy => policy.id === id);
		if (policy) {
			this._selectedSizingPolicy = policy;
		}
	}

	setEditorSizingPolicy(plotId: string, policyId: string): void {
	}

	setCustomPlotSize(size: any): void {
	}

	clearCustomPlotSize(): void {
	}

	selectHistoryPolicy(policy: HistoryPolicy): void {
		this._selectedHistoryPolicy = policy;
		this._onDidChangeHistoryPolicyEmitter.fire(policy);
	}

	setDarkFilterMode(mode: DarkFilter): void {
		this._selectedDarkFilterMode = mode;
		this._onDidChangeDarkFilterModeEmitter.fire(mode);
	}

	copyViewPlotToClipboard(): Promise<void> {
		return Promise.resolve();
	}

	copyEditorPlotToClipboard(plotId: string): Promise<void> {
		return Promise.resolve();
	}

	selectDarkFilterMode(mode: DarkFilter): void {
		this.setDarkFilterMode(mode);
	}

	copyPlotToClipboard(): Promise<void> {
		return this.copyViewPlotToClipboard();
	}

	openPlotInNewWindow(): void {
	}

	saveViewPlot(): void {
	}

	saveEditorPlot(plotId: string): void {
	}

	async openEditor(plotId: string, groupType?: number, metadata?: IErdosPlotMetadata): Promise<void> {
		return Promise.resolve();
	}

	getPreferredEditorGroup(): number {
		return 0;
	}

	getEditorInstance(id: string): IErdosPlotClient | undefined {
		return this._editorPlots.get(id);
	}

	unregisterPlotClient(plotClient: IErdosPlotClient): void {
		plotClient.dispose();
	}

	updatePlotMetadata(plotId: string, updates: Partial<IErdosPlotMetadata>): void {
		const plotClient = this._plotClientsByPlotId.get(plotId);
		if (!plotClient) {
			return;
		}

		// Update the metadata by creating a new object with the updates
		// Since metadata is readonly in the interface, we need to cast to any to modify it
		const metadata = plotClient.metadata as any;
		Object.assign(metadata, updates);

		// Fire the metadata update event to update the UI
		this._onDidUpdatePlotMetadataEmitter.fire(plotClient);
	}

	getPlotByIndex(index: number): IErdosPlotClient | undefined {
		const plots = this.erdosPlotInstances;
		if (plots.length === 0 || index < 1 || index > plots.length) {
			return undefined;
		}
		
		// Sort plots by creation time (most recent first)
		const sortedPlots = plots.sort((a, b) => b.metadata.created - a.metadata.created);
		
		// Index is 1-based, so subtract 1 for 0-based array access
		return sortedPlots[index - 1];
	}

	initialize(): void {
	}

	addPlotClient(plotClient: IErdosPlotClient, selectAfterAdd: boolean = false): void {
		this._plotClientsByPlotId.set(plotClient.id, plotClient);
		this._onDidEmitPlotEmitter.fire(plotClient);

		if (selectAfterAdd) {
			this.selectPlot(plotClient.id);
		}
	}

	addEditorPlot(plotClient: IErdosPlotClient): void {
		this._editorPlots.set(plotClient.id, plotClient);
	}

	fireReplacePlotsEvent(): void {
		this._onDidReplacePlotsEmitter.fire(this.erdosPlotInstances);
	}

	addSizingPolicy(policy: IErdosPlotSizingPolicy): void {
		this._sizingPolicies.push(policy);
		if (this._sizingPolicies.length === 1) {
			this._selectedSizingPolicy = policy;
		}
	}
}
