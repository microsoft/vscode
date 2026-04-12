/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual } from 'assert';
import { Codicon } from '../../../../base/common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createProfileSchemaEnums } from '../../common/terminalProfiles.js';
suite('terminalProfiles', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('createProfileSchemaEnums', () => {
        test('should return an empty array when there are no profiles', () => {
            deepStrictEqual(createProfileSchemaEnums([]), {
                values: [
                    null
                ],
                markdownDescriptions: [
                    'Automatically detect the default'
                ]
            });
        });
        test('should return a single entry when there is one profile', () => {
            const profile = {
                profileName: 'name',
                path: 'path',
                isDefault: true
            };
            deepStrictEqual(createProfileSchemaEnums([profile]), {
                values: [
                    null,
                    'name'
                ],
                markdownDescriptions: [
                    'Automatically detect the default',
                    '$(terminal) name\n- path: path'
                ]
            });
        });
        test('should show all profile information', () => {
            const profile = {
                profileName: 'name',
                path: 'path',
                isDefault: true,
                args: ['a', 'b'],
                color: 'terminal.ansiRed',
                env: {
                    c: 'd',
                    e: 'f'
                },
                icon: Codicon.zap,
                overrideName: true
            };
            deepStrictEqual(createProfileSchemaEnums([profile]), {
                values: [
                    null,
                    'name'
                ],
                markdownDescriptions: [
                    'Automatically detect the default',
                    `$(zap) name\n- path: path\n- args: ['a','b']\n- overrideName: true\n- color: terminal.ansiRed\n- env: {\"c\":\"d\",\"e\":\"f\"}`
                ]
            });
        });
        test('should return a multiple entries when there are multiple profiles', () => {
            const profile1 = {
                profileName: 'name',
                path: 'path',
                isDefault: true
            };
            const profile2 = {
                profileName: 'foo',
                path: 'bar',
                isDefault: false
            };
            deepStrictEqual(createProfileSchemaEnums([profile1, profile2]), {
                values: [
                    null,
                    'name',
                    'foo'
                ],
                markdownDescriptions: [
                    'Automatically detect the default',
                    '$(terminal) name\n- path: path',
                    '$(terminal) foo\n- path: bar'
                ]
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxQcm9maWxlcy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGVybWluYWwvdGVzdC9jb21tb24vdGVybWluYWxQcm9maWxlcy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDekMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTVFLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7SUFDOUIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsMEJBQTBCLEVBQUUsR0FBRyxFQUFFO1FBQ3RDLElBQUksQ0FBQyx5REFBeUQsRUFBRSxHQUFHLEVBQUU7WUFDcEUsZUFBZSxDQUFDLHdCQUF3QixDQUFDLEVBQUUsQ0FBQyxFQUFFO2dCQUM3QyxNQUFNLEVBQUU7b0JBQ1AsSUFBSTtpQkFDSjtnQkFDRCxvQkFBb0IsRUFBRTtvQkFDckIsa0NBQWtDO2lCQUNsQzthQUNELENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLHdEQUF3RCxFQUFFLEdBQUcsRUFBRTtZQUNuRSxNQUFNLE9BQU8sR0FBcUI7Z0JBQ2pDLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixJQUFJLEVBQUUsTUFBTTtnQkFDWixTQUFTLEVBQUUsSUFBSTthQUNmLENBQUM7WUFDRixlQUFlLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFO2dCQUNwRCxNQUFNLEVBQUU7b0JBQ1AsSUFBSTtvQkFDSixNQUFNO2lCQUNOO2dCQUNELG9CQUFvQixFQUFFO29CQUNyQixrQ0FBa0M7b0JBQ2xDLGdDQUFnQztpQkFDaEM7YUFDRCxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxHQUFHLEVBQUU7WUFDaEQsTUFBTSxPQUFPLEdBQXFCO2dCQUNqQyxXQUFXLEVBQUUsTUFBTTtnQkFDbkIsSUFBSSxFQUFFLE1BQU07Z0JBQ1osU0FBUyxFQUFFLElBQUk7Z0JBQ2YsSUFBSSxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztnQkFDaEIsS0FBSyxFQUFFLGtCQUFrQjtnQkFDekIsR0FBRyxFQUFFO29CQUNKLENBQUMsRUFBRSxHQUFHO29CQUNOLENBQUMsRUFBRSxHQUFHO2lCQUNOO2dCQUNELElBQUksRUFBRSxPQUFPLENBQUMsR0FBRztnQkFDakIsWUFBWSxFQUFFLElBQUk7YUFDbEIsQ0FBQztZQUNGLGVBQWUsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUU7Z0JBQ3BELE1BQU0sRUFBRTtvQkFDUCxJQUFJO29CQUNKLE1BQU07aUJBQ047Z0JBQ0Qsb0JBQW9CLEVBQUU7b0JBQ3JCLGtDQUFrQztvQkFDbEMsaUlBQWlJO2lCQUNqSTthQUNELENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLG1FQUFtRSxFQUFFLEdBQUcsRUFBRTtZQUM5RSxNQUFNLFFBQVEsR0FBcUI7Z0JBQ2xDLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixJQUFJLEVBQUUsTUFBTTtnQkFDWixTQUFTLEVBQUUsSUFBSTthQUNmLENBQUM7WUFDRixNQUFNLFFBQVEsR0FBcUI7Z0JBQ2xDLFdBQVcsRUFBRSxLQUFLO2dCQUNsQixJQUFJLEVBQUUsS0FBSztnQkFDWCxTQUFTLEVBQUUsS0FBSzthQUNoQixDQUFDO1lBQ0YsZUFBZSxDQUFDLHdCQUF3QixDQUFDLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDLEVBQUU7Z0JBQy9ELE1BQU0sRUFBRTtvQkFDUCxJQUFJO29CQUNKLE1BQU07b0JBQ04sS0FBSztpQkFDTDtnQkFDRCxvQkFBb0IsRUFBRTtvQkFDckIsa0NBQWtDO29CQUNsQyxnQ0FBZ0M7b0JBQ2hDLDhCQUE4QjtpQkFDOUI7YUFDRCxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==