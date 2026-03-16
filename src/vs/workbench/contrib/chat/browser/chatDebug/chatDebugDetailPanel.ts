/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Orientation, Sash, SashState } from '../../../../../base/browser/ui/sash/sash.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IUntitledTextResourceEditorInput } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatDebugEvent, IChatDebugService } from '../../common/chatDebugService.js';
import { formatEventDetail } from './chatDebugEventDetailRenderer.js';
import { renderCustomizationDiscoveryContent, fileListToPlainText } from './chatCustomizationDiscoveryRenderer.js';
import { renderUserMessageContent, renderAgentResponseContent, messageEventToPlainText, renderResolvedMessageContent, resolvedMessageToPlainText } from './chatDebugMessageContentRenderer.js';
import { renderToolCallContent, toolCallContentToPlainText } from './chatDebugToolCallContentRenderer.js';
import { renderModelTurnContent, modelTurnContentToPlainText } from './chatDebugModelTurnContentRenderer.js';

const $ = DOM.$;

const DETAIL_PANEL_DEFAULT_WIDTH = 350;
const DETAIL_PANEL_MIN_WIDTH = 200;
const DETAIL_PANEL_MAX_WIDTH = 800;

/**
 * Reusable detail panel that resolves and displays the content of a
 * single {@link IChatDebugEvent}. Used by both the logs view and the
 * flow chart view.
 */
export class ChatDebugDetailPanel extends Disposable {

	private readonly _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	private readonly _onDidChangeWidth = this._register(new Emitter<number>());
	readonly onDidChangeWidth = this._onDidChangeWidth.event;

	readonly element: HTMLElement;
	private readonly contentContainer: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly sash: Sash;
	private headerElement: HTMLElement | undefined;
	private readonly detailDisposables = this._register(new DisposableStore());
	private currentDetailText: string = '';
	private currentDetailEventId: string | undefined;
	private firstFocusableElement: HTMLElement | undefined;
	private _width: number = DETAIL_PANEL_DEFAULT_WIDTH;

	get width(): number {
		return this._width;
	}

	constructor(
		parent: HTMLElement,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IHoverService private readonly hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();
		this.element = DOM.append(parent, $('.chat-debug-detail-panel'));
		this.contentContainer = $('.chat-debug-detail-content');
		this.scrollable = this._register(new DomScrollableElement(this.contentContainer, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
		}));
		this.element.style.width = `${this._width}px`;
		DOM.hide(this.element);

		// Sash on the parent container, positioned at the left edge of the detail panel
		this.sash = this._register(new Sash(parent, {
			getVerticalSashLeft: () => parent.offsetWidth - this._width,
		}, { orientation: Orientation.VERTICAL }));
		this.sash.state = SashState.Disabled;

		let sashStartWidth: number | undefined;
		this._register(this.sash.onDidStart(() => sashStartWidth = this._width));
		this._register(this.sash.onDidEnd(() => {
			sashStartWidth = undefined;
			this.sash.layout();
		}));
		this._register(this.sash.onDidChange(e => {
			if (sashStartWidth === undefined) {
				return;
			}
			// Dragging left (negative currentX delta) should increase width
			const delta = e.startX - e.currentX;
			const newWidth = Math.max(DETAIL_PANEL_MIN_WIDTH, Math.min(DETAIL_PANEL_MAX_WIDTH, sashStartWidth + delta));
			this._width = newWidth;
			this.element.style.width = `${newWidth}px`;
			this.sash.layout();
			this._onDidChangeWidth.fire(newWidth);
		}));

