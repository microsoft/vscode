/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import {
	Disposable,
	MutableDisposable,
	toDisposable,
} from '../../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import {
	ChatConfiguration,
	ChatScrollbarPromptMarkerClickBehavior,
} from '../../common/constants.js';
import {
	IChatRequestViewModel,
	IChatResponseViewModel,
	isRequestVM,
	isResponseVM,
} from '../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import {
	getFocusedScrollbarPromptMarkerId,
	getScrollbarPromptMarkerDescriptors,
} from '../actions/chatPromptNavigationActions.js';

/**
 * The host surface that {@link ChatScrollbarPromptMarkerController} depends on.
 * This interface captures the subset of {@link ChatListWidget} methods used by
 * the controller, allowing it to be tested in isolation with a fake host.
 */
export interface IChatScrollbarPromptMarkerHost {
	readonly renderHeight: number;
	readonly scrollHeight: number;
	getOverviewRulerLayoutInfo(): { parent: HTMLElement; insertBefore: HTMLElement } | undefined;
	getItems(): ChatTreeItem[];
	hasElement(element: ChatTreeItem): boolean;
	getElementTop(element: ChatTreeItem): number;
	getElementHeight(element: ChatTreeItem): number;
	getFocus(): ChatTreeItem[];
	reveal(element: ChatTreeItem, relativeTop?: number): void;
	focusItem(item: ChatTreeItem): void;
}

/**
 * Fixed file path for debug logging of marker render diagnostics.
 * Each render pass appends a JSONL line with the full item list, descriptor
 * set, and computed layout, enabling offline analysis of marker behavior.
 */
const CHAT_SCROLLBAR_MARKER_DEBUG_LOG = URI.file('/Users/core/out.txt');

/**
 * Serializes a chat tree item (request, response, or pending divider) into a
 * plain object suitable for JSON debug logging. Includes only the fields
 * relevant to marker classification and layout.
 */
