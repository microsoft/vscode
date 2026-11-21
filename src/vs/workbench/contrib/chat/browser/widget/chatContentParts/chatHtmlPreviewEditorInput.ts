/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { convertHtmlToMarkdown } from '../../../../../../base/browser/htmlToMarkdown.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { localize } from '../../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { IWebviewService, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED, WebviewContentPurpose } from '../../../../webview/browser/webview.js';
import { CONTEXT_ACTIVE_WEBVIEW_PANEL_ID } from '../../../../webviewPanel/browser/webviewEditor.js';
import { WebviewInput } from '../../../../webviewPanel/browser/webviewEditorInput.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { createHtmlPreviewDocument, getHtmlPreviewWebviewOptions } from './chatHtmlPreviewDocument.js';

export class ChatHtmlPreviewEditorInput extends WebviewInput {
	static readonly viewType = 'vscode.chat.htmlPreview';
	readonly html: string;

	constructor(
		readonly source: string,
		readonly sourceId: string,
		@IWebviewService webviewService: IWebviewService,
		@IThemeService themeService: IThemeService,
		@ILogService logService: ILogService,
		@INotificationService notificationService: INotificationService,
	) {
		const title = localize('chat.htmlPreview.editorTitle', "HTML Preview");
		const options = getHtmlPreviewWebviewOptions(title);
		const html = createHtmlPreviewDocument(source);
		super({
			viewType: ChatHtmlPreviewEditorInput.viewType,
			providedId: ChatHtmlPreviewEditorInput.viewType,
			name: title,
			iconPath: Codicon.preview,
		}, webviewService.createWebviewOverlay({
			...options,
			options: { ...options.options, purpose: WebviewContentPurpose.CustomEditor, enableFindWidget: true, tryRestoreScrollPosition: true },
		}), themeService);
		this.html = html;
		this._register(this.webview.onFatalError(error => {
			logService.error('Error loading expanded chat HTML preview', error.message);
			notificationService.error(localize('chat.htmlPreview.editorError', "Unable to load HTML preview. The original source is still available in the chat."));
		}));
		this.webview.setHtml(html);
	}
}

export class ChatHtmlPreviewAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 125;
	readonly name = 'chatHtmlPreview';
	readonly when = ContextKeyExpr.and(ChatContextKeys.enabled, CONTEXT_ACTIVE_WEBVIEW_PANEL_ID.isEqualTo(ChatHtmlPreviewEditorInput.viewType), KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED.toNegated());

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editorService = accessor.get(IEditorService);
		const input = editorService.activeEditor;
		if (!(input instanceof ChatHtmlPreviewEditorInput) || !input.webview.isFocused) {
			return undefined;
		}
		const content = this.type === AccessibleViewType.Help
			? localize('chat.htmlPreview.editorHelp', "This is an expanded HTML response preview. Use Tab and Shift+Tab to reach links to sections and expandable disclosures. External links, scripts, and forms are disabled. Use Find{0} to search the document, or Accessible View{1} to read its text. Close the editor{2} to return to chat, where the preview context menu offers Show Source and Save HTML. Focus the HTML preview and press Shift+F10 to open its context menu. Save HTML exports a sanitized, self-contained document, not the original source.", '<keybinding:editor.action.webvieweditor.showFind>', '<keybinding:editor.action.accessibleView>', '<keybinding:workbench.action.closeActiveEditor>')
			: convertHtmlToMarkdown(input.html);
		return new AccessibleContentProvider(
			AccessibleViewProviderId.ChatHtmlPreview,
			{ type: this.type },
			() => content,
			() => {
				if (!input.isDisposed() && editorService.activeEditor === input) {
					input.webview.focus();
				}
			},
			AccessibilityVerbositySettingId.Chat,
		);
	}
}
