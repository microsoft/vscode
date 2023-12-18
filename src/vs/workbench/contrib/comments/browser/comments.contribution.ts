/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import 'vs/workbench/contrib/comments/browser/commentsEditorContribution';
import { ICommentService, CommentService, IWorkspaceCommentThreadsEvent } from 'vs/workbench/contrib/comments/browser/commentService';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { ctxCommentEditorFocused } from 'vs/workbench/contrib/comments/browser/simpleCommentEditor';
import * as strings from 'vs/base/common/strings';
import { AccessibilityVerbositySettingId, AccessibleViewProviderId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibleViewType, IAccessibleContentProvider, IAccessibleViewOptions, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibilityHelpAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Disposable, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { CommentContextKeys } from 'vs/workbench/contrib/comments/common/commentContextKeys';
import { CommentCommandId } from 'vs/workbench/contrib/comments/common/commentCommandIds';
import { ToggleTabFocusModeAction } from 'vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode';
import { getActiveElement } from 'vs/base/browser/dom';
import { Extensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { COMMENTS_VIEW_ID } from 'vs/workbench/contrib/comments/browser/commentsTreeViewer';
import { CommentThreadState } from 'vs/editor/common/languages';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'comments',
	order: 20,
	title: nls.localize('commentsConfigurationTitle', "Comments"),
	type: 'object',
	properties: {
		'comments.openPanel': {
			enum: ['neverOpen', 'openOnSessionStart', 'openOnSessionStartWithComments'],
			default: 'openOnSessionStartWithComments',
			description: nls.localize('openComments', "Controls when the comments panel should open."),
			restricted: false,
			markdownDeprecationMessage: nls.localize('comments.openPanel.deprecated', "This setting is deprecated in favor of `comments.openView`.")
		},
		'comments.openView': {
			enum: ['never', 'file', 'firstFile', 'firstFileUnresolved'],
			enumDescriptions: [nls.localize('comments.openView.never', "The comments view will never be opened."), nls.localize('comments.openView.file', "The comments view will open when a file with comments is active."), nls.localize('comments.openView.firstFile', "If the comments view has not been opened yet during this session it will open the first time during a session that a file with comments is active."), nls.localize('comments.openView.firstFileUnresolved', "If the comments view has not been opened yet during this session and the comment is not resolved, it will open the first time during a session that a file with comments is active.")],
			default: 'firstFile',
			description: nls.localize('comments.openView', "Controls when the comments view should open."),
			restricted: false
		},
		'comments.useRelativeTime': {
			type: 'boolean',
			default: true,
			description: nls.localize('useRelativeTime', "Determines if relative time will be used in comment timestamps (ex. '1 day ago').")
		},
		'comments.visible': {
			type: 'boolean',
			default: true,
			description: nls.localize('comments.visible', "Controls the visibility of the comments bar and comment threads in editors that have commenting ranges and comments. Comments are still accessible via the Comments view and will cause commenting to be toggled on in the same way running the command \"Comments: Toggle Editor Commenting\" toggles comments.")
		},
		'comments.maxHeight': {
			type: 'boolean',
			default: true,
			description: nls.localize('comments.maxHeight', "Controls whether the comments widget scrolls or expands.")
		},
		'comments.collapseOnResolve': {
			type: 'boolean',
			default: true,
			description: nls.localize('collapseOnResolve', "Controls whether the comment thread should collapse when the thread is resolved.")
		}
	}
});

registerSingleton(ICommentService, CommentService, InstantiationType.Delayed);

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
export class CommentsAccessibilityHelpProvider implements IAccessibleContentProvider {
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

export class UnresolvedCommentsBadge extends Disposable implements IWorkbenchContribution {
	private readonly activity = this._register(new MutableDisposable<IDisposable>());
	private totalUnresolved = 0;

	constructor(
		@ICommentService private readonly _commentService: ICommentService,
		@IActivityService private readonly activityService: IActivityService) {
		super();
		this._register(this._commentService.onDidSetAllCommentThreads(this.onAllCommentsChanged, this));
		this._register(this._commentService.onDidUpdateCommentThreads(this.onCommentsUpdated, this));

	}

	private onAllCommentsChanged(e: IWorkspaceCommentThreadsEvent): void {
		let unresolved = 0;
		for (const thread of e.commentThreads) {
			if (thread.state === CommentThreadState.Unresolved) {
				unresolved++;
			}
		}
		this.updateBadge(unresolved);
	}

	private onCommentsUpdated(): void {
		let unresolved = 0;
		for (const resource of this._commentService.commentsModel.resourceCommentThreads) {
			for (const thread of resource.commentThreads) {
				if (thread.threadState === CommentThreadState.Unresolved) {
					unresolved++;
				}
			}
		}
		this.updateBadge(unresolved);
	}

	private updateBadge(unresolved: number) {
		if (unresolved === this.totalUnresolved) {
			return;
		}

		this.totalUnresolved = unresolved;
		const message = nls.localize('totalUnresolvedComments', '{0} Unresolved Comments', this.totalUnresolved);
		this.activity.value = this.activityService.showViewActivity(COMMENTS_VIEW_ID, { badge: new NumberBadge(this.totalUnresolved, () => message) });
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(UnresolvedCommentsBadge, LifecyclePhase.Eventually);
