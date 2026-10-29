/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, clearNode, getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { hashAsync } from '../../../../base/common/hash.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignal } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IChatImageCarouselService } from '../../../../workbench/contrib/chat/browser/chatImageCarouselService.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel, IChatResponseModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { collectInboxEvidence, IInboxEvidence, IInboxEvidenceImage } from '../common/inboxEvidence.js';
import { IInboxNotificationItem } from '../common/inboxNotificationsService.js';

export class InboxEvidenceWidget extends Disposable {
	readonly element = $('.inbox-evidence');
	private readonly renderStore = this._register(new DisposableStore());
	private readonly modelStore = this._register(new DisposableStore());
	private readonly responseListener = this._register(new MutableDisposable());
	private readonly changed = observableSignal(this);
	private model: IChatModel | undefined;
	private response: IChatResponseModel | undefined;
	private signature: string | undefined;
	private accessibleContent = '';
	private readonly focusTargets = new Map<string, HTMLElement>();

	constructor(
		session: ISession,
		private readonly chat: IChat,
		private readonly item: IInboxNotificationItem,
		private readonly onLayout: () => void,
		@IChatService private readonly chatService: IChatService,
		@IFileService private readonly fileService: IFileService,
		@IChatImageCarouselService private readonly carouselService: IChatImageCarouselService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this._register(chatService.onDidCreateModel(() => this.connectModel()));
		this.connectModel();
		this._register(autorun(reader => {
			this.changed.read(reader);
			const current = collectInboxEvidence(session, chat, this.model, item.needsInputPart?.requestId, reader);
			const signature = JSON.stringify(current);
			if (signature !== this.signature) {
				this.signature = signature;
				this.render(current);
			}
		}));
	}

	getAccessibleContent(): string {
		return this.accessibleContent;
	}

	private connectModel(): void {
		const model = this.chatService.getSession(this.chat.resource);
		if (model === this.model) {
			return;
		}
		this.modelStore.clear();
		this.model = model;
		if (model) {
			this.modelStore.add(model.onDidChange(() => this.connectResponse()));
		}
		this.connectResponse();
	}

	private connectResponse(): void {
		const requests = this.model?.getRequests();
		const requestId = this.item.needsInputPart?.requestId;
		const response = (requestId ? requests?.find(request => request.id === requestId) : requests?.at(-1))?.response;
		if (this.response !== response) {
			this.response = response;
			this.responseListener.value = response?.onDidChange(() => this.changed.trigger(undefined));
		}
		this.changed.trigger(undefined);
	}

	private section(title: string, note?: string): HTMLElement {
		const section = this.element.appendChild($('section.inbox-evidence-section'));
		section.appendChild($('h3', undefined, title));
		if (note) {
			section.appendChild($('p.inbox-evidence-note', undefined, note));
		}
		return section;
	}

	private button(parent: HTMLElement, label: string, key: string, action: () => Promise<unknown>, store = this.renderStore): void {
		const button = store.add(new Button(parent, { ...defaultButtonStyles, secondary: true, small: true }));
		button.label = label;
		button.element.dataset.evidenceKey = key;
		this.focusTargets.set(key, button.element);
		store.add(button.onDidClick(async () => {
			try {
				await action();
			} catch (error) {
				this.logService.error('[InboxEvidence] Failed to open source', error);
				this.notificationService.error(localize('inbox.evidence.openFailed', "Could not open this evidence source. It may no longer be available."));
			}
		}));
	}

	private render(evidence: IInboxEvidence): void {
		const focused = getActiveElement();
		const focusKey = isHTMLElement(focused) && this.element.contains(focused) ? focused.dataset.evidenceKey : undefined;
		this.renderStore.clear();
		this.focusTargets.clear();
		clearNode(this.element);
		const accessible: string[] = [];
		if (evidence.error || evidence.canceled) {
			const section = this.section(localize('inbox.evidence.incomplete', "Incomplete turn"));
			const message = evidence.error ?? localize('inbox.evidence.canceled', "This turn was canceled. Recorded evidence may be incomplete.");
			section.appendChild($('p.inbox-evidence-note', undefined, message));
			accessible.push(message);
		}
		if (evidence.images.length) {
			const title = localize('inbox.evidence.images', "Images");
			const section = this.section(title, localize('inbox.evidence.imagesNote', "Recorded images. Open an image to inspect or compare sources."));
			const cancellation = new CancellationTokenSource();
			this.renderStore.add(toDisposable(() => cancellation.dispose(true)));
			const imageContentIndex = accessible.length;
			void this.renderImages(section, evidence.images, cancellation, this.renderStore, images => {
				accessible.splice(imageContentIndex, 0, ...images.map(image => `${image.name}: ${image.uri.toString(true)}`));
				this.accessibleContent = accessible.join('\n\n');
			}, focusKey);
		}
		if (evidence.artifacts.length) {
			const section = this.section(localize('inbox.evidence.sources', "Artifacts and references"));
			const list = section.appendChild($('ul.inbox-evidence-files'));
			for (const artifact of evidence.artifacts) {
				const uri = artifact.uri ?? artifact.link;
				const row = list.appendChild($('li'));
				const label = artifact.isArtifact ? artifact.label : localize('inbox.evidence.reference', "Reference: {0}", artifact.label);
				if (uri) {
					this.button(row, label, `artifact:${artifact.id}`, () => this.openerService.open(uri));
				} else {
					row.textContent = label;
				}
				accessible.push(`${label}: ${uri?.toString(true) ?? artifact.commitHash ?? ''}`);
			}
		}
		this.element.style.display = this.element.hasChildNodes() ? '' : 'none';
		this.accessibleContent = accessible.join('\n\n');
		if (focusKey) {
			this.focusTargets.get(focusKey)?.focus();
		}
		this.onLayout();
	}

