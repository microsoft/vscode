/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { autorun, observableSignalFromEvent } from '../../../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { getChatImageResourceComparisonKey, getToolResultImageResources } from '../../../common/chatImageExtraction.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { IChatProgressResponseContent } from '../../../common/model/chatModel.js';
import { IChatRendererContent, IChatResponseViewModel, isResponseVM } from '../../../common/model/chatViewModel.js';
import { isToolResultInputOutputDetails } from '../../../common/tools/languageModelToolsService.js';
import { ChatTreeItem, IChatCodeBlockInfo } from '../../chat.js';
import { GlyphSurface } from '../../attachments/chatImageGlyphSurface.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatResourceGroupWidget } from './chatResourceGroupWidget.js';
import { IChatCollapsibleIODataPart } from './chatToolInputOutputContentPart.js';
import { isImageGenerationToolInvocation, hasToolInvocationError } from './toolInvocationParts/chatToolPartUtilities.js';
import './media/chatImageGenerationBatchPart.css';
import '../../attachments/chatImageReveal.css';

type ImageTool = IChatToolInvocation | IChatToolInvocationSerialized;
type ImageStatus = 'running' | 'waiting' | 'ready' | 'failed' | 'cancelled';

/** Matches the response-wide gallery scope, leaving subagent and hidden tools with their owners. */
export function getImageGenerationBatch(content: readonly (IChatRendererContent | IChatProgressResponseContent)[]): ImageTool[] {
	const tools = content.filter((part): part is ImageTool =>
		(part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized')
		&& !part.subAgentInvocationId && !(part.kind === 'toolInvocation' && part.otherClientToolCall)
		&& !IChatToolInvocation.isStreaming(part)
		&& !IChatToolInvocation.isEffectivelyHidden(part) && isImageGenerationToolInvocation(part));
	return tools.length > 1 ? tools : [];
}

function isWaiting(tool: ImageTool): boolean {
	const state = tool.kind === 'toolInvocation' ? tool.state.get().type : undefined;
	return state === IChatToolInvocation.StateKind.WaitingForConfirmation
		|| state === IChatToolInvocation.StateKind.WaitingForPostApproval
		|| state === IChatToolInvocation.StateKind.WaitingForAuthentication;
}

function getStatus(tool: ImageTool): ImageStatus {
	if (isWaiting(tool)) {
		return 'waiting';
	}
	if (!IChatToolInvocation.isComplete(tool)) {
		return 'running';
	}
	const confirmation = IChatToolInvocation.executionConfirmedOrDenied(tool);
	if (confirmation?.type === ToolConfirmKind.Denied || confirmation?.type === ToolConfirmKind.Skipped) {
		return 'cancelled';
	}
	return hasToolInvocationError(tool) ? 'failed' : 'ready';
}

interface IBatchViewState {
	selected?: string;
	selectedByUser: boolean;
	readonly imageDimensions: ResourceMap<dom.IDimension>;
}

interface IImageSlot {
	readonly key: string;
	readonly tool: ImageTool;
	readonly status: ImageStatus;
	readonly part?: IChatCollapsibleIODataPart;
}

interface IThumbnail extends IDisposable {
	readonly button: Button;
	readonly store: DisposableStore;
	readonly icon: HTMLElement;
	readonly imageStore: MutableDisposable<DisposableStore>;
	slot: IImageSlot;
	image?: HTMLImageElement;
	previewUnavailable?: boolean;
}

/** A response-owned preview keeps parallel image generation quiet without delaying ready results. */
export class ChatImageGenerationBatchPart extends Disposable implements IChatContentPart {
	private static readonly viewStates = new WeakMap<IChatResponseViewModel, IBatchViewState>();

	readonly domNode = dom.$('.chat-image-generation-batch');
	private readonly selectedTool = dom.append(this.domNode, dom.$('.chat-image-generation-batch-tool'));
	private readonly preview = dom.append(this.domNode, dom.$('.chat-image-generation-batch-preview'));
	private readonly summary = dom.append(this.domNode, dom.$('.chat-image-generation-batch-summary', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }));
	private readonly thumbnails = dom.$('.chat-image-generation-batch-thumbnails', { role: 'group', 'aria-label': localize('chat.imageBatch.thumbnails', "Generated image previews") });
	private readonly scrollable = this._register(new DomScrollableElement(this.thumbnails, { horizontal: ScrollbarVisibility.Auto, vertical: ScrollbarVisibility.Hidden }));
	private readonly confirmations = dom.append(this.domNode, dom.$('.chat-image-generation-batch-confirmations'));
	private readonly loading = this._register(new MutableDisposable<IDisposable>());
	private readonly previewWidget = this._register(new MutableDisposable<ChatResourceGroupWidget>());
	private readonly layoutAfterResize = this._register(new MutableDisposable<IDisposable>());
	private readonly thumbnailItems = this._register(new DisposableMap<string, IThumbnail>());
	private readonly toolParts = this._register(new DisposableMap<string, IChatContentPart>());
	private readonly toolPartStartIndices = new WeakMap<IChatContentPart, number>();
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;
	private readonly viewState: IBatchViewState;
	private slots: IImageSlot[] = [];
	private previewKey: string | undefined;
	private tools: ImageTool[] = [];

	get codeblocks(): IChatCodeBlockInfo[] {
		return this.tools.flatMap(tool => this.toolParts.get(tool.toolCallId)?.codeblocks ?? []);
	}

	constructor(
		private readonly owner: ImageTool,
		private readonly context: IChatContentPartRenderContext,
		response: IChatResponseViewModel,
		private readonly createToolPart: (tool: ImageTool, codeBlockStartIndex: number) => IChatContentPart,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.viewState = ChatImageGenerationBatchPart.viewStates.get(response) ?? {
			selectedByUser: false,
			imageDimensions: new ResourceMap<dom.IDimension>(getChatImageResourceComparisonKey),
		};
		ChatImageGenerationBatchPart.viewStates.set(response, this.viewState);
		this.summary.before(this.scrollable.getDomNode());
		this._register(this.hoverService.setupDelayedHover(this.summary, () => ({ content: this.summary.textContent ?? '' })));
		this._register(dom.addDisposableListener(this.preview, dom.EventType.DRAG_START, event => event.preventDefault()));
		this._register(dom.addDisposableListener(this.thumbnails, dom.EventType.KEY_DOWN, event => {
			const index = this.slots.findIndex(slot => slot.key === this.viewState.selected);
			const next = event.key === 'ArrowRight' ? Math.min(index + 1, this.slots.length - 1)
				: event.key === 'ArrowLeft' ? Math.max(index - 1, 0)
					: event.key === 'Home' ? 0
						: event.key === 'End' ? this.slots.length - 1 : undefined;
			if (next !== undefined && this.slots[next]) {
				event.preventDefault();
				event.stopPropagation();
				this.select(this.slots[next].key);
				this.thumbnailItems.get(this.slots[next].key)?.button.focus();
				this.thumbnailItems.get(this.slots[next].key)?.button.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
			}
		}));
		const resizeObserver = this._register(new dom.DisposableResizeObserver('ChatImageGenerationBatch', () => {
			this.layoutAfterResize.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.domNode), () => {
				this.scrollable.scanDomNode();
				this._onDidChangeHeight.fire();
			});
		}));
		this._register(resizeObserver.observe(this.domNode));
		const changed = observableSignalFromEvent(this, response.model.onDidChange);
		this._register(autorun(reader => {
			changed.read(reader);
			this.tools = getImageGenerationBatch(response.response.value);
			for (const tool of this.tools) {
				if (tool.kind === 'toolInvocation') {
					tool.state.read(reader);
					tool.toolSpecificDataKind.read(reader);
				}
			}
			this.update();
		}));
	}

	private update(): void {
		const slots: IImageSlot[] = [];
		let waiting = 0;
		let failed = 0;
		let cancelled = 0;
		for (const tool of this.tools) {
			const status = getStatus(tool);
			const details = IChatToolInvocation.resultDetails(tool);
			const images = status === 'ready' && isToolResultInputOutputDetails(details)
				? getToolResultImageResources(details, this.context.element.sessionResource, tool.toolCallId, 'generated-image') : [];
			if (images.length) {
				for (const [index, image] of images.entries()) {
					slots.push({
						key: `${tool.toolCallId}:${index === 0 ? 'first' : image.index}`, tool, status, part: {
							kind: 'data', uri: image.uri, name: image.name, mimeType: image.mimeType, base64Value: image.base64Value, audience: image.audience,
						}
					});
				}
			} else {
				const effectiveStatus = status === 'ready' ? 'failed' : status;
				slots.push({ key: `${tool.toolCallId}:first`, tool, status: effectiveStatus });
				switch (effectiveStatus) {
					case 'waiting': waiting++; break;
					case 'failed': failed++; break;
					case 'cancelled': cancelled++; break;
				}
			}
		}
		this.slots = slots;
		const ready = slots.filter(slot => slot.part);
		const counts = [
			localize('chat.imageBatch.readyCount', "Image batch \u00b7 {0} of {1} ready", ready.length, slots.length),
			waiting === 1 ? localize('chat.imageBatch.oneWaiting', "1 needs attention") : waiting ? localize('chat.imageBatch.waiting', "{0} need attention", waiting) : undefined,
			failed ? localize('chat.imageBatch.failed', "{0} failed", failed) : undefined,
			cancelled ? localize('chat.imageBatch.cancelled', "{0} cancelled", cancelled) : undefined,
		].filter((value): value is string => !!value);
		const text = counts.join(' \u00b7 ');
		if (this.summary.textContent !== text) {
			this.summary.textContent = text;
		}
		this.updateThumbnails();
		const selected = slots.find(slot => slot.key === this.viewState.selected);
		if (!selected || !this.viewState.selectedByUser && !selected.part) {
			this.viewState.selected = ready[0]?.key ?? slots.find(slot => slot.status === 'running')?.key ?? selected?.key ?? slots[0]?.key;
		}
		this.updatePreview();
		this.updateToolRow();
		this._onDidChangeHeight.fire();
	}

	private updateThumbnails(): void {
		const keys = new Set(this.slots.map(slot => slot.key));
		for (const key of this.thumbnailItems.keys()) {
			if (!keys.has(key)) {
				this.thumbnailItems.deleteAndDispose(key);
			}
		}
		this.slots.forEach((slot, index) => {
			let item = this.thumbnailItems.get(slot.key);
			if (!item) {
				const store = new DisposableStore();
				const button = store.add(new Button(this.thumbnails, { ...defaultButtonStyles, secondary: true, buttonBorder: undefined, buttonSecondaryBorder: undefined }));
				button.element.classList.add('chat-image-generation-batch-thumbnail');
				button.element.draggable = false;
				store.add(toDisposable(() => button.element.remove()));
				const icon = dom.append(button.element, dom.$('span', { 'aria-hidden': 'true' }));
				const imageStore = store.add(new MutableDisposable<DisposableStore>());
				item = { button, store, icon, imageStore, slot, dispose: () => store.dispose() };
				this.thumbnailItems.set(slot.key, item);
				store.add(button.onDidClick(() => this.select(slot.key)));
			}
			if (slot.part && !item.image && !item.previewUnavailable) {
				const thumbnail = item;
				const store = thumbnail.imageStore.value = new DisposableStore();
				const image = dom.append(thumbnail.button.element, dom.$<HTMLImageElement>('img', { alt: '', draggable: false }));
				thumbnail.image = image;
				thumbnail.icon.hidden = true;
				store.add(toDisposable(() => {
					image.removeAttribute('src');
					image.remove();
				}));
				const showError = () => {
					if (store.isDisposed) {
						return;
					}
					image.remove();
					thumbnail.previewUnavailable = true;
					thumbnail.icon.className = ThemeIcon.asClassName(Codicon.warning);
					thumbnail.icon.hidden = false;
					thumbnail.button.setAriaLabel(localize('chat.imageBatch.previewUnavailable', "Image {0}, preview unavailable", index + 1));
				};
				store.add(dom.addDisposableListener(image, dom.EventType.ERROR, showError));
				void this.loadThumbnail(slot.part, image, store, showError);
			} else if (!slot.part) {
				item.imageStore.clear();
				item.image = undefined;
				item.previewUnavailable = false;
				item.icon.hidden = false;
				item.icon.className = ThemeIcon.asClassName(slot.status === 'failed' ? Codicon.error : slot.status === 'cancelled' ? Codicon.close : Codicon.clock);
			}
			item.slot = slot;
			const label = item.previewUnavailable ? localize('chat.imageBatch.previewUnavailable', "Image {0}, preview unavailable", index + 1)
				: slot.status === 'ready' ? localize('chat.imageBatch.select', "Show image {0}", index + 1)
					: slot.status === 'running' ? localize('chat.imageBatch.pending', "Image {0}, generating", index + 1)
						: slot.status === 'waiting' ? localize('chat.imageBatch.attention', "Image {0}, needs attention", index + 1)
							: slot.status === 'cancelled' ? localize('chat.imageBatch.cancelledImage', "Image {0}, cancelled", index + 1)
								: localize('chat.imageBatch.failedImage', "Image {0}, failed", index + 1);
			item.button.setAriaLabel(label);
			item.button.setTitle(label);
			if (this.thumbnails.children[index] !== item.button.element) {
				this.thumbnails.insertBefore(item.button.element, this.thumbnails.children[index] ?? null);
			}
		});
		this.scrollable.scanDomNode();
	}

	private async loadThumbnail(part: IChatCollapsibleIODataPart, image: HTMLImageElement, store: DisposableStore, onError: () => void): Promise<void> {
		if (part.base64Value !== undefined) {
			image.src = `data:${part.mimeType};base64,${part.base64Value}`;
			return;
		}
		try {
			const content = await this.fileService.readFile(part.uri);
			if (store.isDisposed) {
				return;
			}
			const url = URL.createObjectURL(new Blob([content.value.buffer.slice()], { type: part.mimeType }));
			store.add(toDisposable(() => URL.revokeObjectURL(url)));
			image.src = url;
		} catch (error) {
			this.logService.warn('[ChatImageGenerationBatch] Could not load thumbnail', error);
			onError();
		}
	}

	private select(key: string): void {
		if (!this.slots.some(slot => slot.key === key)) {
			return;
		}
		this.viewState.selected = key;
		this.viewState.selectedByUser = true;
		this.updatePreview(false);
		this.updateToolRow();
		this._onDidChangeHeight.fire();
	}

	private updatePreview(allowReveal = true): void {
		const selected = this.slots.find(slot => slot.key === this.viewState.selected);
		for (const [key, item] of this.thumbnailItems) {
			const active = key === selected?.key;
			item.button.element.setAttribute('aria-pressed', String(active));
			item.button.element.tabIndex = active ? 0 : -1;
		}
		if (!selected?.part) {
			if (this.previewWidget.value) {
				this.clearPreview();
			}
			if (selected?.status === 'running') {
				if (!this.loading.value) {
					const store = this.loading.value = new DisposableStore();
					const placeholder = dom.append(this.preview, dom.$('.chat-image-generation-placeholder', { 'aria-hidden': 'true' }));
					const line = dom.append(placeholder, dom.$('.chat-image-generation-line'));
					store.add(this.instantiationService.createInstance(GlyphSurface, line));
					store.add(toDisposable(() => placeholder.remove()));
				}
			} else {
				this.loading.clear();
			}
			return;
		}
		const reveal = allowReveal && !!this.loading.value;
		this.loading.clear();
		if (this.previewKey === selected.key) {
			return;
		}
		this.clearPreview();
		this.previewKey = selected.key;
		const widget = this.previewWidget.value = this.instantiationService.createInstance(ChatResourceGroupWidget, [selected.part], {
			imagePresentation: 'inline',
			showImageInHover: false,
			imageReveal: reveal ? { container: this.domNode } : undefined,
			imageDimensions: this.viewState.imageDimensions,
		});
		const gallery = dom.append(this.preview, dom.$('.chat-generated-image-result', undefined, widget.domNode));
		gallery.classList.add('chat-image-generation-batch-selected');
		this._onDidChangeHeight.fire();
	}

	private clearPreview(): void {
		this.previewKey = undefined;
		this.previewWidget.clear();
		dom.clearNode(this.preview);
	}

	private updateToolRow(): void {
		const selected = this.slots.find(slot => slot.key === this.viewState.selected)?.tool;
		const visibleTools = this.tools.filter(tool => tool === selected || isWaiting(tool));
		const ids = new Set(visibleTools.map(tool => tool.toolCallId));
		for (const id of this.toolParts.keys()) {
			if (!ids.has(id)) {
				this.toolParts.get(id)?.domNode?.remove();
				this.toolParts.deleteAndDispose(id);
			}
		}
		let codeBlockIndex = this.context.codeBlockStartIndex;
		for (const tool of visibleTools) {
			let part = this.toolParts.get(tool.toolCallId);
			if (part && this.toolPartStartIndices.get(part) !== codeBlockIndex) {
				part.domNode?.remove();
				this.toolParts.deleteAndDispose(tool.toolCallId);
				part = undefined;
			}
			if (!part) {
				part = this.createToolPart(tool, codeBlockIndex);
				this.toolParts.set(tool.toolCallId, part);
				this.toolPartStartIndices.set(part, codeBlockIndex);
			}
			codeBlockIndex += part.codeblocks?.length ?? 0;
			const container = tool === selected ? this.selectedTool : this.confirmations;
			if (part.domNode && part.domNode.parentElement !== container) {
				const focused = dom.isAncestorOfActiveElement(part.domNode) ? dom.getActiveElement() : undefined;
				container.appendChild(part.domNode);
				if (focused && dom.isHTMLElement(focused)) {
					focused.focus({ preventScroll: true });
				}
			}
		}
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return (other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized')
			&& other.toolCallId === this.owner.toolCallId && isResponseVM(element)
			&& getImageGenerationBatch(element.response.value)[0]?.toolCallId === this.owner.toolCallId;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
