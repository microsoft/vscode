/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { BreadcrumbsWidget } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { defaultBreadcrumbsWidgetStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { TextBreadcrumbItem } from './chatDebugTypes.js';
import { buildFlowGraph, layoutFlowGraph, renderFlowChartSVG } from './chatDebugFlowChart.js';

const $ = DOM.$;

export const enum FlowChartNavigation {
	Home = 'home',
	Overview = 'overview',
}

export class ChatDebugFlowChartView extends Disposable {

	private readonly _onNavigate = this._register(new Emitter<FlowChartNavigation>());
	readonly onNavigate = this._onNavigate.event;

	readonly container: HTMLElement;
	private readonly content: HTMLElement;
	private readonly breadcrumbWidget: BreadcrumbsWidget;
	private readonly loadDisposables = this._register(new DisposableStore());

	// Pan/zoom state
	private scale = 1;
	private translateX = 0;
	private translateY = 0;
	private isPanning = false;
	private startX = 0;
	private startY = 0;

	// Direct element references (avoid querySelector)
	private svgWrapper: HTMLElement | undefined;
	private svgElement: SVGElement | undefined;

	private currentSessionId: string = '';

	constructor(
		parent: HTMLElement,
		@IChatService private readonly chatService: IChatService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
	) {
		super();
		this.container = DOM.append(parent, $('.chat-debug-flowchart'));
		DOM.hide(this.container);

		// Breadcrumb
		const breadcrumbContainer = DOM.append(this.container, $('.chat-debug-breadcrumb'));
		this.breadcrumbWidget = this._register(new BreadcrumbsWidget(breadcrumbContainer, 3, undefined, Codicon.chevronRight, defaultBreadcrumbsWidgetStyles));
		this._register(this.breadcrumbWidget.onDidSelectItem(e => {
			if (e.type === 'select' && e.item instanceof TextBreadcrumbItem) {
				this.breadcrumbWidget.setSelection(undefined);
				const items = this.breadcrumbWidget.getItems();
				const idx = items.indexOf(e.item);
				if (idx === 0) {
					this._onNavigate.fire(FlowChartNavigation.Home);
				} else if (idx === 1) {
					this._onNavigate.fire(FlowChartNavigation.Overview);
				}
			}
		}));

		this.content = DOM.append(this.container, $('.chat-debug-flowchart-content'));

		// Set up pan/zoom event listeners
		this.setupPanZoom();
	}

	setSession(sessionId: string): void {
		this.currentSessionId = sessionId;
	}

	show(): void {
		DOM.show(this.container);
		this.load();
	}

	hide(): void {
		DOM.hide(this.container);
	}

	refresh(): void {
		if (this.container.style.display !== 'none') {
			this.load();
		}
	}

	updateBreadcrumb(): void {
		const sessionUri = LocalChatSessionUri.forSession(this.currentSessionId);
		const sessionTitle = this.chatService.getSessionTitle(sessionUri) || this.currentSessionId;
		this.breadcrumbWidget.setItems([
			new TextBreadcrumbItem(localize('chatDebug.title', "Chat Debug Panel"), true),
			new TextBreadcrumbItem(sessionTitle, true),
			new TextBreadcrumbItem(localize('chatDebug.flowChart', "Agent Flow Chart")),
		]);
	}

	private load(): void {
		DOM.clearNode(this.content);
		this.loadDisposables.clear();
		this.updateBreadcrumb();

		// Reset pan/zoom
		this.scale = 1;
		this.translateX = 0;
		this.translateY = 0;

		const events = this.chatDebugService.getEvents(this.currentSessionId);

		if (events.length === 0) {
			const emptyMsg = DOM.append(this.content, $('.chat-debug-flowchart-empty'));
			emptyMsg.textContent = localize('chatDebug.flowChart.noEvents', "No events recorded for this session.");
			return;
		}

		// Build and render the flow chart
		const flowNodes = buildFlowGraph(events);
		const layout = layoutFlowGraph(flowNodes);
		const svg = renderFlowChartSVG(layout);

		this.svgWrapper = DOM.append(this.content, $('.chat-debug-flowchart-svg-wrapper'));
		this.svgWrapper.appendChild(svg);
		this.svgElement = svg;

		// Center after layout
		DOM.getWindow(this.content).requestAnimationFrame(() => {
			this.centerContent();
		});
	}

	private setupPanZoom(): void {
		this.content.addEventListener('mousedown', e => this.handleMouseDown(e));
		const targetDocument = DOM.getWindow(this.content).document;
		this._register(DOM.addDisposableListener(targetDocument, DOM.EventType.MOUSE_MOVE, e => this.handleMouseMove(e)));
		this._register(DOM.addDisposableListener(targetDocument, DOM.EventType.MOUSE_UP, () => this.handleMouseUp()));
		this.content.addEventListener('wheel', e => this.handleWheel(e), { passive: false });
	}

	private handleMouseDown(e: MouseEvent): void {
		if (e.button !== 0) {
			return;
		}
		e.preventDefault();
		this.isPanning = true;
		this.startX = e.clientX - this.translateX;
		this.startY = e.clientY - this.translateY;
		this.content.style.cursor = 'grabbing';
	}

	private handleMouseMove(e: MouseEvent): void {
		if (!this.isPanning) {
			return;
		}
		if (e.buttons === 0) {
			this.handleMouseUp();
			return;
		}
		this.translateX = e.clientX - this.startX;
		this.translateY = e.clientY - this.startY;
		this.applyTransform();
	}

	private handleMouseUp(): void {
		if (this.isPanning) {
			this.isPanning = false;
			this.content.style.cursor = 'grab';
		}
	}

	private handleWheel(e: WheelEvent): void {
		e.preventDefault();
		e.stopPropagation();

		const rect = this.content.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		const zoomFactor = 0.002;
		const minScale = 0.1;
		const maxScale = 5;

		const delta = -e.deltaY * zoomFactor;
		const newScale = Math.min(maxScale, Math.max(minScale, this.scale * (1 + delta)));

		const scaleFactor = newScale / this.scale;
		this.translateX = mouseX - (mouseX - this.translateX) * scaleFactor;
		this.translateY = mouseY - (mouseY - this.translateY) * scaleFactor;
		this.scale = newScale;

		this.applyTransform();
	}

	private applyTransform(): void {
		if (this.svgWrapper) {
			this.svgWrapper.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
		}
	}

	private centerContent(): void {
		const containerRect = this.content.getBoundingClientRect();
		if (!this.svgElement) {
			return;
		}
		const svgWidth = parseFloat(this.svgElement.getAttribute('width') || '0');
		const svgHeight = parseFloat(this.svgElement.getAttribute('height') || '0');

		this.translateX = (containerRect.width - svgWidth) / 2;
		this.translateY = Math.max(20, (containerRect.height - svgHeight) / 2);
		this.applyTransform();
	}
}