	private async renderImages(section: HTMLElement, images: readonly IInboxEvidenceImage[], cancellation: CancellationTokenSource, store: DisposableStore, onLoaded: (images: readonly IInboxEvidenceImage[]) => void, focusKey?: string): Promise<void> {
		const loading = section.appendChild($('p.inbox-evidence-note', undefined, localize('inbox.evidence.imagesLoading', "Loading images…")));
		const uniqueImages: IInboxEvidenceImage[] = [];
		const hashes = new Set<string>();
		const previews = new Map<IInboxEvidenceImage, VSBuffer>();
		for (const image of images) {
			try {
				const content = await this.fileService.readFile(image.uri, { limits: { size: 10 * 1024 * 1024 } }, cancellation.token);
				if (cancellation.token.isCancellationRequested) {
					return;
				}
				const hash = await hashAsync(content.value);
				if (cancellation.token.isCancellationRequested) {
					return;
				}
				if (hashes.has(hash)) {
					continue;
				}
				hashes.add(hash);
				uniqueImages.push(image);
				if (uniqueImages.length <= 2) {
					previews.set(image, content.value);
				}
			} catch (error) {
				if (cancellation.token.isCancellationRequested) {
					return;
				}
				this.logService.warn('[InboxEvidence] Image preview unavailable', error);
				uniqueImages.push(image);
			}
		}
		loading.remove();
		const grid = section.appendChild($('.inbox-evidence-images'));
		for (const image of uniqueImages.slice(0, 2)) {
			this.renderImage(grid, image, uniqueImages, previews.get(image), store);
		}
		if (uniqueImages.length > 2) {
			section.appendChild($('p.inbox-evidence-note', undefined, localize('inbox.evidence.moreImages', "Showing 2 of {0} images. Open an image to browse the full collection.", uniqueImages.length)));
		}
		onLoaded(uniqueImages);
		if (focusKey && getActiveElement() === this.element.ownerDocument.body) {
			this.focusTargets.get(focusKey)?.focus();
		}
		this.onLayout();
	}

	private renderImage(parent: HTMLElement, image: IInboxEvidenceImage, images: readonly IInboxEvidenceImage[], content: VSBuffer | undefined, store: DisposableStore): void {
		const figure = parent.appendChild($('figure.inbox-evidence-image'));
		const preview = figure.appendChild($<HTMLImageElement>('img', { alt: image.name }));
		const message = figure.appendChild($('p.inbox-evidence-note', undefined, localize('inbox.evidence.imageLoading', "Loading image…")));
		figure.appendChild($('figcaption', undefined, image.name));
		this.button(figure, localize('inbox.evidence.inspectImage', "Inspect image"), `image:${image.uri}`, () =>
			this.carouselService.openCarouselAtResource(image.uri, undefined, { sessionResource: this.chat.resource, additionalImages: images, includeChatImages: false }), store);
		store.add(addDisposableListener(preview, 'load', () => {
			message.remove();
			this.onLayout();
		}));
		store.add(addDisposableListener(preview, 'error', () => {
			preview.remove();
			message.textContent = localize('inbox.evidence.imageInvalid', "This image could not be displayed. Open the source to inspect it.");
			this.onLayout();
		}));
		if (content) {
			const url = URL.createObjectURL(new Blob([content.buffer.slice()], { type: image.mimeType }));
			store.add(toDisposable(() => URL.revokeObjectURL(url)));
			preview.src = url;
		} else {
			preview.remove();
			message.textContent = localize('inbox.evidence.imageUnavailable', "Preview unavailable (missing, unsupported, or larger than 10 MB). Open the source to inspect it.");
		}
	}
}
