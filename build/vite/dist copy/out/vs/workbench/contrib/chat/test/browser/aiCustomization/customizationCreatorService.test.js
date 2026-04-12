/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { resolveUserTargetDirectory } from '../../../browser/aiCustomization/customizationCreatorService.js';
suite('customizationCreatorService', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function createMockPromptsService(userFolderUri) {
        return {
            getSourceFolders: () => Promise.resolve(userFolderUri
                ? [{ uri: userFolderUri, storage: PromptsStorage.user, type: PromptsType.instructions }]
                : []),
        };
    }
    suite('resolveUserTargetDirectory', () => {
        test('returns user folder from getSourceFolders', async () => {
            const userFolder = URI.file('/home/user/.copilot/instructions');
            const result = await resolveUserTargetDirectory(createMockPromptsService(userFolder), PromptsType.instructions);
            assert.strictEqual(result?.path, '/home/user/.copilot/instructions');
        });
        test('returns undefined when no user folder exists', async () => {
            const result = await resolveUserTargetDirectory(createMockPromptsService(), PromptsType.hook);
            assert.strictEqual(result, undefined);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9taXphdGlvbkNyZWF0b3JTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vY3VzdG9taXphdGlvbkNyZWF0b3JTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDMUUsT0FBTyxFQUFtQixjQUFjLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUU3RyxLQUFLLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxFQUFFO0lBQ3pDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsU0FBUyx3QkFBd0IsQ0FBQyxhQUFtQjtRQUNwRCxPQUFPO1lBQ04sZ0JBQWdCLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FDdEMsYUFBYTtnQkFDWixDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLGNBQWMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLFdBQVcsQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDeEYsQ0FBQyxDQUFDLEVBQUUsQ0FDTDtTQUM0QyxDQUFDO0lBQ2hELENBQUM7SUFFRCxLQUFLLENBQUMsNEJBQTRCLEVBQUUsR0FBRyxFQUFFO1FBRXhDLElBQUksQ0FBQywyQ0FBMkMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUM1RCxNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGtDQUFrQyxDQUFDLENBQUM7WUFDaEUsTUFBTSxNQUFNLEdBQUcsTUFBTSwwQkFBMEIsQ0FDOUMsd0JBQXdCLENBQUMsVUFBVSxDQUFvQixFQUN2RCxXQUFXLENBQUMsWUFBWSxDQUN4QixDQUFDO1lBQ0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLGtDQUFrQyxDQUFDLENBQUM7UUFDdEUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsOENBQThDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDL0QsTUFBTSxNQUFNLEdBQUcsTUFBTSwwQkFBMEIsQ0FDOUMsd0JBQXdCLEVBQXFCLEVBQzdDLFdBQVcsQ0FBQyxJQUFJLENBQ2hCLENBQUM7WUFDRixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN2QyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==