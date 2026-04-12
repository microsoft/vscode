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
export const diffMoveBorder = registerColor('diffEditor.move.border', '#8b8b8b9c', localize('diffEditor.move.border', 'The border color for text that got moved in the diff editor.'));
export const diffMoveBorderActive = registerColor('diffEditor.moveActive.border', '#FFA500', localize('diffEditor.moveActive.border', 'The active border color for text that got moved in the diff editor.'));
export const diffEditorUnchangedRegionShadow = registerColor('diffEditor.unchangedRegionShadow', { dark: '#000000', light: '#737373BF', hcDark: '#000000', hcLight: '#737373BF', }, localize('diffEditor.unchangedRegionShadow', 'The color of the shadow around unchanged region widgets.'));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVnaXN0cmF0aW9ucy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9yZWdpc3RyYXRpb25zLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDbkYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRWpGLE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBRyxhQUFhLENBQzFDLHdCQUF3QixFQUN4QixXQUFXLEVBQ1gsUUFBUSxDQUFDLHdCQUF3QixFQUFFLDhEQUE4RCxDQUFDLENBQ2xHLENBQUM7QUFFRixNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxhQUFhLENBQ2hELDhCQUE4QixFQUM5QixTQUFTLEVBQ1QsUUFBUSxDQUFDLDhCQUE4QixFQUFFLHFFQUFxRSxDQUFDLENBQy9HLENBQUM7QUFFRixNQUFNLENBQUMsTUFBTSwrQkFBK0IsR0FBRyxhQUFhLENBQzNELGtDQUFrQyxFQUNsQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxXQUFXLEdBQUcsRUFDakYsUUFBUSxDQUFDLGtDQUFrQyxFQUFFLDBEQUEwRCxDQUFDLENBQ3hHLENBQUM7QUFF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