/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
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
import { renderFileListContent, fileListToPlainText } from './chatDebugFileListRenderer.js';
import { renderUserMessageContent, renderAgentResponseContent, messageEventToPlainText, renderResolvedMessageContent, resolvedMessageToPlainText } from './chatDebugMessageContentRenderer.js';

const $ = DOM.$;

/**
 * Reusable detail panel that resolves and displays the content of a
 * single {@link IChatDebugEvent}. Used by both the logs view and the
 * flow chart view.
 */
export class ChatDebugDetailPanel extends Disposable {

	private readonly _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;

	readonly element: HTMLElement;
	private readonly detailDisposables = this._register(new DisposableStore());
	private currentDetailText: string = '';
	private currentDetailEventId: string | undefined;

	constructor(
		parent: HTMLElement,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IHoverService private readonly hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();
		this.element = DOM.append(parent, $('.chat-debug-detail-panel'));
		DOM.hide(this.element);

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
		DOM.clearNode(this.element);
		this.detailDisposables.clear();

		// Header with action buttons
		const header = DOM.append(this.element, $('.chat-debug-detail-header'));

		const fullScreenButton = this.detailDisposables.add(new Button(header, { ariaLabel: localize('chatDebug.openInEditor', "Open in Editor"), title: localize('chatDebug.openInEditor', "Open in Editor") }));
		fullScreenButton.element.classList.add('chat-debug-detail-button');
		fullScreenButton.icon = Codicon.goToFile;
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
				renderFileListContent(resolved, this.openerService, accessor.get(IModelService), accessor.get(ILanguageService), this.hoverService, accessor.get(ILabelService))
			);
			this.detailDisposables.add(contentDisposables);
			this.element.appendChild(contentEl);
		} else if (resolved && resolved.kind === 'message') {
			this.currentDetailText = resolvedMessageToPlainText(resolved);
			const { element: contentEl, disposables: contentDisposables } = renderResolvedMessageContent(resolved);
			this.detailDisposables.add(contentDisposables);
			this.element.appendChild(contentEl);
		} else if (event.kind === 'userMessage') {
			this.currentDetailText = messageEventToPlainText(event);
			const { element: contentEl, disposables: contentDisposables } = renderUserMessageContent(event);
			this.detailDisposables.add(contentDisposables);
			this.element.appendChild(contentEl);
		} else if (event.kind === 'agentResponse') {
			this.currentDetailText = messageEventToPlainText(event);
			const { element: contentEl, disposables: contentDisposables } = renderAgentResponseContent(event);
			this.detailDisposables.add(contentDisposables);
			this.element.appendChild(contentEl);
		} else {
			const pre = DOM.append(this.element, $('pre'));
			pre.tabIndex = 0;
			if (resolved) {
				this.currentDetailText = resolved.value;
			} else {
				this.currentDetailText = formatEventDetail(event);
			}
			pre.textContent = this.currentDetailText;
		}
	}

	hide(): void {
		this.currentDetailEventId = undefined;
		DOM.hide(this.element);
		DOM.clearNode(this.element);
		this.detailDisposables.clear();
		this._onDidHide.fire();
	}
}
