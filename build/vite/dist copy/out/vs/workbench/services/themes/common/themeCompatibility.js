/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Color } from '../../../../base/common/color.js';
import * as colorRegistry from '../../../../platform/theme/common/colorRegistry.js';
import * as editorColorRegistry from '../../../../editor/common/core/editorColorRegistry.js';
const settingToColorIdMapping = {};
function addSettingMapping(settingId, colorId) {
    let colorIds = settingToColorIdMapping[settingId];
    if (!colorIds) {
        settingToColorIdMapping[settingId] = colorIds = [];
    }
    colorIds.push(colorId);
}
export function convertSettings(oldSettings, result) {
    for (const rule of oldSettings) {
        result.textMateRules.push(rule);
        if (!rule.scope) {
            const settings = rule.settings;
            if (!settings) {
                rule.settings = {};
            }
            else {
                for (const settingKey in settings) {
                    const key = settingKey;
                    const mappings = settingToColorIdMapping[key];
                    if (mappings) {
                        const colorHex = settings[key];
                        if (typeof colorHex === 'string') {
                            const color = Color.fromHex(colorHex);
                            for (const colorId of mappings) {
                                result.colors[colorId] = color;
                            }
                        }
                    }
                    if (key !== 'foreground' && key !== 'background' && key !== 'fontStyle') {
                        delete settings[key];
                    }
                }
            }
        }
    }
}
addSettingMapping('background', colorRegistry.editorBackground);
addSettingMapping('foreground', colorRegistry.editorForeground);
addSettingMapping('selection', colorRegistry.editorSelectionBackground);
addSettingMapping('inactiveSelection', colorRegistry.editorInactiveSelection);
addSettingMapping('selectionHighlightColor', colorRegistry.editorSelectionHighlight);
addSettingMapping('findMatchHighlight', colorRegistry.editorFindMatchHighlight);
addSettingMapping('currentFindMatchHighlight', colorRegistry.editorFindMatch);
addSettingMapping('hoverHighlight', colorRegistry.editorHoverHighlight);
addSettingMapping('wordHighlight', 'editor.wordHighlightBackground'); // inlined to avoid editor/contrib dependenies
addSettingMapping('wordHighlightStrong', 'editor.wordHighlightStrongBackground');
addSettingMapping('findRangeHighlight', colorRegistry.editorFindRangeHighlight);
addSettingMapping('findMatchHighlight', 'peekViewResult.matchHighlightBackground');
addSettingMapping('referenceHighlight', 'peekViewEditor.matchHighlightBackground');
addSettingMapping('lineHighlight', editorColorRegistry.editorLineHighlight);
addSettingMapping('rangeHighlight', editorColorRegistry.editorRangeHighlight);
addSettingMapping('caret', editorColorRegistry.editorCursorForeground);
addSettingMapping('invisibles', editorColorRegistry.editorWhitespaces);
addSettingMapping('guide', editorColorRegistry.editorIndentGuide1);
addSettingMapping('activeGuide', editorColorRegistry.editorActiveIndentGuide1);
const ansiColorMap = ['ansiBlack', 'ansiRed', 'ansiGreen', 'ansiYellow', 'ansiBlue', 'ansiMagenta', 'ansiCyan', 'ansiWhite',
    'ansiBrightBlack', 'ansiBrightRed', 'ansiBrightGreen', 'ansiBrightYellow', 'ansiBrightBlue', 'ansiBrightMagenta', 'ansiBrightCyan', 'ansiBrightWhite'
];
for (const color of ansiColorMap) {
    addSettingMapping(color, 'terminal.' + color);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhlbWVDb21wYXRpYmlsaXR5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RoZW1lcy9jb21tb24vdGhlbWVDb21wYXRpYmlsaXR5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEtBQUssYUFBYSxNQUFNLG9EQUFvRCxDQUFDO0FBRXBGLE9BQU8sS0FBSyxtQkFBbUIsTUFBTSx1REFBdUQsQ0FBQztBQUU3RixNQUFNLHVCQUF1QixHQUFzQyxFQUFFLENBQUM7QUFDdEUsU0FBUyxpQkFBaUIsQ0FBQyxTQUFpQixFQUFFLE9BQWU7SUFDNUQsSUFBSSxRQUFRLEdBQUcsdUJBQXVCLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDbEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2YsdUJBQXVCLENBQUMsU0FBUyxDQUFDLEdBQUcsUUFBUSxHQUFHLEVBQUUsQ0FBQztJQUNwRCxDQUFDO0lBQ0QsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUN4QixDQUFDO0FBRUQsTUFBTSxVQUFVLGVBQWUsQ0FBQyxXQUFtQyxFQUFFLE1BQW9FO0lBQ3hJLEtBQUssTUFBTSxJQUFJLElBQUksV0FBVyxFQUFFLENBQUM7UUFDaEMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNqQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO1lBQy9CLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDZixJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztZQUNwQixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsS0FBSyxNQUFNLFVBQVUsSUFBSSxRQUFRLEVBQUUsQ0FBQztvQkFDbkMsTUFBTSxHQUFHLEdBQTBCLFVBQVUsQ0FBQztvQkFDOUMsTUFBTSxRQUFRLEdBQUcsdUJBQXVCLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQzlDLElBQUksUUFBUSxFQUFFLENBQUM7d0JBQ2QsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO3dCQUMvQixJQUFJLE9BQU8sUUFBUSxLQUFLLFFBQVEsRUFBRSxDQUFDOzRCQUNsQyxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDOzRCQUN0QyxLQUFLLE1BQU0sT0FBTyxJQUFJLFFBQVEsRUFBRSxDQUFDO2dDQUNoQyxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEtBQUssQ0FBQzs0QkFDaEMsQ0FBQzt3QkFDRixDQUFDO29CQUNGLENBQUM7b0JBQ0QsSUFBSSxHQUFHLEtBQUssWUFBWSxJQUFJLEdBQUcsS0FBSyxZQUFZLElBQUksR0FBRyxLQUFLLFdBQVcsRUFBRSxDQUFDO3dCQUN6RSxPQUFPLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDdEIsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELGlCQUFpQixDQUFDLFlBQVksRUFBRSxhQUFhLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUNoRSxpQkFBaUIsQ0FBQyxZQUFZLEVBQUUsYUFBYSxDQUFDLGdCQUFnQixDQUFDLENBQUM7QUFDaEUsaUJBQWlCLENBQUMsV0FBVyxFQUFFLGFBQWEsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0FBQ3hFLGlCQUFpQixDQUFDLG1CQUFtQixFQUFFLGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0FBQzlFLGlCQUFpQixDQUFDLHlCQUF5QixFQUFFLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBQ3JGLGlCQUFpQixDQUFDLG9CQUFvQixFQUFFLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBQ2hGLGlCQUFpQixDQUFDLDJCQUEyQixFQUFFLGFBQWEsQ0FBQyxlQUFlLENBQUMsQ0FBQztBQUM5RSxpQkFBaUIsQ0FBQyxnQkFBZ0IsRUFBRSxhQUFhLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUN4RSxpQkFBaUIsQ0FBQyxlQUFlLEVBQUUsZ0NBQWdDLENBQUMsQ0FBQyxDQUFDLDhDQUE4QztBQUNwSCxpQkFBaUIsQ0FBQyxxQkFBcUIsRUFBRSxzQ0FBc0MsQ0FBQyxDQUFDO0FBQ2pGLGlCQUFpQixDQUFDLG9CQUFvQixFQUFFLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBQ2hGLGlCQUFpQixDQUFDLG9CQUFvQixFQUFFLHlDQUF5QyxDQUFDLENBQUM7QUFDbkYsaUJBQWlCLENBQUMsb0JBQW9CLEVBQUUseUNBQXlDLENBQUMsQ0FBQztBQUNuRixpQkFBaUIsQ0FBQyxlQUFlLEVBQUUsbUJBQW1CLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUM1RSxpQkFBaUIsQ0FBQyxnQkFBZ0IsRUFBRSxtQkFBbUIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBQzlFLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxtQkFBbUIsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0FBQ3ZFLGlCQUFpQixDQUFDLFlBQVksRUFBRSxtQkFBbUIsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0FBQ3ZFLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxtQkFBbUIsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0FBQ25FLGlCQUFpQixDQUFDLGFBQWEsRUFBRSxtQkFBbUIsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBRS9FLE1BQU0sWUFBWSxHQUFHLENBQUMsV0FBVyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLFdBQVc7SUFDMUgsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLGtCQUFrQixFQUFFLGdCQUFnQixFQUFFLG1CQUFtQixFQUFFLGdCQUFnQixFQUFFLGlCQUFpQjtDQUNySixDQUFDO0FBRUYsS0FBSyxNQUFNLEtBQUssSUFBSSxZQUFZLEVBQUUsQ0FBQztJQUNsQyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsV0FBVyxHQUFHLEtBQUssQ0FBQyxDQUFDO0FBQy9DLENBQUMifQ==