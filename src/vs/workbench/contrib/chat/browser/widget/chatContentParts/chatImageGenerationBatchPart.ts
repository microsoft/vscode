/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { Action } from '../../../../../../base/common/actions.js';
import { decodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { matchesSomeScheme, Schemas } from '../../../../../../base/common/network.js';
import { autorun, observableSignalFromEvent } from '../../../../../../base/common/observable.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { basename } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { createZip } from '../../../../../../base/common/zip.js';
import { localize } from '../../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../../../platform/progress/common/progress.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { ISharedWebContentExtractorService } from '../../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { downloadFile } from '../../../../../browser/download.js';
import { getChatImageResourceComparisonKey, getToolResultImageResources } from '../../../common/chatImageExtraction.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { IChatRendererContent, IChatResponseViewModel, isResponseVM } from '../../../common/model/chatViewModel.js';
import { isToolResultInputOutputDetails } from '../../../common/tools/languageModelToolsService.js';
import { ChatTreeItem, IChatCodeBlockInfo } from '../../chat.js';
import { GlyphSurface } from '../../attachments/chatImageGlyphSurface.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatResourceGroupWidget } from './chatResourceGroupWidget.js';
import { IChatCollapsibleIODataPart } from './chatToolInputOutputContentPart.js';
import { getImageGenerationBatch, hasToolInvocationError } from './toolInvocationParts/chatToolPartUtilities.js';
import './media/chatImageGenerationBatchPart.css';
import '../../attachments/chatImageReveal.css';

type ImageTool = IChatToolInvocation | IChatToolInvocationSerialized;
type ImageStatus = 'running' | 'waiting' | 'ready' | 'failed' | 'cancelled';

const MAX_THUMBNAILS_PER_ROW = 5;
const THUMBNAIL_TARGET_WIDTH = 96;
const THUMBNAIL_LANDSCAPE_RATIO = 3 / 2;

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

/** A batch-owned preview keeps parallel image generation quiet without delaying ready results. */
export class ChatImageGenerationBatchPart extends Disposable implements IChatContentPart {
	private static readonly viewStates = new WeakMap<IChatResponseViewModel, Map<string, IBatchViewState>>();

	readonly domNode = dom.$('.chat-image-generation-batch');
	private readonly selectedTool = dom.append(this.domNode, dom.$('.chat-image-generation-batch-tool'));
	private readonly preview = dom.append(this.domNode, dom.$('.chat-image-generation-batch-preview'));
	private readonly footer = dom.append(this.domNode, dom.$('.chat-image-generation-batch-footer'));
	private readonly summary = dom.append(this.footer, dom.$('.chat-image-generation-batch-summary', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }));
	private readonly downloadAction = this._register(new Action('chat.imageBatch.download', localize('chat.imageBatch.download', "Download All Images as ZIP"), ThemeIcon.asClassName(Codicon.cloudDownload), false, () => this.downloadImages()));
	private downloadInProgress = false;
	private readonly thumbnails = dom.$('.chat-image-generation-batch-thumbnails', { role: 'group', 'aria-label': localize('chat.imageBatch.thumbnails', "Generated image previews") });
	private readonly thumbnailRows: HTMLElement[] = [];
	private readonly confirmations = dom.append(this.domNode, dom.$('.chat-image-generation-batch-confirmations'));
	private readonly loading = this._register(new MutableDisposable<IDisposable>());
	/** The loading square while {@link loading} shows it, which a reveal grows from. */
	private loadingLine: HTMLElement | undefined;
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
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProgressService private readonly progressService: IProgressService,
		@ISharedWebContentExtractorService private readonly webContentExtractorService: ISharedWebContentExtractorService,
	) {
		super();
		const viewStates = ChatImageGenerationBatchPart.viewStates.get(response) ?? new Map<string, IBatchViewState>();
		this.viewState = viewStates.get(owner.toolCallId) ?? {
			selectedByUser: false,
			imageDimensions: new ResourceMap<dom.IDimension>(getChatImageResourceComparisonKey),
		};
		viewStates.set(owner.toolCallId, this.viewState);
		ChatImageGenerationBatchPart.viewStates.set(response, viewStates);
		this.footer.before(this.thumbnails);
		this._register(this.hoverService.setupDelayedHover(this.summary, () => ({ content: this.summary.textContent ?? '' })));
		const toolbar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, dom.append(this.footer, dom.$('.chat-image-generation-batch-actions')), {
			ariaLabel: localize('chat.imageBatch.actions', "Image batch actions"),
		}));
		toolbar.setActions([this.downloadAction]);
		this._register(dom.addDisposableListener(this.preview, dom.EventType.DRAG_START, event => event.preventDefault()));
		this._register(dom.addDisposableListener(this.thumbnails, dom.EventType.KEY_DOWN, event => {
			const index = this.slots.findIndex(slot => slot.key === this.viewState.selected);
			const next = event.key === 'ArrowRight' ? Math.min(index + 1, this.slots.length - 1)
				: event.key === 'ArrowLeft' ? Math.max(index - 1, 0)
					: event.key === 'ArrowDown' ? this.getVerticalThumbnailIndex(index, 1)
						: event.key === 'ArrowUp' ? this.getVerticalThumbnailIndex(index, -1)
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
				this.layoutThumbnails();
				this._onDidChangeHeight.fire();
			});
		}));
		this._register(resizeObserver.observe(this.domNode));
		const changed = observableSignalFromEvent(this, response.model.onDidChange);
		this._register(autorun(reader => {
			changed.read(reader);
			this.tools = getImageGenerationBatch(response.response.value, owner.toolCallId);
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
		this.updateDownloadAction();
		this.updateThumbnails();
		const selected = slots.find(slot => slot.key === this.viewState.selected);
		if (!selected || !this.viewState.selectedByUser && !selected.part) {
			this.viewState.selected = ready[0]?.key ?? slots.find(slot => slot.status === 'running')?.key ?? selected?.key ?? slots[0]?.key;
		}
		this.updatePreview();
		this.updateToolRow();
		this._onDidChangeHeight.fire();
	}

	private updateDownloadAction(): void {
		const ready = this.slots.filter(slot => slot.part).length;
		this.downloadAction.label = ready > 0 && ready < this.slots.length
			? ready === 1 ? localize('chat.imageBatch.downloadOneReady', "Download 1 Ready Image as ZIP") : localize('chat.imageBatch.downloadReady', "Download {0} Ready Images as ZIP", ready)
			: localize('chat.imageBatch.download', "Download All Images as ZIP");
		this.downloadAction.tooltip = this.downloadAction.label;
		this.downloadAction.enabled = ready > 0 && !this.downloadInProgress;
	}

	private async downloadImages(): Promise<void> {
		const images = this.slots.flatMap(slot => slot.part ? [slot.part] : []);
		if (!images.length || this.downloadInProgress) {
			return;
		}
		this.downloadInProgress = true;
		this.updateDownloadAction();
		try {
			const archive = await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('chat.imageBatch.downloadProgress', "Preparing image batch..."),
				delay: 500,
			}, async progress => {
				const files: { path: string; contents: VSBuffer }[] = [];
				for (const image of images) {
					let contents: VSBuffer;
					if (image.base64Value !== undefined) {
						contents = decodeBase64(image.base64Value);
					} else if (image.value) {
						contents = VSBuffer.wrap(image.value);
					} else if (!isWeb && matchesSomeScheme(image.uri, Schemas.http, Schemas.https)) {
						const extracted = await this.webContentExtractorService.readImage(image.uri, CancellationToken.None);
						if (!extracted) {
							throw new Error(localize('chat.imageBatch.imageUnavailable', "Unable to read image data from the URL."));
						}
						contents = extracted;
					} else {
						contents = (await this.fileService.readFile(image.uri)).value;
					}
					files.push({ path: image.name ?? basename(image.uri), contents });
					progress.report({ increment: 1, total: images.length });
				}
				return createZip(files);
			});
			await downloadFile(archive, 'generated-images.zip', this.fileService, this.fileDialogService, this.webContentExtractorService);
		} catch (error) {
			this.logService.error('[ChatImageGenerationBatch] Could not download images', error);
			this.notificationService.error(localize('chat.imageBatch.downloadError', "Failed to download image batch: {0}", toErrorMessage(error)));
		} finally {
			this.downloadInProgress = false;
			if (!this._store.isDisposed) {
				this.updateDownloadAction();
			}
		}
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
				// Browsers can paint a loaded image before dispatching its load event, which shapes the tile,
				// so show it from that event rather than letterboxed in the square placeholder.
				image.hidden = true;
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
					this.layoutThumbnails();
				};
				store.add(dom.addDisposableListener(image, dom.EventType.LOAD, () => {
					if (store.isDisposed) {
						return;
					}
					if (image.naturalWidth > 0 && image.naturalHeight > 0) {
						this.viewState.imageDimensions.set(slot.part!.uri, { width: image.naturalWidth, height: image.naturalHeight });
						this.layoutThumbnails();
					}
					image.hidden = false;
				}));
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
		});
		this.layoutThumbnails();
	}

	private layoutThumbnails(): void {
		const width = this.thumbnails.clientWidth || this.context.container.clientWidth || this.context.currentWidth.get();
		const columns = Math.max(1, Math.min(MAX_THUMBNAILS_PER_ROW, Math.floor(width / THUMBNAIL_TARGET_WIDTH)));
		const rowHeight = `min(144px, calc((100cqw - var(--vscode-spacing-size120) * ${columns - 1}) / ${columns * THUMBNAIL_LANDSCAPE_RATIO}))`;
		const rowCount = Math.ceil(this.slots.length / columns);
		const focused = dom.isAncestorOfActiveElement(this.thumbnails) ? dom.getActiveElement() : undefined;
		let start = 0;
		for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
			const row = this.thumbnailRows[rowIndex] ?? dom.append(this.thumbnails, dom.$('.chat-image-generation-batch-thumbnail-row'));
			this.thumbnailRows[rowIndex] = row;
			// Reserve landscape-sized slots before decoding; narrower images leave space at the row end.
			row.style.height = rowHeight;
			const rowSize = Math.ceil((this.slots.length - start) / (rowCount - rowIndex));
			for (let column = 0; column < rowSize; column++) {
				const slot = this.slots[start + column];
				const item = this.thumbnailItems.get(slot.key)!;
				const dimensions = slot.part && !item.previewUnavailable ? this.viewState.imageDimensions.get(slot.part.uri) : undefined;
				const ratio = dimensions ? dimensions.width / dimensions.height : 1;
				const heightScale = Math.min(1, THUMBNAIL_LANDSCAPE_RATIO / ratio);
				item.button.element.style.aspectRatio = String(ratio);
				item.button.element.style.height = `calc(${rowHeight} * ${heightScale})`;
				item.button.element.style.width = `calc(${rowHeight} * ${heightScale * ratio})`;
				if (row.children[column] !== item.button.element) {
					row.insertBefore(item.button.element, row.children[column] ?? null);
				}
			}
			start += rowSize;
		}
		for (const row of this.thumbnailRows.splice(rowCount)) {
			row.remove();
		}
		if (focused && dom.isHTMLElement(focused) && dom.getActiveElement() !== focused) {
			focused.focus({ preventScroll: true });
		}
	}

	private getVerticalThumbnailIndex(index: number, direction: -1 | 1): number {
		const current = this.thumbnailItems.get(this.slots[index]?.key)?.button.element;
		if (!current) {
			return index;
		}
		const rowIndex = this.thumbnailRows.findIndex(row => row === current.parentElement);
		const row = this.thumbnailRows[rowIndex];
		const nextRow = this.thumbnailRows[rowIndex + direction];
		if (!row || !nextRow) {
			return index;
		}
		const column = Array.from(row.children).indexOf(current);
		const next = nextRow.children[Math.min(column, nextRow.children.length - 1)];
		return this.slots.findIndex(slot => this.thumbnailItems.get(slot.key)?.button.element === next);
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
					const line = this.loadingLine = dom.append(placeholder, dom.$('.chat-image-generation-line'));
					store.add(this.instantiationService.createInstance(GlyphSurface, line));
					store.add(toDisposable(() => {
						placeholder.remove();
						this.loadingLine = undefined;
					}));
				}
			} else {
				this.loading.clear();
			}
			return;
		}
		const reveal = allowReveal && !!this.loading.value;
		const revealSize = reveal ? this.loadingLine?.getBoundingClientRect().width || undefined : undefined;
		this.loading.clear();
		if (this.previewKey === selected.key) {
			return;
		}
		this.clearPreview();
		this.previewKey = selected.key;
		const widget = this.previewWidget.value = this.instantiationService.createInstance(ChatResourceGroupWidget, [selected.part], {
			imagePresentation: 'inline',
			showImageInHover: false,
			imageReveal: reveal ? { container: this.domNode, size: revealSize } : undefined,
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
		const batch = isResponseVM(element) ? getImageGenerationBatch(element.response.value, this.owner.toolCallId) : [];
		return (other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized')
			&& other.toolCallId === this.owner.toolCallId && batch.length > 1
			&& batch[0].toolCallId === this.owner.toolCallId;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
