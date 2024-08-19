/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ctxCommentEditorFocused } from 'vs/workbench/contrib/comments/browser/simpleCommentEditor';
import { CommentContextKeys } from 'vs/workbench/contrib/comments/common/commentContextKeys';
import * as nls from 'vs/nls';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { CommentCommandId } from 'vs/workbench/contrib/comments/common/commentCommandIds';
import { ToggleTabFocusModeAction } from 'vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode';
import { IAccessibleViewContentProvider, AccessibleViewProviderId, IAccessibleViewOptions, AccessibleViewType } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { Disposable } from 'vs/base/common/lifecycle';


export namespace CommentAccessibilityHelpNLS {
	export const intro = nls.localize('intro', "The editor contains commentable range(s). Some useful commands include:");
	export const tabFocus = nls.localize('introWidget', "This widget contains a text area, for composition of new comments, and actions, that can be tabbed to once tab moves focus mode has been enabled with the command Toggle Tab Key Moves Focus{0}.", `<keybinding:${ToggleTabFocusModeAction.ID}>`);
	export const commentCommands = nls.localize('commentCommands', "Some useful comment commands include:");
	export const escape = nls.localize('escape', "- Dismiss Comment (Escape)");
	export const nextRange = nls.localize('next', "- Go to Next Commenting Range{0}.", `<keybinding:${CommentCommandId.NextRange}>`);
	export const previousRange = nls.localize('previous', "- Go to Previous Commenting Range{0}.", `<keybinding:${CommentCommandId.PreviousRange}>`);
	export const nextCommentThread = nls.localize('nextCommentThreadKb', "- Go to Next Comment Thread{0}.", `<keybinding:${CommentCommandId.NextThread}>`);
	export const previousCommentThread = nls.localize('previousCommentThreadKb', "- Go to Previous Comment Thread{0}.", `<keybinding:${CommentCommandId.PreviousThread}>`);
	export const addComment = nls.localize('addCommentNoKb', "- Add Comment on Current Selection{0}.", `<keybinding:${CommentCommandId.Add}>`);
	export const submitComment = nls.localize('submitComment', "- Submit Comment{0}.", `<keybinding:${CommentCommandId.Submit}>`);
}

export class CommentsAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	id = AccessibleViewProviderId.Comments;
	verbositySettingKey: AccessibilityVerbositySettingId = AccessibilityVerbositySettingId.Comments;
	options: IAccessibleViewOptions = { type: AccessibleViewType.Help };
	private _element: HTMLElement | undefined;
	provideContent(): string {
		return [CommentAccessibilityHelpNLS.tabFocus, CommentAccessibilityHelpNLS.commentCommands, CommentAccessibilityHelpNLS.escape, CommentAccessibilityHelpNLS.addComment, CommentAccessibilityHelpNLS.submitComment, CommentAccessibilityHelpNLS.nextRange, CommentAccessibilityHelpNLS.previousRange].join('\n');
	}
	onClose(): void {
		this._element?.focus();
	}
}

export class CommentsAccessibilityHelp implements IAccessibleViewImplentation {
	readonly priority = 110;
	readonly name = 'comments';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.or(ctxCommentEditorFocused, CommentContextKeys.commentFocused);
	getProvider(accessor: ServicesAccessor) {
		return accessor.get(IInstantiationService).createInstance(CommentsAccessibilityHelpProvider);
	}
}
