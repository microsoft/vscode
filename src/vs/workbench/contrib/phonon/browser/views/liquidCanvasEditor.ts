/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { ICompositionIntent, ICompositionSlot, CompositionLayout } from '../../common/liquidModuleTypes.js';
import { LiquidCanvasEditorInput } from './liquidCanvasEditorInput.js';

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
		return { columns: `repeat(${colCount}, 1fr)`, rows: 'auto' };
	},
	'stack': (slots) => {
		const rows = slots.map(() => 'auto').join(' ');
		return { columns: '1fr', rows };
	},
};

/**
 * Editor pane that renders composition intents as CSS grid layouts.
 *
 * MVP: pure DOM rendering -- no webview. Each composition slot is a styled
 * div showing the viewId and params. Actual component loading deferred to
 * future tasks.
 */
export class LiquidCanvasEditor extends EditorPane {

	static readonly ID = LiquidCanvasEditorInput.EditorID;

	private _container: HTMLElement | undefined;
	private _currentIntent: ICompositionIntent | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
	) {
		super(LiquidCanvasEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this._container = dom.append(parent, dom.$('.liquid-canvas-container'));
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
		const slotTargetId = slot.viewId ?? slot.cardId ?? 'unknown';

		// -- Header --
		const header = dom.append(slotEl, dom.$('.liquid-canvas-slot-header'));
		header.textContent = slot.label ?? slotTargetId;

		// -- Body --
		const body = dom.append(slotEl, dom.$('.liquid-canvas-slot-body'));

		const targetLine = dom.append(body, dom.$('div'));
		targetLine.textContent = slot.cardId ? `Card: ${slot.cardId}` : `View: ${slotTargetId}`;

		if (slot.params && Object.keys(slot.params).length > 0) {
			const paramsBlock = dom.append(body, dom.$('pre.liquid-canvas-slot-params'));
			paramsBlock.textContent = JSON.stringify(slot.params, null, 2);
		}
	}
}
