/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AccessibleViewType, IAccessibleViewContentProvider, IAccessibleViewOptions, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibilityHelpAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { ctxCommentEditorFocused } from 'vs/workbench/contrib/comments/browser/simpleCommentEditor';
import { CommentContextKeys } from 'vs/workbench/contrib/comments/common/commentContextKeys';
import * as nls from 'vs/nls';
import { AccessibilityVerbositySettingId, AccessibleViewProviderId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import * as strings from 'vs/base/common/strings';
import { getActiveElement } from 'vs/base/browser/dom';
import { CommentCommandId } from 'vs/workbench/contrib/comments/common/commentCommandIds';
import { ToggleTabFocusModeAction } from 'vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode';

export namespace CommentAccessibilityHelpNLS {
	export const intro = nls.localize('intro', "The editor contains commentable range(s). Some useful commands include:");
	export const introWidget = nls.localize('introWidget', "This widget contains a text area, for composition of new comments, and actions, that can be tabbed to once tab moves focus mode has been enabled ({0}).");
	export const introWidgetNoKb = nls.localize('introWidgetNoKb', "This widget contains a text area, for composition of new comments, and actions, that can be tabbed to once tab moves focus mode has been enabled with the command Toggle Tab Key Moves Focus, which is currently not triggerable via keybinding.");
	export const commentCommands = nls.localize('commentCommands', "Some useful comment commands include:");
	export const escape = nls.localize('escape', "- Dismiss Comment (Escape)");
	export const nextRange = nls.localize('next', "- Go to Next Commenting Range ({0})");
	export const nextRangeNoKb = nls.localize('nextNoKb', "- Go to Next Commenting Range, which is currently not triggerable via keybinding.");
	export const previousRange = nls.localize('previous', "- Go to Previous Commenting Range ({0})");
	export const previousRangeNoKb = nls.localize('previousNoKb', "- Go to Previous Commenting Range, which is currently not triggerable via keybinding.");
	export const nextCommentThreadKb = nls.localize('nextCommentThreadKb', "- Go to Next Comment Thread ({0})");
	export const nextCommentThreadNoKb = nls.localize('nextCommentThreadNoKb', "- Go to Next Comment Thread, which is currently not triggerable via keybinding.");
	export const previousCommentThreadKb = nls.localize('previousCommentThreadKb', "- Go to Previous Comment Thread ({0})");
	export const previousCommentThreadNoKb = nls.localize('previousCommentThreadNoKb', "- Go to Previous Comment Thread, which is currently not triggerable via keybinding.");
	export const addComment = nls.localize('addComment', "- Add Comment ({0})");
	export const addCommentNoKb = nls.localize('addCommentNoKb', "- Add Comment on Current Selection, which is currently not triggerable via keybinding.");
	export const submitComment = nls.localize('submitComment', "- Submit Comment ({0})");
	export const submitCommentNoKb = nls.localize('submitCommentNoKb', "- Submit Comment, accessible via tabbing, as it's currently not triggerable with a keybinding.");
}

export class CommentsAccessibilityHelpProvider implements IAccessibleViewContentProvider {
	id = AccessibleViewProviderId.Comments;
	verbositySettingKey: AccessibilityVerbositySettingId = AccessibilityVerbositySettingId.Comments;
	options: IAccessibleViewOptions = { type: AccessibleViewType.Help };
	private _element: HTMLElement | undefined;
	constructor(
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {

	}
	private _descriptionForCommand(commandId: string, msg: string, noKbMsg: string): string {
		const kb = this._keybindingService.lookupKeybinding(commandId);
		if (kb) {
			return strings.format(msg, kb.getAriaLabel());
		}
		return strings.format(noKbMsg, commandId);
	}
	provideContent(): string {
		this._element = getActiveElement() as HTMLElement;
		const content: string[] = [];
		content.push(this._descriptionForCommand(ToggleTabFocusModeAction.ID, CommentAccessibilityHelpNLS.introWidget, CommentAccessibilityHelpNLS.introWidgetNoKb) + '\n');
		content.push(CommentAccessibilityHelpNLS.commentCommands);
		content.push(CommentAccessibilityHelpNLS.escape);
		content.push(this._descriptionForCommand(CommentCommandId.Add, CommentAccessibilityHelpNLS.addComment, CommentAccessibilityHelpNLS.addCommentNoKb));
		content.push(this._descriptionForCommand(CommentCommandId.Submit, CommentAccessibilityHelpNLS.submitComment, CommentAccessibilityHelpNLS.submitCommentNoKb));
		content.push(this._descriptionForCommand(CommentCommandId.NextRange, CommentAccessibilityHelpNLS.nextRange, CommentAccessibilityHelpNLS.nextRangeNoKb));
		content.push(this._descriptionForCommand(CommentCommandId.PreviousRange, CommentAccessibilityHelpNLS.previousRange, CommentAccessibilityHelpNLS.previousRangeNoKb));
		return content.join('\n');
	}
	onClose(): void {
		this._element?.focus();
	}
}

export class CommentsAccessibilityHelpContribution extends Disposable {
	static ID: 'commentsAccessibilityHelpContribution';
	constructor() {
		super();
		this._register(AccessibilityHelpAction.addImplementation(110, 'comments', accessor => {
			const instantiationService = accessor.get(IInstantiationService);
			const accessibleViewService = accessor.get(IAccessibleViewService);
			accessibleViewService.show(instantiationService.createInstance(CommentsAccessibilityHelpProvider));
			return true;
		}, ContextKeyExpr.or(ctxCommentEditorFocused, CommentContextKeys.commentFocused)));
	}
}
