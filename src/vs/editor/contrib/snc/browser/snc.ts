/* eslint-disable header/header */
import { registerEditorContribution, EditorContributionInstantiation } from '../../../browser/editorExtensions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { ICodeEditor, IViewZone, IOverlayWidget, IOverlayWidgetPosition, IOverlayWidgetPositionCoordinates } from '../../../browser/editorBrowser.js';
import { Position } from '../../../common/core/position.js';
import { IModelContentChangedEvent } from '../../../common/textModelEvents.js';
import { IProcessOptions, IVisualizationItem, SNCCommand, SNCStreamMessage, SNCTimingData, UiEvent } from '../../../../platform/snc/common/snc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { createTrustedTypesPolicy } from '../../../../base/browser/trustedTypes.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import * as dom from '../../../../base/browser/dom.js';
import './snc.css';

// 'sncVisualization' is a trusted name defined in src/vs/code/electron-sandbox/workbench/workbench(-dev).html
const ttPolicy = createTrustedTypesPolicy('sncVisualization', { createHTML: value => value });


// /**
//  * Determines if a visualization should be positioned as a block (between lines) vs inline (at end of line)
//  */
// function shouldUseBlockLayout(html: string): boolean {
// 	// Check for HTML tables (pandas DataFrames)
// 	if (html.includes('<table>')) {
// 		return true;
// 	}

// 	// Check for multiple line breaks (multi-line content)
// 	const brCount = (html.match(/<br>/gi) || []).length;
// 	if (brCount >= 2) {
// 		return true;
// 	}

// 	// Check for long content that would overflow inline
// 	const textContent = html.replace(/<[^>]*>/g, ''); // Strip HTML tags
// 	if (textContent.length > 200) {
// 		return true;
// 	}

// 	return false;
// }

/**
 * Widget that displays visualization data for a specific line of code.
 */
class VisualizationWidget extends Disposable implements IOverlayWidget {
	private readonly editor: ICodeEditor;
	private readonly domNode: HTMLElement;
	private position: Position | null = null;
	private lastOnscreenPixelPosition: IOverlayWidgetPositionCoordinates | null = null;
	private readonly visIndex: number;
	private readonly lineNumber: number;
	private readonly onPointerEvent: (pythonEventStr: string, ev: MouseEvent) => void;
	private readonly onKeyboardEvent: (pythonEventStr: string, ev: KeyboardEvent) => void;
	private moveThrottleTimer: any = null;
	private readonly moveThrottleDelay = 16;

	constructor(editor: ICodeEditor, lineNumber: number, visIndex: number, onPointerEvent: (pythonEventStr: string, ev: MouseEvent) => void, onKeyboardEvent: (pythonEventStr: string, ev: KeyboardEvent) => void) {
		super();
		this.editor = editor;
		this.position = new Position(lineNumber, 1);
		this.visIndex = visIndex;
		this.lineNumber = lineNumber;
		this.onPointerEvent = onPointerEvent;
		this.onKeyboardEvent = onKeyboardEvent;

		// Create the widget DOM node
		this.domNode = document.createElement('div');
		this.domNode.className = 'snc-visualization-widget';

		// Add custom mouse wheel event handling to actually scroll
		this._register(dom.addDisposableListener(this.domNode, 'wheel', (e: WheelEvent) => {

			const oldScrollTop = this.domNode.scrollTop;
			const oldScrollLeft = this.domNode.scrollLeft;

			this.domNode.scrollTop += e.deltaY;
			this.domNode.scrollLeft += e.deltaX;

			if (oldScrollTop != this.domNode.scrollTop || oldScrollLeft != this.domNode.scrollLeft) {
				e.preventDefault();
				e.stopPropagation();
			}
		}));


		this._register(dom.addDisposableListener(this.domNode, 'mousedown', (ev: MouseEvent) => {
			this.dispatch_as_python_event('snc-mouse-down', ev);
		}));
		this._register(dom.addDisposableListener(this.domNode, 'mousemove', (ev: MouseEvent) => {
			if (this.moveThrottleTimer) { return; }
			this.moveThrottleTimer = setTimeout(() => { this.moveThrottleTimer = null; }, this.moveThrottleDelay);
			this.dispatch_as_python_event('snc-mouse-move', ev);
		}));
		this._register(dom.addDisposableListener(this.domNode, 'mouseup', (ev: MouseEvent) => {
			this.dispatch_as_python_event('snc-mouse-up', ev);
		}));
		this._register(dom.addDisposableListener(this.domNode, 'keydown', (ev: KeyboardEvent) => {
			this.dispatch_keyboard_event('snc-key-down', ev);
		}));

		// Add the widget to the editor
		this.editor.addOverlayWidget(this);
	}

