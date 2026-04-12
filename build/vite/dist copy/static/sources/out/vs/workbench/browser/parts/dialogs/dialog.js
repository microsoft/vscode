/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EventHelper } from '../../../../base/browser/dom.js';
import { fromNow } from '../../../../base/common/date.js';
import { localize } from '../../../../nls.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles, defaultDialogStyles } from '../../../../platform/theme/browser/defaultStyles.js';
const defaultDialogAllowableCommands = new Set([
    'workbench.action.quit',
    'workbench.action.reloadWindow',
    'copy',
    'cut',
    'editor.action.selectAll',
    'editor.action.clipboardCopyAction',
    'editor.action.clipboardCutAction',
    'editor.action.clipboardPasteAction'
]);
export function createWorkbenchDialogOptions(options, keybindingService, layoutService, hostService, allowableCommands = defaultDialogAllowableCommands) {
    return {
        keyEventProcessor: (event) => {
            const resolved = keybindingService.softDispatch(event, layoutService.activeContainer);
            if (resolved.kind === 2 /* ResultKind.KbFound */ && resolved.commandId) {
                if (!allowableCommands.has(resolved.commandId)) {
                    EventHelper.stop(event, true);
                }
            }
        },
        buttonStyles: defaultButtonStyles,
        checkboxStyles: defaultCheckboxStyles,
        inputBoxStyles: defaultInputBoxStyles,
        dialogStyles: defaultDialogStyles,
        onVisibilityChange: (window, visible) => hostService.setWindowDimmed(window, visible),
        ...options
    };
}
export function createBrowserAboutDialogDetails(productService) {
    const detailString = (useAgo) => {
        return localize('aboutDetail', "Version: {0}\nCommit: {1}\nDate: {2}\nBrowser: {3}", productService.version || 'Unknown', productService.commit || 'Unknown', productService.date ? `${productService.date}${useAgo ? ' (' + fromNow(new Date(productService.date), true) + ')' : ''}` : 'Unknown', navigator.userAgent);
    };
    const details = detailString(true);
    const detailsToCopy = detailString(false);
    return {
        title: productService.nameLong,
        details: details,
        detailsToCopy: detailsToCopy
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlhbG9nLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZGlhbG9ncy9kaWFsb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRzlELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFNOUMsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLHFCQUFxQixFQUFFLG1CQUFtQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFFN0osTUFBTSw4QkFBOEIsR0FBRyxJQUFJLEdBQUcsQ0FBQztJQUM5Qyx1QkFBdUI7SUFDdkIsK0JBQStCO0lBQy9CLE1BQU07SUFDTixLQUFLO0lBQ0wseUJBQXlCO0lBQ3pCLG1DQUFtQztJQUNuQyxrQ0FBa0M7SUFDbEMsb0NBQW9DO0NBQ3BDLENBQUMsQ0FBQztBQUVILE1BQU0sVUFBVSw0QkFBNEIsQ0FBQyxPQUFnQyxFQUFFLGlCQUFxQyxFQUFFLGFBQTZCLEVBQUUsV0FBeUIsRUFBRSxpQkFBaUIsR0FBRyw4QkFBOEI7SUFDak8sT0FBTztRQUNOLGlCQUFpQixFQUFFLENBQUMsS0FBNEIsRUFBRSxFQUFFO1lBQ25ELE1BQU0sUUFBUSxHQUFHLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsYUFBYSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ3RGLElBQUksUUFBUSxDQUFDLElBQUksK0JBQXVCLElBQUksUUFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUNoRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO29CQUNoRCxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDL0IsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQ0QsWUFBWSxFQUFFLG1CQUFtQjtRQUNqQyxjQUFjLEVBQUUscUJBQXFCO1FBQ3JDLGNBQWMsRUFBRSxxQkFBcUI7UUFDckMsWUFBWSxFQUFFLG1CQUFtQjtRQUNqQyxrQkFBa0IsRUFBRSxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQztRQUNyRixHQUFHLE9BQU87S0FDVixDQUFDO0FBQ0gsQ0FBQztBQUVELE1BQU0sVUFBVSwrQkFBK0IsQ0FBQyxjQUErQjtJQUM5RSxNQUFNLFlBQVksR0FBRyxDQUFDLE1BQWUsRUFBVSxFQUFFO1FBQ2hELE9BQU8sUUFBUSxDQUFDLGFBQWEsRUFDNUIsb0RBQW9ELEVBQ3BELGNBQWMsQ0FBQyxPQUFPLElBQUksU0FBUyxFQUNuQyxjQUFjLENBQUMsTUFBTSxJQUFJLFNBQVMsRUFDbEMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxjQUFjLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUNwSSxTQUFTLENBQUMsU0FBUyxDQUNuQixDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBRUYsTUFBTSxPQUFPLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ25DLE1BQU0sYUFBYSxHQUFHLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUUxQyxPQUFPO1FBQ04sS0FBSyxFQUFFLGNBQWMsQ0FBQyxRQUFRO1FBQzlCLE9BQU8sRUFBRSxPQUFPO1FBQ2hCLGFBQWEsRUFBRSxhQUFhO0tBQzVCLENBQUM7QUFDSCxDQUFDIn0=