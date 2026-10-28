/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionCanvasPictureInPicture.css';
import { $, addDisposableListener, EventType, getWindow, isHTMLElement, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { GlobalPointerMoveMonitor } from '../../../../base/browser/globalPointerMoveMonitor.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { HoverStyle } from '../../../../base/browser/ui/hover/hover.js';
import { createInstantHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Action } from '../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IReader, observableSignal, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IRectangle } from '../../../../platform/window/common/window.js';
import { DraggedEditorIdentifier } from '../../../../workbench/browser/dnd.js';
import { IEditorGroupView } from '../../../../workbench/browser/parts/editor/editor.js';
import { CanvasInput, CanvasPictureInPictureEnabledSettingId, getCanvasReferenceKey, ICanvasContextService, ICanvasDetachedPresentation, ICanvasReference, ICanvasService, isCanvasOwner } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { CanvasEditor } from '../../../../workbench/contrib/canvases/electron-browser/canvasEditor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { FOCUS_ACTIVE_SESSION_COMMAND_ID } from '../../../common/sessionCommands.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { CANVAS_PIP_DEFAULT_SIZE, CANVAS_PIP_STASH_PEEK, CANVAS_PIP_STASH_SLIVER, CanvasCorner, CanvasStashSide, clamp, constrainCanvasSize, estimateCanvasVelocity, getCanvasCornerPositions, getCanvasPlacementArea, getCanvasPresetSize, getCanvasReleaseTarget, getCanvasRevealCorner, getCanvasStashX, getNearestCanvasCorner, ICanvasPoint, ICanvasSize, ICanvasVelocitySample, rubberBand, resist, stepCanvasSpring } from '../common/sessionCanvasPictureInPictureLayout.js';

/** Focus is within a floating canvas. */
export const CanvasPictureInPictureFocused = new RawContextKey<boolean>('sessionCanvasPictureInPictureFocused', false);
/** A canvas is floating above the Agents Window, whether shown or tucked away. */
export const CanvasPictureInPictureActive = new RawContextKey<boolean>('sessionCanvasPictureInPictureActive', false);

export const ISessionCanvasPictureInPictureService = createDecorator<ISessionCanvasPictureInPictureService>('sessionCanvasPictureInPictureService');

export interface ISessionCanvasPictureInPictureService {
	readonly _serviceBrand: undefined;
	readonly enabled: boolean;
	/** Floats a canvas from its tab, or reveals it when it already floats. */
	open(input: CanvasInput, group: IEditorGroup): Promise<void>;
	reveal(): void;
	stash(): void;
	/** Returns the floating canvas to its tab, going to the chat it belongs to first when another is shown. */
	dock(): void;
	/** Shows the chat the floating canvas belongs to. */
	goToChat(): void;
}

/** Overlay marker that hides native pages painted beneath it. */
const overlayClass = 'canvas-picture-in-picture';
const tearDistance = 22;
const dragSlop = 4;
const sampleWindowMs = 120;
const resizeEdges = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
type ResizeEdge = typeof resizeEdges[number];
type Axis = 'x' | 'y' | 'width' | 'height';
type FloatingMode = 'dragging' | 'settling' | 'floating' | 'stashed' | 'docking';

type FloatingCanvasStart =
	| { readonly kind: 'popOut'; readonly from: IRectangle | undefined }
	| { readonly kind: 'tear'; readonly from: IRectangle; readonly pointer: ICanvasPoint; readonly time: number };

interface IGroupRects {
	readonly strip: IRectangle;
	readonly content: IRectangle;
}

interface IFloatingCanvasHost {
	/** The Agents Window container whose coordinates the canvas moves in. */
	readonly container: HTMLElement;
	/** A clipping layer over the container that holds the canvas and its hints, so they can never scroll the window. */
	readonly layer: HTMLElement;
	/** Whether the canvas may float, which it does above every conversation while AI features are enabled. */
	isLive(reader: IReader | undefined): boolean;
	/** Whether the conversation that owns the canvas is the one shown. */
	isHome(reader: IReader | undefined): boolean;
	/** The title of the conversation that owns the canvas, when known. */
	ownerTitle(): string | undefined;
	goToOwner(): void;
	placementArea(): IRectangle;
	toContainer(clientX: number, clientY: number): ICanvasPoint;
	groupRects(group: IEditorGroup): IGroupRects | undefined;
	dock(floating: FloatingCanvas): void;
}

interface IPointerGesture {
	readonly kind: 'move' | 'pull' | 'resize' | 'external';
	readonly edge?: ResizeEdge;
	readonly start: ICanvasPoint;
	readonly startBox: IRectangle;
	readonly caught: boolean;
	readonly samples: ICanvasVelocitySample[];
	readonly dockTarget: IGroupRects | undefined;
	pointer: ICanvasPoint;
	active: boolean;
	follow?: { readonly fraction: number; readonly offsetY: number };
}

function contains(rect: IRectangle, point: ICanvasPoint, inflateY = 0): boolean {
	return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y - inflateY && point.y <= rect.y + rect.height + inflateY;
}

function asGroupView(group: IEditorGroup): IEditorGroupView | undefined {
	const candidate = group as Partial<IEditorGroupView>;
	return isHTMLElement(candidate.element) && candidate.titleHeight ? group as IEditorGroupView : undefined;
}

/** One canvas floating above the Agents Window, moved with spring physics and anchored by its tab. */
class FloatingCanvas extends Disposable implements ICanvasDetachedPresentation {

	readonly element: HTMLElement;
	readonly editor: CanvasEditor;
	private readonly header: HTMLElement;
	private readonly content: HTMLElement;
	private readonly titleLabel: HTMLElement;
	private readonly stashCover: HTMLElement;
	private readonly stashChevron: HTMLElement;
	private readonly edgeGlows: Record<CanvasStashSide, HTMLElement>;
	private readonly dockHighlight: HTMLElement;
	private readonly dockHint: HTMLElement;
	private readonly hideAction: Action;
	private readonly goToChat: Button;
	private readonly window: CodeWindow;
	private readonly inputListener = this._register(new MutableDisposable());
	private readonly box = { x: 0, y: 0, width: CANVAS_PIP_DEFAULT_SIZE.width, height: CANVAS_PIP_DEFAULT_SIZE.height };
	private readonly velocity = { x: 0, y: 0, width: 0, height: 0 };
	private readonly targets = new Map<Axis, number>();
	private readonly frame = this._register(new MutableDisposable());
	private readonly nativeSuspension = new MutableDisposable();
	private readonly pointerMonitor = this._register(new GlobalPointerMoveMonitor());
	private readonly pinchEnd: RunOnceScheduler;
	private onSettled: (() => void) | undefined;
	private lastFrame: number | undefined;
	private gesture: IPointerGesture | undefined;
	private mode: FloatingMode = 'settling';
	private corner: CanvasCorner = 3;
	private floatSize: ICanvasSize = CANVAS_PIP_DEFAULT_SIZE;
	private side: CanvasStashSide | undefined;
	private stashY = 0;
	private peek = false;
	private available = true;
	private home = true;
	private _input: CanvasInput;
	private _group: IEditorGroup;

	/** The tab that anchors this canvas, or the last one while its conversation is not shown. */
	get input(): CanvasInput { return this._input; }
	get group(): IEditorGroup { return this._group; }

	constructor(
		input: CanvasInput,
		group: IEditorGroup,
		private readonly host: IFloatingCanvasHost,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@ICommandService private readonly commandService: ICommandService,
		@ICanvasService private readonly canvasService: ICanvasService,
		@IHoverService hoverService: IHoverService,
	) {
		super();
		this._input = input;
		this._group = group;
		this.window = getWindow(host.container);
		this.pinchEnd = this._register(new RunOnceScheduler(() => this.endResize(), 180));

		this.element = $(`.canvas-pip-window.${overlayClass}`);
		this.element.tabIndex = 0;
		this.element.setAttribute('role', 'group');
		this.element.setAttribute('aria-roledescription', localize('canvas.pip.roleDescription', "floating canvas"));
		this.header = $('.canvas-pip-header');
		this.titleLabel = $('.canvas-pip-title');
		const goToChatContainer = $('.canvas-pip-go-to-chat');
		const actionsContainer = $('.canvas-pip-actions');
		this.header.append(this.titleLabel, goToChatContainer, actionsContainer);
		const content = this.content = $('.canvas-pip-content');
		this.stashCover = $('.canvas-pip-stash-cover');
		this.stashCover.tabIndex = 0;
		this.stashCover.setAttribute('role', 'button');
		this.stashChevron = $('.canvas-pip-stash-chevron');
		this.stashChevron.setAttribute('aria-hidden', 'true');
		this.stashCover.appendChild(this.stashChevron);
		this.element.append(this.header, content, this.stashCover);
		for (const edge of resizeEdges) {
			const handle = $(`.canvas-pip-resize.canvas-pip-resize-${edge}`);
			handle.setAttribute('aria-hidden', 'true');
			this._register(addDisposableListener(handle, EventType.POINTER_DOWN, event => this.startPointerGesture(event, 'resize', edge)));
			this.element.appendChild(handle);
		}
		this.edgeGlows = { left: $(`.canvas-pip-edge-glow.left.${overlayClass}`), right: $(`.canvas-pip-edge-glow.right.${overlayClass}`) };
		this.dockHighlight = $(`.canvas-pip-dock-target.${overlayClass}`);
		this.dockHint = $(`.canvas-pip-dock-hint.${overlayClass}`);
		this.dockHint.textContent = localize('canvas.pip.dockHint', "Release to return to tab");
		const hints = [this.edgeGlows.left, this.edgeGlows.right, this.dockHighlight, this.dockHint];
		for (const hint of hints) {
			hint.setAttribute('aria-hidden', 'true');
			hint.hidden = true;
		}
		host.layer.append(...hints, this.element);
		this._register(toDisposable(() => {
			this.element.remove();
			hints.forEach(hint => hint.remove());
		}));

		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		CanvasPictureInPictureFocused.bindTo(scopedContextKeyService).set(true);
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));

		const hoverDelegate = this._register(createInstantHoverDelegate());
		const actionBar = this._register(new ActionBar(actionsContainer, { hoverDelegate, ariaLabel: localize('canvas.pip.actions', "Floating Canvas Actions") }));
		this.hideAction = this._register(new Action('canvas.pip.hide', '', ThemeIcon.asClassName(Codicon.chevronRight), true, async () => this.stash(this.innerSide() === 'left' ? 'right' : 'left')));
		const dockAction = this._register(new Action('canvas.pip.dock', localize('canvas.pip.returnToTab', "Return to Tab"), ThemeIcon.asClassName(Codicon.layoutSidebarRight), true, async () => this.dock()));
		actionBar.push([this.hideAction, dockAction], { icon: true, label: false });
		this.goToChat = this._register(new Button(goToChatContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, hoverDelegate }));
		this.goToChat.label = `$(${Codicon.arrowLeft.id}) ${localize('canvas.pip.goToChat', "Go to Chat")}`;
		this._register(this.goToChat.onDidClick(() => host.goToOwner()));
		this._register(hoverService.setupDelayedHover(this.stashCover, () => ({ content: this.stashCover.getAttribute('aria-label') ?? '', style: HoverStyle.Pointer })));

		this.editor = scopedInstantiationService.createInstance(CanvasEditor, group);
		this.editor.setStandalonePresentation(localize('canvas.pip.help', "This canvas floats above the Agents Window and its tab remains in the side pane. Drag its title bar and release to settle it in the nearest corner. Toss it, or drag it past either side, to tuck it away, then activate its visible edge to show it again. Drag a side or corner to resize it, or double-click the title bar to cycle sizes. Drop it on the tab bar or use Return to Tab to put it back without reloading. While the floating canvas is focused, arrow keys move it between corners and past an edge to tuck it, Shift+arrow keys resize it, Escape returns focus to the session, and {0}+Enter returns it to its tab. It stays above the window when you switch to another chat or session; use Go to Chat to return to the conversation it belongs to.", 'Ctrl/Cmd'), reader => host.isLive(reader));
		this.editor.create(content);
		this.nativeSuspension.value = this.editor.suspendNativePresentation();
		this.editor.setVisible(true);
		this._register(toDisposable(() => {
			// Hide the live page before detaching so it never flashes at stale bounds; the tab takes it back once the presentation ends.
			this.editor.setVisible(false);
			this.editor.clearInput();
			this.editor.dispose();
			this.nativeSuspension.dispose();
		}));

		this.updateTitle();
		this.inputListener.value = input.onDidChangeLabel(() => this.updateTitle());
		this._register(addDisposableListener(this.element, EventType.POINTER_DOWN, event => {
			if (event.target === this.element) {
				this.startPointerGesture(event, 'move');
			}
		}));
		this._register(addDisposableListener(this.header, EventType.POINTER_DOWN, event => {
			if (!isHTMLElement(event.target) || !event.target.closest('.canvas-pip-actions, .canvas-pip-go-to-chat')) {
				this.startPointerGesture(event, 'move');
			}
		}));
		this._register(addDisposableListener(this.header, EventType.DBLCLICK, event => {
			if (!isHTMLElement(event.target) || !event.target.closest('.canvas-pip-actions, .canvas-pip-go-to-chat')) {
				this.resizeTo(getCanvasPresetSize(this.box.width, 1, true));
			}
		}));
		this._register(addDisposableListener(this.stashCover, EventType.POINTER_DOWN, event => this.startPointerGesture(event, 'pull')));
		this._register(addDisposableListener(this.element, EventType.MOUSE_ENTER, () => this.setPeek(true)));
		this._register(addDisposableListener(this.element, EventType.MOUSE_LEAVE, () => this.setPeek(false)));
		this._register(addDisposableListener(this.element, EventType.WHEEL, event => this.onWheel(event), { passive: false }));
		this._register(addDisposableListener(this.element, EventType.KEY_DOWN, event => this.onKeyDown(event)));
		this._register(addDisposableListener(this.stashCover, EventType.KEY_DOWN, event => this.onStashKeyDown(event)));
		this._register(autorun(reader => {
			this.available = host.isLive(reader);
			if (!this.available && this.gesture) {
				this.cancelGesture();
			}
			this.element.hidden = !this.available;
			this.editor.setVisible(this.available);
			this.updateNative();
		}));
		this._register(autorun(reader => {
			this.home = host.isHome(reader);
			this.element.classList.toggle('away', !this.home);
			goToChatContainer.hidden = this.home;
			this.updateTitle();
		}));
		this._register(toDisposable(() => this.pointerMonitor.stopMonitoring(false)));
	}

	async start(start: FloatingCanvasStart): Promise<void> {
		// Registered after the editor so the page is detached here before the tab reattaches it.
		this._register(this.canvasService.presentDetached(this.input.reference, this));
		const area = this.host.placementArea();
		if (start.kind === 'tear') {
			Object.assign(this.box, { x: start.from.x, y: start.from.y, width: start.from.width, height: start.from.height });
			this.render();
			this.beginExternalDrag(start.pointer, start.time, start.from);
			this.floatSize = constrainCanvasSize(this.floatSize, area);
			this.animateTo({ width: this.floatSize.width, height: this.floatSize.height });
		} else {
			this.floatSize = constrainCanvasSize(this.floatSize, area);
			const from = start.from ?? { ...getCanvasCornerPositions(area, this.floatSize)[this.corner], ...this.floatSize };
			Object.assign(this.box, { x: from.x, y: from.y, width: from.width, height: from.height });
			this.render();
			this.setMode('settling');
			this.animateTo({ ...getCanvasCornerPositions(area, this.floatSize)[this.corner], ...this.floatSize }, () => this.settled(false));
			this.element.focus({ preventScroll: true });
			status(localize('canvas.pip.opened', "{0} is floating. Use arrow keys to move it.", this.input.getName()));
		}
		await this.editor.setInput(this.input, { pinned: true }, { newInGroup: true }, CancellationToken.None);
		// A drop on the tab bar can return the canvas before its page is attached.
		if (!this._store.isDisposed) {
			this.updateNative();
		}
	}

	/** Moves the canvas onto a new tab for its conversation, such as one restored when the conversation is shown again. */
	async rebind(input: CanvasInput, group: IEditorGroup): Promise<void> {
		this._group = group;
		if (input === this._input) {
			return;
		}
		this._input = input;
		this.inputListener.value = input.onDidChangeLabel(() => this.updateTitle());
		this.updateTitle();
		const suspension = this.editor.suspendNativePresentation();
		try {
			await this.editor.setInput(input, { pinned: true }, { newInGroup: true }, CancellationToken.None);
		} finally {
			suspension.dispose();
		}
	}

	reveal(options?: { readonly focus?: boolean }): void {
		if (!this.available) {
			return;
		}
		if (this.mode === 'stashed') {
			this.unstash(options?.focus ?? true);
			return;
		}
		if (!this.accessibilityService.isMotionReduced()) {
			// Only the frame can move: scaling would separate it from the native page it surrounds.
			this.element.animate([{ borderColor: 'var(--vscode-focusBorder)' }, { borderColor: 'var(--vscode-focusBorder)', offset: 0.6 }, {}], { duration: 700, easing: 'ease-out' });
		}
		if (options?.focus) {
			this.element.focus({ preventScroll: true });
		}
	}

	dock(): void {
		this.host.dock(this);
	}

	stash(side?: CanvasStashSide): void {
		if (!this.available || this.mode === 'stashed' || this.mode === 'docking') {
			return;
		}
		this.cancelGesture();
		this.applyStash(side ?? (this.innerSide() === 'left' ? 'right' : 'left'), this.box.y, true);
	}

	/** Shrinks and moves the canvas onto its tab before it is handed back. */
	animateDock(target: IRectangle | undefined, done: () => void): void {
		this.cancelGesture();
		this.clearHints();
		this.setMode('docking');
		this.clearStash();
		if (!target) {
			done();
			return;
		}
		this.animateTo({ x: target.x, y: target.y, width: target.width, height: target.height }, done);
	}

	relayout(): void {
		if (this.gesture || this.mode === 'docking') {
			return;
		}
		const area = this.host.placementArea();
		if (this.mode === 'stashed' && this.side) {
			this.stopAxes('x', 'y');
			this.stashY = clamp(this.stashY, area.y, area.y + area.height - this.box.height);
			Object.assign(this.box, { x: getCanvasStashX(this.side, this.box.width, this.host.container.clientWidth, this.peek), y: this.stashY });
		} else if (this.mode === 'floating') {
			const size = constrainCanvasSize(this.box, area, this.box.width / this.box.height);
			Object.assign(this.box, size, getCanvasCornerPositions(area, size)[this.corner]);
		}
		this.render();
		if (this.mode === 'floating') {
			this.editor.layout();
		}
	}

	beginExternalDrag(pointer: ICanvasPoint, time: number, from: IRectangle): void {
		this.stopAxes('x', 'y');
		this.gesture = {
			kind: 'external', start: pointer, pointer, startBox: { ...this.box }, caught: false, active: true,
			samples: [{ ...pointer, time }], dockTarget: this.home ? this.host.groupRects(this.group) : undefined,
			follow: { fraction: clamp((pointer.x - from.x) / from.width, 0.15, 0.85), offsetY: 15 },
		};
		this.setMode('dragging');
	}

	externalDragTo(pointer: ICanvasPoint, time: number): void {
		const gesture = this.gesture;
		if (gesture?.kind === 'external') {
			this.track(gesture, pointer, time);
			this.render();
			this.updateHints(gesture);
		}
	}

	externalRelease(time: number | undefined, cancelled: boolean): void {
		const gesture = this.gesture;
		if (gesture?.kind !== 'external') {
			return;
		}
		this.gesture = undefined;
		this.finishMove(gesture, cancelled ? { x: 0, y: 0 } : estimateCanvasVelocity(gesture.samples, time ?? gesture.samples[gesture.samples.length - 1].time), cancelled);
	}

	private updateTitle(): void {
		const name = this.input.getName();
		const owner = this.host.ownerTitle();
		this.titleLabel.textContent = name;
		this.element.setAttribute('aria-label', !this.home && owner
			? localize('canvas.pip.ariaLabelAway', "{0}, from {1}. Use arrow keys to move it and Shift+arrow keys to resize it.", name, owner)
			: localize('canvas.pip.ariaLabel', "{0}. Use arrow keys to move it and Shift+arrow keys to resize it.", name));
		this.stashCover.setAttribute('aria-label', localize('canvas.pip.show', "Show {0}", name));
		const goTo = owner ? localize('canvas.pip.goToNamedChat', "Go to {0}", owner) : localize('canvas.pip.goToOwningChat', "Go to the chat this canvas belongs to");
		this.goToChat.setTitle(goTo);
		this.goToChat.setAriaLabel(goTo);
	}

	private innerSide(): CanvasStashSide {
		return this.box.x + this.box.width / 2 > this.host.container.clientWidth / 2 ? 'left' : 'right';
	}

	private setMode(mode: FloatingMode): void {
		this.mode = mode;
		this.element.classList.toggle('dragging', mode === 'dragging');
		this.element.classList.toggle('docking', mode === 'docking');
		this.updateNative();
	}

	private updateNative(): void {
		if (this._store.isDisposed) {
			return;
		}
		const live = this.mode === 'floating' && this.available;
		if (live) {
			this.nativeSuspension.clear();
		} else if (!this.nativeSuspension.value) {
			this.nativeSuspension.value = this.editor.suspendNativePresentation();
		}
	}

	private render(): void {
		const gesture = this.gesture;
		if (gesture?.active && gesture.follow) {
			const area = this.host.placementArea();
			this.box.x = clamp(gesture.pointer.x - this.box.width * gesture.follow.fraction, 24 - this.box.width, this.host.container.clientWidth - 24);
			this.box.y = rubberBand(gesture.pointer.y - gesture.follow.offsetY, area.y, area.y + area.height - this.box.height);
		}
		const { x, y, width, height } = this.box;
		this.element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
		this.element.style.width = `${width}px`;
		this.element.style.height = `${height}px`;
		const side = this.innerSide() === 'left' ? 'right' : 'left';
		const label = side === 'left'
			? localize('canvas.pip.hideLeft', "Hide at Left Edge")
			: localize('canvas.pip.hideRight', "Hide at Right Edge");
		if (this.hideAction.label !== label) {
			this.hideAction.label = label;
			this.hideAction.tooltip = label;
			this.hideAction.class = ThemeIcon.asClassName(side === 'left' ? Codicon.chevronLeft : Codicon.chevronRight);
		}
		this.stashChevron.style.width = `${this.peek ? CANVAS_PIP_STASH_PEEK : CANVAS_PIP_STASH_SLIVER}px`;
	}

	private animateTo(targets: Partial<Record<Axis, number>>, onSettled?: () => void): void {
		for (const [axis, value] of Object.entries(targets) as [Axis, number][]) {
			this.targets.set(axis, value);
		}
		this.onSettled = onSettled;
		if (this.accessibilityService.isMotionReduced()) {
			for (const [axis, value] of this.targets) {
				this.box[axis] = value;
				this.velocity[axis] = 0;
			}
			this.targets.clear();
			this.frame.clear();
			this.render();
			this.completeAnimation();
			return;
		}
		if (!this.frame.value) {
			this.lastFrame = undefined;
			this.scheduleFrame();
		}
	}

	private scheduleFrame(): void {
		this.frame.value = scheduleAtNextAnimationFrame(this.window, () => {
			this.frame.value = undefined;
			this.step();
		});
	}

	private step(): void {
		const now = this.window.performance.now();
		const seconds = this.lastFrame === undefined ? 1 / 60 : (now - this.lastFrame) / 1000;
		this.lastFrame = now;
		for (const [axis, target] of this.targets) {
			const spring = { value: this.box[axis], velocity: this.velocity[axis] };
			if (stepCanvasSpring(spring, target, seconds)) {
				this.targets.delete(axis);
			}
			this.box[axis] = spring.value;
			this.velocity[axis] = spring.velocity;
		}
		this.render();
		if (this.targets.size) {
			this.scheduleFrame();
		} else {
			this.completeAnimation();
		}
	}

	private completeAnimation(): void {
		const done = this.onSettled;
		this.onSettled = undefined;
		done?.();
	}

	private stopAxes(...axes: Axis[]): void {
		for (const axis of axes) {
			this.targets.delete(axis);
		}
		if (!this.targets.size) {
			this.frame.clear();
			this.onSettled = undefined;
		}
	}

	private settled(announce = true): void {
		if (this.mode !== 'settling') {
			return;
		}
		this.floatSize = { width: this.box.width, height: this.box.height };
		this.setMode('floating');
		this.editor.layout();
		if (announce) {
			status(this.cornerAnnouncement());
		}
	}

	private cornerAnnouncement(): string {
		switch (this.corner) {
			case 0: return localize('canvas.pip.topLeft', "Canvas moved to the top left.");
			case 1: return localize('canvas.pip.topRight', "Canvas moved to the top right.");
			case 2: return localize('canvas.pip.bottomLeft', "Canvas moved to the bottom left.");
			default: return localize('canvas.pip.bottomRight', "Canvas moved to the bottom right.");
		}
	}

	private settle(velocity: ICanvasPoint): void {
		const area = this.host.placementArea();
		const target = getCanvasReleaseTarget(this.box, velocity, this.host.container.clientWidth, area);
		if (target.kind === 'stash') {
			this.velocity.x = velocity.x;
			this.velocity.y = velocity.y * 0.6;
			this.applyStash(target.side, target.y, true);
			return;
		}
		this.corner = target.corner;
		this.velocity.x = velocity.x;
		this.velocity.y = velocity.y;
		this.setMode('settling');
		this.animateTo({ x: target.x, y: target.y }, () => this.settled());
	}

	private applyStash(side: CanvasStashSide, y: number, animate: boolean): void {
		const hadFocus = this.element.contains(this.window.document.activeElement);
		const area = this.host.placementArea();
		this.side = side;
		this.peek = false;
		this.stashY = clamp(y, area.y, area.y + area.height - this.box.height);
		this.setMode('stashed');
		this.element.classList.add('stashed');
		// Only the visible sliver may take focus; focusing anything off-screen would scroll the window.
		this.header.inert = true;
		this.content.inert = true;
		this.element.tabIndex = -1;
		this.element.classList.toggle('stashed-left', side === 'left');
		this.element.classList.toggle('stashed-right', side === 'right');
		const targets = { x: getCanvasStashX(side, this.box.width, this.host.container.clientWidth, false), y: this.stashY };
		if (animate) {
			this.animateTo(targets);
		} else {
			Object.assign(this.box, targets);
			this.render();
		}
		this.stashChevron.classList.toggle('left', side === 'left');
		if (hadFocus) {
			this.stashCover.focus({ preventScroll: true });
		}
		if (animate) {
			status(side === 'left'
				? localize('canvas.pip.stashedLeft', "Canvas tucked at the left edge. Activate it to show it again.")
				: localize('canvas.pip.stashedRight', "Canvas tucked at the right edge. Activate it to show it again."));
		}
	}

	private unstash(focus: boolean): void {
		const side = this.side;
		if (this.mode !== 'stashed' || !side) {
			return;
		}
		const area = this.host.placementArea();
		this.clearStash();
		this.corner = getCanvasRevealCorner(side, area, this.box.y, this.box);
		this.setMode('settling');
		this.animateTo(getCanvasCornerPositions(area, this.box)[this.corner], () => this.settled(false));
		if (focus) {
			this.element.focus({ preventScroll: true });
		}
		status(localize('canvas.pip.shown', "Canvas shown."));
	}

	private clearStash(): void {
		this.side = undefined;
		this.peek = false;
		this.element.classList.remove('stashed', 'stashed-left', 'stashed-right');
		this.header.inert = false;
		this.content.inert = false;
		this.element.tabIndex = 0;
	}

	private setPeek(peek: boolean): void {
		if (this.mode !== 'stashed' || !this.side || this.gesture || this.peek === peek) {
			return;
		}
		this.peek = peek;
		this.animateTo({ x: getCanvasStashX(this.side, this.box.width, this.host.container.clientWidth, peek) });
	}

	private startPointerGesture(event: PointerEvent, kind: 'move' | 'pull' | 'resize', edge?: ResizeEdge): void {
		if (event.button !== 0 || this.mode === 'docking' || this.gesture || !isHTMLElement(event.currentTarget)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const pointer = this.host.toContainer(event.clientX, event.clientY);
		const caught = kind !== 'resize' && this.targets.has('x');
		if (caught) {
			this.stopAxes('x', 'y');
		}
		this.gesture = {
			kind, edge, start: pointer, pointer, startBox: { ...this.box }, caught, active: false,
			samples: [{ ...pointer, time: event.timeStamp }], dockTarget: undefined,
		};
		this.pointerMonitor.startMonitoring(event.currentTarget, event.pointerId, event.buttons,
			move => this.onPointerMove(move),
			end => this.onPointerEnd(end));
	}

	private onPointerMove(event: PointerEvent): void {
		const gesture = this.gesture;
		if (!gesture || gesture.kind === 'external') {
			return;
		}
		const pointer = this.host.toContainer(event.clientX, event.clientY);
		this.track(gesture, pointer, event.timeStamp);
		if (!gesture.active) {
			if (Math.hypot(pointer.x - gesture.start.x, pointer.y - gesture.start.y) < dragSlop) {
				return;
			}
			this.activate(gesture);
		}
		if (gesture.kind === 'resize') {
			this.resizeFromPointer(gesture);
		} else {
			this.render();
			this.updateHints(gesture);
		}
	}

	private activate(gesture: IPointerGesture): void {
		gesture.active = true;
		this.stopAxes('x', 'y');
		if (gesture.kind === 'resize') {
			this.stopAxes('width', 'height');
		} else {
			if (gesture.kind === 'pull') {
				this.clearStash();
			}
			gesture.follow = { fraction: (gesture.start.x - this.box.x) / this.box.width, offsetY: gesture.start.y - this.box.y };
			// Its tab can only take it back beside the conversation it belongs to.
			(gesture as { dockTarget: IGroupRects | undefined }).dockTarget = this.home ? this.host.groupRects(this.group) : undefined;
		}
		this.setMode('dragging');
	}

	private track(gesture: IPointerGesture, pointer: ICanvasPoint, time: number): void {
		gesture.pointer = pointer;
		gesture.samples.push({ ...pointer, time });
		while (gesture.samples.length > 2 && time - gesture.samples[0].time > sampleWindowMs) {
			gesture.samples.shift();
		}
	}

	private onPointerEnd(event: PointerEvent | KeyboardEvent | undefined): void {
		const gesture = this.gesture;
		if (!gesture || gesture.kind === 'external') {
			return;
		}
		this.gesture = undefined;
		if (!gesture.active) {
			if (gesture.kind === 'pull') {
				this.unstash(true);
			} else if (gesture.caught) {
				this.settle({ x: 0, y: 0 });
			}
			return;
		}
		if (gesture.kind === 'resize') {
			this.endResize();
			return;
		}
		const time = event?.timeStamp ?? gesture.samples[gesture.samples.length - 1].time;
		this.finishMove(gesture, estimateCanvasVelocity(gesture.samples, time), false);
	}

	private finishMove(gesture: IPointerGesture, velocity: ICanvasPoint, cancelled: boolean): void {
		const overDock = !!gesture.dockTarget && contains(gesture.dockTarget.strip, gesture.pointer, 12);
		this.clearHints();
		if (overDock || (cancelled && gesture.kind === 'external')) {
			this.dock();
			return;
		}
		this.settle(velocity);
	}

	private cancelGesture(): void {
		if (!this.gesture) {
			return;
		}
		const external = this.gesture.kind === 'external';
		this.gesture = undefined;
		this.pointerMonitor.stopMonitoring(false);
		this.clearHints();
		if (!external && this.mode === 'dragging') {
			this.settle({ x: 0, y: 0 });
		}
	}

	private updateHints(gesture: IPointerGesture): void {
		const target = gesture.dockTarget;
		const overDock = !!target && contains(target.strip, gesture.pointer, 12);
		this.element.classList.toggle('dock-armed', overDock);
		this.element.style.transformOrigin = gesture.follow ? `${gesture.follow.fraction * 100}% ${gesture.follow.offsetY}px` : '';
		this.dockHighlight.hidden = !overDock;
		this.dockHint.hidden = !overDock;
		if (target && overDock) {
			Object.assign(this.dockHighlight.style, { left: `${target.strip.x}px`, top: `${target.strip.y}px`, width: `${target.strip.width}px`, height: `${target.strip.height}px` });
			Object.assign(this.dockHint.style, { left: `${gesture.pointer.x}px`, top: `${gesture.pointer.y + 22}px` });
		}
		const last = gesture.samples[gesture.samples.length - 1];
		const release = overDock ? undefined : getCanvasReleaseTarget(this.box, estimateCanvasVelocity(gesture.samples, last.time), this.host.container.clientWidth, this.host.placementArea());
		const stashSide = release?.kind === 'stash' ? release.side : undefined;
		this.edgeGlows.left.hidden = stashSide !== 'left';
		this.edgeGlows.right.hidden = stashSide !== 'right';
		this.element.classList.toggle('will-stash', !!stashSide);
	}

	private clearHints(): void {
		this.dockHighlight.hidden = true;
		this.dockHint.hidden = true;
		this.edgeGlows.left.hidden = true;
		this.edgeGlows.right.hidden = true;
		this.element.classList.remove('will-stash', 'dock-armed');
	}

	private resizeFromPointer(gesture: IPointerGesture): void {
		const edge = gesture.edge ?? 'se';
		const start = gesture.startBox;
		const aspect = start.width / start.height;
		const dx = gesture.pointer.x - gesture.start.x;
		const dy = gesture.pointer.y - gesture.start.y;
		const horizontal = edge.includes('e') ? dx : edge.includes('w') ? -dx : 0;
		const vertical = edge.includes('s') ? dy : edge.includes('n') ? -dy : 0;
		const requested = edge === 'n' || edge === 's'
			? { width: (start.height + vertical) * aspect, height: start.height + vertical }
			: { width: start.width + horizontal, height: (start.width + horizontal) / aspect };
		const size = constrainCanvasSize(requested, this.host.placementArea(), aspect);
		this.box.width = size.width;
		this.box.height = size.height;
		this.box.x = edge.includes('w') ? start.x + start.width - size.width : start.x;
		this.box.y = edge.includes('n') ? start.y + start.height - size.height : start.y;
		this.render();
	}

	private endResize(): void {
		const area = this.host.placementArea();
		this.corner = getNearestCanvasCorner(area, this.box, this.box);
		this.floatSize = { width: this.box.width, height: this.box.height };
		this.setMode('settling');
		this.animateTo(getCanvasCornerPositions(area, this.box)[this.corner], () => this.settled(false));
		status(localize('canvas.pip.resized', "Canvas resized to {0} by {1} pixels.", Math.round(this.box.width), Math.round(this.box.height)));
	}

	private resizeTo(size: ICanvasSize): void {
		if (this.mode === 'stashed' || this.mode === 'docking' || this.gesture) {
			return;
		}
		const area = this.host.placementArea();
		const constrained = constrainCanvasSize(size, area);
		this.floatSize = constrained;
		this.setMode('settling');
		this.animateTo({ ...constrained, ...getCanvasCornerPositions(area, constrained)[this.corner] }, () => this.settled(false));
		status(localize('canvas.pip.resized', "Canvas resized to {0} by {1} pixels.", Math.round(constrained.width), Math.round(constrained.height)));
	}

	private onWheel(event: WheelEvent): void {
		if (!event.ctrlKey || this.mode === 'stashed' || this.mode === 'docking' || this.gesture) {
			return;
		}
		event.preventDefault();
		this.stopAxes('x', 'y', 'width', 'height');
		const area = this.host.placementArea();
		const aspect = this.box.width / this.box.height;
		const size = constrainCanvasSize({ width: this.box.width * Math.exp(-event.deltaY * 0.01), height: 0 }, area, aspect);
		const onRight = this.innerSide() === 'left';
		const onBottom = this.box.y + this.box.height / 2 > area.y + area.height / 2;
		this.box.x = onRight ? this.box.x + this.box.width - size.width : this.box.x;
		this.box.y = onBottom ? this.box.y + this.box.height - size.height : this.box.y;
		this.box.width = size.width;
		this.box.height = size.height;
		this.setMode('dragging');
		this.render();
		this.pinchEnd.schedule();
	}

	private onKeyDown(browserEvent: KeyboardEvent): void {
		if (browserEvent.target !== this.element || this.mode === 'stashed' || this.mode === 'docking') {
			return;
		}
		const event = new StandardKeyboardEvent(browserEvent);
		const directions: [number, number, number][] = [[KeyCode.LeftArrow, -1, 0], [KeyCode.RightArrow, 1, 0], [KeyCode.UpArrow, 0, -1], [KeyCode.DownArrow, 0, 1]];
		for (const [keyCode, dx, dy] of directions) {
			if (event.equals(keyCode)) {
				event.preventDefault();
				event.stopPropagation();
				this.moveWithKeyboard(dx, dy);
				return;
			}
			if (event.equals(KeyMod.Shift | keyCode)) {
				event.preventDefault();
				event.stopPropagation();
				this.resizeTo(getCanvasPresetSize(this.box.width, dx - dy > 0 ? 1 : -1, false));
				return;
			}
		}
		if (event.equals(KeyCode.Escape)) {
			event.preventDefault();
			event.stopPropagation();
			void this.commandService.executeCommand(FOCUS_ACTIVE_SESSION_COMMAND_ID);
		} else if (event.equals(KeyMod.CtrlCmd | KeyCode.Enter)) {
			event.preventDefault();
			event.stopPropagation();
			this.dock();
		}
	}

	private onStashKeyDown(browserEvent: KeyboardEvent): void {
		const event = new StandardKeyboardEvent(browserEvent);
		const inward = this.side === 'left' ? KeyCode.RightArrow : KeyCode.LeftArrow;
		if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space) || event.equals(inward)) {
			event.preventDefault();
			event.stopPropagation();
			this.unstash(true);
		} else if (event.equals(KeyCode.Escape)) {
			event.preventDefault();
			event.stopPropagation();
			void this.commandService.executeCommand(FOCUS_ACTIVE_SESSION_COMMAND_ID);
		}
	}

	private moveWithKeyboard(dx: number, dy: number): void {
		const onRight = this.innerSide() === 'left';
		const area = this.host.placementArea();
		const onBottom = this.box.y + this.box.height / 2 > area.y + area.height / 2;
		if ((dx < 0 && !onRight) || (dx > 0 && onRight)) {
			this.stash(dx < 0 ? 'left' : 'right');
			return;
		}
		this.corner = (((dy ? dy > 0 : onBottom) ? 2 : 0) + ((dx ? dx > 0 : onRight) ? 1 : 0)) as CanvasCorner;
		this.setMode('settling');
		this.animateTo(getCanvasCornerPositions(area, this.box)[this.corner], () => this.settled());
	}
}

