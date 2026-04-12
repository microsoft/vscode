/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { escape } from '../../../../../base/common/strings.js';
import { localize } from '../../../../../nls.js';
import { ThemeSettingDefaults } from '../../../../services/themes/common/workbenchThemeService.js';
export default () => `
<checklist>
	<div class="theme-picker-row">
		<checkbox when-checked="setTheme:${ThemeSettingDefaults.COLOR_THEME_DARK}" checked-on="config.workbench.colorTheme == '${ThemeSettingDefaults.COLOR_THEME_DARK}'">
			<img width="150" src="./dark.png"/>
			${escape(localize('dark', "Dark Modern"))}
		</checkbox>
		<checkbox when-checked="setTheme:${ThemeSettingDefaults.COLOR_THEME_LIGHT}" checked-on="config.workbench.colorTheme == '${ThemeSettingDefaults.COLOR_THEME_LIGHT}'">
			<img width="150" src="./light.png"/>
			${escape(localize('light', "Light Modern"))}
		</checkbox>
	</div>
	<div class="theme-picker-row">
		<checkbox when-checked="setTheme:${ThemeSettingDefaults.COLOR_THEME_HC_DARK}" checked-on="config.workbench.colorTheme == '${ThemeSettingDefaults.COLOR_THEME_HC_DARK}'">
			<img width="150" src="./dark-hc.png"/>
			${escape(localize('HighContrast', "Dark High Contrast"))}
		</checkbox>
		<checkbox when-checked="setTheme:${ThemeSettingDefaults.COLOR_THEME_HC_LIGHT}" checked-on="config.workbench.colorTheme == '${ThemeSettingDefaults.COLOR_THEME_HC_LIGHT}'">
			<img width="150" src="./light-hc.png"/>
			${escape(localize('HighContrastLight', "Light High Contrast"))}
		</checkbox>
	</div>
</checklist>
`;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhlbWVfcGlja2VyX3NtYWxsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZUdldHRpbmdTdGFydGVkL2NvbW1vbi9tZWRpYS90aGVtZV9waWNrZXJfc21hbGwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUVuRyxlQUFlLEdBQUcsRUFBRSxDQUFDOzs7cUNBR2dCLG9CQUFvQixDQUFDLGdCQUFnQixpREFBaUQsb0JBQW9CLENBQUMsZ0JBQWdCOztLQUUzSixNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxhQUFhLENBQUMsQ0FBQzs7cUNBRVAsb0JBQW9CLENBQUMsaUJBQWlCLGlEQUFpRCxvQkFBb0IsQ0FBQyxpQkFBaUI7O0tBRTdKLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLGNBQWMsQ0FBQyxDQUFDOzs7O3FDQUlULG9CQUFvQixDQUFDLG1CQUFtQixpREFBaUQsb0JBQW9CLENBQUMsbUJBQW1COztLQUVqSyxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDOztxQ0FFdEIsb0JBQW9CLENBQUMsb0JBQW9CLGlEQUFpRCxvQkFBb0IsQ0FBQyxvQkFBb0I7O0tBRW5LLE1BQU0sQ0FBQyxRQUFRLENBQUMsbUJBQW1CLEVBQUUscUJBQXFCLENBQUMsQ0FBQzs7OztDQUloRSxDQUFDIn0=