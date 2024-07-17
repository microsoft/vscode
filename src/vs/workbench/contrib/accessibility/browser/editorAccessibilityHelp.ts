/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { AccessibilityHelpNLS } from 'vs/editor/common/standaloneStrings';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { AccessibilityHelpAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { CONTEXT_CHAT_ENABLED } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { CommentAccessibilityHelpNLS } from 'vs/workbench/contrib/comments/browser/commentsAccessibility';
import { CommentContextKeys } from 'vs/workbench/contrib/comments/common/commentContextKeys';
import { NEW_UNTITLED_FILE_COMMAND_ID } from 'vs/workbench/contrib/files/browser/fileConstants';
import { IAccessibleViewService, IAccessibleViewContentProvider, AccessibleViewProviderId, IAccessibleViewOptions, AccessibleViewType } from 'vs/platform/accessibility/browser/accessibleView';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';

export class EditorAccessibilityHelpContribution extends Disposable {
	static ID: 'editorAccessibilityHelpContribution';
	constructor() {
		super();
		this._register(AccessibilityHelpAction.addImplementation(90, 'editor', async accessor => {
			const codeEditorService = accessor.get(ICodeEditorService);
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const instantiationService = accessor.get(IInstantiationService);
			const commandService = accessor.get(ICommandService);
			let codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
			if (!codeEditor) {
				await commandService.executeCommand(NEW_UNTITLED_FILE_COMMAND_ID);
				codeEditor = codeEditorService.getActiveCodeEditor()!;
			}
			accessibleViewService.show(instantiationService.createInstance(EditorAccessibilityHelpProvider, codeEditor));
		}));
	}
}

class EditorAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	id = AccessibleViewProviderId.Editor;
	onClose() {
		this._editor.focus();
	}
	options: IAccessibleViewOptions = { type: AccessibleViewType.Help, readMoreUrl: 'https://go.microsoft.com/fwlink/?linkid=851010' };
	verbositySettingKey = AccessibilityVerbositySettingId.Editor;
	constructor(
		private readonly _editor: ICodeEditor,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();
	}

	provideContent(): string {
		const options = this._editor.getOptions();
		const content = [];

		if (options.get(EditorOption.inDiffEditor)) {
			if (options.get(EditorOption.readOnly)) {
				content.push(AccessibilityHelpNLS.readonlyDiffEditor);
			} else {
				content.push(AccessibilityHelpNLS.editableDiffEditor);
			}
		} else {
			if (options.get(EditorOption.readOnly)) {
				content.push(AccessibilityHelpNLS.readonlyEditor);
			} else {
				content.push(AccessibilityHelpNLS.editableEditor);
			}
		}

		content.push(AccessibilityHelpNLS.listSignalSounds);
		content.push(AccessibilityHelpNLS.listAlerts);

		const chatCommandInfo = getChatCommandInfo(this._keybindingService, this._contextKeyService);
		if (chatCommandInfo) {
			content.push(chatCommandInfo);
		}

		const commentCommandInfo = getCommentCommandInfo(this._keybindingService, this._contextKeyService, this._editor);
		if (commentCommandInfo) {
			content.push(commentCommandInfo);
		}

		if (options.get(EditorOption.stickyScroll).enabled) {
			content.push(AccessibilityHelpNLS.stickScroll);
		}

		if (options.get(EditorOption.tabFocusMode)) {
			content.push(AccessibilityHelpNLS.tabFocusModeOnMsg);
		} else {
			content.push(AccessibilityHelpNLS.tabFocusModeOffMsg);
		}

		content.push(AccessibilityHelpNLS.setBreakpoint);
		content.push(AccessibilityHelpNLS.debugExecuteSelection);
		return content.join('\n');
	}
}

export function getCommentCommandInfo(keybindingService: IKeybindingService, contextKeyService: IContextKeyService, editor: ICodeEditor): string | undefined {
	const editorContext = contextKeyService.getContext(editor.getDomNode()!);
	if (editorContext.getValue<boolean>(CommentContextKeys.activeEditorHasCommentingRange.key)) {
		return [CommentAccessibilityHelpNLS.intro, CommentAccessibilityHelpNLS.addComment, CommentAccessibilityHelpNLS.nextCommentThread, CommentAccessibilityHelpNLS.previousCommentThread, CommentAccessibilityHelpNLS.nextRange, CommentAccessibilityHelpNLS.previousRange].join('\n');
	}
	return;
}

export function getChatCommandInfo(keybindingService: IKeybindingService, contextKeyService: IContextKeyService): string | undefined {
	if (CONTEXT_CHAT_ENABLED.getValue(contextKeyService)) {
		return [AccessibilityHelpNLS.quickChat, AccessibilityHelpNLS.startInlineChat].join('\n');
	}
	return;
}
