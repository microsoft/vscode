/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MarkerService } from '../../../../platform/markers/common/markerService.js';
import { MainThreadDiagnostics } from '../../browser/mainThreadDiagnostics.js';
import { mock } from '../../../test/common/workbenchTestServices.js';
suite('MainThreadDiagnostics', function () {
    let markerService;
    setup(function () {
        markerService = new MarkerService();
    });
    teardown(function () {
        markerService.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('clear markers on dispose', function () {
        const diag = new MainThreadDiagnostics(new class {
            constructor() {
                this.remoteAuthority = '';
                this.extensionHostKind = 1 /* ExtensionHostKind.LocalProcess */;
            }
            dispose() { }
            assertRegistered() { }
            set(v) { return null; }
            getProxy() {
                return {
                    $acceptMarkersChange() { }
                };
            }
            drain() { return null; }
        }, markerService, new class extends mock() {
            asCanonicalUri(uri) { return uri; }
        });
        diag.$changeMany('foo', [[URI.file('a'), [{
                        code: '666',
                        startLineNumber: 1,
                        startColumn: 1,
                        endLineNumber: 1,
                        endColumn: 1,
                        message: 'fffff',
                        severity: 1,
                        source: 'me'
                    }]]]);
        assert.strictEqual(markerService.read().length, 1);
        diag.dispose();
        assert.strictEqual(markerService.read().length, 0);
    });
    test('OnDidChangeDiagnostics triggers twice on same diagnostics #136434', function () {
        return runWithFakedTimers({}, async () => {
            const changedData = [];
            const diag = new MainThreadDiagnostics(new class {
                constructor() {
                    this.remoteAuthority = '';
                    this.extensionHostKind = 1 /* ExtensionHostKind.LocalProcess */;
                }
                dispose() { }
                assertRegistered() { }
                set(v) { return null; }
                getProxy() {
                    return {
                        $acceptMarkersChange(data) {
                            changedData.push(data);
                        }
                    };
                }
                drain() { return null; }
            }, markerService, new class extends mock() {
                asCanonicalUri(uri) { return uri; }
            });
            const markerDataStub = {
                code: '666',
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: 1,
                endColumn: 1,
                severity: 1,
                source: 'me'
            };
            const target = URI.file('a');
            diag.$changeMany('foo', [[target, [{ ...markerDataStub, message: 'same_owner' }]]]);
            markerService.changeOne('bar', target, [{ ...markerDataStub, message: 'forgein_owner' }]);
            // added one marker via the API and one via the ext host. the latter must not
            // trigger an event to the extension host
            await timeout(0);
            assert.strictEqual(markerService.read().length, 2);
            assert.strictEqual(changedData.length, 1);
            assert.strictEqual(changedData[0].length, 1);
            assert.strictEqual(changedData[0][0][1][0].message, 'forgein_owner');
            diag.dispose();
        });
    });
    test('onDidChangeDiagnostics different behavior when "extensionKind" ui running on remote workspace #136955', function () {
        return runWithFakedTimers({}, async () => {
            const markerData = {
                code: '666',
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: 1,
                endColumn: 1,
                severity: 1,
                source: 'me',
                message: 'message'
            };
            const target = URI.file('a');
            markerService.changeOne('bar', target, [markerData]);
            const changedData = [];
            const diag = new MainThreadDiagnostics(new class {
                constructor() {
                    this.remoteAuthority = '';
                    this.extensionHostKind = 1 /* ExtensionHostKind.LocalProcess */;
                }
                dispose() { }
                assertRegistered() { }
                set(v) { return null; }
                getProxy() {
                    return {
                        $acceptMarkersChange(data) {
                            changedData.push(data);
                        }
                    };
                }
                drain() { return null; }
            }, markerService, new class extends mock() {
                asCanonicalUri(uri) { return uri; }
            });
            diag.$clear('bar');
            await timeout(0);
            assert.strictEqual(markerService.read().length, 0);
            assert.strictEqual(changedData.length, 1);
            diag.dispose();
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZERpYWdub3N0aWNzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL3Rlc3QvYnJvd3Nlci9tYWluVGhyZWFkRGlhZ25vc3RpY3MudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDekYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBR3JGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRy9FLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUdyRSxLQUFLLENBQUMsdUJBQXVCLEVBQUU7SUFFOUIsSUFBSSxhQUE0QixDQUFDO0lBRWpDLEtBQUssQ0FBQztRQUNMLGFBQWEsR0FBRyxJQUFJLGFBQWEsRUFBRSxDQUFDO0lBQ3JDLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDO1FBQ1IsYUFBYSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3pCLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsMEJBQTBCLEVBQUU7UUFFaEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxxQkFBcUIsQ0FDckMsSUFBSTtZQUFBO2dCQUNILG9CQUFlLEdBQUcsRUFBRSxDQUFDO2dCQUNyQixzQkFBaUIsMENBQWtDO1lBVXBELENB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