/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { AiRelatedInformationService } from '../../common/aiRelatedInformationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { RelatedInformationType } from '../../common/aiRelatedInformation.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('AiRelatedInformationService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let service;
    setup(() => {
        service = new AiRelatedInformationService(store.add(new NullLogService()));
    });
    test('should check if providers are registered', () => {
        assert.equal(service.isEnabled(), false);
        store.add(service.registerAiRelatedInformationProvider(RelatedInformationType.CommandInformation, { provideAiRelatedInformation: () => Promise.resolve([]) }));
        assert.equal(service.isEnabled(), true);
    });
    test('should register and unregister providers', () => {
        const provider = { provideAiRelatedInformation: () => Promise.resolve([]) };
        const disposable = service.registerAiRelatedInformationProvider(RelatedInformationType.CommandInformation, provider);
        assert.strictEqual(service.isEnabled(), true);
        disposable.dispose();
        assert.strictEqual(service.isEnabled(), false);
    });
    test('should get related information', async () => {
        const command = 'command';
        const provider = {
            provideAiRelatedInformation: () => Promise.resolve([{ type: RelatedInformationType.CommandInformation, command, weight: 1 }])
        };
        service.registerAiRelatedInformationProvider(RelatedInformationType.CommandInformation, provider);
        const result = await service.getRelatedInformation('query', [RelatedInformationType.CommandInformation], CancellationToken.None);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].command, command);
    });
    test('should get different types of related information', async () => {
        const command = 'command';
        const commandProvider = {
            provideAiRelatedInformation: () => Promise.resolve([{ type: RelatedInformationType.CommandInformation, command, weight: 1 }])
        };
        service.registerAiRelatedInformationProvider(RelatedInformationType.CommandInformation, commandProvider);
        const setting = 'setting';
        const settingProvider = {
            provideAiRelatedInformation: () => Promise.resolve([{ type: RelatedInformationType.SettingInformation, setting, weight: 1 }])
        };
        service.registerAiRelatedInformationProvider(RelatedInformationType.SettingInformation, settingProvider);
        const result = await service.getRelatedInformation('query', [
            RelatedInformationType.CommandInformation,
            RelatedInformationType.SettingInformation
        ], CancellationToken.None);
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].command, command);
        assert.strictEqual(result[1].setting, setting);
    });
    test('should return empty array on timeout', async () => {
        const clock = sinon.useFakeTimers({
            shouldAdvanceTime: true,
        });
        const provider = {
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
        }
        finally {
            clock.restore();
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlSZWxhdGVkSW5mb3JtYXRpb25TZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvYWlSZWxhdGVkSW5mb3JtYXRpb24vdGVzdC9jb21tb24vYWlSZWxhdGVkSW5mb3JtYXRpb25TZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQy9CLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQTJELHNCQUFzQixFQUE0QixNQUFNLHNDQUFzQyxDQUFDO0FBQ2pLLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLEtBQUssQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUU7SUFDekMsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUN4RCxJQUFJLE9BQW9DLENBQUM7SUFFekMsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLE9BQU8sR0FBRyxJQUFJLDJCQUEyQixDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDNUUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMENBQTBDLEVBQUUsR0FBRyxFQUFFO1FBQ3JELE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3pDLEtBQUssQ0FBQyxHQUFHLENB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