/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { localize } from '../../../../nls.js';
import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';

export const diffMoveBorder = registerColor(
	'diffEditor.move.border',
	'#8b8b8b9c',
	localize('diffEditor.move.border', 'The border color for text that got moved in the diff editor.')
);

export const diffMoveBorderActive = registerColor(
	'diffEditor.moveActive.border',
	'#FFA500',
	localize('diffEditor.moveActive.border', 'The active border color for text that got moved in the diff editor.')
);

export const diffEditorUnchangedRegionShadow = registerColor(
	'diffEditor.unchangedRegionShadow',
	{ dark: '#000000', light: '#737373BF', hcDark: '#000000', hcLight: '#737373BF', },
	localize('diffEditor.unchangedRegionShadow', 'The color of the shadow around unchanged region widgets.')
);

export const diffInsertIcon = registerIcon('diff-insert', Codicon.add, localize('diffInsertIcon', 'Line decoration for inserts in the diff editor.'));
export const diffRemoveIcon = registerIcon('diff-remove', Codicon.remove, localize('diffRemoveIcon', 'Line decoration for removals in the diff editor.'));

export const diffLineAddDecorationBackgroundWithIndicator = ModelDecorationOptions.register({
	className: 'line-insert',
	description: 'line-insert',
	isWholeLine: true,
	linesDecorationsClassName: 'insert-sign ' + ThemeIcon.asClassName(diffInsertIcon),
	marginClassName: 'gutter-insert',
});

export const diffLineDeleteDecorationBackgroundWithIndicator = ModelDecorationOptions.register({
	className: 'line-delete',
	description: 'line-delete',
	isWholeLine: true,
	linesDecorationsClassName: 'delete-sign ' + ThemeIcon.asClassName(diffRemoveIcon),
	marginClassName: 'gutter-delete',
});

export const diffLineAddDecorationBackground = ModelDecorationOptions.register({
	className: 'line-insert',
	description: 'line-insert',
	isWholeLine: true,
	marginClassName: 'gutter-insert',
});

export const diffLineDeleteDecorationBackground = ModelDecorationOptions.register({
	className: 'line-delete',
	description: 'line-delete',
	isWholeLine: true,
	marginClassName: 'gutter-delete',
});

export const diffAddDecoration = ModelDecorationOptions.register({
	className: 'char-insert',
	description: 'char-insert',
	shouldFillLineOnLineBreak: true,
});

export const diffWholeLineAddDecoration = ModelDecorationOptions.register({
	className: 'char-insert',
	description: 'char-insert',
	isWholeLine: true,
});

export const diffAddDecorationEmpty = ModelDecorationOptions.register({
	className: 'char-insert diff-range-empty',
	description: 'char-insert diff-range-empty',
});

export const diffDeleteDecoration = ModelDecorationOptions.register({
	className: 'char-delete',
	description: 'char-delete',
	shouldFillLineOnLineBreak: true,
});

export const diffWholeLineDeleteDecoration = ModelDecorationOptions.register({
	className: 'char-delete',
	description: 'char-delete',
	isWholeLine: true,
});

export const diffDeleteDecorationEmpty = ModelDecorationOptions.register({
	className: 'char-delete diff-range-empty',
	description: 'char-delete diff-range-empty',
});
