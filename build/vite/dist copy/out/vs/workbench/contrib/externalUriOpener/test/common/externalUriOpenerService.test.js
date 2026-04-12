/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExternalUriOpenerPriority } from '../../../../../editor/common/languages.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ExternalUriOpenerService } from '../../common/externalUriOpenerService.js';
class MockQuickInputService {
    constructor(pickIndex) {
        this.pickIndex = pickIndex;
    }
    async pick(picks, options, token) {
        const resolvedPicks = await picks;
        const item = resolvedPicks[this.pickIndex];
        if (item.type === 'separator') {
            return undefined;
        }
        return item;
    }
}
suite('ExternalUriOpenerService', () => {
    let disposables;
    let instantiationService;
    setup(() => {
        disposables = new DisposableStore();
        instantiationService = disposables.add(new TestInstantiationService());
        instantiationService.stub(IConfigurationService, new TestConfigurationService());
        instantiationService.stub(IOpenerService, {
            registerExternalOpener: () => { return Disposable.None; }
        });
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Should not open if there are no openers', async () => {
        const externalUriOpenerService = disposables.add(instantiationService.createInstance(ExternalUriOpenerService));
        externalUriOpenerService.registerExternalOpenerProvider(new class {
            async *getOpeners(_targetUri) {
                // noop
            }
        });
        const uri = URI.parse('http://contoso.com');
        const didOpen = await externalUriOpenerService.openExternal(uri.toString(), { sourceUri: uri }, CancellationToken.None);
        assert.strictEqual(didOpen, false);
    });
    test('Should prompt if there is at least one enabled opener', async () => {
        instantiationService.stub(IQuickInputService, new MockQuickInputService(0));
        const externalUriOpenerService = disposables.add(instantiationService.createInstance(ExternalUriOpenerService));
        let openedWithEnabled = false;
        externalUriOpenerService.registerExternalOpenerProvider(new class {
            async *getOpeners(_targetUri) {
                yield {
                    id: 'disabled-id',
                    label: 'disabled',
                    canOpen: async () => ExternalUriOpenerPriority.None,
                    openExternalUri: async () => true,
                };
                yield {
                    id: 'enabled-id',
                    label: 'enabled',
                    canOpen: async () => ExternalUriOpenerPriority.Default,
                    openExternalUri: async () => {
                        openedWithEnabled = true;
                        return true;
                    }
                };
            }
        });
        const uri = URI.parse('http://contoso.com');
        const didOpen = await externalUriOpenerService.openExternal(uri.toString(), { sourceUri: uri }, CancellationToken.None);
        assert.strictEqual(didOpen, true);
        assert.strictEqual(openedWithEnabled, true);
    });
    test('Should automatically pick single preferred opener without prompt', async () => {
        const externalUriOpenerService = disposables.add(instantiationService.createInstance(ExternalUriOpenerService));
        let openedWithPreferred = false;
        externalUriOpenerService.registerExternalOpenerProvider(new class {
            async *getOpeners(_targetUri) {
                yield {
                    id: 'other-id',
                    label: 'other',
                    canOpen: async () => ExternalUriOpenerPriority.Default,
                    openExternalUri: async () => {
                        return true;
                    }
                };
                yield {
                    id: 'preferred-id',
                    label: 'preferred',
                    canOpen: async () => ExternalUriOpenerPriority.Preferred,
                    openExternalUri: async () => {
                        openedWithPreferred = true;
                        return true;
                    }
                };
            }
        });
        const uri = URI.parse('http://contoso.com');
        const didOpen = await externalUriOpenerService.openExternal(uri.toString(), { sourceUri: uri }, CancellationToken.None);
        assert.strictEqual(didOpen, true);
        assert.strictEqual(openedWithPreferred, true);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZXJuYWxVcmlPcGVuZXJTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9leHRlcm5hbFVyaU9wZW5lci90ZXN0L2NvbW1vbi9leHRlcm5hbFVyaU9wZW5lclNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDL0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDdEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ2pGLE9BQU8sRUFBZ0Isa0JBQWtCLEVBQWtDLE1BQU0seURBQXlELENBQUM7QUFDM0ksT0FBTyxFQUFFLHdCQUF3QixFQUErQyxNQUFNLDBDQUEwQyxDQUFDO0FBR2pJLE1BQU0scUJBQXFCO0lBRTFCLFlBQ2tCLFNBQWlCO1FBQWpCLGNBQVMsR0FBVCxTQUFTLENBQVE7SUFDL0IsQ0FBQztJQUlFLEtBQUssQ0FBQyxJQUFJLENBQTJCLEtBQXlELEVBQUUsT0FBOEMsRUFBRSxL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