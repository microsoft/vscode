/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
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
import { IWebviewService } from '../../../webview/browser/webview.js';
import { ILiquidModuleRegistry } from '../../common/liquidModule.js';
import { ICompositionIntent, ICompositionSlot, ILiquidCard, CompositionLayout } from '../../common/liquidModuleTypes.js';
import { ILiquidDataResolver, LiquidCardSlotHost } from '../liquidCardBridge.js';
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
		const rowCount = Math.ceil(slots.length / colCount);
		return { columns: `repeat(${colCount}, 1fr)`, rows: `repeat(${rowCount}, 1fr)` };
	},
	'stack': (slots) => {
		const rows = slots.map(s => s.weight ? `${s.weight}fr` : 'minmax(150px, 1fr)').join(' ');
		return { columns: '1fr', rows };
	},
};

/**
 * Bridge script injected into every card webview.
 * Provides the `window.phonon` API for card developers. Inlined to avoid
 * a runtime file read -- the source of truth is phonon-card-bridge.js.
 */
function getBridgeScript(): string {
	// The bridge detects acquireVsCodeApi for WebviewElement transport and
	// falls back to window.parent.postMessage for raw iframe transport.
	return [
		'(function(){',
		'"use strict";',
		'var vscodeApi=(typeof acquireVsCodeApi==="function")?acquireVsCodeApi():null;',
		'function sendToHost(m){if(vscodeApi){vscodeApi.postMessage(m);}else{window.parent.postMessage(m,"*");}}',
		'var pending=new Map();var readyCallbacks=[];var initialized=false;',
		'window.phonon={data:{',
		'fetch:function(e,q){return sendReq("phonon:data:fetch",{entity:e,query:q});},',
		'mutate:function(e,op,d){return sendReq("phonon:data:mutate",{entity:e,operation:op,data:d});}',
		'},',
		'navigate:function(v,p){sendToHost({type:"phonon:navigate",viewId:v,params:p});},',
		'intent:function(d){sendToHost({type:"phonon:intent",description:d});},',
		'setTitle:function(t){sendToHost({type:"phonon:setTitle",title:t});},',
		'setLoading:function(l){sendToHost({type:"phonon:setLoading",loading:l});},',
		'onReady:function(cb){if(initialized){cb();}else{readyCallbacks.push(cb);}},',
		'params:{}};',
		'function genId(){return Date.now().toString(36)+"-"+Math.random().toString(36).substring(2,10);}',
		'function sendReq(type,payload){return new Promise(function(resolve,reject){',
		'var rid=genId();pending.set(rid,{resolve:resolve,reject:reject});',
		'var msg={type:type,requestId:rid};for(var k in payload){if(Object.prototype.hasOwnProperty.call(payload,k)){msg[k]=payload[k];}}',
		'sendToHost(msg);});}',
		'window.addEventListener("message",function(event){',
		'var msg=event.data;if(!msg||!msg.type){return;}',
		'if(msg.type==="phonon:data:response"){var p=pending.get(msg.requestId);if(p){pending.delete(msg.requestId);if(msg.success){p.resolve(msg.data);}else{p.reject(new Error(msg.error||"Unknown error"));}}}',
		'else if(msg.type==="phonon:params"){window.phonon.params=msg.params||{};}',
		'else if(msg.type==="phonon:init"){initialized=true;var cbs=readyCallbacks;readyCallbacks=[];for(var i=0;i<cbs.length;i++){cbs[i]();}}',
		'});',
		'sendToHost({type:"phonon:ready"});',
		'})();',
	].join('\n');
}

