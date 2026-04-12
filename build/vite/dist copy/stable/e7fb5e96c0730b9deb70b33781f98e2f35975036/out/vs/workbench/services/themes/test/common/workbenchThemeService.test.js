/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { migrateThemeSettingsId, ThemeSettingDefaults } from '../../common/workbenchThemeService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('WorkbenchThemeService', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('migrateThemeSettingsId', () => {
        test('migrates Default-prefixed theme IDs', () => {
            assert.deepStrictEqual(['Default Dark Modern', 'Default Light Modern', 'Default Dark+', 'Default Light+'].map(migrateThemeSettingsId), ['Dark Modern', 'Light Modern', 'Dark+', 'Light+']);
        });
        test('migrates Experimental theme IDs to VS Code themes', () => {
            assert.deepStrictEqual(['Experimental Dark', 'Experimental Light', 'VS Code Dark', 'VS Code Light'].map(migrateThemeSettingsId), [ThemeSettingDefaults.COLOR_THEME_DARK, ThemeSettingDefaults.COLOR_THEME_LIGHT, ThemeSettingDefaults.COLOR_THEME_DARK, ThemeSettingDefaults.COLOR_THEME_LIGHT]);
        });
        test('returns unknown IDs unchanged', () => {
            assert.deepStrictEqual(['Dark Modern', 'Dark 2026', 'Some Custom Theme', ''].map(migrateThemeSettingsId), ['Dark Modern', 'Dark 2026', 'Some Custom Theme', '']);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2JlbmNoVGhlbWVTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdGhlbWVzL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRoZW1lU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxLQUFLLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFO0lBRW5DLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtRQUVwQyxJQUFJLENBQUMscUNBQXFDLEVBQUUsR0FBRyxFQUFFO1lBQ2hELE1BQU0sQ0FBQyxlQUFlLENBQ3JCLENBQUMscUJBQXFCLEVBQUUsc0JBQXNCLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixDQUFDLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLEVBQzlHLENBQUMsYUFBYSxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQ2xELENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxtREFBbUQsRUFBRSxHQUFHLEVBQUU7WUFDOUQsTUFBTSxDQUFDLGVBQWUsQ0FDckIsQ0FBQyxtQkFBbUIsRUFBRSxvQkFBb0IsRUFBRSxjQUFjLEVBQUUsZUFBZSxDQUFDLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLEVBQ3hHLENBQUMsb0JBQW9CLENBQUMsZ0JBQWdCLEVBQUUsb0JBQW9CLENBQUMsaUJBQWlCLEVBQUUsb0JBQW9CLENBQUMsZ0JBQWdCLEVBQUUsb0JBQW9CLENBQUMsaUJBQWlCLENBQUMsQ0FDOUosQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLCtCQUErQixFQUFFLEdBQUcsRUFBRTtZQUMxQyxNQUFNLENBQUMsZUFBZSxDQUNyQixDQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsbUJBQW1CLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLEVBQ2pGLENBQUMsYUFBYSxFQUFFLFdBQVcsRUFBRSxtQkFBbUIsRUFBRSxFQUFFLENBQUMsQ0FDckQsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9