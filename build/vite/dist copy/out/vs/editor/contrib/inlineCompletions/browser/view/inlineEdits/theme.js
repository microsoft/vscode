/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assertNever } from '../../../../../../base/common/assert.js';
import { BugIndicatingError } from '../../../../../../base/common/errors.js';
import { observableFromEventOpts } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { buttonBackground, buttonForeground, diffInserted, diffInsertedLine, diffRemoved, editorBackground, editorHoverBackground, editorHoverBorder, editorHoverForeground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable, darken, registerColor, transparent } from '../../../../../../platform/theme/common/colorUtils.js';
import { InlineCompletionEditorType } from '../../model/provideInlineCompletions.js';
import { InlineEditTabAction } from './inlineEditsViewInterface.js';
export const originalBackgroundColor = registerColor('inlineEdit.originalBackground', transparent(diffRemoved, 0.2), localize('inlineEdit.originalBackground', 'Background color for the original text in inline edits.'), true);
export const modifiedBackgroundColor = registerColor('inlineEdit.modifiedBackground', transparent(diffInserted, 0.3), localize('inlineEdit.modifiedBackground', 'Background color for the modified text in inline edits.'), true);
export const originalChangedLineBackgroundColor = registerColor('inlineEdit.originalChangedLineBackground', transparent(diffRemoved, 0.8), localize('inlineEdit.originalChangedLineBackground', 'Background color for the changed lines in the original text of inline edits.'), true);
export const originalChangedTextOverlayColor = registerColor('inlineEdit.originalChangedTextBackground', transparent(diffRemoved, 0.8), localize('inlineEdit.originalChangedTextBackground', 'Overlay color for the changed text in the original text of inline edits.'), true);
export const modifiedChangedLineBackgroundColor = registerColor('inlineEdit.modifiedChangedLineBackground', {
    light: transparent(diffInsertedLine, 0.7),
    dark: transparent(diffInsertedLine, 0.7),
    hcDark: diffInsertedLine,
    hcLight: diffInsertedLine
}, localize('inlineEdit.modifiedChangedLineBackground', 'Background color for the changed lines in the modified text of inline edits.'), true);
export const modifiedChangedTextOverlayColor = registerColor('inlineEdit.modifiedChangedTextBackground', transparent(diffInserted, 0.7), localize('inlineEdit.modifiedChangedTextBackground', 'Overlay color for the changed text in the modified text of inline edits.'), true);
// ------- GUTTER INDICATOR -------
export const inlineEditIndicatorPrimaryForeground = registerColor('inlineEdit.gutterIndicator.primaryForeground', buttonForeground, localize('inlineEdit.gutterIndicator.primaryForeground', 'Foreground color for the primary inline edit gutter indicator.'));
export const inlineEditIndicatorPrimaryBorder = registerColor('inlineEdit.gutterIndicator.primaryBorder', buttonBackground, localize('inlineEdit.gutterIndicator.primaryBorder', 'Border color for the primary inline edit gutter indicator.'));
export const inlineEditIndicatorPrimaryBackground = registerColor('inlineEdit.gutterIndicator.primaryBackground', {
    light: transparent(inlineEditIndicatorPrimaryBorder, 0.5),
    dark: transparent(inlineEditIndicatorPrimaryBorder, 0.4),
    hcDark: transparent(inlineEditIndicatorPrimaryBorder, 0.4),
    hcLight: transparent(inlineEditIndicatorPrimaryBorder, 0.5),
}, localize('inlineEdit.gutterIndicator.primaryBackground', 'Background color for the primary inline edit gutter indicator.'));
export const inlineEditIndicatorSecondaryForeground = registerColor('inlineEdit.gutterIndicator.secondaryForeground', editorHoverForeground, localize('inlineEdit.gutterIndicator.secondaryForeground', 'Foreground color for the secondary inline edit gutter indicator.'));
export const inlineEditIndicatorSecondaryBorder = registerColor('inlineEdit.gutterIndicator.secondaryBorder', editorHoverBorder, localize('inlineEdit.gutterIndicator.secondaryBorder', 'Border color for the secondary inline edit gutter indicator.'));
export const inlineEditIndicatorSecondaryBackground = registerColor('inlineEdit.gutterIndicator.secondaryBackground', editorHoverBackground, localize('inlineEdit.gutterIndicator.secondaryBackground', 'Background color for the secondary inline edit gutter indicator.'));
export const inlineEditIndicatorSuccessfulForeground = registerColor('inlineEdit.gutterIndicator.successfulForeground', buttonForeground, localize('inlineEdit.gutterIndicator.successfulForeground', 'Foreground color for the successful inline edit gutter indicator.'));
export const inlineEditIndicatorSuccessfulBorder = registerColor('inlineEdit.gutterIndicator.successfulBorder', buttonBackground, localize('inlineEdit.gutterIndicator.successfulBorder', 'Border color for the successful inline edit gutter indicator.'));
export const inlineEditIndicatorSuccessfulBackground = registerColor('inlineEdit.gutterIndicator.successfulBackground', inlineEditIndicatorSuccessfulBorder, localize('inlineEdit.gutterIndicator.successfulBackground', 'Background color for the successful inline edit gutter indicator.'));
export const inlineEditIndicatorBackground = registerColor('inlineEdit.gutterIndicator.background', {
    hcDark: transparent('tab.inactiveBackground', 0.5),
    hcLight: transparent('tab.inactiveBackground', 0.5),
    dark: transparent('tab.inactiveBackground', 0.5),
    light: '#5f5f5f18',
}, localize('inlineEdit.gutterIndicator.background', 'Background color for the inline edit gutter indicator.'));
// ------- BORDER COLORS -------
const originalBorder = registerColor('inlineEdit.originalBorder', {
    light: diffRemoved,
    dark: diffRemoved,
    hcDark: diffRemoved,
    hcLight: diffRemoved
}, localize('inlineEdit.originalBorder', 'Border color for the original text in inline edits.'));
const modifiedBorder = registerColor('inlineEdit.modifiedBorder', {
    light: darken(diffInserted, 0.6),
    dark: diffInserted,
    hcDark: diffInserted,
    hcLight: diffInserted
}, localize('inlineEdit.modifiedBorder', 'Border color for the modified text in inline edits.'));
const tabWillAcceptModifiedBorder = registerColor('inlineEdit.tabWillAcceptModifiedBorder', {
    light: darken(modifiedBorder, 0),
    dark: darken(modifiedBorder, 0),
    hcDark: darken(modifiedBorder, 0),
    hcLight: darken(modifiedBorder, 0)
}, localize('inlineEdit.tabWillAcceptModifiedBorder', 'Modified border color for the inline edits widget when tab will accept it.'));
const tabWillAcceptOriginalBorder = registerColor('inlineEdit.tabWillAcceptOriginalBorder', {
    light: darken(originalBorder, 0),
    dark: darken(originalBorder, 0),
    hcDark: darken(originalBorder, 0),
    hcLight: darken(originalBorder, 0)
}, localize('inlineEdit.tabWillAcceptOriginalBorder', 'Original border color for the inline edits widget over the original text when tab will accept it.'));
export function getModifiedBorderColor(tabAction) {
    return tabAction.map(a => a === InlineEditTabAction.Accept ? tabWillAcceptModifiedBorder : modifiedBorder);
}
export function getOriginalBorderColor(tabAction) {
    return tabAction.map(a => a === InlineEditTabAction.Accept ? tabWillAcceptOriginalBorder : originalBorder);
}
export function getEditorBlendedColor(colorIdentifier, themeService) {
    let color;
    if (typeof colorIdentifier === 'string') {
        color = observeColor(colorIdentifier, themeService);
    }
    else {
        color = colorIdentifier.map((identifier, reader) => observeColor(identifier, themeService).read(reader));
    }
    const backgroundColor = observeColor(editorBackground, themeService);
    return color.map((c, reader) => /** @description makeOpaque */ c.makeOpaque(backgroundColor.read(reader)));
}
export function getEditorBackgroundColor(editorType) {
    let color;
    switch (editorType) {
        case InlineCompletionEditorType.TextEditor:
            color = editorBackground;
            break;
        case InlineCompletionEditorType.DiffEditor:
            color = editorBackground;
            break;
        case InlineCompletionEditorType.Notebook:
            color = 'notebook.cellEditorBackground';
            break;
        default:
            assertNever(editorType, 'Not supported editor type yet');
    }
    return asCssVariable(color);
}
export function observeColor(colorIdentifier, themeService) {
    return observableFromEventOpts({
        owner: { observeColor: colorIdentifier },
        equalsFn: (a, b) => a.equals(b),
        debugName: () => `observeColor(${colorIdentifier})`
    }, themeService.onDidColorThemeChange, () => {
        const color = themeService.getColorTheme().getColor(colorIdentifier);
        if (!color) {
            throw new BugIndicatingError(`Missing color: ${colorIdentifier}`);
        }
        return color;
    });
}
// Styles
export const INLINE_EDITS_BORDER_RADIUS = 3; // also used in CSS file
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhlbWUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL3ZpZXcvaW5saW5lRWRpdHMvdGhlbWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRXRFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzdFLE9BQU8sRUFBZSx1QkFBdUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsWUFBWSxFQUFFLGdCQUFnQixFQUFFLFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSxxQkFBcUIsRUFBRSxpQkFBaUIsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzlPLE9BQU8sRUFBRSxhQUFhLEVBQW1CLE1BQU0sRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFM0ksT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFcEUsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsYUFBYSxDQUNuRCwrQkFBK0IsRUFDL0IsV0FBVyxDQUFDLFdBQVcsRUFBRSxHQUFHLENBQUMsRUFDN0IsUUFBUSxDQUFDLCtCQUErQixFQUFFLHlEQUF5RCxDQUFDLEVBQ3BHLElBQUksQ0FDSixDQUFDO0FBQ0YsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsYUFBYSxDQUNuRCwrQkFBK0IsRUFDL0IsV0FBVyxDQUFDLFlB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