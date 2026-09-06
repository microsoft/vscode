/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { IEndpointProvider } from '../../../../../platform/endpoint/common/endpointProvider';
import { Event } from '../../../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { CompositeElement } from '../common';
import { renderPromptElementJSON } from '../promptRenderer';

class ThrowingEndpointProvider implements IEndpointProvider {
	declare readonly _serviceBrand: undefined;
	readonly onDidModelsRefresh = Event.None;
	async getChatEndpoint(): Promise<never> { throw new Error('no utility model'); }
	async getEmbeddingsEndpoint(): Promise<never> { throw new Error('not implemented'); }
	async getAllChatEndpoints(): Promise<never[]> { return []; }
	async getAllCompletionModels(): Promise<never[]> { return []; }
}

describe('renderPromptElementJSON', () => {
	test('falls back to a stub endpoint when no utility model is available', async () => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		testingServiceCollection.define(IEndpointProvider, new ThrowingEndpointProvider());
		const accessor = testingServiceCollection.createTestingAccessor();

		const result = await renderPromptElementJSON(
			accessor.get(IInstantiationService),
			CompositeElement,
			{},
		);

		expect(result.node).toBeDefined();
	});
});
