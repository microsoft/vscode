/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { PositionOffsetTransformer } from '../../../common/core/text/positionToOffset.js';
suite('PositionOffsetTransformer', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const str = '123456\nabcdef\nghijkl\nmnopqr';
    const t = new PositionOffsetTransformer(str);
    test('getPosition', () => {
        assert.deepStrictEqual(new OffsetRange(0, str.length + 2).map(i => t.getPosition(i).toString()), [
            '(1,1)',
            '(1,2)',
            '(1,3)',
            '(1,4)',
            '(1,5)',
            '(1,6)',
            '(1,7)',
            '(2,1)',
            '(2,2)',
            '(2,3)',
            '(2,4)',
            '(2,5)',
            '(2,6)',
            '(2,7)',
            '(3,1)',
            '(3,2)',
            '(3,3)',
            '(3,4)',
            '(3,5)',
            '(3,6)',
            '(3,7)',
            '(4,1)',
            '(4,2)',
            '(4,3)',
            '(4,4)',
            '(4,5)',
            '(4,6)',
            '(4,7)',
            '(4,8)'
        ]);
    });
    test('getOffset', () => {
        for (let i = 0; i < str.length + 1; i++) {
            assert.strictEqual(t.getOffset(t.getPosition(i)), i);
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvY29tbW9uL2NvcmUvcG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDekUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFMUYsS0FBSyxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtJQUN2Qyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLE1BQU0sR0FBRyxHQUFHLGdDQUFnQyxDQUFDO0lBRTdDLE1BQU0sQ0FBQyxHQUFHLElBQUkseUJBQXlCLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDN0MsSUFBSSxDQUFDLGFBQWEsRUFBRSxHQUFHLEVBQUU7UUFDeEIsTUFBTSxDQUFDLGVBQWUsQ0FDckIsSUFBSSxXQUFXLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxFQUN4RTtZQUNDLE9BQU87WUFDUCxPQUFPO1lBQ1AsT0FBTztZQUNQLE9BQU87WUFDUCxPQUFPO1lBQ1AsT0FBTztZQUNQLE9BQU87WUFDUCxPQUFPO1lBQ1AsT0FBTztZQUNQLE9BQU87WUFDUCxPQUFPO1lBQ1AsT0FBTztZQUNQLE9BQU87WUFDUCxPQUFPO1lBQ1AsT0FBTztZQUNQLE9BQU87WUFDUCxPQUFPO1lBQ1AsT0FBTztZQUNQLE9BQU87WUFDUCxPQUFPO1lBQ1AsT0FBTztZQUNQLE9BQU87WUFDUCxPQUFPO1lBQ1AsT0FBTztZQUNQLE9BQU87WUFDUCxPQUFPO1lBQ1AsT0FBTztZQUNQLE9BQU87WUFDUCxPQUFPO1NBQ1AsQ0FDRCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtRQUN0QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3RELENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=