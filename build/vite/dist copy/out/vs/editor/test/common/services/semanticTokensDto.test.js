/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { encodeSemanticTokensDto, decodeSemanticTokensDto } from '../../../common/services/semanticTokensDto.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('SemanticTokensDto', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function toArr(arr) {
        const result = [];
        for (let i = 0, len = arr.length; i < len; i++) {
            result[i] = arr[i];
        }
        return result;
    }
    function assertEqualFull(actual, expected) {
        const convert = (dto) => {
            return {
                id: dto.id,
                type: dto.type,
                data: toArr(dto.data)
            };
        };
        assert.deepStrictEqual(convert(actual), convert(expected));
    }
    function assertEqualDelta(actual, expected) {
        const convertOne = (delta) => {
            if (!delta.data) {
                return delta;
            }
            return {
                start: delta.start,
                deleteCount: delta.deleteCount,
                data: toArr(delta.data)
            };
        };
        const convert = (dto) => {
            return {
                id: dto.id,
                type: dto.type,
                deltas: dto.deltas.map(convertOne)
            };
        };
        assert.deepStrictEqual(convert(actual), convert(expected));
    }
    function testRoundTrip(value) {
        const decoded = decodeSemanticTokensDto(encodeSemanticTokensDto(value));
        if (value.type === 'full' && decoded.type === 'full') {
            assertEqualFull(decoded, value);
        }
        else if (value.type === 'delta' && decoded.type === 'delta') {
            assertEqualDelta(decoded, value);
        }
        else {
            assert.fail('wrong type');
        }
    }
    test('full encoding', () => {
        testRoundTrip({
            id: 12,
            type: 'full',
            data: new Uint32Array([(1 << 24) + (2 << 16) + (3 << 8) + 4])
        });
    });
    test('delta encoding', () => {
        testRoundTrip({
            id: 12,
            type: 'delta',
            deltas: [{
                    start: 0,
                    deleteCount: 4,
                    data: undefined
                }, {
                    start: 15,
                    deleteCount: 0,
                    data: new Uint32Array([(1 << 24) + (2 << 16) + (3 << 8) + 4])
                }, {
                    start: 27,
                    deleteCount: 5,
                    data: new Uint32Array([(1 << 24) + (2 << 16) + (3 << 8) + 4, 1, 2, 3, 4, 5, 6, 7, 8, 9])
                }]
        });
    });
    test('partial array buffer', () => {
        const sharedArr = new Uint32Array([
            (1 << 24) + (2 << 16) + (3 << 8) + 4,
            1, 2, 3, 4, 5, (1 << 24) + (2 << 16) + (3 << 8) + 4
        ]);
        testRoundTrip({
            id: 12,
            type: 'delta',
            deltas: [{
                    start: 0,
                    deleteCount: 4,
                    data: sharedArr.subarray(0, 1)
                }, {
                    start: 15,
                    deleteCount: 0,
                    data: sharedArr.subarray(1, sharedArr.length)
                }]
        });
    });
    test('issue #94521: unusual backing array buffer', () => {
        function wrapAndSliceUint8Arry(buff, prefixLength, suffixLength) {
            const wrapped = new Uint8Array(prefixLength + buff.byteLength + suffixLength);
            wrapped.set(buff, prefixLength);
            return wrapped.subarray(prefixLength, prefixLength + buff.byteLength);
        }
        function wrapAndSlice(buff, prefixLength, suffixLength) {
            return VSBuffer.wrap(wrapAndSliceUint8Arry(buff.buffer, prefixLength, suffixLength));
        }
        const dto = {
            id: 5,
            type: 'full',
            data: new Uint32Array([1, 2, 3, 4, 5])
        };
        const encoded = encodeSemanticTokensDto(dto);
        // with misaligned prefix and misaligned suffix
        assertEqualFull(decodeSemanticTokensDto(wrapAndSlice(encoded, 1, 1)), dto);
        // with misaligned prefix and aligned suffix
        assertEqualFull(decodeSemanticTokensDto(wrapAndSlice(encoded, 1, 4)), dto);
        // with aligned prefix and misaligned suffix
        assertEqualFull(decodeSemanticTokensDto(wrapAndSlice(encoded, 4, 1)), dto);
        // with aligned prefix and aligned suffix
        assertEqualFull(decodeSemanticTokensDto(wrapAndSlice(encoded, 4, 4)), dto);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VtYW50aWNUb2tlbnNEdG8udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi9zZXJ2aWNlcy9zZW1hbnRpY1Rva2Vuc0R0by50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQW1ELHVCQUF1QixFQUFzQix1QkFBdUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3RMLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxLQUFLLENBQUMsbUJBQW1CLEVBQUUsR0FBRyxFQUFFO0lBRS9CLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsU0FBUyxLQUFLLENBQUMsR0FBZ0I7UUFDOUIsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO1FBQzVCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNoRCxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BCLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFRCxTQUFTLGVBQWUsQ0FBQyxNQUE4QixFQUFFLFFBQWdDO1FBQ3hGLE1BQU0sT0FBTyxHQUFHLENBQUMsR0FBMkIsRUFBRSxFQUFFO1lBQy9DLE9BQU87Z0JBQ04sRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFFO2dCQUNWLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSTtnQkFDZCxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJ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