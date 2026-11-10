/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { status } from '../../../../../../base/browser/ui/aria/aria.js';
import { Action } from '../../../../../../base/common/actions.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { localize } from '../../../../../../nls.js';
import { HiddenItemStrategy, WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { WebviewThemeDataProvider } from '../../../../webview/browser/themeing.js';
import { IWebviewElement, IWebviewService, WebviewContentPurpose } from '../../../../webview/browser/webview.js';
import { IChatWidgetService } from '../../chat.js';
import { delegateWebviewScrollToChatWidget } from '../../chatOutputItemRenderer.js';
import { openChatTurnFile, previewKind } from '../chatTurnPills.js';
import { IDisposableReference } from './chatCollections.js';
import { EditorPool } from './chatContentCodePools.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import { createHtmlPreviewDocument, getHtmlPreviewWebviewOptions } from './chatHtmlPreviewDocument.js';
import { ChatHtmlPreviewEditorInput } from './chatHtmlPreviewEditorInput.js';
import { IChatOutputPartStateCache, IOutputPartState } from './chatOutputPartStateCache.js';
import { CodeBlockPart, ICodeBlockData } from './codeBlockPart.js';
import './media/chatHtmlPreviewPart.css';

export function isHtmlPreviewCodeBlock(languageId: string, raw: string | undefined): boolean {
	if (languageId.toLowerCase() !== 'html-preview' || !raw) {
		return false;
	}

	const lines = raw.trimEnd().split('\n');
	const opening = /^\s*(?<fence>`{3,}|~{3,})/.exec(lines[0])?.groups?.fence;
	const closing = lines.at(-1)?.trim();
	return !!opening && !!closing && lines.length > 1
		&& closing.length >= opening.length
		&& [...closing].every(character => character === opening[0]);
}

export class ChatHtmlPreviewPart extends Disposable {
	static readonly maxPreviewLength = 64_000;

	readonly element = dom.$('.chat-html-preview');
	readonly reuseKey: string;

	private readonly source: IDisposableReference<CodeBlockPart>;
	private readonly webviewDisposables = this._register(new DisposableStore());
	private webview: IWebviewElement | undefined;
	private readonly renderPreview: (() => void) | undefined;
	private readonly previewContainer = dom.$('.chat-html-preview-content');
	private readonly sourceContainer = dom.$('.chat-html-preview-source');
	private readonly toolbar: WorkbenchToolBar;
	private readonly sourceAction: Action;
	private readonly openAction: Action;
	private readonly saveAction: Action;
	private expandedPreview: ChatHtmlPreviewEditorInput | undefined;
	private readonly stateCacheKey: string;
	private readonly partState: IOutputPartState;

	constructor(
		private readonly data: ICodeBlockData,
		context: IChatContentPartRenderContext,
		editorPool: EditorPool,
		private readonly onDidChangeHeight: () => void,
		@IWebviewService webviewService: IWebviewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ILogService logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFileService private readonly fileService: IFileService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService notificationService: INotificationService,
		@IChatOutputPartStateCache stateCache: IChatOutputPartStateCache,
	) {
		super();
		this.reuseKey = CodeBlockPart.poolKey(data.element.id, data.codeBlockIndex);
		this.stateCacheKey = `htmlPreview/${data.chatSessionResource.toString()}/${data.element.id}/${data.codeBlockIndex}`;
		this.partState = stateCache.get(this.stateCacheKey) ?? { height: 0 };
		stateCache.set(this.stateCacheKey, this.partState);
		this.source = this._register(editorPool.get(this.reuseKey));
		this.source.object.render({ ...data, languageId: 'html' }, context.currentWidth.get());

		const header = dom.append(this.element, dom.$('.chat-html-preview-header'));
		const title = dom.append(header, dom.$('span'));
		title.textContent = localize('chat.htmlPreview.title', "HTML preview");
		this.sourceAction = this._register(new Action('chat.htmlPreview.source', localize('chat.htmlPreview.source', "Show Source"), undefined, true, async () => {
			this.showSource(!this.sourceAction.checked);
		}));
		this.sourceAction.checked = !!this.partState.showingSource;
		this.openAction = this._register(new Action('chat.htmlPreview.open', localize('chat.htmlPreview.open', "Open Preview"), undefined, true, () => this.openPreview()));
		this.saveAction = this._register(new Action('chat.htmlPreview.save', localize('chat.htmlPreview.save', "Save HTML..."), undefined, true, () => this.savePreview()));
		this.toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, dom.append(header, dom.$('.chat-html-preview-actions')), {
			ariaLabel: localize('chat.htmlPreview.actions', "HTML preview actions"),
			icon: false,
			label: true,
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
		}));
		this.toolbar.setActions([this.sourceAction, this.openAction, this.saveAction]);
		this._register(this.toolbar.actionRunner.onDidRun(event => {
			if (event.error) {
				logService.error('HTML preview action failed', event.error);
				notificationService.error(event.error);
			}
		}));

		const notice = dom.append(this.element, dom.$('.chat-html-preview-notice'));
		notice.hidden = true;
		this.element.append(this.previewContainer, this.sourceContainer);
		this.sourceContainer.appendChild(this.source.object.element);
		const showingSource = this.updateViewState();

		if (data.text.length > ChatHtmlPreviewPart.maxPreviewLength) {
			notice.textContent = localize('chat.htmlPreview.tooLarge', "HTML preview is too large. Showing source instead.");
			notice.hidden = false;
			this.showSource(true);
			this.sourceAction.enabled = this.openAction.enabled = this.saveAction.enabled = false;
			return;
		}

		const webviewOptions = getHtmlPreviewWebviewOptions(localize('chat.htmlPreview.label', "HTML preview for code block {0}", data.codeBlockIndex + 1));
		const html = createHtmlPreviewDocument(data.text);
		this.renderPreview = () => {
			const webview = this.webview = this.webviewDisposables.add(webviewService.createWebviewElement({
				...webviewOptions,
				options: { ...webviewOptions.options, purpose: WebviewContentPurpose.ChatOutputItem },
			}));
			webview.setContextKeyService(this.webviewDisposables.add(contextKeyService.createScoped(this.previewContainer)));
			this.webviewDisposables.add(delegateWebviewScrollToChatWidget(webview, data.chatSessionResource, chatWidgetService));
			this.webviewDisposables.add(autorun(reader => {
				const size = webview.intrinsicContentSize.read(reader);
				if (size && Number.isFinite(size.height) && size.height > 0) {
					const height = Math.max(100, Math.min(600, size.height + (size.horizontalScrollbarHeight ?? 0)));
					this.partState.height = height;
					this.previewContainer.style.height = `${height}px`;
					this.onDidChangeHeight();
				}
			}));
			this.webviewDisposables.add(webview.onFatalError(error => {
				logService.error('Error loading chat HTML preview', error.message);
				notice.textContent = localize('chat.htmlPreview.error', "Unable to load HTML preview. Showing source instead.");
				notice.setAttribute('role', 'alert');
				notice.hidden = false;
				const restoreFocus = webview.isFocused;
				this.showSource(true);
				this.sourceAction.enabled = false;
				if (restoreFocus) {
					this.source.object.focus();
				}
			}));
			webview.setHtml(html);
			webview.mountTo(this.previewContainer, dom.getWindow(context.container));
		};
		this._register(context.onDidChangeVisibility(visible => {
			if (visible) {
				this.onDidRemount();
			}
		}));
		if (!showingSource) {
			this.renderPreview();
		}
	}

	get uri() {
		return this.source.object.uri;
	}

	hasSameContent(text: string): boolean {
		return this.data.text === text;
	}

	layout(width: number): void {
		this.source.object.layout(width);
	}

	onDidRemount(): void {
		const previousSource = this.sourceAction.checked;
		const previousHeight = this.previewContainer.style.height;
		const showingSource = this.updateViewState();
		const viewStateChanged = previousSource !== showingSource || previousHeight !== this.previewContainer.style.height;
		this.source.object.onDidRemount();
		// A detached iframe can retain an unpainted document even after reinitialization.
		this.webviewDisposables.clear();
		this.webview = undefined;
		if (!showingSource && !this._store.isDisposed) {
			this.renderPreview?.();
		}
		if (viewStateChanged) {
			this.onDidChangeHeight();
		}
	}

	focus(): void {
		if (this.sourceAction.enabled) {
			this.toolbar.focus();
		} else {
			this.source.object.focus();
		}
	}

	private showSource(show: boolean): void {
		this.partState.showingSource = show;
		const showingSource = this.updateViewState();
		if (showingSource) {
			this.source.object.onDidRemount();
		} else if (!this.webview) {
			this.renderPreview?.();
		}
		this.onDidChangeHeight();
	}

	private updateViewState(): boolean {
		const showingSource = !!this.partState.showingSource || !this.sourceAction.enabled;
		this.sourceContainer.hidden = !showingSource;
		this.previewContainer.hidden = showingSource;
		this.sourceAction.checked = showingSource;
		if (Number.isFinite(this.partState.height) && this.partState.height > 0) {
			this.previewContainer.style.height = `${Math.max(100, Math.min(600, this.partState.height))}px`;
		}
		return showingSource;
	}

	private async openPreview(): Promise<void> {
		this.openAction.enabled = false;
		let created: ChatHtmlPreviewEditorInput | undefined;
		try {
			if (!this.expandedPreview || this.expandedPreview.isDisposed()) {
				this.expandedPreview = this.editorService.editors.find((input): input is ChatHtmlPreviewEditorInput =>
					input instanceof ChatHtmlPreviewEditorInput && input.sourceId === this.stateCacheKey && input.source === this.data.text);
				if (!this.expandedPreview) {
					created = this.instantiationService.createInstance(ChatHtmlPreviewEditorInput, this.data.text, this.stateCacheKey);
					this.expandedPreview = created;
				}
			}
			if (!await this.editorService.openEditor(this.expandedPreview, { pinned: true })) {
				created?.dispose();
			}
		} catch (error) {
			created?.dispose();
			throw error;
		} finally {
			this.openAction.enabled = true;
		}
	}

	private async savePreview(): Promise<void> {
		this.saveAction.enabled = false;
		try {
			const store = new DisposableStore();
			let html: string;
			try {
				const theme = store.add(this.instantiationService.createInstance(WebviewThemeDataProvider)).getWebviewThemeData();
				html = createHtmlPreviewDocument(this.data.text, theme);
			} finally {
				store.dispose();
			}
			const target = await this.fileDialogService.showSaveDialog({
				defaultUri: joinPath(await this.fileDialogService.defaultFilePath(), 'html-preview.html'),
				title: localize('chat.htmlPreview.saveTitle', "Save Sanitized HTML Preview"),
				filters: [{ name: localize('chat.htmlPreview.htmlFiles', "HTML"), extensions: ['html'] }],
			});
			if (!target) {
				return;
			}

			await this.fileService.writeFile(target, VSBuffer.fromString(html));
			status(localize('chat.htmlPreview.saved', "Sanitized HTML preview saved."));
			const kind = previewKind(target);
			if (kind) {
				await openChatTurnFile({ uri: target, kind, created: true }, this.openerService, this.configurationService);
			} else {
				await this.editorService.openEditor({ resource: target, options: { pinned: true } });
			}
		} finally {
			this.saveAction.enabled = true;
		}
	}
}
