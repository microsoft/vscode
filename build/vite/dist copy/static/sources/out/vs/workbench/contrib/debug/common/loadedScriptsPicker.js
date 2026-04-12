/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { matchesFuzzy } from '../../../../base/common/filters.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IDebugService } from './debug.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { dirname } from '../../../../base/common/resources.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
/**
 * This function takes a regular quickpick and makes one for loaded scripts that has persistent headers
 * e.g. when some picks are filtered out, the ones that are visible still have its header.
 */
export async function showLoadedScriptMenu(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    const debugService = accessor.get(IDebugService);
    const editorService = accessor.get(IEditorService);
    const sessions = debugService.getModel().getSessions(false);
    const modelService = accessor.get(IModelService);
    const languageService = accessor.get(ILanguageService);
    const labelService = accessor.get(ILabelService);
    const localDisposableStore = new DisposableStore();
    const quickPick = quickInputService.createQuickPick({ useSeparators: true });
    localDisposableStore.add(quickPick);
    quickPick.matchOnLabel = quickPick.matchOnDescription = quickPick.matchOnDetail = quickPick.sortByLabel = false;
    quickPick.placeholder = nls.localize('moveFocusedView.selectView', "Search loaded scripts by name");
    quickPick.items = await _getPicks(quickPick.value, sessions, editorService, modelService, languageService, labelService);
    localDisposableStore.add(quickPick.onDidChangeValue(async () => {
        quickPick.items = await _getPicks(quickPick.value, sessions, editorService, modelService, languageService, labelService);
    }));
    localDisposableStore.add(quickPick.onDidAccept(() => {
        const selectedItem = quickPick.selectedItems[0];
        selectedItem.accept();
        quickPick.hide();
    }));
    localDisposableStore.add(quickPick.onDidHide(() => localDisposableStore.dispose()));
    quickPick.show();
}
async function _getPicksFromSession(session, filter, editorService, modelService, languageService, labelService) {
    const items = [];
    items.push({ type: 'separator', label: session.name });
    const sources = await session.getLoadedSources();
    sources.forEach((element) => {
        const pick = _createPick(element, filter, editorService, modelService, languageService, labelService);
        if (pick) {
            items.push(pick);
        }
    });
    return items;
}
async function _getPicks(filter, sessions, editorService, modelService, languageService, labelService) {
    const loadedScriptPicks = [];
    const picks = await Promise.all(sessions.map((session) => _getPicksFromSession(session, filter, editorService, modelService, languageService, labelService)));
    for (const row of picks) {
        for (const elem of row) {
            loadedScriptPicks.push(elem);
        }
    }
    return loadedScriptPicks;
}
function _createPick(source, filter, editorService, modelService, languageService, labelService) {
    const label = labelService.getUriBasenameLabel(source.uri);
    const desc = labelService.getUriLabel(dirname(source.uri));
    // manually filter so that headers don't get filtered out
    const labelHighlights = matchesFuzzy(filter, label, true);
    const descHighlights = matchesFuzzy(filter, desc, true);
    if (labelHighlights || descHighlights) {
        return {
            label,
            description: desc === '.' ? undefined : desc,
            highlights: { label: labelHighlights ?? undefined, description: descHighlights ?? undefined },
            iconClasses: getIconClasses(modelService, languageService, source.uri),
            accept: () => {
                if (source.available) {
                    source.openInEditor(editorService, { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 });
                }
            }
        };
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9hZGVkU2NyaXB0c1BpY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2NvbW1vbi9sb2FkZWRTY3JpcHRzUGlja2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxrQkFBa0IsRUFBdUMsTUFBTSxzREFBc0QsQ0FBQztBQUMvSCxPQUFPLEVBQUUsYUFBYSxFQUFpQixNQUFNLFlBQVksQ0FBQztBQUMxRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFdkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQU0zRTs7O0dBR0c7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLG9CQUFvQixDQUFDLFFBQTBCO0lBQ3BFLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQzNELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDakQsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENB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