	private dispatch_as_python_event(attr_name: string, ev: MouseEvent): void {
		if (!ev.target) { return; }

		let node = ev.target as Node;
		let el: Element | null = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : (node.parentElement);

		while (el && el != this.domNode) {
			if (el.hasAttribute(attr_name)) {
				const pythonEventStr: string = el.getAttribute(attr_name) ?? '';
				this.onPointerEvent(pythonEventStr, ev);
			}
			el = el.parentElement;
		}
	}

	private dispatch_keyboard_event(attr_name: string, ev: KeyboardEvent): void {
		if (!ev.target) { return; }

		let node = ev.target as Node;
		let el: Element | null = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : (node.parentElement);

		// Walk up to find element with the keyboard event handler attribute
		while (el) {
			if (el.hasAttribute(attr_name)) {
				const pythonEventStr: string = el.getAttribute(attr_name) ?? '';
				this.onKeyboardEvent(pythonEventStr, ev);
				return;
			}
			if (el === this.domNode) { break; }
			el = el.parentElement;
		}

		// Also check the domNode itself (container level handler)
		if (this.domNode.hasAttribute(attr_name)) {
			const pythonEventStr: string = this.domNode.getAttribute(attr_name) ?? '';
			this.onKeyboardEvent(pythonEventStr, ev);
		}
	}

	getId(): string {
		return `editor.contrib.visualizationOverlayWidget-${this.lineNumber}-${this.visIndex}`;
	}

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		if (!this.position) {
			return null;
		}

		// Calculate absolute position coordinates
		const lineNumber = this.position.lineNumber;
		const model = this.editor.getModel();

		if (!model) {
			return null;
		}

		try {
			// Get the line content to find the end column
			const lineContent = model.getLineContent(lineNumber);
			const endColumn = lineContent.length + 1;

			// Use the editor's coordinate conversion methods
			const position = { lineNumber, column: endColumn };
			const pixelPosition = this.editor.getScrolledVisiblePosition(position);

			if (!pixelPosition) {
				// Line is not visible
				return null;
			}

			pixelPosition.top -= 1; // align first line of text b/c 1px border

			if (pixelPosition.top < 0 && this.lastOnscreenPixelPosition) {
				// x coordinate is not reliable when lines are offscreen, use last known coordinate
				return {
					preference: {
						top: pixelPosition.top,
						left: this.lastOnscreenPixelPosition.left
					}
				};
			} else {
				this.lastOnscreenPixelPosition = pixelPosition;
				return { preference: pixelPosition };
			}
		} catch (error) {
			return null;
		}
	}

	/**
	 * Update the widget's HTML content
	 */
	updateContent(html: string): void {
		// Check if focus is inside this widget before replacing HTML
		const activeElement = document.activeElement;
		let focusedIndex = -1;

		if (activeElement && this.domNode.contains(activeElement)) {
			// Find which focusable element (by index) was focused
			const focusableElements = this.domNode.querySelectorAll('[tabindex]');
			for (let i = 0; i < focusableElements.length; i++) {
				if (focusableElements[i] === activeElement) {
					focusedIndex = i;
					break;
				}
			}
		}

		const trustedHtml = ttPolicy?.createHTML(html) ?? html;
		this.domNode.innerHTML = trustedHtml as string;

		// Restore focus to the same nth focusable element
		if (focusedIndex >= 0) {
			const focusableElements = this.domNode.querySelectorAll('[tabindex]');
			if (focusedIndex < focusableElements.length) {
				(focusableElements[focusedIndex] as HTMLElement).focus();
			}
		}
	}

	/**
	 * Update the widget's position (called when scrolling or content changes)
	 */
	updatePosition(): void {
		this.editor.layoutOverlayWidget(this);
	}

	/**
	 * Dispose of the widget
	 */
	override dispose(): void {
		this.editor.removeOverlayWidget(this);
		super.dispose();
	}
}

