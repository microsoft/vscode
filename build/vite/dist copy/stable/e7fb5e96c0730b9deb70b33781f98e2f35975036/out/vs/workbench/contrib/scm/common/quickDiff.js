/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Color } from '../../../../base/common/color.js';
import { darken, editorBackground, editorForeground, listInactiveSelectionBackground, opaque, editorErrorForeground, registerColor, transparent, lighten } from '../../../../platform/theme/common/colorRegistry.js';
export const IQuickDiffService = createDecorator('quickDiff');
const editorGutterModifiedBackground = registerColor('editorGutter.modifiedBackground', {
    dark: '#1B81A8', light: '#2090D3', hcDark: '#1B81A8', hcLight: '#2090D3'
}, nls.localize('editorGutterModifiedBackground', "Editor gutter background color for lines that are modified."));
registerColor('editorGutter.modifiedSecondaryBackground', { dark: darken(editorGutterModifiedBackground, 0.5), light: lighten(editorGutterModifiedBackground, 0.7), hcDark: '#1B81A8', hcLight: '#2090D3' }, nls.localize('editorGutterModifiedSecondaryBackground', "Editor gutter secondary background color for lines that are modified."));
const editorGutterAddedBackground = registerColor('editorGutter.addedBackground', {
    dark: '#487E02', light: '#48985D', hcDark: '#487E02', hcLight: '#48985D'
}, nls.localize('editorGutterAddedBackground', "Editor gutter background color for lines that are added."));
registerColor('editorGutter.addedSecondaryBackground', { dark: darken(editorGutterAddedBackground, 0.5), light: lighten(editorGutterAddedBackground, 0.7), hcDark: '#487E02', hcLight: '#48985D' }, nls.localize('editorGutterAddedSecondaryBackground', "Editor gutter secondary background color for lines that are added."));
const editorGutterDeletedBackground = registerColor('editorGutter.deletedBackground', editorErrorForeground, nls.localize('editorGutterDeletedBackground', "Editor gutter background color for lines that are deleted."));
registerColor('editorGutter.deletedSecondaryBackground', { dark: darken(editorGutterDeletedBackground, 0.4), light: lighten(editorGutterDeletedBackground, 0.3), hcDark: '#F48771', hcLight: '#B5200D' }, nls.localize('editorGutterDeletedSecondaryBackground', "Editor gutter secondary background color for lines that are deleted."));
export const minimapGutterModifiedBackground = registerColor('minimapGutter.modifiedBackground', editorGutterModifiedBackground, nls.localize('minimapGutterModifiedBackground', "Minimap gutter background color for lines that are modified."));
export const minimapGutterAddedBackground = registerColor('minimapGutter.addedBackground', editorGutterAddedBackground, nls.localize('minimapGutterAddedBackground', "Minimap gutter background color for lines that are added."));
export const minimapGutterDeletedBackground = registerColor('minimapGutter.deletedBackground', editorGutterDeletedBackground, nls.localize('minimapGutterDeletedBackground', "Minimap gutter background color for lines that are deleted."));
export const overviewRulerModifiedForeground = registerColor('editorOverviewRuler.modifiedForeground', transparent(editorGutterModifiedBackground, 0.6), nls.localize('overviewRulerModifiedForeground', 'Overview ruler marker color for modified content.'));
export const overviewRulerAddedForeground = registerColor('editorOverviewRuler.addedForeground', transparent(editorGutterAddedBackground, 0.6), nls.localize('overviewRulerAddedForeground', 'Overview ruler marker color for added content.'));
export const overviewRulerDeletedForeground = registerColor('editorOverviewRuler.deletedForeground', transparent(editorGutterDeletedBackground, 0.6), nls.localize('overviewRulerDeletedForeground', 'Overview ruler marker color for deleted content.'));
export const editorGutterItemGlyphForeground = registerColor('editorGutter.itemGlyphForeground', { dark: editorForeground, light: editorForeground, hcDark: Color.black, hcLight: Color.white }, nls.localize('editorGutterItemGlyphForeground', 'Editor gutter decoration color for gutter item glyphs.'));
export const editorGutterItemBackground = registerColor('editorGutter.itemBackground', { dark: opaque(listInactiveSelectionBackground, editorBackground), light: darken(opaque(listInactiveSelectionBackground, editorBackground), .05), hcDark: Color.white, hcLight: Color.black }, nls.localize('editorGutterItemBackground', 'Editor gutter decoration color for gutter item background. This color should be opaque.'));
export var ChangeType;
(function (ChangeType) {
    ChangeType[ChangeType["Modify"] = 0] = "Modify";
    ChangeType[ChangeType["Add"] = 1] = "Add";
    ChangeType[ChangeType["Delete"] = 2] = "Delete";
})(ChangeType || (ChangeType = {}));
export function getChangeType(change) {
    if (change.originalEndLineNumber === 0) {
        return ChangeType.Add;
    }
    else if (change.modifiedEndLineNumber === 0) {
        return ChangeType.Delete;
    }
    else {
        return ChangeType.Modify;
    }
}
export function getChangeTypeColor(theme, changeType) {
    switch (changeType) {
        case ChangeType.Modify: return theme.getColor(editorGutterModifiedBackground);
        case ChangeType.Add: return theme.getColor(editorGutterAddedBackground);
        case ChangeType.Delete: return theme.getColor(editorGutterDeletedBackground);
    }
}
export function compareChanges(a, b) {
    let result = a.modifiedStartLineNumber - b.modifiedStartLineNumber;
    if (result !== 0) {
        return result;
    }
    result = a.modifiedEndLineNumber - b.modifiedEndLineNumber;
    if (result !== 0) {
        return result;
    }
    result = a.originalStartLineNumber - b.originalStartLineNumber;
    if (result !== 0) {
        return result;
    }
    return a.originalEndLineNumber - b.originalEndLineNumber;
}
export function getChangeHeight(change) {
    const modified = change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1;
    const original = change.originalEndLineNumber - change.originalStartLineNumber + 1;
    if (change.originalEndLineNumber === 0) {
        return modified;
    }
    else if (change.modifiedEndLineNumber === 0) {
        return original;
    }
    else {
        return modified + original;
    }
}
export function getModifiedEndLineNumber(change) {
    if (change.modifiedEndLineNumber === 0) {
        return change.modifiedStartLineNumber === 0 ? 1 : change.modifiedStartLineNumber;
    }
    else {
        return change.modifiedEndLineNumber;
    }
}
export function lineIntersectsChange(lineNumber, change) {
    // deletion at the beginning of the file
    if (lineNumber === 1 && change.modifiedStartLineNumber === 0 && change.modifiedEndLineNumber === 0) {
        return true;
    }
    return lineNumber >= change.modifiedStartLineNumber && lineNumber <= (change.modifiedEndLineNumber || change.modifiedStartLineNumber);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tEaWZmLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2NtL2NvbW1vbi9xdWlja0RpZmYudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUcxQyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFPN0YsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFDTixNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxFQUNuRixxQkFBcUIsRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUNqRCxPQUFPLEVBQ1AsTUFBTSxvREFBb0QsQ0FBQztBQUU1RCxNQUFNLENBQUMsTUFBTSxpQkFBaUIsR0FBRyxlQUFlLENBQW9CLFdBQVcsQ0FBQyxDQUFDO0FBRWpGLE1BQU0sOEJBQThCLEdBQUcsYUFBYSxDQUFDLGlDQUFpQyxFQUFFO0lBQ3ZGLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxTQUFTO0NBQ3hFLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSw2REFBNkQsQ0FBQyxDQUFDLENBQUM7QUFFbEgsYUFBYSxDQUFDLDBDQUEwQyxFQUN2RCxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsOEJBQThCLEVBQUUsR0FBRyxDQUFDLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsRUFDakosR0FBRyxDQUFDLFFBQVEsQ0FBQyx5Q0FBeUMsRUFBRSx1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