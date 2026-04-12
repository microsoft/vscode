/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ExtensionDescriptionRegistry } from '../../common/extensionDescriptionRegistry.js';
suite('ExtensionDescriptionRegistry', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('allow removing and adding the same extension at a different version', () => {
        const idA = new ExtensionIdentifier('a');
        const extensionA1 = desc(idA, '1.0.0');
        const extensionA2 = desc(idA, '2.0.0');
        const basicActivationEventsReader = {
            readActivationEvents: (extensionDescription) => {
                return extensionDescription.activationEvents?.slice() ?? [];
            }
        };
        const registry = new ExtensionDescriptionRegistry(basicActivationEventsReader, [extensionA1]);
        registry.deltaExtensions([extensionA2], [idA]);
        assert.deepStrictEqual(registry.getAllExtensionDescriptions(), [extensionA2]);
        registry.dispose();
    });
    function desc(id, version, activationEvents = ['*']) {
        return {
            name: id.value,
            publisher: 'test',
            version: '0.0.0',
            engines: { vscode: '^1.0.0' },
            identifier: id,
            extensionLocation: URI.parse(`nothing://nowhere`),
            isBuiltin: false,
            isUnderDevelopment: false,
            isUserBuiltin: false,
            activationEvents,
            main: 'index.js',
            targetPlatform: "undefined" /* TargetPlatform.UNDEFINED */,
            extensionDependencies: [],
            enabledApiProposals: undefined,
            preRelease: false,
        };
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbnMvdGVzdC9jb21tb24vZXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLG1CQUFtQixFQUF5QyxNQUFNLHlEQUF5RCxDQUFDO0FBQ3JJLE9BQU8sRUFBRSw0QkFBNEIsRUFBMkIsTUFBTSw4Q0FBOEMsQ0FBQztBQUVySCxLQUFLLENBQUMsOEJBQThCLEVBQUUsR0FBRyxFQUFFO0lBRTFDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLHFFQUFxRSxFQUFFLEdBQUcsRUFBRTtRQUNoRixNQUFNLEdBQUcsR0FBRyxJQUFJLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDdkMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUV2QyxNQUFNLDJCQUEyQixHQUE0QjtZQUM1RCxvQkFBb0IsRUFBRSxDQUFDLG9CQUEyQyxFQUFZLEVBQUU7Z0JBQy9FLE9BQU8sb0JBQW9CLENBQUMsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDO1lBQzdELENBQUM7U0FDRCxDQUFDO1FBRUYsTUFBTSxRQUFRLEdBQUcsSUFBSSw0QkFBNEIsQ0FBQywyQkFBMkIsRUFBRSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFDOUYsUUFBUSxDQUFDLGVBQWUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUUvQyxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztRQUU5RSxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDcEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxTQUFTLElBQUksQ0FBQyxFQUF1QixFQUFFLE9BQWUsRUFBRSxtQkFBNkIsQ0FBQyxHQUFHLENBQUM7UUFDekYsT0FBTztZQUNOLElBQUksRUFBRSxFQUFFLENBQUMsS0FBSztZQUNkLFNBQVMsRUFBRSxNQUFNO1lBQ2pCLE9BQU8sRUFBRSxPQUFPO1lBQ2hCLE9BQU8sRUFBRSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUU7WUFDN0IsVUFBVSxFQUFFLEVBQUU7WUFDZCxpQkFBaUIsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLG1CQUFtQixDQUFDO1lBQ2pELFNBQVMsRUFBRSxLQUFLO1lBQ2hCLGtCQUFrQixFQUFFLEtBQUs7WUFDekIsYUFBYSxFQUFFLEtBQUs7WUFDcEIsZ0JBQWdCO1lBQ2hCLElBQUksRUFBRSxVQUFVO1lBQ2hCLGNBQWMsNENBQTBCO1lBQ3hDLHFCQUFxQixFQUFFLEVBQUU7WUFDekIsbUJBQW1CLEVBQUUsU0FBUztZQUM5QixVQUFVLEVBQUUsS0FBSztTQUNqQixDQUFDO0lBQ0gsQ0FBQztBQUNGLENBQUMsQ0FBQyxDQUFDIn0=