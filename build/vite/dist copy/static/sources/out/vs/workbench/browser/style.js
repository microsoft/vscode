/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './media/style.css';
import { registerThemingParticipant } from '../../platform/theme/common/themeService.js';
import { WORKBENCH_BACKGROUND, TITLE_BAR_ACTIVE_BACKGROUND } from '../common/theme.js';
import { isWeb, isIOS } from '../../base/common/platform.js';
import { createMetaElement } from '../../base/browser/dom.js';
import { isSafari, isStandalone } from '../../base/browser/browser.js';
import { selectionBackground } from '../../platform/theme/common/colorRegistry.js';
import { mainWindow } from '../../base/browser/window.js';
registerThemingParticipant((theme, collector) => {
    // Background (helps for subpixel-antialiasing on Windows)
    const workbenchBackground = WORKBENCH_BACKGROUND(theme);
    collector.addRule(`.monaco-workbench { background-color: ${workbenchBackground}; }`);
    // Selection (do NOT remove - https://github.com/microsoft/vscode/issues/169662)
    const windowSelectionBackground = theme.getColor(selectionBackground);
    if (windowSelectionBackground) {
        collector.addRule(`.monaco-workbench ::selection { background-color: ${windowSelectionBackground}; }`);
    }
    // Update <meta name="theme-color" content=""> based on selected theme
    if (isWeb) {
        const titleBackground = theme.getColor(TITLE_BAR_ACTIVE_BACKGROUND);
        if (titleBackground) {
            const metaElementId = 'monaco-workbench-meta-theme-color';
            // eslint-disable-next-line no-restricted-syntax
            let metaElement = mainWindow.document.getElementById(metaElementId);
            if (!metaElement) {
                metaElement = createMetaElement();
                metaElement.name = 'theme-color';
                metaElement.id = metaElementId;
            }
            metaElement.content = titleBackground.toString();
        }
    }
    // We disable user select on the root element, however on Safari this seems
    // to prevent any text selection in the monaco editor. As a workaround we
    // allow to select text in monaco editor instances.
    if (isSafari) {
        collector.addRule(`
			body.web {
				touch-action: none;
			}
			.monaco-workbench .monaco-editor .view-lines {
				user-select: text;
				-webkit-user-select: text;
			}
		`);
    }
    // Update body background color to ensure the home indicator area looks similar to the workbench
    if (isIOS && isStandalone()) {
        collector.addRule(`body { background-color: ${workbenchBackground}; }`);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3R5bGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9zdHlsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLG1CQUFtQixDQUFDO0FBQzNCLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDN0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN2RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNuRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFMUQsMEJBQTBCLENBQUMsQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLEVBQUU7SUFFL0MsMERBQTBEO0lBQzFELE1BQU0sbUJBQW1CLEdBQUcsb0JBQW9CLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDeEQsU0FBUyxDQUFDLE9BQU8sQ0FBQyx5Q0FBeUMsbUJBQW1CLEtBQUssQ0FBQyxDQUFDO0lBRXJGLGdGQUFnRjtJQUNoRixNQUFNLHlCQUF5QixHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsQ0FBQztJQUN0RSxJQUFJLHlCQUF5QixFQUFFLENBQUM7UUFDL0IsU0FBUyxDQUFDLE9BQU8sQ0FBQyxxREFBcUQseUJBQXlCLEtBQUssQ0FBQyxDQUFDO0lBQ3hHLENBQUM7SUFFRCxzRUFBc0U7SUFDdEUsSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUNYLE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsMkJBQTJCLENBQUMsQ0FBQztRQUNwRSxJQUFJLGVBQWUsRUFBRSxDQUFDO1lBQ3JCLE1BQU0sYUFBYSxHQUFHLG1DQUFtQyxDQUFDO1lBQzFELGdEQUFnRDtZQUNoRCxJQUFJLFdBQVcsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQTJCLENBQUM7WUFDOUYsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNsQixXQUFXLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQztnQkFDbEMsV0FBVyxDQUFDLElBQUksR0FBRyxhQUFhLENBQUM7Z0JBQ2pDLFdBQVcsQ0FBQyxFQUFFLEdBQUcsYUFBYSxDQUFDO1lBQ2hDLENBQUM7WUFFRCxXQUFXLENBQUMsT0FBTyxHQUFHLGVBQWUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNsRCxDQUFDO0lBQ0YsQ0FBQztJQUVELDJFQUEyRTtJQUMzRSx5RUFBeUU7SUFDekUsbURBQW1EO0lBQ25ELElBQUksUUFBUSxFQUFFLENBQUM7UUFDZCxTQUFTLENBQUMsT0FBTyxDQUFDOzs7Ozs7OztHQVFqQixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsZ0dBQWdHO0lBQ2hHLElBQUksS0FBSyxJQUFJLFlBQVksRUFBRSxFQUFFLENBQUM7UUFDN0IsU0FBUyxDQUFDLE9BQU8sQ0FBQyw0QkFBNEIsbUJBQW1CLEtBQUssQ0FBQyxDQUFDO0lBQ3pFLENBQUM7QUFDRixDQUFDLENBQUMsQ0FBQyJ9