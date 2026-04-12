/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createCommandUri } from '../../../../../base/common/htmlContent.js';
import { escape } from '../../../../../base/common/strings.js';
import { localize } from '../../../../../nls.js';
const createSetProfileCommandUri = (profile) => createCommandUri('notebook.setProfile', { profile }).toString();
const imageSize = 400;
export default () => `
<vertically-centered>
<checklist>
	<checkbox on-checked="${createSetProfileCommandUri('default')}" checked-on="config.notebook.cellFocusIndicator == 'border' && config.notebook.insertToolbarLocation == 'both' && config.notebook.globalToolbar == false && config.notebook.compactView == true && config.notebook.showCellStatusBar == 'visible'">
		<img width="${imageSize}" src="./notebookThemes/default.png"/>
		${escape(localize('default', "Default"))}
	</checkbox>
	<checkbox on-checked="${createSetProfileCommandUri('jupyter')}" checked-on="config.notebook.cellFocusIndicator == 'gutter' && config.notebook.insertToolbarLocation == 'notebookToolbar' && config.notebook.globalToolbar == true && config.notebook.compactView == true  && config.notebook.showCellStatusBar == 'visible'">
		<img width="${imageSize}" src="./notebookThemes/jupyter.png"/>
		${escape(localize('jupyter', "Jupyter"))}
	</checkbox>
	<checkbox on-checked="${createSetProfileCommandUri('colab')}" checked-on="config.notebook.cellFocusIndicator == 'border' && config.notebook.insertToolbarLocation == 'betweenCells' && config.notebook.globalToolbar == false && config.notebook.compactView == false && config.notebook.showCellStatusBar == 'hidden'">
		<img width="${imageSize}" src="./notebookThemes/colab.png"/>
		${escape(localize('colab', "Colab"))}
	</checkbox>
</checklist>
</vertically-centered>
`;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tQcm9maWxlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZUdldHRpbmdTdGFydGVkL2NvbW1vbi9tZWRpYS9ub3RlYm9va1Byb2ZpbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDN0UsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUVqRCxNQUFNLDBCQUEwQixHQUFHLENBQUMsT0FBZSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7QUFDeEgsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDO0FBRXRCLGVBQWUsR0FBRyxFQUFFLENBQUM7Ozt5QkFHSSwwQkFBMEIsQ0FBQyxTQUFTLENBQUM7Z0JBQzlDLFNBQVM7SUFDckIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7O3lCQUVqQiwwQkFBMEIsQ0FBQyxTQUFTLENBQUM7Z0JBQzlDLFNBQVM7SUFDckIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7O3lCQUVqQiwwQkFBMEIsQ0FBQyxPQUFPLENBQUM7Z0JBQzVDLFNBQVM7SUFDckIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7Ozs7Q0FJckMsQ0FBQyJ9