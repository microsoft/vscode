/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import './commentsEditorContribution.js';
import { ICommentService, CommentService, IWorkspaceCommentThreadsEvent } from './commentService.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Extensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { IActivityService, NumberBadge } from '../../../services/activity/common/activity.js';
import { COMMENTS_VIEW_ID } from './commentsTreeViewer.js';
import { CommentThreadState } from '../../../../editor/common/languages.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CONTEXT_KEY_HAS_COMMENTS, CONTEXT_KEY_SOME_COMMENTS_EXPANDED, CommentsPanel } from './commentsView.js';
import { ViewAction } from '../../../browser/parts/views/viewPane.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { revealCommentThread } from './commentsController.js';
import { MarshalledCommentThreadInternal } from '../../../common/comments.js';
import { accessibleViewCurrentProviderId, accessibleViewIsShown } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibleViewProviderId } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { CommentsAccessibleView, CommentThreadAccessibleView } from './commentsAccessibleView.js';
import { CommentsAccessibilityHelp } from './commentsAccessibility.js';

registerAction2(class Collapse extends ViewAction<CommentsPanel> {
	constructor() {
		super({
			viewId: COMMENTS_VIEW_ID,
			id: 'comments.collapse',
			title: nls.localize('collapseAll', "Collapse All"),
			f1: false,
			icon: Codicon.collapseAll,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.and(ContextKeyExpr.and(ContextKeyExpr.equals('view', COMMENTS_VIEW_ID), CONTEXT_KEY_HAS_COMMENTS), CONTEXT_KEY_SOME_COMMENTS_EXPANDED),
				order: 100
			}
		});
	}
	runInView(_accessor: ServicesAccessor, view: CommentsPanel) {
		view.collapseAll();
	}
});

registerAction2(class Expand extends ViewAction<CommentsPanel> {
	constructor() {
		super({
			viewId: COMMENTS_VIEW_ID,
			id: 'comments.expand',
			title: nls.localize('expandAll', "Expand All"),
			f1: false,
			icon: Codicon.expandAll,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.and(ContextKeyExpr.and(ContextKeyExpr.equals('view', COMMENTS_VIEW_ID), CONTEXT_KEY_HAS_COMMENTS), ContextKeyExpr.not(CONTEXT_KEY_SOME_COMMENTS_EXPANDED.key)),
				order: 100
			}
		});
	}
	runInView(_accessor: ServicesAccessor, view: CommentsPanel) {
		view.expandAll();
	}
});

registerAction2(class Reply extends Action2 {
	constructor() {
		super({
			id: 'comments.reply',
			title: nls.localize('reply', "Reply"),
			icon: Codicon.reply,
			precondition: ContextKeyExpr.equals('canReply', true),
			menu: [{
				id: MenuId.CommentsViewThreadActions,
				order: 100
			},
			{
				id: MenuId.AccessibleView,
				when: ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Comments)),
			}]
		});
	}

	override run(accessor: ServicesAccessor, marshalledCommentThread: MarshalledCommentThreadInternal): void {
		const commentService = accessor.get(ICommentService);
		const editorService = accessor.get(IEditorService);
		const uriIdentityService = accessor.get(IUriIdentityService);
		revealCommentThread(commentService, editorService, uriIdentityService, marshalledCommentThread.thread, marshalledCommentThread.thread.comments![marshalledCommentThread.thread.comments!.length - 1], true);
	}
});

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

AccessibleViewRegistry.register(new CommentsAccessibleView());
AccessibleViewRegistry.register(new CommentThreadAccessibleView());
AccessibleViewRegistry.register(new CommentsAccessibilityHelp());
