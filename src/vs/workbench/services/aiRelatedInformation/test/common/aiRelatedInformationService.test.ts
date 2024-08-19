/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { AiRelatedInformationService } from 'vs/workbench/services/aiRelatedInformation/common/aiRelatedInformationService';
import { NullLogService } from 'vs/platform/log/common/log';
import { CommandInformationResult, IAiRelatedInformationProvider, RelatedInformationType, SettingInformationResult } from 'vs/workbench/services/aiRelatedInformation/common/aiRelatedInformation';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('AiRelatedInformationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let service: AiRelatedInformationService;

	setup(() => {
		service = new AiRelatedInformationService(store.add(new NullLogService()));
	});

	test('should check if providers are registered', () => {
		assert.equal(service.isEnabled(), false);
		store.add(service.registerAiRelatedInformationProvider(RelatedInformationType.CommandInformation, { provideAiRelatedInformation: () => Promise.resolve([]) }));
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

	test('should get different types of related information', async () => {
		const command = 'command';
		const commandProvider: IAiRelatedInformationProvider = {
			provideAiRelatedInformation: () => Promise.resolve([{ type: RelatedInformationType.CommandInformation, command, weight: 1 }])
		};
		service.registerAiRelatedInformationProvider(RelatedInformationType.CommandInformation, commandProvider);
		const setting = 'setting';
		const settingProvider: IAiRelatedInformationProvider = {
			provideAiRelatedInformation: () => Promise.resolve([{ type: RelatedInformationType.SettingInformation, setting, weight: 1 }])
		};
		service.registerAiRelatedInformationProvider(RelatedInformationType.SettingInformation, settingProvider);
		const result = await service.getRelatedInformation(
			'query',
			[
				RelatedInformationType.CommandInformation,
				RelatedInformationType.SettingInformation
			],
			CancellationToken.None
		);
		assert.strictEqual(result.length, 2);
		assert.strictEqual((result[0] as CommandInformationResult).command, command);
		assert.strictEqual((result[1] as SettingInformationResult).setting, setting);
	});

	test('should return empty array on timeout', async () => {
		const clock = sinon.useFakeTimers({
			shouldAdvanceTime: true,
		});
		const provider: IAiRelatedInformationProvider = {
			provideAiRelatedInformation: () => new Promise((resolve) => {
				setTimeout(() => {
					resolve([{ type: RelatedInformationType.CommandInformation, command: 'command', weight: 1 }]);
				}, AiRelatedInformationService.DEFAULT_TIMEOUT + 100);
			})
		};

		service.registerAiRelatedInformationProvider(RelatedInformationType.CommandInformation, provider);

		try {
			const promise = service.getRelatedInformation('query', [RelatedInformationType.CommandInformation], CancellationToken.None);
			clock.tick(AiRelatedInformationService.DEFAULT_TIMEOUT + 200);
			const result = await promise;
			assert.strictEqual(result.length, 0);
		} finally {
			clock.restore();
		}
	});
});
