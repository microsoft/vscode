/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/ros2Graph.css';
import { $, addDisposableListener, Dimension, EventType, getWindow, isHTMLElement } from '../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { computeRos2GraphLayout, Ros2GraphEdge, Ros2GraphLayoutResult, Ros2GraphVertex } from '../common/ros2GraphLayout.js';
import { communicationsForNode, parametersForNode, Ros2WorkspaceGraph } from '../common/ros2WorkspaceModel.js';
import { IRos2WorkspaceService } from '../common/ros2WorkspaceService.js';
import { IndexRos2WorkspaceAction } from './ros2WorkspaceActions.js';

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

/**
 * The ROS2 communication graph editor (REQ-5): renders the WKG's node-topic
 * graph as positioned HTML vertices over an SVG edge layer, with pan/zoom,
 * click-highlighting and hovers. Re-renders on {@link IRos2WorkspaceService}
 * graph changes, preserving the viewport.
 */
export class Ros2GraphEditor extends EditorPane {

	static readonly ID = 'roboagent.ros2GraphEditor';

	private container!: HTMLElement;
	private viewport!: HTMLElement;
	private edgeLayer!: SVGSVGElement;
	private emptyState!: HTMLElement;

	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly dragListeners = this._register(new MutableDisposable<DisposableStore>());
	private layoutResult: Ros2GraphLayoutResult | undefined;
	private vertexElements = new Map<string, HTMLElement>();
	private edgeElements: { edge: Ros2GraphEdge; element: SVGPathElement }[] = [];
	private selectedId: string | undefined;

	private scale = 1;
	private translateX = 0;
	private translateY = 0;
	private needsInitialFit = true;
	private dimension: Dimension | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IRos2WorkspaceService private readonly ros2WorkspaceService: IRos2WorkspaceService,
		@IHoverService private readonly hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(Ros2GraphEditor.ID, group, telemetryService, themeService, storageService);

