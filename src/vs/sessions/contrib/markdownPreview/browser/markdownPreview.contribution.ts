/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';

// Show a floating "Open Preview" button in the editor content
// area when editing markdown or related prompt/instructions/chatagent/skill
// language content in the sessions window.
MenuRegistry.appendMenuItem(MenuId.EditorContent, {
	command: {
		id: 'markdown.showPreviewToSide',
		title: localize('openPreview', "Open Preview"),
	},
	when: ContextKeyExpr.and(
		IsSessionsWindowContext,
		ContextKeyExpr.regex(EditorContextKeys.languageId.key, /^(markdown|prompt|instructions|chatagent|skill)$/),
	),
});
