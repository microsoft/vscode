/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getCustomizationSecondaryText, truncateToFirstLine } from '../../../browser/aiCustomization/aiCustomizationListWidgetUtils.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
suite('aiCustomizationListWidget', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('truncateToFirstLine', () => {
        test('keeps first line when text has multiple lines', () => {
            assert.strictEqual(truncateToFirstLine('First line\nSecond line'), 'First line');
        });
        test('returns full text when no newline is present', () => {
            assert.strictEqual(truncateToFirstLine('No newline here. Even with sentences.'), 'No newline here. Even with sentences.');
        });
        test('handles carriage return line endings', () => {
            assert.strictEqual(truncateToFirstLine('First line\r\nSecond line'), 'First line');
        });
    });
    suite('getCustomizationSecondaryText', () => {
        test('keeps hook descriptions intact', () => {
            assert.strictEqual(getCustomizationSecondaryText('echo "setup". echo "run".', 'hook.json', PromptsType.hook), 'echo "setup". echo "run".');
        });
        test('truncates non-hook descriptions to the first line', () => {
            assert.strictEqual(getCustomizationSecondaryText('Show the first line.\nHide the rest.', 'prompt.md', PromptsType.prompt), 'Show the first line.');
        });
        test('falls back to filename when description is missing', () => {
            assert.strictEqual(getCustomizationSecondaryText(undefined, 'prompt.md', PromptsType.prompt), 'prompt.md');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uTGlzdFdpZGdldC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbkxpc3RXaWRnZXQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLG1CQUFtQixFQUFFLE1BQU0sb0VBQW9FLENBQUM7QUFDeEksT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTFFLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxHQUFHLEVBQUU7SUFDdkMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO1FBQ2pDLElBQUksQ0FBQywrQ0FBK0MsRUFBRSxHQUFHLEVBQUU7WUFDMUQsTUFBTSxDQUFDLFdBQVcsQ0FDakIsbUJBQW1CLENBQUMseUJBQXlCLENBQUMsRUFDOUMsWUFBWSxDQUNaLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw4Q0FBOEMsRUFBRSxHQUFHLEVBQUU7WUFDekQsTUFBTSxDQUFDLFdBQVcsQ0FDakIsbUJBQW1CLENBQUMsdUNBQXVDLENBQUMsRUFDNUQsdUNBQXVDLENBQ3ZDLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxzQ0FBc0MsRUFBRSxHQUFHLEVBQUU7WUFDakQsTUFBTSxDQUFDLFdBQVcsQ0FDakIsbUJBQW1CLENBQUMsMkJBQTJCLENBQUMsRUFDaEQsWUFBWSxDQUNaLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLCtCQUErQixFQUFFLEdBQUcsRUFBRTtRQUMzQyxJQUFJLENBQUMsZ0NBQWdDLEVBQUUsR0FBRyxFQUFFO1lBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQ2pCLDZCQUE2QixDQUFDLDJCQUEyQixFQUFFLFdBQVcsRUFBRSxXQUFXLENBQUMsSUFBSSxDQUFDLEVBQ3pGLDJCQUEyQixDQUMzQixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsbURBQW1ELEVBQUUsR0FBRyxFQUFFO1lBQzlELE1BQU0sQ0FBQyxXQUFXLENBQ2pCLDZCQUE2QixDQUFDLHNDQUFzQyxFQUFFLFdBQVcsRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLEVBQ3RHLHNCQUFzQixDQUN0QixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsb0RBQW9ELEVBQUUsR0FBRyxFQUFFO1lBQy9ELE1BQU0sQ0FBQyxXQUFXLENBQ2pCLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxXQUFXLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUN6RSxXQUFXLENBQ1gsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9