interface ITabDrag {
	readonly input: CanvasInput;
	readonly group: IEditorGroup;
	readonly tab: IRectangle;
	readonly rects: IGroupRects | undefined;
	readonly ghost: HTMLElement;
	readonly suspension: IDisposable | undefined;
	floating?: FloatingCanvas;
	dropped: boolean;
}

/** Floats canvases above the Agents Window and keeps their tabs as anchors. */
export class SessionCanvasPictureInPictureService extends Disposable implements ISessionCanvasPictureInPictureService {

	declare readonly _serviceBrand: undefined;

	private floating: FloatingCanvas | undefined;
	private readonly floatingLifetime = this._register(new MutableDisposable<DisposableStore>());
	private readonly floatingChanged = observableSignal(this);
	private readonly reconcile: RunOnceScheduler;
	private readonly activeContext: IContextKey<boolean>;
	private readonly emptyDragImage: HTMLImageElement;
	private readonly enabledObservable;
	private tabDrag: ITabDrag | undefined;
	private layerElement: HTMLElement | undefined;
	/** Set when the canvas should return to its tab once its conversation is shown. */
	private dockWhenHome = false;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICanvasService private readonly canvasService: ICanvasService,
		@ICanvasContextService private readonly contextService: ICanvasContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.activeContext = CanvasPictureInPictureActive.bindTo(contextKeyService);
		this.reconcile = this._register(new RunOnceScheduler(() => this.reconcileFloating(), 0));
		this.emptyDragImage = $('img') as HTMLImageElement;
		this.emptyDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
		const setting = observableConfigValue(CanvasPictureInPictureEnabledSettingId, false, configurationService);
		this.enabledObservable = derived(this, reader => environmentService.isSessionsWindow && setting.read(reader) === true && canvasService.enabled.read(reader));
		this._register(autorun(reader => {
			if (!this.enabledObservable.read(reader) && this.floating) {
				this.end(this.floating);
			}
		}));
		this._register(toDisposable(() => this.activeContext.reset()));
		this._register(layoutService.onDidLayoutMainContainer(() => this.floating?.relayout()));
		this._register(contextService.onDidRemoveOwner(owner => {
			if (this.floating && isCanvasOwner(this.floating.input.reference, owner)) {
				this.end(this.floating);
			}
		}));
		const editorsChanged = observableSignalFromEvent(this, editorService.onDidEditorsChange);
		this._register(autorun(reader => {
			this.floatingChanged.read(reader);
			editorsChanged.read(reader);
			const floating = this.floating;
			if (!floating || contextService.workingSets?.state.read(reader).restoring) {
				return;
			}
			// Track the conversation's canvases and visibility so a closed canvas ends and a pending return to its tab completes.
			contextService.getContext(floating.input.reference, reader)?.canvases.read(reader);
			contextService.isOwnerVisible(floating.input.reference, reader);
			this.reconcile.schedule();
		}));
		this.registerTabTearOut();
		for (const type of [AccessibleViewType.Help, AccessibleViewType.View]) {
			this._register(AccessibleViewRegistry.register({
				type, priority: 210, name: `sessionCanvasPictureInPicture-${type}`,
				when: CanvasPictureInPictureFocused,
				getProvider: () => this.floating?.editor.createAccessibleProvider(type),
			}));
		}
	}

	get enabled(): boolean {
		return this.enabledObservable.get();
	}

	async open(input: CanvasInput, group: IEditorGroup): Promise<void> {
		if (this.floating && getCanvasReferenceKey(this.floating.input.reference) === getCanvasReferenceKey(input.reference)) {
			this.floating.reveal({ focus: true });
			return;
		}
		if (!this.canFloat(input, group)) {
			return;
		}
		const pane = group.activeEditorPane;
		const from = pane instanceof CanvasEditor && pane.input === input ? this.groupRects(group)?.content : undefined;
		await this.present(input, group, { kind: 'popOut', from });
	}

	reveal(): void {
		this.floating?.reveal({ focus: true });
	}

	stash(): void {
		this.floating?.stash();
	}

	dock(): void {
		if (this.floating) {
			this.dockFloating(this.floating);
		}
	}

	goToChat(): void {
		const floating = this.floating;
		if (!floating) {
			return;
		}
		const reference = floating.input.reference;
		const session = this.sessionsManagementService.getSession(reference.session);
		if (!session || session.providerId !== reference.providerId) {
			this.notificationService.warn(localize('canvas.pip.chatUnavailable', "The chat this canvas belongs to is no longer available."));
			return;
		}
		this.sessionsService.openChat(session, reference.chat).catch(error => this.reportError(error));
	}

	private get container(): HTMLElement {
		return this.layoutService.mainContainer;
	}

	private get layer(): HTMLElement {
		if (!this.layerElement || this.layerElement.parentElement !== this.container) {
			this.layerElement?.remove();
			this.layerElement = $('.canvas-pip-layer');
			this.container.appendChild(this.layerElement);
		}
		return this.layerElement;
	}

	private canFloat(input: CanvasInput, group: IEditorGroup): boolean {
		return this.enabled && !input.isDisposed() && this.canvasService.isOwnerPresentable(input.reference)
			&& group.windowId === this.editorGroupsService.mainPart.windowId && group.contains(input);
	}

	private ownerTitle(reference: ICanvasReference): string | undefined {
		const session = this.sessionsManagementService.getSession(reference.session);
		const chat = session?.chats.get().find(candidate => isEqual(candidate.resource, reference.chat));
		return chat?.title.get() || session?.title.get() || undefined;
	}

	private async present(input: CanvasInput, group: IEditorGroup, start: FloatingCanvasStart): Promise<FloatingCanvas> {
		if (this.floating) {
			this.end(this.floating);
		}
		const reference = input.reference;
		const host: IFloatingCanvasHost = {
			container: this.container,
			layer: this.layer,
			isLive: reader => this.canvasService.enabled.read(reader),
			isHome: reader => this.contextService.isOwnerVisible(reference, reader),
			ownerTitle: () => this.ownerTitle(reference),
			goToOwner: () => this.goToChat(),
			placementArea: () => getCanvasPlacementArea({ width: this.container.clientWidth, height: this.container.clientHeight }, this.layoutService.mainContainerOffset.top),
			toContainer: (clientX, clientY) => this.toContainer(clientX, clientY),
			groupRects: target => this.groupRects(target),
			dock: floating => this.dockFloating(floating),
		};
		const lifetime = new DisposableStore();
		const floating = lifetime.add(this.instantiationService.createInstance(FloatingCanvas, input, group, host));
		this.floating = floating;
		this.dockWhenHome = false;
		this.floatingLifetime.value = lifetime;
		lifetime.add(this.watchTab(floating, input));
		this.activeContext.set(true);
		this.floatingChanged.trigger(undefined);
		try {
			await floating.start(start);
		} catch (error) {
			this.end(floating);
			this.reportError(error);
		}
		return floating;
	}

	/**
	 * Switching conversations closes the tab while the canvas keeps floating above the window;
	 * any other close of its tab, such as the user closing it, ends the floating canvas too.
	 */
	private watchTab(floating: FloatingCanvas, input: CanvasInput): IDisposable {
		return Event.once(input.onWillDispose)(() => {
			const workingSet = this.contextService.workingSets?.state.get();
			if (!workingSet?.applying && !workingSet?.restoring && floating.input === input) {
				this.end(floating);
			}
		});
	}

	private end(floating: FloatingCanvas): void {
		if (this.floating === floating) {
			this.floating = undefined;
			this.dockWhenHome = false;
			this.activeContext.set(false);
			this.floatingLifetime.clear();
			this.floatingChanged.trigger(undefined);
		}
	}

	private dockFloating(floating: FloatingCanvas): void {
		if (!this.contextService.isOwnerVisible(floating.input.reference)) {
			// Its tab is beside its own conversation, so go there first and return it once that conversation is shown.
			this.dockWhenHome = true;
			this.goToChat();
			return;
		}
		this.dockWhenHome = false;
		const group = floating.group;
		const target = this.editorGroupsService.mainPart.groups.includes(group) ? this.groupRects(group)?.content : undefined;
		const visibleTarget = target && target.width > 0 && target.height > 0 ? target : undefined;
		floating.animateDock(visibleTarget, () => {
			const reference = floating.input.reference;
			this.end(floating);
			status(localize('canvas.pip.docked', "Canvas returned to its tab."));
			void this.canvasService.revealCanvas(reference).catch(error => this.reportError(error));
		});
	}

	private reconcileFloating(): void {
		const floating = this.floating;
		if (!floating || this.contextService.workingSets?.state.get().restoring) {
			return;
		}
		const reference = floating.input.reference;
		// A canvas that closed while its conversation was not shown ends once that conversation reports its canvases again.
		const canvases = this.contextService.getContext(reference)?.canvases.get();
		if (canvases && !canvases.some(canvas => isEqual(canvas.resource, reference.canvas))) {
			this.end(floating);
			return;
		}
		const key = getCanvasReferenceKey(reference);
		for (const group of this.editorGroupsService.mainPart.groups) {
			const input = group.editors.find((editor): editor is CanvasInput => editor instanceof CanvasInput && !editor.isDisposed() && getCanvasReferenceKey(editor.reference) === key);
			if (input && (input !== floating.input || group !== floating.group)) {
				if (input !== floating.input) {
					this.floatingLifetime.value?.add(this.watchTab(floating, input));
				}
				floating.rebind(input, group).catch(error => this.reportError(error));
				break;
			}
		}
		if (this.dockWhenHome && this.contextService.isOwnerVisible(reference)) {
			this.dockFloating(floating);
		}
	}

	private toContainer(clientX: number, clientY: number): ICanvasPoint {
		const rect = this.container.getBoundingClientRect();
		return { x: clientX - rect.left, y: clientY - rect.top };
	}

	private toContainerRect(rect: DOMRect): IRectangle {
		const origin = this.toContainer(rect.left, rect.top);
		return { x: origin.x, y: origin.y, width: rect.width, height: rect.height };
	}

	private groupRects(group: IEditorGroup): IGroupRects | undefined {
		const view = asGroupView(group);
		if (!view || view.disposed) {
			return undefined;
		}
		const rect = this.toContainerRect(view.element.getBoundingClientRect());
		const title = Math.min(view.titleHeight.total, rect.height);
		return {
			strip: { x: rect.x, y: rect.y, width: rect.width, height: title },
			content: { x: rect.x, y: rect.y + title, width: rect.width, height: rect.height - title },
		};
	}

	private registerTabTearOut(): void {
		const container = this.container;
		const transfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
		this._register(addDisposableListener(container, EventType.DRAG_START, event => {
			this.endTabDrag();
			const dragged = transfer.getData(DraggedEditorIdentifier.prototype);
			const identifier = dragged?.length === 1 ? dragged[0].identifier : undefined;
			const group = identifier && this.editorGroupsService.getGroup(identifier.groupId);
			if (!identifier || !(identifier.editor instanceof CanvasInput) || !group || !isHTMLElement(event.target)
				|| identifier.editor.presentation.get() || !this.canFloat(identifier.editor, group)) {
				return;
			}
			event.dataTransfer?.setDragImage(this.emptyDragImage, 0, 0);
			const pane = group.activeEditorPane;
			const ghost = $(`.canvas-pip-tab-ghost.${overlayClass}`);
			const icon = $(`span${ThemeIcon.asCSSSelector(Codicon.preview)}`);
			const label = $('span.canvas-pip-tab-ghost-label');
			label.textContent = identifier.editor.getName();
			ghost.append(icon, label);
			ghost.setAttribute('aria-hidden', 'true');
			this.layer.appendChild(ghost);
			const tab = this.toContainerRect(event.target.getBoundingClientRect());
			this.tabDrag = {
				input: identifier.editor, group, tab, ghost, dropped: false,
				rects: this.groupRects(group),
				suspension: pane instanceof CanvasEditor && pane.input === identifier.editor ? pane.suspendNativePresentation() : undefined,
			};
			this.positionGhost(this.tabDrag, this.toContainer(event.clientX, event.clientY));
		}));
		const onDragOver = (event: DragEvent) => {
			const drag = this.tabDrag;
			if (!drag || (event.clientX === 0 && event.clientY === 0)) {
				return;
			}
			const pointer = this.toContainer(event.clientX, event.clientY);
			if (!drag.floating && this.overStrip(drag, pointer)) {
				this.positionGhost(drag, pointer);
				return;
			}
			// Outside the tab strip the drag belongs to the canvas, so editor drop targets never see it.
			event.preventDefault();
			event.stopImmediatePropagation();
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'move';
			}
			if (!drag.floating && !this.shouldTear(drag, pointer)) {
				this.positionGhost(drag, pointer);
				return;
			}
			if (!drag.floating) {
				drag.ghost.hidden = true;
				this.tearOut(drag, pointer, event.timeStamp);
			}
			drag.floating?.externalDragTo(pointer, event.timeStamp);
		};
		this._register(addDisposableListener(container, EventType.DRAG_ENTER, onDragOver, true));
		this._register(addDisposableListener(container, EventType.DRAG_OVER, onDragOver, true));
		this._register(addDisposableListener(container, EventType.DRAG_LEAVE, event => {
			if (this.tabDrag?.floating) {
				event.stopImmediatePropagation();
			}
		}, true));
		this._register(addDisposableListener(container, EventType.DROP, event => {
			const drag = this.tabDrag;
			const pointer = drag && this.toContainer(event.clientX, event.clientY);
			if (!drag || !pointer || (!drag.floating && this.overStrip(drag, pointer))) {
				return;
			}
			event.preventDefault();
			event.stopImmediatePropagation();
			drag.dropped = true;
			drag.floating?.externalDragTo(pointer, event.timeStamp);
			drag.floating?.externalRelease(event.timeStamp, false);
		}, true));
		this._register(addDisposableListener(container, EventType.DRAG_END, event => {
			const drag = this.tabDrag;
			if (drag?.floating && !drag.dropped) {
				drag.floating.externalRelease(undefined, event.dataTransfer?.dropEffect === 'none');
			}
			this.endTabDrag();
		}));
		this._register(toDisposable(() => {
			this.endTabDrag();
			this.layerElement?.remove();
		}));
	}

	private overStrip(drag: ITabDrag, pointer: ICanvasPoint): boolean {
		return contains(drag.rects?.strip ?? drag.tab, pointer);
	}

	private shouldTear(drag: ITabDrag, pointer: ICanvasPoint): boolean {
		const strip = drag.rects?.strip ?? drag.tab;
		return pointer.y < strip.y - tearDistance
			|| pointer.y > strip.y + strip.height + tearDistance
			|| pointer.x < strip.x
			|| pointer.x > strip.x + strip.width;
	}

	private tearOut(drag: ITabDrag, pointer: ICanvasPoint, time: number): void {
		// Presenting synchronously starts following the pointer; only loading the page is asynchronous.
		this.present(drag.input, drag.group, { kind: 'tear', from: drag.tab, pointer, time }).catch(error => this.reportError(error));
		drag.floating = this.floating?.input === drag.input ? this.floating : undefined;
	}

	/** The lifted tab follows the pointer along the strip and stretches, rubber-banded, before it tears away. */
	private positionGhost(drag: ITabDrag, pointer: ICanvasPoint): void {
		const strip = drag.rects?.strip ?? drag.tab;
		const top = drag.tab.y;
		const pull = pointer.y < strip.y ? pointer.y - strip.y : pointer.y > strip.y + strip.height ? pointer.y - strip.y - strip.height : 0;
		const offsetY = Math.sign(pull) * resist(Math.abs(pull));
		const x = clamp(pointer.x - drag.tab.width / 2, strip.x, strip.x + strip.width - drag.tab.width);
		drag.ghost.style.width = `${drag.tab.width}px`;
		drag.ghost.style.height = `${drag.tab.height}px`;
		drag.ghost.style.transform = `translate3d(${x}px, ${top + offsetY}px, 0)`;
		drag.ghost.classList.toggle('pulled', pull !== 0);
	}

	private endTabDrag(): void {
		const drag = this.tabDrag;
		this.tabDrag = undefined;
		drag?.ghost.remove();
		drag?.suspension?.dispose();
	}

	private reportError(error: unknown): void {
		this.logService.error('[SessionCanvasPictureInPicture] Floating canvas failed', error);
		this.notificationService.error(localize('canvas.pip.failed', "Could not float the canvas."));
	}
}
