/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { ThemeIcon } from 'vs/base/common/themables';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { localize } from 'vs/nls';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';

export const diffInsertIcon = registerIcon('diff-insert', Codicon.add, localize('diffInsertIcon', 'Line decoration for inserts in the diff editor.'));
export const diffRemoveIcon = registerIcon('diff-remove', Codicon.remove, localize('diffRemoveIcon', 'Line decoration for removals in the diff editor.'));

export const diffFullLineAddDecoration = ModelDecorationOptions.register({
	className: 'line-insert',
	description: 'line-insert',
	isWholeLine: true,
	linesDecorationsClassName: 'insert-sign ' + ThemeIcon.asClassName(diffInsertIcon),
	marginClassName: 'gutter-insert',
});

export const diffFullLineDeleteDecoration = ModelDecorationOptions.register({
	className: 'line-delete',
	description: 'line-delete',
	isWholeLine: true,
	linesDecorationsClassName: 'delete-sign ' + ThemeIcon.asClassName(diffRemoveIcon),
	marginClassName: 'gutter-delete',
});

export const diffAddDecoration = ModelDecorationOptions.register({
	className: 'char-insert',
	description: 'char-insert',
});

export const diffDeleteDecoration = ModelDecorationOptions.register({
	className: 'char-delete',
	description: 'char-delete',
});

export const arrowRevertChange = ModelDecorationOptions.register({
	description: 'diff-editor-arrow-revert-change',
	glyphMarginHoverMessage: new MarkdownString(undefined, { isTrusted: true, supportThemeIcons: true }).appendMarkdown(localize('revertChangeHoverMessage', 'Click to revert change')),
	glyphMarginClassName: 'arrow-revert-change ' + ThemeIcon.asClassName(Codicon.arrowRight),
	zIndex: 10001,
});
