/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { createPixelSpinner, IPixelSpinner } from '../../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, type IReader } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { ILinkPresentation, ILinkPresentationService, ILinkPresentationStatus, ILinkPresentationWatcher, LinkPresentationKind, LinkPresentationStatusKind } from '../../../../../../platform/dataChannel/common/dataChannel.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ISessionSummaryHoverService } from '../../agentSessions/sessionSummaryHoverService.js';
import './media/chatRichLink.css';

// Copied and adapted from @vscode/markdown-editor's src/view/content/richLink.ts.

export type ChatLinkPresentationKind = LinkPresentationKind;
export type ChatLinkPresentationStatusKind = LinkPresentationStatusKind;
export type IChatLinkPresentationStatus = ILinkPresentationStatus;
export type IChatLinkPresentation = ILinkPresentation;

export class ChatRichLink implements IDisposable {
	static mount(element: HTMLElement, authoredLabel: HTMLSpanElement): ChatRichLink {
		return new ChatRichLink(element, authoredLabel);
	}

	private readonly _icon: HTMLSpanElement;
	private readonly _title: HTMLSpanElement;
	private readonly _detail: HTMLSpanElement;
	private readonly _reference: HTMLSpanElement;
	private readonly _changes: IChatRichLinkChangesDom;
	private readonly _status: IChatRichLinkStatusDom;
	private readonly _secondaryStatus: IChatRichLinkStatusDom;

	private constructor(
		readonly element: HTMLElement,
		readonly authoredLabel: HTMLSpanElement,
	) {
		const document = element.ownerDocument;
		this._icon = document.createElement('span');
		this._icon.className = 'chat-rich-link-icon codicon';
		this._icon.setAttribute('aria-hidden', 'true');
		this._title = document.createElement('span');
		this._title.className = 'chat-rich-link-title';
		this._detail = document.createElement('span');
		this._detail.className = 'chat-rich-link-detail';
		this._reference = document.createElement('span');
		this._reference.className = 'chat-rich-link-reference';
		this._changes = createRichLinkChangesDom(document);
		this._status = createRichLinkStatusDom(document, 'chat-rich-link-primary-status');
		this._secondaryStatus = createRichLinkStatusDom(document, 'chat-rich-link-secondary-status');
		this.authoredLabel.className = 'chat-rich-link-label';
		this.element.classList.add('chat-rich-link');
		this._setDefaultOrder();
	}

	update(presentation: IChatLinkPresentation): void {
		this.element.dataset.chatRichLinkKind = presentation.kind;
		this.element.classList.toggle('chat-rich-link-loading', presentation.isLoading === true);
		this.element.setAttribute('aria-busy', String(presentation.isLoading === true));
		this._icon.className = `chat-rich-link-icon codicon codicon-${richLinkIcons[presentation.kind]}`;
		this.authoredLabel.hidden = Boolean(presentation.title);
		this._title.textContent = presentation.title ?? '';
		this._title.hidden = !presentation.title;
		this._detail.textContent = presentation.detail ?? '';
		this._detail.hidden = !presentation.detail;
		this._reference.textContent = presentation.reference ?? '';
		this._reference.hidden = !presentation.reference;
		updateRichLinkChanges(this._changes, presentation.changes);
		updateRichLinkStatus(this.element, presentation.kind, this._status, presentation.status, 'chatRichLinkStatus');
		updateRichLinkStatus(this.element, presentation.kind, this._secondaryStatus, presentation.secondaryStatus, 'chatRichLinkSecondaryStatus');
		patchDomNodes(this.element, hasLeadingLifecycleStatus(presentation)
			? [this._status.root, this.authoredLabel, this._title, this._detail, this._reference, this._changes.root, this._secondaryStatus.root]
			: [this._icon, this.authoredLabel, this._title, this._detail, this._reference, this._changes.root, this._status.root, this._secondaryStatus.root]);
		if (presentation.ariaLabel) {
			this.element.setAttribute('aria-label', presentation.ariaLabel);
		} else {
			this.element.removeAttribute('aria-label');
		}
		this.element.removeAttribute('title');
	}

	dispose(): void {
		disposeRichLinkStatus(this._status);
		disposeRichLinkStatus(this._secondaryStatus);
	}

	private _setDefaultOrder(): void {
		patchDomNodes(this.element, [
			this._icon,
			this.authoredLabel,
			this._title,
			this._detail,
			this._reference,
			this._changes.root,
			this._status.root,
			this._secondaryStatus.root,
		]);
	}
}

export class ChatRichLinkDecorator extends Disposable {
	constructor(
		private readonly _linkPresentationService: ILinkPresentationService,
		private readonly _hoverService: IHoverService,
		private readonly _sessionSummaryHoverService: ISessionSummaryHoverService,
	) {
		super();
	}

