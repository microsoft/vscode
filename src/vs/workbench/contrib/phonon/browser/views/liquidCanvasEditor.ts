/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, type IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { ILiquidModuleRegistry } from '../../common/liquidModule.js';
import { ICompositionIntent, ICompositionSlot, ILiquidGraft, CompositionLayout } from '../../common/liquidGraftTypes.js';
import { ILiquidDataResolver, LiquidGraftSlotHost, type IGraftWebview, type GraftToHostMessage, type HostToGraftMessage, type IGraftStateChange } from '../liquidGraftBridge.js';
import { LiquidCanvasEditorInput } from './liquidCanvasEditorInput.js';
import { createTrustedTypesPolicy } from '../../../../../base/browser/trustedTypes.js';

const ttPolicy = createTrustedTypesPolicy('phononCanvas', { createHTML: value => value });

/**
 * Layout strategy -> CSS grid-template mapping.
 *
 * Each layout receives the slot count and produces a grid-template-columns
 * and grid-template-rows value pair. Weights on slots refine the template
 * when present.
 */
const LAYOUT_STRATEGY: Record<CompositionLayout, (slots: readonly ICompositionSlot[]) => { columns: string; rows: string }> = {
	'single': () => ({ columns: '1fr', rows: '1fr' }),
	'split-horizontal': (slots) => {
		const cols = slots.map(s => s.weight ? `${s.weight}fr` : '1fr').join(' ');
		return { columns: cols, rows: '1fr' };
	},
	'split-vertical': (slots) => {
		const rows = slots.map(s => s.weight ? `${s.weight}fr` : '1fr').join(' ');
		return { columns: '1fr', rows };
	},
	'grid': (slots) => {
		const colCount = Math.ceil(Math.sqrt(slots.length));
		const rowCount = Math.ceil(slots.length / colCount);
		return { columns: `repeat(${colCount}, 1fr)`, rows: `repeat(${rowCount}, 1fr)` };
	},
	'stack': (slots) => {
		const rows = slots.map(s => s.weight ? `${s.weight}fr` : 'minmax(150px, 1fr)').join(' ');
		return { columns: '1fr', rows };
	},
};

/**
 * Editor pane that renders composition intents as CSS grid layouts.
 *
 * Each graft slot is rendered as a sandboxed iframe with a postMessage bridge.
 * The iframe communicates with the host via postMessage and the host routes data
 * requests through ILiquidDataResolver.
 *
 * Relationship graph:
 *   LiquidCanvasEditor -> sandboxed iframe per graft
 *   graft DOM <-> window.phonon bridge <-> ILiquidDataResolver
 *   ILiquidModuleRegistry -> graft metadata (entryUri, entity, tags)
 */
export class LiquidCanvasEditor extends EditorPane {

	static readonly ID = LiquidCanvasEditorInput.EditorID;

	private _container: HTMLElement | undefined;
	private _currentIntent: ICompositionIntent | undefined;
	private readonly _slotHosts = this._register(new DisposableStore());