function serializeChatTreeItem(item: ChatTreeItem) {
	if (isRequestVM(item)) {
		return {
			kind: 'request',
			id: item.id,
			messageText: item.messageText,
			attempt: item.attempt,
			slashCommand: item.slashCommand?.name,
			isSystemInitiated: item.isSystemInitiated,
			systemInitiatedLabel: item.systemInitiatedLabel,
			editedFileEvents: item.editedFileEvents?.map(event => ({
				uri: event.uri.toString(),
				eventKind: event.eventKind,
			})),
			currentRenderedHeight: item.currentRenderedHeight,
		};
	}

	if (isResponseVM(item)) {
		return {
			kind: 'response',
			id: item.id,
			requestId: item.requestId,
			errorDetails: item.errorDetails ? { message: item.errorDetails.message, responseIsFiltered: item.errorDetails.responseIsFiltered } : undefined,
			parts: item.model.entireResponse.value.map(part => ({
				kind: part.kind,
				toolId: (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') ? part.toolId : undefined,
				toolSpecificKind: (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') ? part.toolSpecificData?.kind : undefined,
				isExternalEdit: (hasKey(part, { isExternalEdit: true }) && typeof part.isExternalEdit === 'boolean') ? part.isExternalEdit : undefined,
				editKind: part.kind === 'externalEdit' ? part.editKind : undefined,
			})),
			currentRenderedHeight: item.currentRenderedHeight,
		};
	}

	return {
		kind: 'pendingDivider',
		id: item.id,
		dividerKind: item.dividerKind,
		isSystemInitiated: item.isSystemInitiated,
		currentRenderedHeight: item.currentRenderedHeight,
	};
}

/**
 * Manages the lifecycle, layout, and interaction of scrollbar markers on the
 * chat overview ruler.
 *
 * The controller is responsible for:
 * - Computing marker positions from chat item heights and scroll dimensions
 * - Rendering marker DOM elements (reusing existing elements across renders
 *   so CSS transitions can animate position/size changes)
 * - Resolving overlapping markers via collision detection and priority sorting
 * - Handling pointer/click events on the overview ruler, with full-width
 *   hit-testing so narrow lane markers are as clickable as the full scrollbar
 * - Deferring focus to the target chat row after scroll-induced re-renders settle
 */
export class ChatScrollbarPromptMarkerController extends Disposable {
	private readonly container = document.createElement('div');
	private readonly markerById = new Map<string, HTMLElement>();
	private readonly targetById = new Map<
		string,
		IChatRequestViewModel | IChatResponseViewModel
	>();
	private readonly parentPointerDownListener = this._register(
		new MutableDisposable(),
	);
	private readonly parentClickListener = this._register(
		new MutableDisposable(),
	);
	private readonly parentMouseUpListener = this._register(
		new MutableDisposable(),
	);
	private pointerDownListenerParent: HTMLElement | undefined;
	private visible = true;
	private debugLogWrite = Promise.resolve();
	private markerActivated = false;

	constructor(
		private readonly host: IChatScrollbarPromptMarkerHost,
		private readonly configurationService: IConfigurationService,
		private readonly fileService: IFileService,
		private readonly logService: ILogService,
	) {
		super();

		this._register(
			toDisposable(() => {
				this.container.remove();
			}),
		);
		this.container.classList.add('chat-scrollbar-prompt-markers');
		this.container.setAttribute('aria-hidden', 'true');
		this.container.style.position = 'absolute';
		this.container.style.top = '0';
		this.container.style.bottom = '0';
		this.container.style.pointerEvents = 'auto';
		this.container.style.display = 'none';
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		this.updateContainerVisibility();
	}

	layout(): void {
		const layoutInfo = this.host.getOverviewRulerLayoutInfo();
		if (!layoutInfo) {
			return;
		}

		if (
			this.container.parentElement !== layoutInfo.parent ||
			this.container.nextElementSibling !== layoutInfo.insertBefore
		) {
			layoutInfo.parent.insertBefore(this.container, layoutInfo.insertBefore);
		}

		const scrollbarWidth = Math.max(
			0,
			Math.round(layoutInfo.insertBefore.getBoundingClientRect().width),
		);
		this.container.style.right = '0';
		this.container.style.height = `${this.host.renderHeight}px`;
		this.container.style.width = `${scrollbarWidth}px`;
		if (this.pointerDownListenerParent !== layoutInfo.parent) {
			this.pointerDownListenerParent = layoutInfo.parent;
			this.parentPointerDownListener.value = dom.addDisposableListener(
				layoutInfo.parent,
				dom.EventType.POINTER_DOWN,
				(event) => this.onOverviewRulerPointerDown(event),
				true,
			);
			this.parentClickListener.value = dom.addDisposableListener(
				layoutInfo.parent,
				dom.EventType.CLICK,
				(event) => this.onOverviewRulerClick(event),
				true,
			);
			this.parentMouseUpListener.value = dom.addDisposableListener(
				layoutInfo.parent,
				dom.EventType.MOUSE_UP,
				(event) => this.onOverviewRulerMouseUp(event),
				true,
			);
		}
		this.updateContainerVisibility();
		this.renderMarkers();
	}

	refresh(): void {
		this.renderMarkers();
	}

	private updateContainerVisibility(): void {
		const shouldShow = this.visible && this.host.renderHeight > 0;
		this.container.style.display = shouldShow ? '' : 'none';
	}

	private renderMarkers(): void {
		if (!this.visible) {
			this.updateContainerVisibility();
			return;
		}

		if (!this.host.getOverviewRulerLayoutInfo()) {
			return;
		}

		const scrollHeight = this.host.scrollHeight;
		const rulerHeight = this.host.renderHeight;
		if (scrollHeight <= 0 || rulerHeight <= 0) {
			for (const [, marker] of this.markerById) { marker.remove(); }
			this.markerById.clear();
			this.targetById.clear();
			this.updateContainerVisibility();
			return;
		}

		const descriptors = getScrollbarPromptMarkerDescriptors(
			this.host.getItems(),
		).filter((descriptor) => this.host.hasElement(descriptor.target));
		const activeMarkerId = this.getFocusedMarkerId();
		const markerHeightScale = rulerHeight / scrollHeight;

		const nextMarkerById = new Map<string, HTMLElement>();
		const nextTargetById = new Map<string, IChatRequestViewModel | IChatResponseViewModel>();

		const markerLayouts = descriptors.map((descriptor) => {
			const elementTop = this.host.getElementTop(descriptor.target);
			const elementHeight = this.host.getElementHeight(descriptor.target);
			const topRatio = descriptor.topRatio ?? 0;
			const heightRatio = descriptor.heightRatio ?? 1;
			const scaledTop = (elementTop + (elementHeight * topRatio)) * markerHeightScale;
			const scaledHeight = (elementHeight * heightRatio) * markerHeightScale;
			const height = Math.min(Math.max(descriptor.minHeight, Math.round(scaledHeight)), rulerHeight);
			const top = scaledHeight < descriptor.minHeight
				? scaledTop + (scaledHeight / 2) - (height / 2)
				: scaledTop;
			return { descriptor, top, height };
		}).sort((a, b) => a.top - b.top || b.descriptor.priority - a.descriptor.priority);

		for (let i = 1; i < markerLayouts.length; i++) {
			const previous = markerLayouts[i - 1];
			const current = markerLayouts[i];
			const minimumTop = previous.top + previous.height + 1;
			if (current.top < minimumTop) {
				current.top = minimumTop;
			}
		}

		for (let i = markerLayouts.length - 2; i >= 0; i--) {
			const current = markerLayouts[i];
			const next = markerLayouts[i + 1];
			const rulerMaxTop = Math.max(rulerHeight - current.height, 0);
			current.top = Math.min(current.top, next.top - current.height - 1, rulerMaxTop);
		}

		for (const { descriptor, top, height } of markerLayouts) {
			const clampedTop = Math.max(0, Math.min(Math.round(top), Math.max(rulerHeight - height, 0)));

			// Reuse existing marker element so CSS transitions can animate position/size changes
			let marker = this.markerById.get(descriptor.id);
			if (!marker) {
				marker = dom.$('.chat-scrollbar-prompt-marker');
				marker.style.position = 'absolute';
				marker.style.pointerEvents = 'auto';
				marker.style.cursor = 'pointer';
				this.container.appendChild(marker);
			}

			switch (descriptor.lane) {
				case 'left':
					marker.style.left = '0';
					marker.style.right = 'auto';
					marker.style.width = '50%';
					break;
				case 'right':
					marker.style.left = 'auto';
					marker.style.right = '0';
					marker.style.width = '50%';
					break;
				default:
					marker.style.left = '0';
					marker.style.right = '0';
					marker.style.width = 'auto';
					break;
			}

			marker.dataset.markerId = descriptor.id;
			marker.dataset.requestId = descriptor.request.id;
			marker.dataset.markerType = descriptor.markerType;
			marker.style.top = `${clampedTop}px`;
			marker.style.height = `${height}px`;
			marker.style.zIndex = String(descriptor.priority);
			marker.className = `chat-scrollbar-prompt-marker chat-scrollbar-prompt-marker-type-${descriptor.markerType} chat-scrollbar-prompt-marker-lane-${descriptor.lane}`;
			marker.classList.toggle(
				'active',
				descriptor.id === activeMarkerId,
			);

			nextMarkerById.set(descriptor.id, marker);
			nextTargetById.set(descriptor.id, descriptor.target);
		}

		// Remove stale markers that are no longer present
		for (const [id, marker] of this.markerById) {
			if (!nextMarkerById.has(id)) {
				marker.remove();
			}
		}

		this.markerById.clear();
		for (const [id, marker] of nextMarkerById) {
			this.markerById.set(id, marker);
		}
		this.targetById.clear();
		for (const [id, target] of nextTargetById) {
			this.targetById.set(id, target);
		}
		this.appendDebugLog({
			event: 'renderMarkers',
			timestamp: new Date().toISOString(),
			renderHeight: rulerHeight,
			scrollHeight,
			activeMarkerId,
			focusedItems: this.host.getFocus().map(item => ({ id: item.id, kind: isRequestVM(item) ? 'request' : isResponseVM(item) ? 'response' : 'pendingDivider' })),
			items: this.host.getItems().map(serializeChatTreeItem),
			descriptors: markerLayouts.map(({ descriptor, top, height }) => ({
				id: descriptor.id,
				requestId: descriptor.requestId,
				targetId: descriptor.target.id,
				targetKind: isRequestVM(descriptor.target) ? 'request' : 'response',
				markerType: descriptor.markerType,
				lane: descriptor.lane,
				priority: descriptor.priority,
				minHeight: descriptor.minHeight,
				elementTop: this.host.getElementTop(descriptor.target),
				elementHeight: this.host.getElementHeight(descriptor.target),
				currentRenderedHeight: descriptor.target.currentRenderedHeight,
				topRatio: descriptor.topRatio,
				heightRatio: descriptor.heightRatio,
				computedTop: top,
				computedHeight: height,
				inlineLeft: descriptor.lane === 'right' ? 'auto' : '0',
				inlineRight: descriptor.lane === 'left' ? 'auto' : '0',
				inlineWidth: descriptor.lane === 'full' ? 'auto' : '6px',
			})),
		});
		this.updateContainerVisibility();
	}

	private appendDebugLog(data: unknown): void {
		const line = JSON.stringify(data) + '\n';
		this.debugLogWrite = this.debugLogWrite
			.then(() => {
				return this.fileService.writeFile(CHAT_SCROLLBAR_MARKER_DEBUG_LOG, VSBuffer.fromString(line), { append: true });
			})
			.then(() => undefined)
			.catch(error => {
				this.logService.warn('[ChatScrollbarPromptMarkerDebug] Failed to append debug log', error);
			});
	}

	private onOverviewRulerPointerDown(event: PointerEvent): void {
		const target = this.getTargetAtPoint(event.clientX, event.clientY);
		if (!target) {
			return;
		}

		this.markerActivated = true;
		event.preventDefault();
		event.stopPropagation();
		this.revealItem(target);
	}

	private onOverviewRulerMouseUp(event: MouseEvent): void {
		if (!this.markerActivated) {
			return;
		}
		// Suppress mouseup so the scrollbar doesn't process it and steal focus
		event.preventDefault();
		event.stopPropagation();
	}

	private onOverviewRulerClick(event: MouseEvent): void {
		if (!this.markerActivated) {
			return;
		}
		// Swallow the click that follows pointerdown so the scrollbar doesn't
		// process it and steal focus from the target request.
		this.markerActivated = false;
		event.preventDefault();
		event.stopPropagation();
	}

	/**
	 * Resolves which chat row a pointer event should navigate to, using
	 * full-width Y-axis hit-testing against all rendered markers.
	 *
	 * Unlike standard DOM hit-testing (which checks each marker's actual rect),
	 * this method matches any marker whose Y range contains the click — even if
	 * the click landed outside the marker's narrow lane. This makes 50%-width
	 * lane markers as clickable as the full scrollbar width.
	 *
	 * When multiple markers overlap at the same Y position, priority is:
	 * right-lane (prompt) > left-lane (ask-question) > full-lane (file-change/error).
	 */
	private getTargetAtPoint(
		clientX: number,
		clientY: number,
	): IChatRequestViewModel | IChatResponseViewModel | undefined {
		if (!this.visible || this.container.style.display === 'none') {
			return undefined;
		}

		// Hit-test against the full container width (not just the marker's narrow lane),
		// so that clicking anywhere at a marker's Y position activates it — matching how
		// Monaco's overview ruler handles clicks. When multiple markers overlap at the
		// same Y, prefer right-lane (prompt) markers, then left-lane, then full-lane.
		const containerRect = this.container.getBoundingClientRect();
		if (
			clientX < containerRect.left ||
			clientX > containerRect.right ||
			clientY < containerRect.top ||
			clientY > containerRect.bottom
		) {
			return undefined;
		}

		const candidates: Array<{ id: string; lane: string }> = [];
		for (const [id, marker] of this.markerById) {
			const rect = marker.getBoundingClientRect();
			if (clientY < rect.top || clientY > rect.bottom) {
				continue;
			}
			const lane = marker.dataset.markerType === 'prompt' ? 'right'
				: marker.classList.contains('chat-scrollbar-prompt-marker-lane-left') ? 'left'
					: 'full';
			candidates.push({ id, lane });
		}

		if (candidates.length === 0) {
			return undefined;
		}

		// Prefer right-lane (prompt) > left-lane > full-lane
		const lanePriority: Record<string, number> = { right: 0, left: 1, full: 2 };
		candidates.sort((a, b) => (lanePriority[a.lane] ?? 3) - (lanePriority[b.lane] ?? 3));

		return this.targetById.get(candidates[0].id);
	}

	private getFocusedMarkerId(): string | undefined {
		const focused = this.host.getFocus()[0];
		if (!focused || (!isRequestVM(focused) && !isResponseVM(focused))) {
			return undefined;
		}

		return getFocusedScrollbarPromptMarkerId(focused);
	}

	/**
	 * Reveals and optionally focuses the target chat row. Focus is deferred
	 * across multiple animation frames because revealing a row in a long chat
	 * triggers dynamic height re-measurement in the virtualized tree, which
	 * can steal focus during the re-render cycle. The focus is retried until
	 * the target element is available in the tree or a maximum attempt count
	 * is reached.
	 */
	private revealItem(item: IChatRequestViewModel | IChatResponseViewModel): void {
		const behavior =
			this.configurationService.getValue<ChatScrollbarPromptMarkerClickBehavior>(
				ChatConfiguration.ScrollbarPromptMarkerClickBehavior,
			);

		// Reveal first — this may trigger dynamic height re-measurement in the
		// virtualized tree, which fires scroll/content-height events that can
		// steal focus. Retry the focus over several animation frames so it
		// lands after the tree has fully settled from scroll-induced re-renders.
		this.host.reveal(item);

		if (behavior === ChatScrollbarPromptMarkerClickBehavior.RevealAndFocus) {
			const targetWindow = dom.getWindow(this.container);
			let attempts = 0;
			const maxAttempts = 10;
			const tryFocus = () => {
				if (this.host.hasElement(item)) {
					this.host.focusItem(item);
					return;
				}
				attempts++;
				if (attempts < maxAttempts) {
					dom.scheduleAtNextAnimationFrame(targetWindow, tryFocus);
				}
			};
			dom.scheduleAtNextAnimationFrame(targetWindow, tryFocus);
		}
	}
}