	decorate(anchor: HTMLAnchorElement, href: string, store: DisposableStore): boolean {
		const watcher = this._getLinkPresentationWatcher(href);
		if (watcher) {
			store.add(watcher);
			return this._decorate(anchor, href, store, reader => watcher.presentation.read(reader) ?? createLoadingLinkPresentation(anchor.textContent || href, href));
		}
		return false;
	}

	private _decorate(
		anchor: HTMLAnchorElement,
		href: string,
		store: DisposableStore,
		readPresentation: (reader: IReader) => ILinkPresentation,
	): boolean {
		const authoredLabel = anchor.ownerDocument.createElement('span');
		authoredLabel.textContent = anchor.textContent || href;
		const richLink = store.add(ChatRichLink.mount(anchor, authoredLabel));
		let tooltip = href;
		let kind: ChatLinkPresentationKind | undefined;
		store.add(autorun(reader => {
			const presentation = readPresentation(reader);
			tooltip = presentation.tooltip ?? href;
			kind = presentation.kind;
			richLink.update(presentation);
		}));
		store.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate('element'), anchor, () => {
			// A session pill gets the same rich hover the sessions list shows, when
			// this window can resolve the session behind the link. Anything else —
			// and any link the window does not know — keeps the plain tooltip.
			if (kind !== 'session' && kind !== 'chat') {
				return tooltip;
			}
			return {
				element: async token => await this._createSessionHoverElement(href, token) ?? plainTooltipElement(anchor.ownerDocument, tooltip),
			};
		}));
		return true;
	}

	private async _createSessionHoverElement(href: string, token: CancellationToken): Promise<HTMLElement | undefined> {
		let resource: URI;
		try {
			resource = URI.parse(href);
		} catch {
			return undefined;
		}
		return this._sessionSummaryHoverService.createHoverElement(resource, token);
	}

	private _getLinkPresentationWatcher(href: string): ILinkPresentationWatcher | undefined {
		let resource: URI;
		try {
			resource = URI.parse(href);
		} catch {
			return undefined;
		}
		const rule = this._linkPresentationService.getLinkPresentationRule(resource);
		return rule ? this._linkPresentationService.createLinkPresentationWatcher(rule.id, resource) : undefined;
	}
}

/**
 * The plain tooltip as an element, so a session link whose hover data cannot be
 * resolved still shows something (the managed hover's element factory has no way
 * to fall back to a string).
 */
function plainTooltipElement(document: Document, tooltip: string): HTMLElement {
	const element = document.createElement('div');
	element.className = 'chat-rich-link-plain-hover';
	element.textContent = tooltip;
	return element;
}

interface IChatRichLinkStatusDom {
	readonly root: HTMLSpanElement;
	readonly icon: HTMLSpanElement;
	readonly label: HTMLSpanElement;
	pixelSpinner?: IPixelSpinner;
	spinnerVariant?: 'grid' | 'ring';
}

interface IChatRichLinkChangesDom {
	readonly root: HTMLSpanElement;
	readonly insertions: HTMLSpanElement;
	readonly deletions: HTMLSpanElement;
}

const richLinkIcons: Readonly<Record<ChatLinkPresentationKind, string>> = {
	resource: 'link',
	issue: 'issues',
	pullRequest: 'git-pull-request',
	commit: 'git-commit',
	file: 'file',
	folder: 'folder-compact',
	session: 'agent',
	chat: 'comment-discussion',
	repository: 'repo-compact',
	branch: 'git-branch-compact',
};

function createRichLinkStatusDom(document: Document, className: string): IChatRichLinkStatusDom {
	const root = document.createElement('span');
	root.className = `chat-rich-link-status ${className}`;
	const icon = document.createElement('span');
	icon.className = 'chat-rich-link-status-icon codicon';
	icon.setAttribute('aria-hidden', 'true');
	const label = document.createElement('span');
	label.className = 'chat-rich-link-status-label';
	root.append(icon, label);
	return { root, icon, label };
}

function createRichLinkChangesDom(document: Document): IChatRichLinkChangesDom {
	const root = document.createElement('span');
	root.className = 'chat-rich-link-changes';
	const insertions = document.createElement('span');
	insertions.className = 'chat-rich-link-insertions';
	const deletions = document.createElement('span');
	deletions.className = 'chat-rich-link-deletions';
	root.append(insertions, deletions);
	return { root, insertions, deletions };
}

function updateRichLinkChanges(dom: IChatRichLinkChangesDom, changes: IChatLinkPresentation['changes']): void {
	if (!changes) {
		dom.insertions.textContent = '';
		dom.deletions.textContent = '';
		dom.root.hidden = true;
		return;
	}
	dom.insertions.textContent = `+${changes.insertions}`;
	dom.deletions.textContent = `-${changes.deletions}`;
	dom.root.hidden = false;
}