export class SNCController extends Disposable implements IEditorContribution {
	public static readonly ID = 'editor.contrib.snc';

	private visualizationWidgets: Map<number, VisualizationWidget[]> = new Map();
	private viewZones: Map<number, string> = new Map(); // line number -> view zone id
	private debounceTimer: any = null;
	private readonly debounceDelay = 100; // ms

	// Streaming state
	private currentRunId: string | null = null;
	private eventsBeingHandledCurrentRun: { line: number; visIndex: number; events: UiEvent[] }[] = [];
	private visualizationItems: IVisualizationItem[] = [];
	private streamSubscription: { dispose(): void } | null = null;
	private streamUpdateTimer: any = null;
	private cursorUpdateTimer: any = null;

	// Timing tracking: all frontend times use performance.now()
	private runTriggerMsById: Map<string, number> = new Map();        // When runProgram was called (frontend)
	private runSpawnTimingById: Map<string, SNCTimingData> = new Map(); // Backend spawn timing data
	private runFirstItemReceivedMsById: Map<string, number> = new Map(); // When first 'item' message received (frontend)
	private runFirstRenderMsById: Map<string, number> = new Map();    // When first render completed (frontend)


	constructor(
		private readonly editor: ICodeEditor,
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IHostService private readonly hostService: IHostService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();

		// Register event handlers
		this._register(editor.onDidChangeModelContent((e) => { this.onDidChangeModelContent(e); }));
		this._register(editor.onDidChangeModel(() => {
			this.clearVisualizationWidgets();
			// Set up language change listener for the new model
			this.setupLanguageChangeListener();
			// Trigger initial visualization when a new model loads
			this.triggerInitialVisualization();
		}));
		this._register(editor.onDidDispose(() => { this.clearVisualizationWidgets(); }));
		this._register(editor.onDidChangeCursorPosition(() => {
			this.onCursorPositionChanged();
		}));

		// Register scroll event handler to update overlay widget positions
		this._register(editor.onDidScrollChange(() => {
			this.updateOverlayWidgetPositions();
		}));

		// Register window focus change handler to update visualizations when window becomes visible
		this._register(this.hostService.onDidChangeFocus((focused: boolean) => {
			if (focused) {
				this.onWindowBecameVisible();
			}
		}));

		// Register editor visibility change handler to update visualizations when editors become visible
		this._register(this.editorService.onDidVisibleEditorsChange(() => {
			this.onEditorsVisibilityChanged();
		}));

		// Set up language change listener for the initial model
		this.setupLanguageChangeListener();

		// Trigger initial visualization when controller is created
		this.triggerInitialVisualization();
	}

	getProgram(): string {
		return this.editor.getModel()!.getLinesContent().join('\n');
	}