/**
 * Editor pane that renders composition intents as CSS grid layouts.
 *
 * Each card slot is rendered as a VS Code WebviewElement (sandboxed, CSP-managed,
 * remote-lifecycle-safe). The webview communicates with the host via postMessage
 * and the host routes data requests through ILiquidDataResolver.
 *
 * Relationship graph:
 *   LiquidCanvasEditor -> (IWebviewService) -> WebviewElement per card
 *   WebviewElement <-> LiquidCardSlotHost <-> ILiquidDataResolver
 *   ILiquidModuleRegistry -> card metadata (entryUri, entity, tags)
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
		@IWebviewService private readonly webviewService: IWebviewService,
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
		const slotTargetId = slot.viewId ?? slot.cardId ?? 'unknown';

		// -- Header --
		const header = dom.append(slotEl, dom.$('.liquid-canvas-slot-header'));
		header.textContent = slot.label ?? slotTargetId;

		// -- Body --
		const body = dom.append(slotEl, dom.$('.liquid-canvas-slot-body'));

		// Attempt card rendering via WebviewElement
		if (slot.cardId) {
			const card = this.registry.cards.find(c => c.id === slot.cardId);
			if (card) {
				this._renderCardWebview(body, card, slot.params);
				return;
			}
		}

		// Fallback: placeholder for views or unknown cards
		const viewLine = dom.append(body, dom.$('div'));
		viewLine.textContent = slot.cardId ? `Card: ${slot.cardId}` : `View: ${slotTargetId}`;

		if (slot.params && Object.keys(slot.params).length > 0) {
			const paramsBlock = dom.append(body, dom.$('pre.liquid-canvas-slot-params'));
			paramsBlock.textContent = JSON.stringify(slot.params, null, 2);
		}
	}

	/**
	 * Render a card inside a WebviewElement.
	 *
	 * Reads the card HTML from disk via IFileService, wraps it with the bridge
	 * script, and sets it via setHtml(). No in-webview fetch -- avoids CSP issues.
	 */
	private async _renderCardWebview(
		container: HTMLElement,
		card: ILiquidCard,
		params?: Record<string, unknown>,
	): Promise<void> {
		// Read card HTML content from disk
		let cardHtmlContent: string;
		try {
			const fileContent = await this.fileService.readFile(card.entryUri);
			cardHtmlContent = fileContent.value.toString();
		} catch (err) {
			this.logService.warn(`[Phonon Canvas] Failed to read card HTML: ${card.id}`, err);
			const errEl = dom.append(container, dom.$('div'));
			errEl.textContent = `Card load error: ${card.id}`;
			return;
		}

		// Create a managed webview element
		const webview = this.webviewService.createWebviewElement({
			providedViewType: 'phonon.liquidCard',
			title: card.label,
			options: {
				enableFindWidget: false,
			},
			contentOptions: {
				allowScripts: true,
				localResourceRoots: [],
			},
			extension: undefined,
		});

		// Build full HTML: bridge script + card content inlined
		const bridgeScript = getBridgeScript();
		webview.setHtml([
			'<!DOCTYPE html>',
			'<html>',
			'<head>',
			'<meta charset="utf-8">',
			'<style>',
			'*{margin:0;padding:0;box-sizing:border-box;}',
			'body{font-family:var(--vscode-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);',
			'color:var(--vscode-foreground,#ccc);background:transparent;padding:8px;',
			'font-size:var(--vscode-font-size,13px);}',
			'</style>',
			`<script>${bridgeScript}<\/script>`,
			'</head>',
			'<body>',
			cardHtmlContent,
			'</body>',
			'</html>',
		].join('\n'));

		// Mount the webview DOM element into the slot body
		webview.mountTo(container, this.window);

		// Wire host-side message routing through the abstraction layer.
		// WebviewElement.onMessage carries { message, transfer? } -- unwrap to get
		// the raw CardToHostMessage that LiquidCardSlotHost expects.
		const host = new LiquidCardSlotHost(
			{
				postMessage: (msg) => webview.postMessage(msg),
				onDidReceiveMessage: Event.map(webview.onMessage, e => e.message),
			},
			card.id,
			card.entity,
			params,
			this.dataResolver,
			this.logService,
		);

		// Track both disposables so they are cleaned up on re-render
		this._slotHosts.add(webview);
		this._slotHosts.add(host);

		this.logService.info(`[Phonon Canvas] Rendered card webview: ${card.id}`);
	}
}