function updateRichLinkStatus(
	element: HTMLElement,
	presentationKind: ChatLinkPresentationKind,
	dom: IChatRichLinkStatusDom,
	status: IChatLinkPresentationStatus | undefined,
	dataKey: 'chatRichLinkStatus' | 'chatRichLinkSecondaryStatus',
): void {
	if (!status) {
		delete element.dataset[dataKey];
		resetRichLinkStatus(dom);
		return;
	}
	element.dataset[dataKey] = status.kind;
	const spinnerVariant = getSessionSpinnerVariant(presentationKind, status.kind);
	dom.icon.className = `chat-rich-link-status-icon codicon codicon-${getRichLinkStatusIcon(presentationKind, status.kind)}`;
	dom.icon.hidden = spinnerVariant !== undefined;
	if (spinnerVariant && spinnerVariant !== dom.spinnerVariant) {
		disposePixelSpinner(dom);
		dom.pixelSpinner = createPixelSpinner(undefined, { variant: spinnerVariant });
		dom.spinnerVariant = spinnerVariant;
		dom.label.before(dom.pixelSpinner.element);
	} else if (!spinnerVariant) {
		disposePixelSpinner(dom);
	}
	dom.label.textContent = status.label;
	dom.root.hidden = false;
}

function resetRichLinkStatus(dom: IChatRichLinkStatusDom): void {
	dom.icon.hidden = false;
	disposePixelSpinner(dom);
	dom.label.textContent = '';
	dom.root.hidden = true;
}

function disposeRichLinkStatus(dom: IChatRichLinkStatusDom): void {
	disposePixelSpinner(dom);
}

function disposePixelSpinner(dom: IChatRichLinkStatusDom): void {
	dom.pixelSpinner?.element.remove();
	dom.pixelSpinner?.dispose();
	dom.pixelSpinner = undefined;
	dom.spinnerVariant = undefined;
}

function getSessionSpinnerVariant(
	presentationKind: ChatLinkPresentationKind,
	statusKind: ChatLinkPresentationStatusKind,
): 'grid' | 'ring' | undefined {
	if (presentationKind !== 'session') {
		return undefined;
	}
	switch (statusKind) {
		case 'pending': return 'grid';
		case 'warning': return 'ring';
		default: return undefined;
	}
}

function hasLeadingLifecycleStatus(presentation: IChatLinkPresentation): boolean {
	const statusKind = presentation.status?.kind;
	switch (presentation.kind) {
		case 'issue':
			return statusKind === 'open' || statusKind === 'closed' || statusKind === 'notPlanned';
		case 'pullRequest':
			return statusKind === 'open' || statusKind === 'closed' || statusKind === 'merged' || statusKind === 'draft';
		default:
			return false;
	}
}

function getRichLinkStatusIcon(
	presentationKind: ChatLinkPresentationKind,
	statusKind: ChatLinkPresentationStatusKind,
): string {
	if (presentationKind === 'session') {
		switch (statusKind) {
			case 'pending':
			case 'warning':
			case 'success':
			case 'neutral':
				return 'comment-discussion';
			case 'error':
				return 'error-compact';
		}
	}
	switch (statusKind) {
		case 'open': return presentationKind === 'pullRequest' ? 'git-pull-request' : 'issue-opened';
		case 'closed': return presentationKind === 'pullRequest' ? 'git-pull-request-closed' : 'issue-closed';
		case 'merged': return 'git-merge';
		case 'draft': return 'git-pull-request-draft';
		case 'notPlanned': return 'circle-slash-compact';
		case 'pending': return 'circle-filled-compact';
		case 'success': return 'pass-filled-compact';
		case 'warning': return 'warning-compact';
		case 'error': return 'error-compact';
		case 'neutral': return 'circle-outline';
	}
}

function createLoadingLinkPresentation(authoredLabel: string, href: string): ILinkPresentation {
	const loading = localize('chat.richLink.loading', "Loading");
	return {
		kind: 'resource',
		status: { kind: 'pending', label: loading },
		tooltip: href,
		ariaLabel: localize('chat.richLink.loading.ariaLabel', "Link {0}, {1}", authoredLabel, loading),
	};
}

function patchDomNodes(parent: Node, nodes: readonly Node[]): void {
	let domCursor: ChildNode | null = parent.firstChild;
	let index = 0;
	for (; index < nodes.length; index++) {
		if (domCursor !== nodes[index]) {
			break;
		}
		domCursor = domCursor.nextSibling;
	}
	if (index === nodes.length && domCursor === null) {
		return;
	}
	for (; index < nodes.length; index++) {
		const node = nodes[index];
		if (domCursor === node) {
			domCursor = node.nextSibling;
		} else {
			parent.insertBefore(node, domCursor);
		}
	}
	while (domCursor) {
		const toRemove = domCursor;
		domCursor = domCursor.nextSibling;
		parent.removeChild(toRemove);
	}
}
