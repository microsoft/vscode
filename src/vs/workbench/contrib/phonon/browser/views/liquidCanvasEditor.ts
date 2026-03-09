/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
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
import { ILiquidDataResolver } from '../liquidMoleculeBridge.js';
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
		this._renderIntent(intent);
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
	 * Render a molecule directly into the slot body DOM.
	 *
	 * Phase 1: direct DOM injection + window.phonon bridge for data binding.
	 * Molecule HTML is read from disk, styles/markup injected into container,
	 * scripts extracted and executed with the bridge API on window.phonon.
	 *
	 * Phase 2+: migrate to sandboxed iframe/WebviewElement for isolation.
	 */
	private async _renderMoleculeWebview(
		container: HTMLElement,
		molecule: ILiquidMolecule,
		params?: Record<string, unknown>,
	): Promise<void> {
		// Read molecule HTML content from disk
		this.logService.info(`[Phonon Canvas] Reading molecule: ${molecule.id} from ${molecule.entryUri.toString()}`);
		let moleculeHtmlContent: string;
		try {
			const fileContent = await this.fileService.readFile(molecule.entryUri);
			moleculeHtmlContent = fileContent.value.toString();
			this.logService.info(`[Phonon Canvas] Read ${moleculeHtmlContent.length} bytes for molecule ${molecule.id}`);
		} catch (err) {
			this.logService.warn(`[Phonon Canvas] Failed to read molecule HTML: ${molecule.id}`, err);
			const errorEl = dom.append(container, dom.$('div'));
			errorEl.textContent = `Molecule load error: ${molecule.id}`;
			errorEl.style.color = 'var(--vscode-errorForeground)';
			return;
		}

		// Install bridge API on window (molecules expect window.phonon)
		const win = this.window as unknown as { phonon?: unknown };
		let readyCbs: Array<() => void> = [];
		win.phonon = {
			data: {
				fetch: (entity: string, query?: Record<string, unknown>) => {
					return this.dataResolver.fetch(entity, query);
				},
				mutate: (entity: string, operation: 'create' | 'update' | 'delete', data: unknown) => {
					return this.dataResolver.mutate(entity, operation, data);
				}
			},
			navigate: (viewId: string) => { this.logService.info(`[Phonon Molecule] Navigate: ${viewId}`); },
			intent: (description: string) => { this.logService.info(`[Phonon Molecule] Intent: ${description}`); },
			setTitle: () => { /* future */ },
			setLoading: () => { /* future */ },
			onReady: (cb: () => void) => { readyCbs.push(cb); },
			params: params ?? {},
		};

		// Parse molecule HTML: inject markup, extract scripts
		const template = document.createElement('template');
		// Trusted Types policy required by VS Code CSP
		if (ttPolicy) {
			template.innerHTML = ttPolicy.createHTML(moleculeHtmlContent) as unknown as string;
		} else {
			template.innerHTML = moleculeHtmlContent;
		}
		const fragment = template.content;

		// Extract <script> elements from the fragment before DOM injection.
		// We walk the tree manually to avoid querySelectorAll (fragile selector).
		const scripts: string[] = [];
		const scriptNodes: Element[] = [];
		const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT, {
			acceptNode: (node) => (node as Element).tagName === 'SCRIPT' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
		});
		let cur = walker.nextNode();
		while (cur) {
			scriptNodes.push(cur as Element);
			cur = walker.nextNode();
		}
		for (const s of scriptNodes) {
			scripts.push(s.textContent ?? '');
			s.remove();
		}

		// Inject styles + markup into container
		container.appendChild(fragment);

		// Execute molecule scripts (innerHTML doesn't run <script> tags)
		for (const cb of readyCbs) { cb(); }
		readyCbs = [];
		for (const scriptText of scripts) {
			try {
				const scriptEl = document.createElement('script');
				scriptEl.textContent = scriptText;
				container.appendChild(scriptEl);
			} catch (err) {
				this.logService.warn(`[Phonon Canvas] Molecule script error in ${molecule.id}:`, err);
			}
		}

		this._slotHosts.add({ dispose: () => { delete win.phonon; } });
		this.logService.info(`[Phonon Canvas] Rendered molecule direct: ${molecule.id}`);
	}
}
