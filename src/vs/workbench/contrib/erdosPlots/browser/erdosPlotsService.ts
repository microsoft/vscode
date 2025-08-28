/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { IErdosPlotsService, IErdosPlotClient, HistoryPolicy, DarkFilter, PlotRenderSettings, PlotRenderFormat } from '../../../services/erdosPlots/common/erdosPlots.js';
import { IErdosPlotSizingPolicy, IPlotSize } from '../../../services/erdosPlots/common/erdosPlots.js';
import { ILanguageRuntimeService, ILanguageRuntimeMessageOutput, RuntimeOutputKind } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { PlotSizingPolicyAuto } from '../../../services/erdosPlots/common/sizingPolicyAuto.js';
import { StaticPlotClient } from '../../../services/erdosPlots/common/staticPlotClient.js';
import { IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { PlotClientInstance, PlotClientLocation } from '../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { ErdosPlotCommProxy } from '../../../services/languageRuntime/common/erdosPlotCommProxy.js';
import { ErdosPlotRenderQueue } from '../../../services/languageRuntime/common/erdosPlotRenderQueue.js';
import { ILogService } from '../../../../platform/log/common/log.js';

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

	// Track recent executions for associating plots with code
	private readonly _recentExecutions = new Map<string, string>();
	private readonly _recentExecutionIds: string[] = [];
	private readonly MaxRecentExecutions = 100;

	// Track render queues and comm proxies
	private readonly _renderQueues = new Map<string, ErdosPlotRenderQueue>();
	private readonly _plotCommProxies = new Map<string, ErdosPlotCommProxy>();

	constructor(
		@ILanguageRuntimeService private readonly _languageRuntimeService: ILanguageRuntimeService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@IRuntimeSessionService private readonly _runtimeSessionService: IRuntimeSessionService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this.initialize();
	}

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

	// Private thumbnail cache
	private readonly _thumbnailCache = new Map<string, string>();

	// Cache methods
	getCachedPlotThumbnailURI(plotId: string): string | undefined {
		return this._thumbnailCache.get(plotId);
	}

	async generateThumbnailForPlot(plotClient: IErdosPlotClient): Promise<string> {
		const thumbnailSize = { width: 75, height: 75 };
		
		try {
			// Check if it's a PlotClientInstance with render capability
			if ('requestRender' in plotClient) {
				const rendered = await (plotClient as any).requestRender({
					size: thumbnailSize,
					pixel_ratio: 1,
					format: PlotRenderFormat.Png
				});
				
				this._thumbnailCache.set(plotClient.id, rendered.uri);
				return rendered.uri;
			}
			
			// Check if it's a StaticPlotClient with URI
			if ('uri' in plotClient) {
				const uri = (plotClient as any).uri;
				this._thumbnailCache.set(plotClient.id, uri);
				return uri;
			}
			
			// For other types, generate a placeholder thumbnail
			const placeholderUri = this.generatePlaceholderThumbnail(plotClient.id);
			this._thumbnailCache.set(plotClient.id, placeholderUri);
			return placeholderUri;
		} catch (error) {
			console.warn('Failed to generate thumbnail for plot', plotClient.id, error);
			const placeholderUri = this.generatePlaceholderThumbnail(plotClient.id);
			this._thumbnailCache.set(plotClient.id, placeholderUri);
			return placeholderUri;
		}
	}

	private generatePlaceholderThumbnail(plotId: string): string {
		// Generate a simple SVG placeholder thumbnail without emoji
		const svg = `<svg width="75" height="75" xmlns="http://www.w3.org/2000/svg">
			<rect width="75" height="75" fill="#f0f0f0" stroke="#ccc" stroke-width="1"/>
			<text x="37.5" y="37.5" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="12" fill="#666">Plot</text>
			<text x="37.5" y="50" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="8" fill="#999">${plotId.substring(0, 8)}</text>
		</svg>`;
		
		return `data:image/svg+xml;base64,${btoa(svg)}`;
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
		if (!this._selectedPlotId) {
			throw new Error('No plot selected');
		}
		
		const plotClient = this._plotClientsByPlotId.get(this._selectedPlotId);
		if (!plotClient) {
			throw new Error('Selected plot not found');
		}

		// For now, copy plot metadata as text
		// This will be enhanced when we have actual plot rendering
		const plotInfo = `Plot ID: ${plotClient.id}\nCreated: ${new Date(plotClient.metadata.created).toISOString()}`;
		await this._clipboardService.writeText(plotInfo);
	}

	async copyEditorPlotToClipboard(plotId: string): Promise<void> {
		const plotClient = this._plotClientsByPlotId.get(plotId);
		if (!plotClient) {
			throw new Error('Plot not found');
		}

		// For now, copy plot metadata as text
		const plotInfo = `Plot ID: ${plotClient.id}\nCreated: ${new Date(plotClient.metadata.created).toISOString()}`;
		await this._clipboardService.writeText(plotInfo);
	}

	openPlotInNewWindow(): void {
		// TODO: Implement opening plot in new window
		// This will require window management functionality
	}

	saveViewPlot(): void {
		if (!this._selectedPlotId) {
			return;
		}
		
		const plotClient = this._plotClientsByPlotId.get(this._selectedPlotId);
		if (!plotClient) {
			return;
		}

		// Show save dialog
		this._fileDialogService.showSaveDialog({
			title: 'Save Plot',
			filters: [
				{ name: 'PNG Images', extensions: ['png'] },
				{ name: 'All Files', extensions: ['*'] }
			]
		}).then(result => {
			if (result) {
				// TODO: Implement actual plot saving when we have rendered plots
				console.log('Would save plot to:', result.toString());
			}
		});
	}

	saveEditorPlot(plotId: string): void {
		const plotClient = this._plotClientsByPlotId.get(plotId);
		if (!plotClient) {
			return;
		}

		// Show save dialog
		this._fileDialogService.showSaveDialog({
			title: 'Save Plot',
			filters: [
				{ name: 'PNG Images', extensions: ['png'] },
				{ name: 'All Files', extensions: ['*'] }
			]
		}).then(result => {
			if (result) {
				// TODO: Implement actual plot saving when we have rendered plots
				console.log('Would save plot to:', result.toString());
			}
		});
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
		this.setupSizingPolicies();
		this.setupLanguageRuntimeListeners();
	}

	private setupSizingPolicies(): void {
		// Create and add the default Auto sizing policy
		const autoPolicy = new PlotSizingPolicyAuto();
		this._sizingPolicies.push(autoPolicy);
		this._selectedSizingPolicy = autoPolicy;
	}

	private setupLanguageRuntimeListeners(): void {
		this._register(this._languageRuntimeService.onDidRegisterRuntime((runtime: any) => {
		}));

		// Listen for runtime sessions starting
		this._register(this._runtimeSessionService.onDidStartRuntime((session) => {
			this.attachToRuntimeSession(session);
		}));
	}

	private attachToRuntimeSession(session: any): void {
		console.log('Attaching to runtime session:', session.sessionId);

		// Listen for plot output messages (existing static image handling)
		this._register(session.onDidReceiveRuntimeMessageOutput((message: ILanguageRuntimeMessageOutput) => {
			this.handleRuntimeOutputMessage(message, session);
		}));

		// Listen for plot result messages (some plots come as results instead of outputs)
		this._register(session.onDidReceiveRuntimeMessageResult?.((message: ILanguageRuntimeMessageOutput) => {
			this.handleRuntimeOutputMessage(message, session);
		}) ?? { dispose: () => {} });

		// Track code executions for plot association
		this._register(session.onDidReceiveRuntimeMessageInput?.((message: any) => {
			if (message.parent_id && message.code) {
				this._recentExecutionIds.push(message.parent_id);
				if (this._recentExecutionIds.length > this.MaxRecentExecutions) {
					const oldId = this._recentExecutionIds.shift();
					if (oldId) {
						this._recentExecutions.delete(oldId);
					}
				}
				this._recentExecutions.set(message.parent_id, message.code);
			}
		}) ?? { dispose: () => {} });

		// Listen for dynamic plot client creation (Python plots)
		this._register(session.onDidCreateClientInstance?.((event: any) => {
			if (event.client.getClientType() === 'erdos.plot') {
				this.handleDynamicPlotCreation(event, session);
			}
		}) ?? { dispose: () => {} });
	}

	private handleRuntimeOutputMessage(message: ILanguageRuntimeMessageOutput, session: any): void {
		// Check if this is a plot message
		if (message.kind === RuntimeOutputKind.StaticImage || message.kind === RuntimeOutputKind.PlotWidget) {
			console.log('Received plot message:', message);
			
			// Create plot from the message (before we modify it)
			this.createPlotFromMessage(message, session);
			
			// Remove image data from the message to prevent console from displaying it
			this.removeImageDataFromMessage(message);
		}
	}

	private removeImageDataFromMessage(message: ILanguageRuntimeMessageOutput): void {
		// Remove all image mime types from the message data
		// This prevents the console service from detecting it as a plot
		const imageMimeTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/gif'];
		for (const mimeType of imageMimeTypes) {
			if (message.data[mimeType]) {
				delete message.data[mimeType];
			}
		}
		
		// Mark this message as handled to provide additional safety
		(message as any)._plotHandledByPlotsService = true;
	}

	private createPlotFromMessage(message: ILanguageRuntimeMessageOutput, session: any): void {
		try {
			// Create plot metadata
			const plotMetadata = {
				id: message.id,
				created: Date.parse(message.when),
				parent_id: message.parent_id,
				code: '', // TODO: Get the code that generated this plot
				session_id: session.sessionId,
				suggested_file_name: `plot-${Date.now()}`,
				language: session.runtimeMetadata?.languageName || 'unknown'
			};

			// Create a static plot client from the message
			if (message.kind === RuntimeOutputKind.StaticImage) {
				const plotClient = this.createStaticPlotFromMessage(message, plotMetadata);
				if (plotClient) {
					this.registerNewPlot(plotClient);
				}
			} else if (message.kind === RuntimeOutputKind.PlotWidget) {
				// For now, treat plot widgets as static images if they contain image data
				const plotClient = this.createStaticPlotFromMessage(message, plotMetadata);
				if (plotClient) {
					this.registerNewPlot(plotClient);
				}
			}
		} catch (error) {
			console.error('Failed to create plot from message:', error);
		}
	}

	private createStaticPlotFromMessage(message: ILanguageRuntimeMessageOutput, metadata: any): StaticPlotClient | null {
		try {
			// Look for image data in the message
			let imageData: string | null = null;
			let mimeType = 'image/png';

			// Check different possible locations for image data
			if (message.data) {
				// Try common image mime types
				const imageMimeTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/gif'];
				for (const mime of imageMimeTypes) {
					if (message.data[mime] && typeof message.data[mime] === 'string') {
						imageData = message.data[mime] as string;
						mimeType = mime;
						break;
					}
				}

				// Also check for base64 data
				if (!imageData && typeof message.data === 'string') {
					imageData = message.data;
				}
			}

			if (!imageData) {
				console.warn('No image data found in plot message');
				return null;
			}

			// Ensure the data is a proper data URI
			if (!imageData.startsWith('data:')) {
				imageData = `data:${mimeType};base64,${imageData}`;
			}

			// Create the static plot client
			return StaticPlotClient.fromData(imageData, mimeType, metadata);
		} catch (error) {
			console.error('Failed to create static plot client:', error);
			return null;
		}
	}

	private handleDynamicPlotCreation(event: any, session: any): void {
		try {
			const clientId = event.client.getClientId();
			
			// Check if we already have this plot
			if (this.hasPlot(session.sessionId, clientId)) {
				return;
			}

			console.log('Creating dynamic plot client:', clientId);

			// Get the code that generated this plot (if available)
			const code = this._recentExecutions?.get(event.message.parent_id) || '';

			// Create plot metadata
			const metadata = {
				id: clientId,
				created: Date.parse(event.message.when),
				parent_id: event.message.parent_id,
				code,
				session_id: session.sessionId,
				suggested_file_name: `python-plot-${Date.now()}`,
				language: session.runtimeMetadata?.languageName || 'python',
				zoom_level: undefined
			};

			// Create dynamic plot client
			const plotClient = this.createDynamicPlotClient(event.client, metadata, session);
			if (plotClient) {
				this.registerNewPlot(plotClient);
				console.log('Dynamic plot registered successfully:', clientId);
			}
		} catch (error) {
			console.error('Failed to handle dynamic plot creation:', error);
		}
	}

	private createDynamicPlotClient(client: any, metadata: any, session?: any): IErdosPlotClient | null {
		try {
			// Create the communication stack like Positron does
			const commProxy = this.createCommProxy(client, metadata);
			
			// Use the existing PlotClientInstance infrastructure
			const plotClient = new PlotClientInstance(
				client.getClientId(),
				PlotClientLocation.View,
				metadata,
				commProxy
			);
			
			return plotClient;
		} catch (error) {
			console.error('Failed to create dynamic plot client:', error);
			return null;
		}
	}

	private createCommProxy(client: any, metadata: any): ErdosPlotCommProxy {
		// Get or create the render queue for this session
		let renderQueue = this._renderQueues.get(metadata.session_id);
		if (!renderQueue) {
			const session = this._runtimeSessionService.getSession(metadata.session_id);
			if (session) {
				renderQueue = new ErdosPlotRenderQueue(session, this._logService);
				this._register(renderQueue);
				this._renderQueues.set(metadata.session_id, renderQueue);
			} else {
				this._logService.error(`Cannot find session ${metadata.session_id} for plot ${metadata.id}.`);
				throw new Error(`Cannot find session ${metadata.session_id} for plot ${metadata.id}`);
			}
		}

		const commProxy = new ErdosPlotCommProxy(client, renderQueue);
		this._plotCommProxies.set(metadata.id, commProxy);

		this._register(commProxy.onDidClose(() => {
			// Clean up when plot is closed
			this._plotCommProxies.delete(metadata.id);
		}));

		this._register(commProxy);

		return commProxy;
	}

	private hasPlot(sessionId: string, plotId: string): boolean {
		return this._plotClientsByPlotId.has(plotId);
	}

	private registerNewPlot(plotClient: IErdosPlotClient): void {
		console.log('Registering new plot:', plotClient.id);
		
		// Add to our plot clients map
		this._plotClientsByPlotId.set(plotClient.id, plotClient);

		// Select this plot as the current one
		this._selectedPlotId = plotClient.id;

		// Fire events to update the UI
		this._onDidEmitPlot.fire(plotClient);
		this._onDidSelectPlot.fire(plotClient.id);

		console.log('Plot registered successfully, total plots:', this._plotClientsByPlotId.size);
	}

	// Note: Runtime connection methods will be implemented when language runtime sessions are available
}
