/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ExtHostDecorations } from '../../common/extHostDecorations.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
suite('ExtHostDecorations', function () {
    let mainThreadShape;
    let extHostDecorations;
    const providers = new Set();
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(function () {
        providers.clear();
        mainThreadShape = new class extends mock() {
            $registerDecorationProvider(handle) {
                providers.add(handle);
            }
        };
        extHostDecorations = new ExtHostDecorations(new class extends mock() {
            getProxy() {
                return mainThreadShape;
            }
        }, new NullLogService());
    });
    test('SCM Decorations missing #100524', async function () {
        let calledA = false;
        let calledB = false;
        // never returns
        extHostDecorations.registerFileDecorationProvider({
            provideFileDecoration() {
                calledA = true;
                return new Promise(() => { });
            }
        }, nullExtensionDescription);
        // always returns
        extHostDecorations.registerFileDecorationProvider({
            provideFileDecoration() {
                calledB = true;
                return new Promise(resolve => resolve({ badge: 'H', tooltip: 'Hello' }));
            }
        }, nullExtensionDescription);
        const requests = [...providers.values()].map((handle, idx) => {
            return extHostDecorations.$provideDecorations(handle, [{ id: idx, uri: URI.parse('test:///file') }], CancellationToken.None);
        });
        assert.strictEqual(calledA, true);
        assert.strictEqual(calledB, true);
        assert.strictEqual(requests.length, 2);
        const [first, second] = requests;
        const firstResult = await Promise.race([first, timeout(30).then(() => false)]);
        assert.strictEqual(typeof firstResult, 'boolean'); // never finishes...
        const secondResult = await Promise.race([second, timeout(30).then(() => false)]);
        assert.strictEqual(typeof secondResult, 'object');
        await timeout(30);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdERlY29yYXRpb25zLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL3Rlc3QvYnJvd3Nlci9leHRIb3N0RGVjb3JhdGlvbnMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDNUQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXhFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRXhFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRTdGLEtBQUssQ0FBQyxvQkFBb0IsRUFBRTtJQUUzQixJQUFJLGVBQTJDLENBQUM7SUFDaEQsSUFBSSxrQkFBc0MsQ0FBQztJQUMzQyxNQUFNLFNBQVMsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBRXBDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDO1FBRUwsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBRWxCLGVBQWUsR0FBRyxJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQThCO1lBQzVELDJCQUEyQixDQUFDLE1BQWM7Z0JBQ2xELFNBQVMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdkIsQ0FBQztTQUNE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