		// Handle Ctrl+A / Cmd+A to select all within the detail panel
		this._register(DOM.addDisposableListener(this.element, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
				const target = e.target as HTMLElement | null;
				if (target && this.element.contains(target)) {
					e.preventDefault();
					const targetWindow = DOM.getWindow(target);
					const selection = targetWindow.getSelection();
					if (selection) {
						const range = targetWindow.document.createRange();
						range.selectNodeContents(target);
						selection.removeAllRanges();
						selection.addRange(range);
					}
				}
			}
		}));
	}

	async show(event: IChatDebugEvent): Promise<void> {
		// Skip re-rendering if we're already showing this event's detail
		if (event.id && event.id === this.currentDetailEventId) {
			return;
		}
		this.currentDetailEventId = event.id;

		const resolved = event.id ? await this.chatDebugService.resolveEvent(event.id) : undefined;

		DOM.show(this.element);
		this.sash.state = SashState.Enabled;
		this.sash.layout();
		DOM.clearNode(this.element);
		DOM.clearNode(this.contentContainer);
		this.detailDisposables.clear();

		// Header with action buttons
		const header = DOM.append(this.element, $('.chat-debug-detail-header'));
		this.headerElement = header;
		this.element.appendChild(this.scrollable.getDomNode());

		const fullScreenButton = this.detailDisposables.add(new Button(header, { ariaLabel: localize('chatDebug.openInEditor', "Open in Editor"), title: localize('chatDebug.openInEditor', "Open in Editor") }));
		fullScreenButton.element.classList.add('chat-debug-detail-button');
		fullScreenButton.icon = Codicon.goToFile;
		this.firstFocusableElement = fullScreenButton.element;
		this.detailDisposables.add(fullScreenButton.onDidClick(() => {
			this.editorService.openEditor({ contents: this.currentDetailText, resource: undefined } satisfies IUntitledTextResourceEditorInput);
		}));

		const copyButton = this.detailDisposables.add(new Button(header, { ariaLabel: localize('chatDebug.copyToClipboard', "Copy"), title: localize('chatDebug.copyToClipboard', "Copy") }));
		copyButton.element.classList.add('chat-debug-detail-button');
		copyButton.icon = Codicon.copy;
		this.detailDisposables.add(copyButton.onDidClick(() => {
			this.clipboardService.writeText(this.currentDetailText);
		}));

		const closeButton = this.detailDisposables.add(new Button(header, { ariaLabel: localize('chatDebug.closeDetail', "Close"), title: localize('chatDebug.closeDetail', "Close") }));
		closeButton.element.classList.add('chat-debug-detail-button');
		closeButton.icon = Codicon.close;
		this.detailDisposables.add(closeButton.onDidClick(() => {
			this.hide();
		}));

		if (resolved && resolved.kind === 'fileList') {
			this.currentDetailText = fileListToPlainText(resolved);
			const { element: contentEl, disposables: contentDisposables } = this.instantiationService.invokeFunction(accessor =>
				renderCustomizationDiscoveryContent(resolved, this.openerService, accessor.get(IModelService), this.languageService, this.hoverService, accessor.get(ILabelService))
			);
			this.detailDisposables.add(contentDisposables);
			this.contentContainer.appendChild(contentEl);
		} else if (resolved && resolved.kind === 'toolCall') {
			this.currentDetailText = toolCallContentToPlainText(resolved);
			const { element: contentEl, disposables: contentDisposables } = await renderToolCallContent(resolved, this.languageService, this.clipboardService);
			if (this.currentDetailEventId !== event.id) {
				// Another event was selected while we were rendering
				contentDisposables.dispose();
				return;
			}
			this.detailDisposables.add(contentDisposables);
			this.contentContainer.appendChild(contentEl);
		} else if (resolved && resolved.kind === 'message') {
			this.currentDetailText = resolvedMessageToPlainText(resolved);
			const { element: contentEl, disposables: contentDisposables } = await renderResolvedMessageContent(resolved, this.languageService, this.clipboardService);
			if (this.currentDetailEventId !== event.id) {
				contentDisposables.dispose();
				return;
			}
			this.detailDisposables.add(contentDisposables);
			this.contentContainer.appendChild(contentEl);
		} else if (resolved && resolved.kind === 'modelTurn') {
			this.currentDetailText = modelTurnContentToPlainText(resolved);
			const { element: contentEl, disposables: contentDisposables } = await renderModelTurnContent(resolved, this.languageService, this.clipboardService);
			if (this.currentDetailEventId !== event.id) {
				// Another event was selected while we were rendering
				contentDisposables.dispose();
				return;
			}
			this.detailDisposables.add(contentDisposables);
			this.contentContainer.appendChild(contentEl);
		} else if (event.kind === 'userMessage') {
			this.currentDetailText = messageEventToPlainText(event);
			const { element: contentEl, disposables: contentDisposables } = await renderUserMessageContent(event, this.languageService, this.clipboardService);
			if (this.currentDetailEventId !== event.id) {
				contentDisposables.dispose();
				return;
			}
			this.detailDisposables.add(contentDisposables);
			this.contentContainer.appendChild(contentEl);
		} else if (event.kind === 'agentResponse') {
			this.currentDetailText = messageEventToPlainText(event);
			const { element: contentEl, disposables: contentDisposables } = await renderAgentResponseContent(event, this.languageService, this.clipboardService);
			if (this.currentDetailEventId !== event.id) {
				contentDisposables.dispose();
				return;
			}
			this.detailDisposables.add(contentDisposables);
			this.contentContainer.appendChild(contentEl);
		} else {
			const pre = DOM.append(this.contentContainer, $('pre'));
			pre.tabIndex = 0;
			if (resolved) {
				this.currentDetailText = resolved.value;
			} else {
				this.currentDetailText = formatEventDetail(event);
			}
			pre.textContent = this.currentDetailText;
		}

		// Compute height from the parent container and set explicit
		// dimensions so the scrollable element can show proper scrollbars.
		const parentHeight = this.element.parentElement?.clientHeight ?? 0;
		if (parentHeight > 0) {
			this.layout(parentHeight);
		} else {
			this.scrollable.scanDomNode();
		}
	}

	get isVisible(): boolean {
		return this.element.style.display !== 'none';
	}

	focus(): void {
		this.firstFocusableElement?.focus();
	}

	/**
	 * Set explicit dimensions on the scrollable element so the scrollbar
	 * can compute its size. Call after the panel is shown and whenever
	 * the available space changes.
	 */
	layout(height: number): void {
		const headerHeight = this.headerElement?.offsetHeight ?? 0;
		const scrollableHeight = Math.max(0, height - headerHeight);
		this.contentContainer.style.height = `${scrollableHeight}px`;
		this.scrollable.scanDomNode();
		this.sash.layout();
	}

	layoutSash(): void {
		this.sash.layout();
	}

	hide(): void {
		this.currentDetailEventId = undefined;
		this.firstFocusableElement = undefined;
		this.headerElement = undefined;
		DOM.hide(this.element);
		this.sash.state = SashState.Disabled;
		DOM.clearNode(this.element);
		DOM.clearNode(this.contentContainer);
		this.detailDisposables.clear();
		this._onDidHide.fire();
	}
}
