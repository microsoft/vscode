/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { getCleanPromptName, isPromptOrInstructionsFile } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../../base/common/uri.js';
suite('Prompt Constants', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('getCleanPromptName', () => {
        test('returns a clean prompt name', () => {
            assert.strictEqual(getCleanPromptName(URI.file('/path/to/my-prompt.prompt.md')), 'my-prompt');
            assert.strictEqual(getCleanPromptName(URI.file('../common.prompt.md')), 'common');
            const expectedPromptName = `some-3095`;
            assert.strictEqual(getCleanPromptName(URI.file(`./${expectedPromptName}.prompt.md`)), expectedPromptName);
            assert.strictEqual(getCleanPromptName(URI.file('.github/copilot-instructions.md')), 'copilot-instructions');
            assert.strictEqual(getCleanPromptName(URI.file('/etc/prompts/my-prompt')), 'my-prompt');
            assert.strictEqual(getCleanPromptName(URI.file('../some-folder/frequent.txt')), 'frequent.txt');
            assert.strictEqual(getCleanPromptName(URI.parse('untitled:Untitled-1')), 'Untitled-1');
        });
    });
    suite('isPromptOrInstructionsFile', () => {
        test('returns `true` for prompt files', () => {
            assert(isPromptOrInstructionsFile(URI.file('/path/to/my-prompt.prompt.md')));
            assert(isPromptOrInstructionsFile(URI.file('../common.prompt.md')));
            assert(isPromptOrInstructionsFile(URI.file(`./some-38294.prompt.md`)));
            assert(isPromptOrInstructionsFile(URI.file('.github/copilot-instructions.md')));
        });
        test('returns `false` for non-prompt files', () => {
            assert(!isPromptOrInstructionsFile(URI.file('/path/to/my-prompt.prompt.md1')));
            assert(!isPromptOrInstructionsFile(URI.file('../common.md')));
            assert(!isPromptOrInstructionsFile(URI.file(`./some-2530.txt`)));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc3RhbnRzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvY29uc3RhbnRzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQy9ILE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUc5RCxLQUFLLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO0lBQzlCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDLG9CQUFvQixFQUFFLEdBQUcsRUFBRTtRQUNoQyxJQUFJLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxFQUFFO1lBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQ2pCLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsOEJBQThCLENBQUMsQ0FBQyxFQUM1RCxXQUFXLENBQ1gsQ0FBQztZQUVGLE1BQU0sQ0FBQyxXQUFXLENBQ2pCLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQyxFQUNuRCxRQUFRLENBQ1IsQ0FBQztZQUVGLE1BQU0sa0JBQWtCLEdBQUcsV0FBVyxDQUFDO1lBQ3ZDLE1BQU0sQ0FBQyxXQUFXLENBQ2pCLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxrQkFBa0IsWUFBWSxDQUFDLENBQUMsRUFDakUsa0JBQWtCLENBQ2xCLENBQUM7WUFFRixNQUFNLENBQUMsV0FBVyxDQUNqQixrQkFBa0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLENBQUMsRUFDL0Qsc0JBQXNCLENBQ3RCLENBQUM7WUFFRixNQUFNLENBQUMsV0FBVyxDQUNqQixrQkFBa0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUMsRUFDdEQsV0FBVyxDQUNYLENBQUM7WUFFRixNQUFNLENBQUMsV0FBVyxDQUNqQixrQkFBa0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLENBQUMsRUFDM0QsY0FBYyxDQUNkLENBQUM7WUFFRixNQUFNLENBQUMsV0FBVyxDQUNqQixrQkFBa0IsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUMsRUFDcEQsWUFBWSxDQUNaLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEdBQUcsRUFBRTtRQUN4QyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsR0FBRyxFQUFFO1lBQzVDLE1BQU0sQ0FDTCwwQkFBMEIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FDcEUsQ0FBQztZQUVGLE1BQU0sQ0FDTCwwQkFBMEIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FDM0QsQ0FBQztZQUVGLE1BQU0sQ0FDTCwwQkFBMEIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FDOUQsQ0FBQztZQUVGLE1BQU0sQ0FDTCwwQkFBMEIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLENBQUMsQ0FDdkUsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLEdBQUcsRUFBRTtZQUNqRCxNQUFNLENBQ0wsQ0FBQywwQkFBMEIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLCtCQUErQixDQUFDLENBQUMsQ0FDdEUsQ0FBQztZQUVGLE1BQU0sQ0FDTCxDQUFDLDBCQUEwQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FDckQsQ0FBQztZQUVGLE1BQU0sQ0FDTCxDQUFDLDBCQUEwQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUN4RCxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=