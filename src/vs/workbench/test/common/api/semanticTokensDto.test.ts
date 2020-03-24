/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IFullSemanticTokensDto, IDeltaSemanticTokensDto, encodeSemanticTokensDto, ISemanticTokensDto, decodeSemanticTokensDto } from 'vs/workbench/api/common/shared/semanticTokensDto';

suite('SemanticTokensDto', () => {

	function toArr(arr: Uint32Array): number[] {
		const result: number[] = [];
		for (let i = 0, len = arr.length; i < len; i++) {
			result[i] = arr[i];
		}
		return result;
	}

	function assertEqualFull(actual: IFullSemanticTokensDto, expected: IFullSemanticTokensDto): void {
		const convert = (dto: IFullSemanticTokensDto) => {
			return {
				id: dto.id,
				type: dto.type,
				data: toArr(dto.data)
			};
		};
		assert.deepEqual(convert(actual), convert(expected));
	}

	function assertEqualDelta(actual: IDeltaSemanticTokensDto, expected: IDeltaSemanticTokensDto): void {
		const convertOne = (delta: { start: number; deleteCount: number; data?: Uint32Array; }) => {
			if (!delta.data) {
				return delta;
			}
			return {
				start: delta.start,
				deleteCount: delta.deleteCount,
				data: toArr(delta.data)
			};
		};
		const convert = (dto: IDeltaSemanticTokensDto) => {
			return {
				id: dto.id,
				type: dto.type,
				deltas: dto.deltas.map(convertOne)
			};
		};
		assert.deepEqual(convert(actual), convert(expected));
	}

	function testRoundTrip(value: ISemanticTokensDto): void {
		const decoded = decodeSemanticTokensDto(encodeSemanticTokensDto(value));
		if (value.type === 'full' && decoded.type === 'full') {
			assertEqualFull(decoded, value);
		} else if (value.type === 'delta' && decoded.type === 'delta') {
			assertEqualDelta(decoded, value);
		} else {
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

});
