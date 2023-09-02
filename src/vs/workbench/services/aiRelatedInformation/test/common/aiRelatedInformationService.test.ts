/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AiRelatedInformationService } from 'vs/workbench/services/aiRelatedInformation/common/aiRelatedInformationService';
import { NullLogService } from 'vs/platform/log/common/log';
import { CommandInformationResult, IAiRelatedInformationProvider, RelatedInformationType } from 'vs/workbench/services/aiRelatedInformation/common/aiRelatedInformation';
import { CancellationToken } from 'vs/base/common/cancellation';

suite('AiRelatedInformationService', () => {
	let service: AiRelatedInformationService;

	setup(() => {
		service = new AiRelatedInformationService(new NullLogService());
	});

	test('should check if providers are registered', () => {
		assert.equal(service.isEnabled(), false);
		service.registerAiRelatedInformationProvider(RelatedInformationType.CommandInformation, { provideAiRelatedInformation: () => Promise.resolve([]) });
		assert.equal(service.isEnabled(), true);
	});

	test('should register and unregister providers', () => {
		const provider: IAiRelatedInformationProvider = { provideAiRelatedInformation: () => Promise.resolve([]) };
		const disposable = service.registerAiRelatedInformationProvider(RelatedInformationType.CommandInformation, provider);
		assert.strictEqual(service.isEnabled(), true);
		disposable.dispose();
		assert.strictEqual(service.isEnabled(), false);
	});

	test('should get related information', async () => {
		const command = 'command';
		const provider: IAiRelatedInformationProvider = {
			provideAiRelatedInformation: () => Promise.resolve([{ type: RelatedInformationType.CommandInformation, command, weight: 1 }])
		};
		service.registerAiRelatedInformationProvider(RelatedInformationType.CommandInformation, provider);
		const result = await service.getRelatedInformation('query', [RelatedInformationType.CommandInformation], CancellationToken.None);
		assert.strictEqual(result.length, 1);
		assert.strictEqual((result[0] as CommandInformationResult).command, command);
	});
});
