/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, type IDisposable } from '../../../../../base/common/lifecycle.js';
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
import { ICompositionIntent, ICompositionSlot, ILiquidMolecule, CompositionLayout } from '../../common/liquidModuleTypes.js';
import { ILiquidDataResolver, LiquidMoleculeSlotHost, type IMoleculeWebview, type MoleculeToHostMessage, type HostToMoleculeMessage, type IMoleculeStateChange } from '../liquidMoleculeBridge.js';
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
 * Each molecule slot is rendered as a VS Code WebviewElement (sandboxed, CSP-managed,
 * remote-lifecycle-safe). The webview communicates with the host via postMessage
 * and the host routes data requests through ILiquidDataResolver.
 *
 * Relationship graph:
 *   LiquidCanvasEditor -> sandboxed iframe per molecule
 *   molecule DOM <-> window.phonon bridge <-> ILiquidDataResolver
 *   ILiquidModuleRegistry -> molecule metadata (entryUri, entity, tags)
 */
export class LiquidCanvasEditor extends EditorPane {

	static readonly ID = LiquidCanvasEditorInput.EditorID;

	private _container: HTMLElement | undefined;
	private _currentIntent: ICompositionIntent | undefined;
	private readonly _slotHosts = this._register(new DisposableStore());

	/**
	 * Aggregated state per molecule. Updated when molecules call phonon.setState().
	 * Keys are molecule IDs, values are key-value state maps.
	 */
	private readonly _moleculeStates = new Map<string, Record<string, unknown>>();

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
		return this._currentIntent?.title ?? 'Phonon Canvas';
	}

	/**
	 * Compose a new intent into the canvas, replacing any existing content.
	 */
	composeIntent(intent: ICompositionIntent): void {
		this._currentIntent = intent;
		this._moleculeStates.clear();
		this._renderIntent(intent);
	}

	/**
	 * Returns a human-readable snapshot of all molecule states on the active canvas.
	 * Used by the chat agent to enrich the system prompt with live canvas context.
	 */
	getCanvasStateSnapshot(): string {
		if (this._moleculeStates.size === 0) {
			return '';
		}
		const parts: string[] = [];
		for (const [moleculeId, state] of this._moleculeStates) {
			const entries = Object.entries(state).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
			parts.push(`- ${moleculeId}: ${entries}`);
		}
		return parts.join('\n');
	}

	/**
	 * Returns the raw state map for a specific molecule. Used for state preservation
	 * during hot reload.
	 */
	getMoleculeState(moleculeId: string): Record<string, unknown> | undefined {
		return this._moleculeStates.get(moleculeId);
	}

	private _onMoleculeStateChange(change: IMoleculeStateChange): void {
		const current = this._moleculeStates.get(change.moleculeId) ?? {};
		this._moleculeStates.set(change.moleculeId, { ...current, [change.key]: change.value });
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
		const slotTargetId = slot.viewId ?? slot.moleculeId ?? 'unknown';

		// -- Header --
		const header = dom.append(slotEl, dom.$('.liquid-canvas-slot-header'));
		header.textContent = slot.label ?? slotTargetId;

		// -- Body --
		const body = dom.append(slotEl, dom.$('.liquid-canvas-slot-body'));

		// Attempt molecule rendering
		if (slot.moleculeId) {
			const molecule = this.registry.molecules.find(m => m.id === slot.moleculeId);
			if (molecule) {
				// Sync placeholder while async molecule loads
				const loading = dom.append(body, dom.$('div'));
				loading.textContent = `Loading ${molecule.label}...`;
				loading.style.color = 'var(--vscode-descriptionForeground)';
				loading.style.fontStyle = 'italic';

				this._renderMoleculeWebview(body, molecule, slot.params).then(() => {
					loading.remove();
				}).catch(err => {
					loading.textContent = `Molecule error: ${molecule.id} - ${err}`;
					loading.style.color = 'var(--vscode-errorForeground)';
					this.logService.error(`[Phonon Canvas] Molecule render failed: ${molecule.id}`, err);
				});
				return;
			}
		}

		// Fallback: placeholder for views or unknown molecules
		const viewLine = dom.append(body, dom.$('div'));
		viewLine.textContent = slot.moleculeId ? `Molecule: ${slot.moleculeId}` : `View: ${slotTargetId}`;

		if (slot.params && Object.keys(slot.params).length > 0) {
			const paramsBlock = dom.append(body, dom.$('pre.liquid-canvas-slot-params'));
			paramsBlock.textContent = JSON.stringify(slot.params, null, 2);
		}
	}

	/**
	 * Render a molecule inside a sandboxed iframe with a postMessage bridge shim.
	 *
	 * The iframe receives `srcdoc` containing the molecule HTML plus a bridge
	 * script that exposes `window.phonon` inside the sandbox. Communication
	 * flows via postMessage through a LiquidMoleculeSlotHost that routes data
	 * requests to ILiquidDataResolver.
	 *
	 * Relationship graph:
	 *   molecule HTML (disk) -> srcdoc (iframe sandbox)
	 *   bridge shim (window.phonon) <-> postMessage <-> LiquidMoleculeSlotHost
	 *   LiquidMoleculeSlotHost -> ILiquidDataResolver
	 */
	private async _renderMoleculeWebview(
		container: HTMLElement,
		molecule: ILiquidMolecule,
		params?: Record<string, unknown>,
	): Promise<void> {
		this.logService.info(`[Phonon Canvas] Reading molecule: ${molecule.id} from ${molecule.entryUri.toString()}`);

		let moleculeHtml: string;
		try {
			const fileContent = await this.fileService.readFile(molecule.entryUri);
			moleculeHtml = fileContent.value.toString();
		} catch (err) {
			this.logService.warn(`[Phonon Canvas] Failed to read molecule HTML: ${molecule.id}`, err);
			const errorEl = dom.append(container, dom.$('div'));
			errorEl.textContent = `Molecule load error: ${molecule.id}`;
			errorEl.style.color = 'var(--vscode-errorForeground)';
			return;
		}

		// Create sandboxed iframe
		const iframe = document.createElement('iframe');
		iframe.sandbox.add('allow-scripts');
		iframe.style.width = '100%';
		iframe.style.height = '100%';
		iframe.style.border = 'none';

		// Build srcdoc: bridge shim + molecule HTML
		const bridgeShim = this._buildBridgeShim(molecule.id, molecule.entity, params);
		const srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
	body { margin: 0; font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif); color: var(--vscode-foreground, #ccc); background: transparent; }
</style>
</head>
<body>
${moleculeHtml}
<script>${bridgeShim}</script>
</body>
</html>`;

		// Use TrustedTypes if available
		if (ttPolicy) {
			iframe.srcdoc = ttPolicy.createHTML(srcdoc) as unknown as string;
		} else {
			iframe.srcdoc = srcdoc;
		}

		container.appendChild(iframe);

		// Create slot host for message routing
		const slotHost = this._createSlotHost(iframe, molecule.id, molecule.entity, params);
		this._slotHosts.add(slotHost);

		// Watch molecule entry file for hot reload
		this._slotHosts.add(this._watchMoleculeForReload(container, iframe, molecule, params));

		this.logService.info(`[Phonon Canvas] Rendered molecule in iframe: ${molecule.id}`);
	}

	/**
	 * Watch a molecule's entry HTML file for changes. On change, preserve
	 * the molecule's state, remove the old iframe, and re-render.
	 */
	private _watchMoleculeForReload(
		container: HTMLElement,
		iframe: HTMLIFrameElement,
		molecule: ILiquidMolecule,
		params?: Record<string, unknown>,
	): IDisposable {
		const disposables = new DisposableStore();

		// Use a correlated file watcher so events only fire for this molecule's file
		const watcher = this.fileService.createWatcher(molecule.entryUri, { recursive: false, excludes: [] });
		disposables.add(watcher);

		disposables.add(watcher.onDidChange(() => {
			this.logService.info(`[Phonon Canvas] Hot reload: ${molecule.id}`);

			// Preserve state before destroying the iframe
			const savedState = this.getMoleculeState(molecule.id);

			// Remove old iframe
			iframe.remove();

			// Re-render with preserved state merged into params
			const reloadParams = savedState
				? { ...(params ?? {}), _restoredState: savedState }
				: params;

			this._renderMoleculeWebview(container, molecule, reloadParams).catch(err => {
				this.logService.error(`[Phonon Canvas] Hot reload failed: ${molecule.id}`, err);
			});
		}));

		return disposables;
	}

	/**
	 * Build the ES5-compatible bridge shim injected inside the molecule iframe.
	 *
	 * Exposes `window.phonon` with data.fetch, data.mutate, navigate, intent,
	 * setTitle, setLoading, onParams, onReady, and params. All calls route
	 * through postMessage to the parent window.
	 */
	private _buildBridgeShim(moleculeId: string, entity: string | undefined, params: Record<string, unknown> | undefined): string {
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
	 * Create a LiquidMoleculeSlotHost wired to a raw iframe via postMessage.
	 *
	 * Returns a composite IDisposable that tears down the message listener,
	 * the emitter, and the slot host.
	 */
	private _createSlotHost(
		iframe: HTMLIFrameElement,
		moleculeId: string,
		entity: string | undefined,
		params: Record<string, unknown> | undefined,
	): IDisposable {
		// Extract restored state from params (injected by hot reload) before passing to host
		let restoredState: Record<string, unknown> | undefined;
		let cleanParams = params;
		if (params && params._restoredState !== undefined) {
			restoredState = params._restoredState as Record<string, unknown>;
			const { _restoredState: _, ...rest } = params;
			cleanParams = Object.keys(rest).length > 0 ? rest : undefined;
		}

		// Adapt the raw iframe to IMoleculeWebview
		const onMessage = new Emitter<MoleculeToHostMessage>();

		const messageHandler = (event: MessageEvent) => {
			if (event.source === iframe.contentWindow) {
				onMessage.fire(event.data);
			}
		};
		dom.getWindow(this._container ?? iframe).addEventListener('message', messageHandler);

		const webviewAdapter: IMoleculeWebview = {
			postMessage: async (msg: HostToMoleculeMessage) => {
				if (iframe.contentWindow) {
					iframe.contentWindow.postMessage(msg, '*');
					return true;
				}
				return false;
			},
			onDidReceiveMessage: onMessage.event,
		};

		const host = new LiquidMoleculeSlotHost(
			webviewAdapter, moleculeId, entity, cleanParams,
			this.dataResolver, this.logService,
		);

		// Wire molecule state changes to the canvas state aggregator
		const stateListener = host.onDidStateChange(change => this._onMoleculeStateChange(change));

		// If this is a hot reload with preserved state, push it after init
		if (restoredState) {
			const readyListener = webviewAdapter.onDidReceiveMessage(msg => {
				if (msg && msg.type === 'phonon:ready') {
					// Push state after the slot host has sent phonon:init
					setTimeout(() => host.pushState(restoredState!), 0);
					readyListener.dispose();
				}
			});
		}

		return {
			dispose: () => {
				stateListener.dispose();
				dom.getWindow(this._container ?? iframe).removeEventListener('message', messageHandler);
				onMessage.dispose();
				host.dispose();
			}
		};
	}
}
