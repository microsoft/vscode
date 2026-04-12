/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseEnabledApiProposalNames } from '../../common/extensions.js';
suite('Parsing Enabled Api Proposals', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('parsingEnabledApiProposals', () => {
        assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState']));
        assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@1']));
        assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@']));
        assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@randomstring']));
        assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@1234']));
        assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@1234_random']));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9ucy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZXh0ZW5zaW9ucy90ZXN0L2NvbW1vbi9leHRlbnNpb25zLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRTFFLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxHQUFHLEVBQUU7SUFFM0MsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsR0FBRyxFQUFFO1FBQ3ZDLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDLGVBQWUsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2SSxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsZUFBZSxFQUFFLG9CQUFvQixDQUFDLEVBQUUsNEJBQTRCLENBQUMsQ0FBQyxlQUFlLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDekksTUFBTSxDQUFDLGVBQWUsQ0FBQyxDQUFDLGVBQWUsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLDRCQUE0QixDQUFDLENBQUMsZUFBZSxFQUFFLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hJLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDLGVBQWUsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwSixNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsZUFBZSxFQUFFLG9CQUFvQixDQUFDLEVBQUUsNEJBQTRCLENBQUMsQ0FBQyxlQUFlLEVBQUUseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUksTUFBTSxDQUFDLGVBQWUsQ0FBQyxDQUFDLGVBQWUsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLDRCQUE0QixDQUFDLENBQUMsZUFBZSxFQUFFLGdDQUFnQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BKLENBQUMsQ0FBQyxDQUFDO0FBRUosQ0FBQyxDQUFDLENBQUMifQ==