		this._register(this.ros2WorkspaceService.onDidChangeGraph(() => this.render()));
	}

	protected createEditor(parent: HTMLElement): void {
		this.container = parent.appendChild($('.ros2-graph-editor'));
		this.container.tabIndex = 0;

		this.viewport = this.container.appendChild($('.ros2-graph-viewport'));
		this.emptyState = this.container.appendChild($('.ros2-graph-empty'));
		this.createToolbar();

		// Pan: drag the background. Zoom: mouse wheel around the cursor.
		this._register(addDisposableListener(this.container, EventType.POINTER_DOWN, e => this.onPointerDown(e)));
		this._register(addDisposableListener(this.container, EventType.WHEEL, (e: WheelEvent) => this.onWheel(e), { passive: false }));
		this._register(addDisposableListener(this.container, EventType.CLICK, e => {
			if (e.target === this.container || e.target === this.viewport || e.target === this.edgeLayer) {
				this.select(undefined);
			}
		}));

		this.render();
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this.render();
	}

	override layout(dimension: Dimension): void {
		this.dimension = dimension;
		if (this.needsInitialFit) {
			this.fit();
		}
	}

	override focus(): void {
		super.focus();
		this.container.focus();
	}

	// --- Rendering ----------------------------------------------------------

	private render(): void {
		if (!this.viewport) {
			return;
		}
		this.renderDisposables.clear();
		this.viewport.textContent = '';
		this.vertexElements = new Map();
		this.edgeElements = [];

		const graph = this.ros2WorkspaceService.getGraph();
		const layout = this.layoutResult = computeRos2GraphLayout(graph);

		const isEmpty = layout.vertices.length === 0;
		this.emptyState.classList.toggle('visible', isEmpty);
		this.viewport.classList.toggle('hidden', isEmpty);
		this.renderEmptyState(isEmpty);
		if (isEmpty) {
			return;
		}

		// Note: class always goes through the attrs bag — `$.SVG('svg.cls')` would
		// assign the read-only SVGElement.className and throw.
		this.edgeLayer = this.viewport.appendChild($.SVG<SVGSVGElement>('svg', {
			class: 'ros2-graph-edges',
			width: String(layout.width), height: String(layout.height),
			viewBox: `0 0 ${layout.width} ${layout.height}`
		}));
		const marker = $.SVG<SVGMarkerElement>('marker', {
			id: 'roboagent-graph-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5',
			markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse'
		});
		marker.appendChild($.SVG('path', { class: 'ros2-graph-arrow', d: 'M 0 0 L 10 5 L 0 10 z' }));
		this.edgeLayer.appendChild($.SVG('defs')).appendChild(marker);
		for (const edge of layout.edges) {
			this.renderEdge(edge, layout);
		}
		for (const vertex of layout.vertices) {
			this.renderVertex(vertex, graph);
		}

		this.select(this.selectedId && this.vertexElements.has(this.selectedId) ? this.selectedId : undefined);
		if (this.needsInitialFit) {
			this.fit();
		} else {
			this.applyTransform();
		}
	}

	private renderVertex(vertex: Ros2GraphVertex, graph: Ros2WorkspaceGraph): void {
		const element = this.viewport.appendChild($(`.ros2-graph-vertex.${vertex.kind}`));
		element.style.left = `${vertex.x}px`;
		element.style.top = `${vertex.y}px`;
		element.style.width = `${vertex.width}px`;
		element.style.height = `${vertex.height}px`;
		if (vertex.kind === 'node' && vertex.language && vertex.language !== 'unknown') {
			element.classList.add(`language-${vertex.language}`);
		}
		element.appendChild($('span.ros2-graph-label', undefined, vertex.label));
		if (vertex.sublabel) {
			element.appendChild($('span.ros2-graph-sublabel', undefined, vertex.sublabel));
		}
		element.tabIndex = -1;
		element.setAttribute('role', 'button');
		element.ariaLabel = vertex.sublabel ? `${vertex.label} (${vertex.sublabel})` : vertex.label;

		this.renderDisposables.add(addDisposableListener(element, EventType.CLICK, e => {
			e.stopPropagation();
			this.select(this.selectedId === vertex.id ? undefined : vertex.id);
		}));
		this.renderDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), element,
			() => ({ markdown: this.hoverContent(vertex, graph), markdownNotSupportedFallback: undefined })));

		this.vertexElements.set(vertex.id, element);
	}

	private renderEdge(edge: Ros2GraphEdge, layout: Ros2GraphLayoutResult): void {
		const source = layout.vertices.find(v => v.id === edge.source);
		const target = layout.vertices.find(v => v.id === edge.target);
		if (!source || !target) {
			return;
		}
		const y1 = source.y + source.height / 2;
		const y2 = target.y + target.height / 2;
		let d: string;
		if (target.x >= source.x + source.width) {
			// Forward edge: right side of the source to the left side of the target.
			const x1 = source.x + source.width;
			const x2 = target.x;
			const reach = Math.max(40, (x2 - x1) / 2);
			d = `M ${x1} ${y1} C ${x1 + reach} ${y1}, ${x2 - reach} ${y2}, ${x2} ${y2}`;
		} else {
			// Back edge (cycle): leave the source's left side, arc below the rows,
			// enter the target's right side — instead of swinging off-canvas.
			const x1 = source.x;
			const x2 = target.x + target.width;
			const dip = Math.max(y1 + source.height, y2 + target.height) + 40;
			d = `M ${x1} ${y1} C ${x1 - 80} ${dip}, ${x2 + 80} ${dip}, ${x2} ${y2}`;
		}
		const path = this.edgeLayer.appendChild($.SVG<SVGPathElement>('path', { class: 'ros2-graph-edge', d }));
		if (edge.kind !== 'topic') {
			path.classList.add('service');
		}
		this.edgeElements.push({ edge, element: path });
	}

	private renderEmptyState(isEmpty: boolean): void {
		this.emptyState.textContent = '';
		if (!isEmpty) {
			return;
		}
		this.emptyState.appendChild($('p', undefined, localize('roboagent.graph.empty', "No ROS2 communications indexed yet. Open a colcon workspace and index it to see how its nodes connect.")));
		const link = this.emptyState.appendChild($('a.ros2-graph-empty-link', { role: 'button', tabindex: '0' }, localize('roboagent.graph.emptyIndex', "Index ROS2 Workspace")));
		this.renderDisposables.add(addDisposableListener(link, EventType.CLICK, () => this.commandService.executeCommand(IndexRos2WorkspaceAction.ID)));
		this.renderDisposables.add(addDisposableListener(link, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				this.commandService.executeCommand(IndexRos2WorkspaceAction.ID);
			}
		}));
	}

	private hoverContent(vertex: Ros2GraphVertex, graph: Ros2WorkspaceGraph): MarkdownString {
		const content = new MarkdownString();
		if (vertex.kind === 'node') {
			const [pkg, node] = [vertex.sublabel ?? '', vertex.label];
			content.appendMarkdown(`**${node}**\n\n`);
			content.appendText(localize('roboagent.graph.hoverPackage', "Package: {0}", pkg));
			if (vertex.language && vertex.language !== 'unknown') {
				content.appendText('\n' + localize('roboagent.graph.hoverLanguage', "Language: {0}", vertex.language === 'cpp' ? 'C++' : 'Python'));
			}
			const comms = communicationsForNode(graph, pkg, node);
			const count = (kind: string) => comms.filter(c => c.kind === kind).length;
			content.appendText('\n' + localize('roboagent.graph.hoverEndpoints', "Publishes: {0} · Subscribes: {1} · Services: {2} · Actions: {3} · Parameters: {4}",
				count('publisher'), count('subscriber'), count('service_server') + count('service_client'),
				count('action_server') + count('action_client'), parametersForNode(graph, pkg, node).length));
		} else {
			const topic = graph.topics.find(t => t.name === vertex.label);
			content.appendMarkdown(`**${vertex.label}**\n\n`);
			if (vertex.sublabel) {
				content.appendText(localize('roboagent.graph.hoverType', "Type: {0}", vertex.sublabel));
			}
			if (topic) {
				content.appendText('\n' + localize('roboagent.graph.hoverPubs', "Publishers: {0}", topic.publishers.join(', ') || '—'));
				content.appendText('\n' + localize('roboagent.graph.hoverSubs', "Subscribers: {0}", topic.subscribers.join(', ') || '—'));
			}
		}
		return content;
	}

	// --- Selection / highlight ---------------------------------------------

	private select(id: string | undefined): void {
		this.selectedId = id;
		const connected = new Set<string>();
		if (id) {
			connected.add(id);
			for (const { edge } of this.edgeElements) {
				if (edge.source === id) {
					connected.add(edge.target);
				}
				if (edge.target === id) {
					connected.add(edge.source);
				}
			}
		}
		for (const [vertexId, element] of this.vertexElements) {
			element.classList.toggle('selected', vertexId === id);
			element.classList.toggle('dimmed', !!id && !connected.has(vertexId));
		}
		for (const { edge, element } of this.edgeElements) {
			const active = !!id && (edge.source === id || edge.target === id);
			element.classList.toggle('highlighted', active);
			element.classList.toggle('dimmed', !!id && !active);
		}
	}

	// --- Pan / zoom ---------------------------------------------------------

	private createToolbar(): void {
		const toolbar = this.container.appendChild($('.ros2-graph-toolbar'));
		const button = (icon: ThemeIcon, label: string, action: () => void) => {
			const element = toolbar.appendChild($('button.ros2-graph-toolbar-button'));
			element.appendChild($(`span.${ThemeIcon.asClassName(icon).replaceAll(' ', '.')}`));
			element.ariaLabel = label;
			this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), element, label));
			this._register(addDisposableListener(element, EventType.CLICK, action));
		};
		button(Codicon.zoomIn, localize('roboagent.graph.zoomIn', "Zoom In"), () => this.zoom(1.25));
		button(Codicon.zoomOut, localize('roboagent.graph.zoomOut', "Zoom Out"), () => this.zoom(1 / 1.25));
		button(Codicon.screenFull, localize('roboagent.graph.fit', "Fit to View"), () => this.fit());
	}

	private zoom(factor: number, centerX?: number, centerY?: number): void {
		const rect = this.container.getBoundingClientRect();
		const cx = centerX ?? rect.width / 2;
		const cy = centerY ?? rect.height / 2;
		const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
		const applied = next / this.scale;
		this.translateX = cx - (cx - this.translateX) * applied;
		this.translateY = cy - (cy - this.translateY) * applied;
		this.scale = next;
		this.applyTransform();
	}

	private fit(): void {
		if (!this.layoutResult || !this.dimension || this.layoutResult.vertices.length === 0 || this.dimension.width === 0) {
			return;
		}
		const scale = Math.min(1.5, Math.max(MIN_SCALE, Math.min(
			this.dimension.width / this.layoutResult.width,
			this.dimension.height / this.layoutResult.height)));
		this.scale = scale;
		this.translateX = Math.max(0, (this.dimension.width - this.layoutResult.width * scale) / 2);
		this.translateY = Math.max(0, (this.dimension.height - this.layoutResult.height * scale) / 2);
		this.needsInitialFit = false;
		this.applyTransform();
	}

	private onWheel(e: WheelEvent): void {
		e.preventDefault();
		const rect = this.container.getBoundingClientRect();
		this.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - rect.left, e.clientY - rect.top);
	}

	private onPointerDown(e: PointerEvent): void {
		// Vertices handle their own clicks; everything else drags the canvas.
		if (e.button !== 0 || (isHTMLElement(e.target) && e.target.closest('.ros2-graph-vertex, .ros2-graph-toolbar, .ros2-graph-empty'))) {
			return;
		}
		e.preventDefault();
		const startX = e.clientX - this.translateX;
		const startY = e.clientY - this.translateY;
		const window = getWindow(this.container);
		const listeners = this.dragListeners.value = new DisposableStore();
		listeners.add(addDisposableListener(window, EventType.POINTER_MOVE, (move: PointerEvent) => {
			this.translateX = move.clientX - startX;
			this.translateY = move.clientY - startY;
			this.container.classList.add('panning');
			this.applyTransform();
		}));
		listeners.add(addDisposableListener(window, EventType.POINTER_UP, () => {
			this.container.classList.remove('panning');
			this.dragListeners.clear();
		}));
	}

	private applyTransform(): void {
		this.viewport.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
	}
}
