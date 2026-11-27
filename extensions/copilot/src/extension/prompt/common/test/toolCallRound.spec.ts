/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { reasoningSourceFieldMetadataKey } from '../../../../platform/thinking/common/thinking';
import { ThinkingDataItem } from '../toolCallRound';

describe('ThinkingDataItem metadata', () => {
	const source = { [reasoningSourceFieldMetadataKey]: 'reasoning_content' };

	it('keeps the reasoning source key when a later delta carries its own metadata', () => {
		let item = ThinkingDataItem.createOrUpdate(undefined, { text: 'thinking', metadata: source });
		item = ThinkingDataItem.createOrUpdate(item, { text: '', metadata: { toolId: 'call_1' } });

		expect(item.metadata).toEqual({ toolId: 'call_1', ...source });
	});

	it('lets a later delta set its own source key', () => {
		let item = ThinkingDataItem.createOrUpdate(undefined, { text: 'a', metadata: source });
		item = ThinkingDataItem.createOrUpdate(item, { text: 'b', metadata: { [reasoningSourceFieldMetadataKey]: 'reasoning' } });

		expect(item.metadata).toEqual({ [reasoningSourceFieldMetadataKey]: 'reasoning' });
	});

	it('does not add a source key that was never recorded', () => {
		let item = ThinkingDataItem.createOrUpdate(undefined, { text: 'a', metadata: { signature: 's1' } });
		item = ThinkingDataItem.createOrUpdate(item, { text: 'b', metadata: { signature: 's2' } });

		expect(item.metadata).toEqual({ signature: 's2' });
	});

	it('does not let a completion marker overwrite the saved metadata', () => {
		let item = ThinkingDataItem.createOrUpdate(undefined, { text: 'a', metadata: { signature: 's1', ...source } });
		item = ThinkingDataItem.createOrUpdate(item, { text: '', metadata: { vscode_reasoning_done: true } });

		expect(item.metadata).toEqual({ signature: 's1', ...source });
	});
});