	/**
	 * Aggregated state per graft. Updated when grafts call phonon.setState().
	 * Keys are graft IDs, values are key-value state maps.
	 */
	private readonly _graftStates = new Map<string, Record<string, unknown>>();

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IFileService private readonly fileService: IFileService,
		@ILiquidDataResolver private readonly dataResolver: ILiquidDataResolver,
		@ILiquidModuleRegistry private readonly registry: ILiquidModuleRegistry,
		@ILogService private readonly logService: ILogService,
	) {
		super(LiquidCanvasEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this._container = dom.append(parent, dom.$('.liquid-canvas-container'));
		if (this._currentIntent) {
			this._renderIntent(this._currentIntent);
		}
	}

	override async setInput(input: LiquidCanvasEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		// If an intent was composed before the input was set, re-render it.
		if (this._currentIntent) {
			this._renderIntent(this._currentIntent);
		}
	}

	override layout(dimension: dom.Dimension): void {
		if (this._container) {
			this._container.style.width = `${dimension.width}px`;
			this._container.style.height = `${dimension.height}px`;
		}
	}

	override getTitle(): string {
		return this._currentIntent?.title ?? localize('phononCanvas.defaultTitle', "Phonon Canvas");
	}

	/**
	 * Compose a new intent into the canvas, replacing any existing content.
	 */
	composeIntent(intent: ICompositionIntent): void {
		this._currentIntent = intent;
		this._graftStates.clear();
		this._renderIntent(intent);
	}

	/**
	 * Returns a human-readable snapshot of all graft states on the active canvas.
	 * Used by the chat agent to enrich the system prompt with live canvas context.
	 */
	getCanvasStateSnapshot(): string {
		if (this._graftStates.size === 0) {
			return '';
		}
		const parts: string[] = [];
		for (const [graftId, state] of this._graftStates) {
			const entries = Object.entries(state).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
			parts.push(`- ${graftId}: ${entries}`);
		}
		return parts.join('\n');
	}

	/**
	 * Returns the raw state map for a specific graft. Used for state preservation
	 * during hot reload.
	 */
	getGraftState(graftId: string): Record<string, unknown> | undefined {
		return this._graftStates.get(graftId);
	}

	private _onGraftStateChange(change: IGraftStateChange): void {
		const current = this._graftStates.get(change.graftId) ?? {};
		this._graftStates.set(change.graftId, { ...current, [change.key]: change.value });
	}

	private _renderIntent(intent: ICompositionIntent): void {
		if (!this._container) {
			return;
		}

		// Dispose previous slot hosts and webviews before clearing the DOM
		this._slotHosts.clear();

		dom.clearNode(this._container);

		const grid = dom.append(this._container, dom.$('.liquid-canvas-grid'));
		const strategy = LAYOUT_STRATEGY[intent.layout] ?? LAYOUT_STRATEGY['single'];
		const { columns, rows } = strategy(intent.slots);
		grid.style.gridTemplateColumns = columns;
		grid.style.gridTemplateRows = rows;

		for (const slot of intent.slots) {
			this._renderSlot(grid, slot);
		}
	}

	private _renderSlot(parent: HTMLElement, slot: ICompositionSlot): void {
		const slotEl = dom.append(parent, dom.$('.liquid-canvas-slot'));
		const slotTargetId = slot.viewId ?? slot.graftId ?? 'unknown';

		// -- Header --
		const header = dom.append(slotEl, dom.$('.liquid-canvas-slot-header'));
		header.textContent = slot.label ?? slotTargetId;

		// -- Body --
		const body = dom.append(slotEl, dom.$('.liquid-canvas-slot-body'));

		// Attempt graft rendering
		if (slot.graftId) {
			const graft = this.registry.grafts.find(m => m.id === slot.graftId);
			if (graft) {
				// Sync placeholder while async graft loads
				const loading = dom.append(body, dom.$('div'));
				loading.textContent = localize('phononCanvas.loading', "Loading {0}...", graft.label);
				loading.style.color = 'var(--vscode-descriptionForeground)';
				loading.style.fontStyle = 'italic';

				this._renderGraftWebview(body, graft, slot.params).then(() => {
					loading.remove();
				}).catch(err => {
					loading.textContent = localize('phononCanvas.graftError', "Graft error: {0} - {1}", graft.id, String(err));
					loading.style.color = 'var(--vscode-errorForeground)';
					this.logService.error(`[Phonon Canvas] Graft render failed: ${graft.id}`, err);
				});
				return;
			}
		}

		// Fallback: placeholder for views or unknown grafts
		const viewLine = dom.append(body, dom.$('div'));
		viewLine.textContent = slot.graftId ? `Graft: ${slot.graftId}` : `View: ${slotTargetId}`;

		if (slot.params && Object.keys(slot.params).length > 0) {
			const paramsBlock = dom.append(body, dom.$('pre.liquid-canvas-slot-params'));
			paramsBlock.textContent = JSON.stringify(slot.params, null, 2);
		}
	}

	/**
	 * Render a graft inside a sandboxed iframe with a postMessage bridge shim.
	 *
	 * Creates the iframe + slot host, then sets up a file watcher for hot reload.
	 * The watcher persists across reloads -- only the iframe and host are recreated.
	 */
	private async _renderGraftWebview(
		container: HTMLElement,
		graft: ILiquidGraft,
		params?: Record<string, unknown>,
	): Promise<void> {
		this.logService.info(`[Phonon Canvas] Rendering graft: ${graft.id} from ${graft.entryUri.toString()}`);

		const result = await this._createGraftIframe(container, graft, params);
		if (!result) {
			return;
		}

		// The lifecycle manager owns the initial iframe+host AND the watcher.
		// On file change, it recreates only the iframe+host while the watcher persists.
		this._slotHosts.add(this._createGraftLifecycle(container, graft, params, result));
	}

	/**
	 * Create a sandboxed iframe for a graft, wire up the bridge, and return
	 * the iframe + slot host disposable. Does NOT create a file watcher.
	 */
	private async _createGraftIframe(
		container: HTMLElement,
		graft: ILiquidGraft,
		params?: Record<string, unknown>,
		restoredState?: Record<string, unknown>,
	): Promise<{ iframe: HTMLIFrameElement; slotHostDisposable: IDisposable } | undefined> {
		let graftHtml: string;
		try {
			const fileContent = await this.fileService.readFile(graft.entryUri);
			graftHtml = fileContent.value.toString();
		} catch (err) {
			this.logService.warn(`[Phonon Canvas] Failed to read graft HTML: ${graft.id}`, err);
			const errorEl = dom.append(container, dom.$('div'));
			errorEl.textContent = localize('phononCanvas.loadError', "Graft load error: {0}", graft.id);
			errorEl.style.color = 'var(--vscode-errorForeground)';
			return undefined;
		}

		// Create sandboxed iframe
		const iframe = dom.$('iframe') as HTMLIFrameElement;
		iframe.sandbox.add('allow-scripts');
		iframe.style.width = '100%';
		iframe.style.height = '100%';
		iframe.style.border = 'none';

		// Build srcdoc: bridge shim + graft HTML
		const bridgeShim = this._buildBridgeShim(params);
		const srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
	body { margin: 0; font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif); color: var(--vscode-foreground, #ccc); background: transparent; }
</style>
</head>
<body>
${graftHtml}
<script>${bridgeShim}</script>
</body>
</html>`;

		// Use TrustedTypes if available
		if (ttPolicy) {
			iframe.srcdoc = ttPolicy.createHTML(srcdoc) as unknown as string;
		} else {
			iframe.srcdoc = srcdoc;
		}

		dom.append(container, iframe);

		// Create slot host for message routing
		const slotHostDisposable = this._createSlotHost(iframe, graft.id, graft.entity, params, restoredState);

		this.logService.info(`[Phonon Canvas] Rendered graft in iframe: ${graft.id}`);

		return { iframe, slotHostDisposable };
	}

	/**
	 * Manage the full lifecycle of a graft slot: initial iframe + host,
	 * file watcher, and hot reloads. The watcher persists across reloads
	 * (fixes the accumulation bug where each reload created a new watcher).
	 */
	private _createGraftLifecycle(
		container: HTMLElement,
		graft: ILiquidGraft,
		params: Record<string, unknown> | undefined,
		initial: { iframe: HTMLIFrameElement; slotHostDisposable: IDisposable },
	): IDisposable {
		const disposables = new DisposableStore();

		let currentIframe = initial.iframe;
		// MutableDisposable prevents double-dispose: .value setter auto-disposes the old value
		const slotHostRef = disposables.add(new MutableDisposable());
		slotHostRef.value = initial.slotHostDisposable;

		// Guard against rapid file changes causing overlapping reloads
		let reloadInFlight = false;

		// Use a correlated file watcher so events only fire for this graft's file
		const watcher = this.fileService.createWatcher(graft.entryUri, { recursive: false, excludes: [] });
		disposables.add(watcher);

		disposables.add(watcher.onDidChange(() => {
			if (reloadInFlight) {
				return;
			}
			reloadInFlight = true;
			this.logService.info(`[Phonon Canvas] Hot reload: ${graft.id}`);

			// Preserve state before destroying the iframe
			const savedState = this.getGraftState(graft.id);

			// Tear down old iframe + host
			currentIframe.remove();
			slotHostRef.clear();

			// Recreate iframe + host (no new watcher)
			this._createGraftIframe(container, graft, params, savedState).then(result => {
				if (result) {
					currentIframe = result.iframe;
					slotHostRef.value = result.slotHostDisposable;
				}
			}).catch(err => {
				this.logService.error(`[Phonon Canvas] Hot reload failed: ${graft.id}`, err);
			}).finally(() => {
				reloadInFlight = false;
			});
		}));

		return disposables;
	}

	/**
	 * Build the ES5-compatible bridge shim injected inside the graft iframe.
	 *
	 * Exposes `window.phonon` with data.fetch, data.mutate, navigate, intent,
	 * setTitle, setLoading, setState, getState, onParams, onReady, and params.
	 * All calls route through postMessage to the parent window.
	 */
	private _buildBridgeShim(params: Record<string, unknown> | undefined): string {
		// ES5 only: no arrow functions, no const/let, no template literals. iframe has no build step.
		return `
(function() {
	'use strict';
	var _requestId = 0;
	var _pendingRequests = {};
	var _paramCallbacks = [];
	var _readyCallbacks = [];

	var _state = {};

	window.phonon = {
		data: {
			fetch: function(entity, query) {
				return new Promise(function(resolve, reject) {
					var id = 'req-' + (++_requestId);
					_pendingRequests[id] = { resolve: resolve, reject: reject };
					window.parent.postMessage({ type: 'phonon:data:fetch', requestId: id, entity: entity, query: query }, '*');
				});
			},
			mutate: function(entity, op, data) {
				return new Promise(function(resolve, reject) {
					var id = 'req-' + (++_requestId);
					_pendingRequests[id] = { resolve: resolve, reject: reject };
					window.parent.postMessage({ type: 'phonon:data:mutate', requestId: id, entity: entity, operation: op, data: data }, '*');
				});
			}
		},
		navigate: function(viewId, params) {
			window.parent.postMessage({ type: 'phonon:navigate', viewId: viewId, params: params }, '*');
		},
		intent: function(description) {
			window.parent.postMessage({ type: 'phonon:intent', description: description }, '*');
		},
		setTitle: function(title) {
			window.parent.postMessage({ type: 'phonon:setTitle', title: title }, '*');
		},
		setLoading: function(loading) {
			window.parent.postMessage({ type: 'phonon:setLoading', loading: loading }, '*');
		},
		setState: function(key, value) {
			_state[key] = value;
			window.parent.postMessage({ type: 'phonon:setState', key: key, value: value }, '*');
		},
		getState: function(key) {
			return _state[key];
		},
		onParams: function(cb) {
			_paramCallbacks.push(cb);
		},
		onReady: function(cb) {
			_readyCallbacks.push(cb);
		},
		params: ${JSON.stringify(params ?? {})}
	};

	window.addEventListener('message', function(event) {
		var msg = event.data;
		if (!msg || typeof msg.type !== 'string') return;

		if (msg.type === 'phonon:data:response' && msg.requestId) {
			var pending = _pendingRequests[msg.requestId];
			if (pending) {
				delete _pendingRequests[msg.requestId];
				if (msg.success) {
					pending.resolve(msg.data);
				} else {
					pending.reject(new Error(msg.error || 'Unknown error'));
				}
			}
		} else if (msg.type === 'phonon:params') {
			window.phonon.params = msg.params;
			_paramCallbacks.forEach(function(cb) { cb(msg.params); });
		} else if (msg.type === 'phonon:init') {
			_readyCallbacks.forEach(function(cb) { cb(); });
			_readyCallbacks = [];
		} else if (msg.type === 'phonon:stateUpdate') {
			_state = msg.state || {};
		}
	});

	// Signal ready to host
	window.parent.postMessage({ type: 'phonon:ready' }, '*');
})();
`;
	}

	/**
	 * Create a LiquidGraftSlotHost wired to a raw iframe via postMessage.
	 *
	 * Returns a composite IDisposable that tears down the message listener,
	 * the emitter, and the slot host.
	 */
	private _createSlotHost(
		iframe: HTMLIFrameElement,
		graftId: string,
		entity: string | undefined,
		params: Record<string, unknown> | undefined,
		restoredState?: Record<string, unknown>,
	): IDisposable {
		// Adapt the raw iframe to IGraftWebview
		const onMessage = new Emitter<GraftToHostMessage>();

		const messageHandler = (event: MessageEvent) => {
			if (event.source === iframe.contentWindow) {
				onMessage.fire(event.data);
			}
		};
		dom.getWindow(this._container ?? iframe).addEventListener('message', messageHandler);

		const webviewAdapter: IGraftWebview = {
			postMessage: async (msg: HostToGraftMessage) => {
				if (iframe.contentWindow) {
					iframe.contentWindow.postMessage(msg, '*');
					return true;
				}
				return false;
			},
			onDidReceiveMessage: onMessage.event,
		};

		const host = new LiquidGraftSlotHost(
			webviewAdapter, graftId, entity, params,
			this.dataResolver, this.logService,
		);

		// Wire graft state changes to the canvas state aggregator
		const stateListener = host.onDidStateChange(change => this._onGraftStateChange(change));

		// If this is a hot reload with preserved state, push it after init
		let readyListener: IDisposable | undefined;
		if (restoredState) {
			const capturedState = restoredState;
			readyListener = webviewAdapter.onDidReceiveMessage(msg => {
				if (msg && msg.type === 'phonon:ready') {
					// Push state after the slot host has sent phonon:init
					setTimeout(() => host.pushState(capturedState), 0);
					readyListener?.dispose();
				}
			});
		}

		return {
			dispose: () => {
				readyListener?.dispose();
				stateListener.dispose();
				dom.getWindow(this._container ?? iframe).removeEventListener('message', messageHandler);
				onMessage.dispose();
				host.dispose();
			}
		};
	}
}
