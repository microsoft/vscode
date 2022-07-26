/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import 'vs/workbench/contrib/comments/browser/commentsEditorContribution';
import { ICommentService, CommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { COMMENTS_VIEW_ID } from 'vs/workbench/contrib/comments/browser/commentsTreeViewer';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { CommentsViewSmallLayoutContextKey } from 'vs/workbench/contrib/comments/browser/comments';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: `workbench.actions.treeView.${COMMENTS_VIEW_ID}.filter`,
			title: nls.localize('filter', "Filter"),
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', COMMENTS_VIEW_ID), CommentsViewSmallLayoutContextKey.negate()),
				group: 'navigation',
				order: 1,
			},
		});
	}
	async run(): Promise<void> { }
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
			enum: ['never', 'file', 'firstFile'],
			enumDescriptions: [nls.localize('comments.openView.never', "The comments view will never be opened."), nls.localize('comments.openView.file', "The comments view will open when a file with comments is active."), nls.localize('comments.openView.firstFile', "If the comments view has not been opened yet during this session it will open the first time during a session that a file with comments is active.")],
			default: 'firstFile',
			description: nls.localize('comments.openView', "Controls when the comments view should open."),
			restricted: false
		},
		'comments.useRelativeTime': {
			type: 'boolean',
			default: true,
			description: nls.localize('useRelativeTime', "Determines if relative time will be used in comment timestamps (ex. '1 day ago').")
		}
	}
});

registerSingleton(ICommentService, CommentService);