	onDidChangeModelContent(e: IModelContentChangedEvent): void {
		// Debounce to avoid running on every keystroke
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.runProgram(this.getProgram());
		}, this.debounceDelay);
	}

	private onWindowBecameVisible(): void {
		// Re-render existing visualizations when window becomes visible
		const data = this.visualizationItems;
		if (data && data.length > 0) {
			this.updateVisualizationWidgets(data);
		}
	}

	private onCursorPositionChanged(): void {
		// Re-render visualizations when cursor moves; do NOT rerun the program
		const data = this.visualizationItems;
		if (!data || data.length === 0) {
			return;
		}
		if (this.cursorUpdateTimer) {
			clearTimeout(this.cursorUpdateTimer);
		}
		this.cursorUpdateTimer = setTimeout(() => {
			this.updateVisualizationWidgets(data);
		}, 50);
	}

	private setupLanguageChangeListener(): void {
		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		// Listen for language changes on the model
		this._register(model.onDidChangeLanguageConfiguration(() => {
			this.onLanguageChanged();
		}));

		// Also listen for when the language changes
		this._register(model.onDidChangeLanguage(() => {
			this.onLanguageChanged();
		}));
	}

	private onLanguageChanged(): void {
		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		const languageId = model.getLanguageId();

		// If language changed to Python, trigger visualization
		if (languageId === 'python' || languageId === 'py') {
			this.triggerInitialVisualization();
		}
	}

	private onEditorsVisibilityChanged(): void {
		// Check if this editor has a model and is Python
		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		const languageId = model.getLanguageId();
		if (languageId !== 'python' && languageId !== 'py') {
			return;
		}

		// Check if this editor is currently visible in the editor service
		const visibleEditors = this.editorService.visibleTextEditorControls;
		const isThisEditorVisible = visibleEditors.includes(this.editor);

		if (isThisEditorVisible) {
			if (this.debounceTimer) {
				clearTimeout(this.debounceTimer);
			}

			this.debounceTimer = setTimeout(() => {
				this.runProgram(this.getProgram());
			}, this.debounceDelay);
		}
	}

	private triggerInitialVisualization(): void {
		// Only trigger for Python files
		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		const languageId = model.getLanguageId();
		if (languageId !== 'python' && languageId !== 'py') {
			return;
		}

		const content = this.getProgram();
		if (!content || content.trim().length === 0) {
			return;
		}

		// Use longer debounce delay for initial trigger to ensure system is ready
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.runProgram(content);
		}, 1);
	}

	private clearVisualizationWidgets(): void {
		// Remove all existing widgets
		for (const widgets of this.visualizationWidgets.values()) {
			for (const widget of widgets) {
				widget.dispose();
			}
		}
		this.visualizationWidgets.clear();

		// Remove all view zones
		this.editor.changeViewZones((accessor) => {
			for (const viewZoneId of this.viewZones.values()) {
				accessor.removeZone(viewZoneId);
			}
		});
		this.viewZones.clear();
	}

	private updateOverlayWidgetPositions(): void {
		// Update positions of all overlay widgets when scrolling
		for (const widgets of this.visualizationWidgets.values()) {
			for (const widget of widgets) {
				widget.updatePosition();
			}
		}
	}

	// private modelKey(line: number, visIndex?: number | null): string {
	// 	return `${line}:${visIndex ?? 0}`;
	// }

	private updateVisualizationWidgets(visualizationData: IVisualizationItem[]): void {

		// console.log("visualizationData", visualizationData);

		// Get current cursor position
		const cursorPosition = this.editor.getPosition();
		const cursorLine = cursorPosition?.lineNumber || 1;

		// Group visualization items by line number
		const groupedByLine = new Map<number, IVisualizationItem[]>();
		for (const item of visualizationData) {
			if (!groupedByLine.has(item.line)) {
				groupedByLine.set(item.line, []);
			}
			groupedByLine.get(item.line)!.push(item);
		}
		// console.log("groupedByLine", groupedByLine)

		const presentLines = new Set<number>(Array.from(groupedByLine.keys()));

		// console.log("presentLines", presentLines)


		this.editor.changeViewZones((accessor) => {
			// Remove widgets/view zones for lines no longer present
			for (const [line, widgets] of Array.from(this.visualizationWidgets.entries())) {
				if (!presentLines.has(line)) {
					// console.log("disposing", line, widgets)
					for (const w of widgets) { w.dispose(); }
					this.visualizationWidgets.delete(line);
					const vz = this.viewZones.get(line);
					if (vz) { accessor.removeZone(vz); this.viewZones.delete(line); }
				}
			}

			// Update or create for each present line
			for (const [lineNumber, items] of groupedByLine.entries()) {
				// Decide first vs last iteration
				const shouldUseFirst = items.some(item =>
					item.last_line_in_containing_loop !== undefined &&
					cursorLine <= item.last_line_in_containing_loop
				);

				// Group by execution step and pick one step
				const groupedByStep = new Map<number, IVisualizationItem[]>();
				for (const item of items) {
					if (!groupedByStep.has(item.execution_step)) {
						groupedByStep.set(item.execution_step, []);
					}
					groupedByStep.get(item.execution_step)!.push(item);
				}
				const selectedStep = (shouldUseFirst ? Math.min : Math.max)(...groupedByStep.keys());
				const stepItems = groupedByStep.get(selectedStep) || [];

				const existing = this.visualizationWidgets.get(lineNumber);
				// console.log("existing", lineNumber, existing)


				if (existing && existing.length === stepItems.length) {
					// Incremental update: reuse widgets, just update content
					for (let i = 0; i < stepItems.length; i++) {
						existing[i].updateContent(stepItems[i].html);
						existing[i].updatePosition();
					}

					// Adjust view zone height if needed
					const maxHeight = Math.max(...existing.map(w => w.getDomNode().getBoundingClientRect().height));
					const existingZoneId = this.viewZones.get(lineNumber);
					if (maxHeight > 22) {
						if (existingZoneId) {
							accessor.removeZone(existingZoneId);
						}
						const viewZone: IViewZone = {
							afterLineNumber: lineNumber,
							heightInPx: maxHeight - 12,
							domNode: document.createElement('div'),
							suppressMouseDown: false
						};
						const viewZoneId = accessor.addZone(viewZone);
						this.viewZones.set(lineNumber, viewZoneId);
					} else if (existingZoneId) {
						accessor.removeZone(existingZoneId);
						this.viewZones.delete(lineNumber);
					}
				} else {
					// Rebuild for this line
					if (existing) {
						for (const w of existing) { w.dispose(); }
						this.visualizationWidgets.delete(lineNumber);
						const oldZone = this.viewZones.get(lineNumber);
						if (oldZone) { accessor.removeZone(oldZone); this.viewZones.delete(lineNumber); }
					}

					const widgets: VisualizationWidget[] = [];
					for (let i = 0; i < stepItems.length; i++) {
						const item = stepItems[i];
						const visIndex = (item as any).visIndex ?? i;
						const widget = new VisualizationWidget(
							this.editor,
							lineNumber,
							visIndex,
							(pythonEventStr, ev) => { this.onPointerEvent(lineNumber, visIndex, pythonEventStr, ev); },
							(pythonEventStr, ev) => { this.onKeyboardEvent(lineNumber, visIndex, pythonEventStr, ev); }
						);
						widget.updateContent(item.html);
						widgets.push(widget);
					}
					if (widgets.length > 0) {
						this.visualizationWidgets.set(lineNumber, widgets);
					}

					const maxHeight = widgets.length ? Math.max(...widgets.map(w => w.getDomNode().getBoundingClientRect().height)) : 0;
					if (maxHeight > 22) {
						const viewZone: IViewZone = {
							afterLineNumber: lineNumber,
							heightInPx: maxHeight - 12,
							domNode: document.createElement('div'),
							suppressMouseDown: false
						};
						const viewZoneId = accessor.addZone(viewZone);
						this.viewZones.set(lineNumber, viewZoneId);
					}
				}
			}
		});
	}

	/**
	 * Handle pointer event from VisualizationWidget
	 */

	private onPointerEvent(lineNumber: number, visIndex: number, pythonEventStr: string, ev: MouseEvent): void {
		const target = ev.target as HTMLElement;
		const rect = target.getBoundingClientRect();

		const eventJSON = { type: ev.type, button: ev.button, buttons: ev.buttons, offsetY: ev.clientY - rect.top, elementHeight: rect.height, timeStamp: ev.timeStamp, altKey: ev.altKey, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, shiftKey: ev.shiftKey };

		const event: UiEvent = { line: lineNumber, visIndex, pythonEventStr, eventJSON };
		// console.log('SNC viz_pointer event', JSON.stringify(event));

		// Rerun on every pointer event to keep backend authoritative for selections
		this.sendEventToPython(event);
	}

	/**
	 * Handle keyboard event from VisualizationWidget
	 *
	 * If it's not a key the widget handles, let it pass through to VS Code.
	 */
	private onKeyboardEvent(lineNumber: number, visIndex: number, pythonEventStr: string, ev: KeyboardEvent): void {
		// Look up the model for this visualization to get handledKeys
		const visItem = this.visualizationItems.find(
			item => item.line === lineNumber && item.visIndex === visIndex
		);
		const model = visItem?.model as { handledKeys?: string[] } | undefined;
		const handledKeys = model?.handledKeys ?? [];

		// Normalize a key string: sort modifiers alphabetically, keep the main key last
		const normalizeKeyString = (s: string): string => {
			const [mainKey, ...parts] = s.toLowerCase().split(' ').reverse();
			return [...parts.sort(), mainKey].join(' ');
		};

		// Build key string from event: e.g. "cmd shift z", "escape", "enter"
		const keyString = normalizeKeyString(`${ev.metaKey ? 'cmd ' : ''}${ev.ctrlKey ? 'ctrl ' : ''}${ev.altKey ? 'alt ' : ''}${ev.shiftKey ? 'shift ' : ''}${ev.key.toLowerCase()}`);

		// Check if this key combo should be intercepted (normalize both sides)
		const isHandled = handledKeys.some(hk => normalizeKeyString(hk) === keyString);
		if (isHandled) {
			ev.preventDefault();
			ev.stopPropagation();
		}

		const eventJSON = {
			type: ev.type,
			key: ev.key,
			code: ev.code,
			timeStamp: ev.timeStamp,
			altKey: ev.altKey,
			ctrlKey: ev.ctrlKey,
			metaKey: ev.metaKey,
			shiftKey: ev.shiftKey
		};

		const event: UiEvent = { line: lineNumber, visIndex, pythonEventStr, eventJSON };
		// console.log('SNC keyboard event', JSON.stringify(event));

		this.sendEventToPython(event);
	}

	private sendEventToPython(event: UiEvent) {
		this.runProgram(this.getProgram(), event);
	}

	/**
	 * Handle commands from visualizers (Elm-style commands)
	 */
	private handleCommand(command: SNCCommand): void {
		if (command.type === 'NewCode') {
			// Replace the entire editor content with new code
			const model = this.editor.getModel();
			if (model) {
				// Use pushEditOperations to make the change undoable
				model.pushEditOperations(
					[],
					[{
						range: model.getFullModelRange(),
						text: command.code
					}],
					() => null
				);
			}
		}
	}

	/**
	 * Log comprehensive visualizer timing data.
	 *
	 * Measurements:
	 * 1. triggerToSpawn: Time from trigger (runProgram call) to Python spawn
	 * 2. spawnToFirstStdout: Time from spawn to first visualizer data on stdout (backend)
	 * 3. firstStdoutToFirstRender: Time from first stdout to first render completion (frontend)
	 * 4. total: Total time from trigger to first render completion
	 */
	private logVisualizerTiming(runId: string, backendTiming: SNCTimingData | undefined, tEnd: number): void {
		const triggerMs = this.runTriggerMsById.get(runId);
		const firstItemReceivedMs = this.runFirstItemReceivedMsById.get(runId);
		const firstRenderMs = this.runFirstRenderMsById.get(runId);
		const spawnTiming = this.runSpawnTimingById.get(runId);

		// If we don't have the spawn timing from the spawn message, use the one from the end message
		const timing = spawnTiming || backendTiming;

		if (typeof triggerMs !== 'number' || !timing) {
			// Not enough data for timing - likely the run was cancelled or errored early
			return;
		}

		// Calculate timings
		// Note: We can't directly compare frontend (performance.now) and backend (Date.now) times,
		// but we can use the backend's relative timings and our frontend measurements.

		// 1. Trigger to spawn: approximate using the time the spawn message was processed
		//    Since spawn message is emitted immediately after spawn and IPC is fast,
		//    this gives us a reasonable approximation
		const triggerToFirstItemReceived = typeof firstItemReceivedMs === 'number' ? firstItemReceivedMs - triggerMs : undefined;

		// 2. Spawn to first stdout (backend timing)
		const spawnToFirstStdout = timing.spawnToStdoutFirstMs;

		// 3. Spawn to first item parsed (backend timing)
		const spawnToFirstItem = timing.spawnToFirstItemMs;

		// 4. First item received to first render (frontend timing)
		const firstItemToFirstRender = (typeof firstItemReceivedMs === 'number' && typeof firstRenderMs === 'number')
			? firstRenderMs - firstItemReceivedMs
			: undefined;

		// 5. Total from trigger to first render
		const triggerToFirstRender = typeof firstRenderMs === 'number' ? firstRenderMs - triggerMs : undefined;

		// 6. Total from trigger to end
		const triggerToEnd = tEnd - triggerMs;

		// Build timing summary
		const timingSummary = {
			runId,
			// Frontend timings (all relative to trigger)
			triggerToFirstItemReceivedMs: triggerToFirstItemReceived !== undefined ? Math.round(triggerToFirstItemReceived * 100) / 100 : undefined,
			firstItemReceivedToFirstRenderMs: firstItemToFirstRender !== undefined ? Math.round(firstItemToFirstRender * 100) / 100 : undefined,
			triggerToFirstRenderMs: triggerToFirstRender !== undefined ? Math.round(triggerToFirstRender * 100) / 100 : undefined,
			triggerToEndMs: Math.round(triggerToEnd * 100) / 100,
			// Backend timings (all relative to spawn)
			spawnToStdinEndMs: timing.spawnToStdinEndMs,
			spawnToFirstStdoutMs: spawnToFirstStdout,
			spawnToFirstItemParsedMs: spawnToFirstItem,
			spawnToEndMs: timing.spawnToEndMs,
		};

		console.log('SNC Visualizer Timing:', timingSummary);

		// Log a human-readable summary
		const parts: string[] = [];
		if (triggerToFirstItemReceived !== undefined) {
			parts.push(`trigger→firstItem: ${Math.round(triggerToFirstItemReceived)}ms`);
		}
		if (spawnToFirstStdout !== undefined) {
			parts.push(`spawn→stdout: ${spawnToFirstStdout}ms`);
		}
		if (firstItemToFirstRender !== undefined) {
			parts.push(`firstItem→render: ${Math.round(firstItemToFirstRender)}ms`);
		}
		if (triggerToFirstRender !== undefined) {
			parts.push(`TOTAL trigger→render: ${Math.round(triggerToFirstRender)}ms`);
		}
		if (parts.length > 0) {
			console.log(`SNC Timing Summary: ${parts.join(' | ')}`);
		}
	}

	private async runProgram(content: string, uiEvent?: UiEvent): Promise<void> {
		// Get the working directory from the first workspace folder
		const workingDirectory = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath || '';
		const channel = this.mainProcessService.getChannel('sncProcess');

		// Cancel any previous streaming run
		if (this.currentRunId) {
			try { await channel.call('cancel', [this.currentRunId]); } catch { /* ignore */ }
			this.currentRunId = null;
			this.eventsBeingHandledCurrentRun = [];
		}

		this.streamUpdateTimer = null;

		// Add event to appropriate visualizer
		if (uiEvent) {
			let found = false;
			this.visualizationItems = this.visualizationItems.map(visItem => {
				if (visItem.line == uiEvent.line && visItem.visIndex == uiEvent.visIndex) {
					found = true;
					return {
						...visItem,
						unhandledEvents: [...(visItem.unhandledEvents || []), uiEvent]
					}
				}
				return visItem;
			});
			if (!found) {
				console.error(`SNC: No vis at ${uiEvent.line}:${uiEvent.visIndex} to queue event on!`)
			}
		}

		// Ensure we are subscribed to the streaming event once
		if (!this.streamSubscription) {
			const ev = channel.listen<SNCStreamMessage>('onStream');
			this.streamSubscription = ev((msg) => {
				// Filter by run id for this controller
				if (!this.currentRunId || msg.runId !== this.currentRunId) {
					return;
				}

				const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

				if (msg.type === 'spawn') {
					// Store backend spawn timing data
					this.runSpawnTimingById.set(msg.runId, msg.timing);
				} else if (msg.type === 'item') {
					// console.log(msg.item.model)
					// Timing: first item arrival for this run
					const isFirstItem = !this.runFirstItemReceivedMsById.has(msg.runId);
					if (isFirstItem) {
						this.runFirstItemReceivedMsById.set(msg.runId, now());
					}

					// replace prior items as new ones come in
					let found = false;
					this.visualizationItems = this.visualizationItems.map(visItem => {
						if (visItem.line == msg.item.line && visItem.visIndex == msg.item.visIndex) {
							found = true;
							const handled_events: UiEvent[] = this.eventsBeingHandledCurrentRun.find(ev => ev.line == msg.item.line && ev.visIndex == msg.item.visIndex)?.events || [];
							return {
								...msg.item,
								unhandledEvents: (visItem.unhandledEvents || []).filter(ev => !handled_events.includes(ev))
							};
						}
						return visItem;
					});
					if (!found) {
						this.visualizationItems = [...this.visualizationItems, msg.item];
					}

					// Throttle UI updates
					if (!this.streamUpdateTimer) {
						this.updateVisualizationWidgets(this.visualizationItems);

						// Track first render completion time (after updateVisualizationWidgets returns)
						if (isFirstItem && !this.runFirstRenderMsById.has(msg.runId)) {
							// Use requestAnimationFrame to ensure the render has actually painted
							dom.getActiveWindow().requestAnimationFrame(() => {
								if (!this.runFirstRenderMsById.has(msg.runId)) {
									this.runFirstRenderMsById.set(msg.runId, now());
								}
							});
						}

						this.streamUpdateTimer = setTimeout(() => {
							this.streamUpdateTimer = null;
						}, 16);
					}
				} else if (msg.type === 'command') {
					// Handle commands from visualizers
					this.handleCommand(msg.command);
				} else if (msg.type === 'end') {
					// console.log('program end');
					const tEnd = now();

					// Comprehensive timing logging
					this.logVisualizerTiming(msg.runId, msg.timing, tEnd);

					// Timing cleanup
					this.runTriggerMsById.delete(msg.runId);
					this.runSpawnTimingById.delete(msg.runId);
					this.runFirstItemReceivedMsById.delete(msg.runId);
					this.runFirstRenderMsById.delete(msg.runId);

					clearTimeout(this.streamUpdateTimer);

					// remove prior runs
					this.visualizationItems = this.visualizationItems.filter(visItem => visItem.runId === this.currentRunId);
					this.updateVisualizationWidgets(this.visualizationItems);

					if (msg.result.stdout) {
						console.log('Program output:', msg.result.stdout);
					}
					if (msg.result.stderr) {
						console.error('Program errors:', msg.result.stderr);
					}

					this.currentRunId = null;
					this.eventsBeingHandledCurrentRun = [];
				} else if (msg.type === 'error') {
					console.error('SNC streaming error:', msg.error);
					// Cleanup timing tracking on error
					this.runTriggerMsById.delete(msg.runId);
					this.runSpawnTimingById.delete(msg.runId);
					this.runFirstItemReceivedMsById.delete(msg.runId);
					this.runFirstRenderMsById.delete(msg.runId);

					this.currentRunId = null;
					this.eventsBeingHandledCurrentRun = [];
					this.visualizationItems = [];
					this.clearVisualizationWidgets();
				}
			});
			this._register({ dispose: () => { this.streamSubscription?.dispose(); this.streamSubscription = null; } });
		}

		const models_and_events = this.visualizationItems.filter(visItem => visItem.model || visItem.unhandledEvents).map(visItem => {
			const model_and_events: any = {
				line: visItem.line,
				visIndex: visItem.visIndex,
			};
			if (visItem.model) { model_and_events['model'] = visItem.model }
			if (visItem.unhandledEvents) { model_and_events['events'] = visItem.unhandledEvents } // don't transform events: they are compared by == i.e. exact objectid
			return model_and_events;
		});

		// Start a new streaming run
		const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		this.currentRunId = runId;
		const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
		// Track trigger time for timing measurement
		this.runTriggerMsById.set(runId, nowMs);

		this.eventsBeingHandledCurrentRun = models_and_events.map(m_e => ({
			line: m_e.line,
			visIndex: m_e.visIndex,
			events: m_e['events'] || []
		}))

		try {
			const options: IProcessOptions = {
				modelsAndEventsJson: JSON.stringify(models_and_events),
				timeout: 60_000,
				workingDirectory
			};
			await channel.call('startProgram', [content, options, runId]);
		} catch (error) {
			console.error('Failed to start streaming run:', error);
			this.currentRunId = null;
			this.eventsBeingHandledCurrentRun = [];
			this.clearVisualizationWidgets();
		}
	}

}

registerEditorContribution(SNCController.ID, SNCController, EditorContributionInstantiation.AfterFirstRender);
