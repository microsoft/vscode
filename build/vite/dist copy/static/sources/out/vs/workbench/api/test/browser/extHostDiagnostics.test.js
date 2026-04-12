/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { DiagnosticCollection, ExtHostDiagnostics } from '../../common/extHostDiagnostics.js';
import { Diagnostic, DiagnosticSeverity, Range, DiagnosticRelatedInformation, Location } from '../../common/extHostTypes.js';
import { MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { mock } from '../../../../base/test/common/mock.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ExtUri, extUri } from '../../../../base/common/resources.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('ExtHostDiagnostics', () => {
    class DiagnosticsShape extends mock() {
        $changeMany(owner, entries) {
            //
        }
        $clear(owner) {
            //
        }
    }
    const fileSystemInfoService = new class extends mock() {
        constructor() {
            super(...arguments);
            this.extUri = extUri;
        }
    };
    const versionProvider = (uri) => {
        return undefined;
    };
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('disposeCheck', () => {
        const collection = new DiagnosticCollection('test', 'test', 100, 100, versionProvider, extUri, new DiagnosticsShape(), new Emitter());
        collection.dispose();
        collection.dispose(); // that's OK
        assert.throws(() => collection.name);
        assert.throws(() => collection.clear());
        assert.throws(() => collection.delete(URI.parse('aa:bb')));
        assert.throws(() => collection.forEach(() => { }));
        assert.throws(() => collection.get(URI.parse('aa:bb')));
        assert.throws(() => collection.has(URI.parse('aa:bb')));
        assert.throws(() => collection.set(URI.parse('aa:bb'), []));
        assert.throws(() => collection.set(URI.parse('aa:bb'), undefined));
    });
    test('diagnostic collection, forEach, clear, has', function () {
        let collection = new DiagnosticCollection('test', 'test', 100, 100, versionProvider, extUri, new DiagnosticsShape(), new Emitter());
        assert.strictEqual(collection.name, 'test');
        collection.dispose();
        assert.throws(() => collection.name);
        let c = 0;
        collection = new DiagnosticCollection('test', 'test', 100, 100, versionProvider, extUri, new DiagnosticsShape(), new Emitter());
        collection.forEach(() => c++);
        assert.strictEqual(c, 0);
        collection.set(URI.parse('foo:bar'), [
            new Diagnostic(new Range(0, 0, 1, 1), 'message-1'),
            new Diagnostic(new Range(0, 0, 1, 1), 'message-2')
        ]);
        collection.forEach(() => c++);
        assert.strictEqual(c, 1);
        c = 0;
        collection.clear();
        collection.forEach(() => c++);
        assert.strictEqual(c, 0);
        collection.set(URI.parse('foo:bar1'), [
            new Diagnostic(new Range(0, 0, 1, 1), 'message-1'),
            new Diagnostic(new Range(0, 0, 1, 1), 'message-2')
        ]);
        collection.set(URI.parse('foo:bar2'), [
            new Diagnostic(new Range(0, 0, 1, 1), 'message-1'),
            new Diagnostic(new Range(0, 0, 1, 1), 'message-2')
        ]);
        collection.forEach(() => c++);
        assert.strictEqual(c, 2);
        assert.ok(collection.has(URI.parse('foo:bar1')));
        assert.ok(collection.has(URI.parse('foo:bar2')));
        assert.ok(!collection.has(URI.parse('foo:bar3')));
        collection.delete(URI.parse('foo:bar1'));
        assert.ok(!collection.has(URI.parse('foo:bar1')));
        collection.dispose();
    });
    test('diagnostic collection, immutable read', function () {
        const collection = new DiagnosticCollection('test', 'test', 100, 100, versionProvider, extUri, new DiagnosticsShape(), new Emitter());
        collection.set(URI.parse('foo:bar'), [
            new Diagnostic(new Range(0, 0, 1, 1), 'message-1'),
            new Diagnostic(new Range(0, 0, 1, 1), 'message-2')
        ]);
        let array = collection.get(URI.parse('foo:bar'));
        assert.throws(() => array.length = 0);
        assert.throws(() => array.pop());
        assert.throws(() => array[0] = new Diagnostic(new Range(0, 0, 0, 0), 'evil'));
        collection.forEach((uri, array) => {
            assert.throws(() => array.length = 0);
            assert.throws(() => array.pop());
            assert.throws(() => array[0] = new Diagnostic(new Range(0, 0, 0, 0), 'evil'));
        });
        array = collection.get(URI.parse('foo:bar'));
        assert.strictEqual(array.length, 2);
        collection.dispose();
    });
    test('diagnostics collection, set with dupliclated tuples', function () {
        const collection = new DiagnosticCollection('test', 'test', 100, 100, versionProvider, extUri, new DiagnosticsShape(), new Emitter());
        const uri = URI.parse('sc:hightower');
        collection.set([
            [uri, [new Diagnostic(new Range(0, 0, 0, 1), 'message-1')]],
            [URI.parse('some:thing'), [new Diagnostic(new Range(0, 0, 1, 1), 'something')]],
            [uri, [new Diagnostic(new Range(0, 0, 0, 1), 'message-2')]],
        ]);
        let array = collection.get(uri);
        assert.strictEqual(array.length, 2);
        let [first, second] = array;
        assert.strictEqual(first.message, 'message-1');
        assert.strictEqual(second.message, 'message-2');
        // clear
        collection.delete(uri);
        assert.ok(!collection.has(uri));
        // bad tuple clears 1/2
        collection.set([
            [uri, [new Diagnostic(new Range(0, 0, 0, 1), 'message-1')]],
            [URI.parse('some:thing'), [new Diagnostic(new Range(0, 0, 1, 1), 'something')]],
            [uri, undefined]
        ]);
        assert.ok(!collection.has(uri));
        // clear
        collection.delete(uri);
        assert.ok(!collection.has(uri));
        // bad tuple clears 2/2
        collection.set([
            [uri, [new Diagnostic(new Range(0, 0, 0, 1), 'message-1')]],
            [URI.parse('some:thing'), [new Diagnostic(new Range(0, 0, 1, 1), 'something')]],
            [uri, undefined],
            [uri, [new Diagnostic(new Range(0, 0, 0, 1), 'message-2')]],
            [uri, [new Diagnostic(new Range(0, 0, 0, 1), 'message-3')]],
        ]);
        array = collection.get(uri);
        assert.strictEqual(array.length, 2);
        [first, second] = array;
        assert.strictEqual(first.message, 'message-2');
        assert.strictEqual(second.message, 'message-3');
        collection.dispose();
    });
    test('diagnostics collection, set tuple overrides, #11547', function () {
        let lastEntries;
        const collection = new DiagnosticCollection('test', 'test', 100, 100, versionProvider, extUri, new class extends DiagnosticsShape {
            $changeMany(owner, entries) {
                lastEntries = entries;
                return super.$changeMany(owner, entries);
            }
        }, new Emitter());
        const uri = URI.parse('sc:hightower');
        collection.set([[uri, [new Diagnostic(new Range(0, 0, 1, 1), 'error')]]]);
        assert.strictEqual(collection.get(uri).length, 1);
        assert.strictEqual(collection.get(uri)[0].message, 'error');
        assert.strictEqual(lastEntries.length, 1);
        const [[, data1]] = lastEntries;
        assert.strictEqual(data1.length, 1);
        assert.strictEqual(data1[0].message, 'error');
        lastEntries = undefined;
        collection.set([[uri, [new Diagnostic(new Range(0, 0, 1, 1), 'warning')]]]);
        assert.strictEqual(collection.get(uri).length, 1);
        assert.strictEqual(collection.get(uri)[0].message, 'warning');
        assert.strictEqual(lastEntries.length, 1);
        const [[, data2]] = lastEntries;
        assert.strictEqual(data2.length, 1);
        assert.strictEqual(data2[0].message, 'warning');
        lastEntries = undefined;
    });
    test('do send message when not making a change', function () {
        let changeCount = 0;
        let eventCount = 0;
        const emitter = new Emitter();
        store.add(emitter.event(_ => eventCount += 1));
        const collection = new DiagnosticCollection('test', 'test', 100, 100, versionProvider, extUri, new class extends DiagnosticsShape {
            $changeMany() {
                changeCount += 1;
            }
        }, emitter);
        const uri = URI.parse('sc:hightower');
        const diag = new Diagnostic(new Range(0, 0, 0, 1), 'ffff');
        collection.set(uri, [diag]);
        assert.strictEqual(changeCount, 1);
        assert.strictEqual(eventCount, 1);
        collection.set(uri, [diag]);
        assert.strictEqual(changeCount, 2);
        assert.strictEqual(eventCount, 2);
    });
    test('diagnostics collection, tuples and undefined (small array), #15585', function () {
        const collection = new DiagnosticCollection('test', 'test', 100, 100, versionProvider, extUri, new DiagnosticsShape(), new Emitter());
        const uri = URI.parse('sc:hightower');
        const uri2 = URI.parse('sc:nomad');
        const diag = new Diagnostic(new Range(0, 0, 0, 1), 'ffff');
        collection.set([
            [uri, [diag, diag, diag]],
            [uri, undefined],
            [uri, [diag]],
            [uri2, [diag, diag]],
            [uri2, undefined],
            [uri2, [diag]],
        ]);
        assert.strictEqual(collection.get(uri).length, 1);
        assert.strictEqual(collection.get(uri2).length, 1);
    });
    test('diagnostics collection, tuples and undefined (large array), #15585', function () {
        const collection = new DiagnosticCollection('test', 'test', 100, 100, versionProvider, extUri, new DiagnosticsShape(), new Emitter());
        const tuples = [];
        for (let i = 0; i < 500; i++) {
            const uri = URI.parse('sc:hightower#' + i);
            const diag = new Diagnostic(new Range(0, 0, 0, 1), i.toString());
            tuples.push([uri, [diag, diag, diag]]);
            tuples.push([uri, undefined]);
            tuples.push([uri, [diag]]);
        }
        collection.set(tuples);
        for (let i = 0; i < 500; i++) {
            const uri = URI.parse('sc:hightower#' + i);
            assert.strictEqual(collection.has(uri), true);
            assert.strictEqual(collection.get(uri).length, 1);
        }
    });
    test('diagnostic capping (max per file)', function () {
        let lastEntries;
        const collection = new DiagnosticCollection('test', 'test', 100, 250, versionProvider, extUri, new class extends DiagnosticsShape {
            $changeMany(owner, entries) {
                lastEntries = entries;
                return super.$changeMany(owner, entries);
            }
        }, new Emitter());
        const uri = URI.parse('aa:bb');
        const diagnostics = [];
        for (let i = 0; i < 500; i++) {
            diagnostics.push(new Diagnostic(new Range(i, 0, i + 1, 0), `error#${i}`, i < 300
                ? DiagnosticSeverity.Warning
                : DiagnosticSeverity.Error));
        }
        collection.set(uri, diagnostics);
        assert.strictEqual(collection.get(uri).length, 500);
        assert.strictEqual(lastEntries.length, 1);
        assert.strictEqual(lastEntries[0][1].length, 251);
        assert.strictEqual(lastEntries[0][1][0].severity, MarkerSeverity.Error);
        assert.strictEqual(lastEntries[0][1][200].severity, MarkerSeverity.Warning);
        assert.strictEqual(lastEntries[0][1][250].severity, MarkerSeverity.Info);
    });
    test('diagnostic capping (max files)', function () {
        let lastEntries;
        const collection = new DiagnosticCollection('test', 'test', 2, 1, versionProvider, extUri, new class extends DiagnosticsShape {
            $changeMany(owner, entries) {
                lastEntries = entries;
                return super.$changeMany(owner, entries);
            }
        }, new Emitter());
        const diag = new Diagnostic(new Range(0, 0, 1, 1), 'Hello');
        collection.set([
            [URI.parse('aa:bb1'), [diag]],
            [URI.parse('aa:bb2'), [diag]],
            [URI.parse('aa:bb3'), [diag]],
            [URI.parse('aa:bb4'), [diag]],
        ]);
        assert.strictEqual(lastEntries.length, 3); // goes above the limit and then stops
    });
    test('diagnostic eventing', async function () {
        const emitter = new Emitter();
        const collection = new DiagnosticCollection('ddd', 'test', 100, 100, versionProvider, extUri, new DiagnosticsShape(), emitter);
        const diag1 = new Diagnostic(new Range(1, 1, 2, 3), 'diag1');
        const diag2 = new Diagnostic(new Range(1, 1, 2, 3), 'diag2');
        const diag3 = new Diagnostic(new Range(1, 1, 2, 3), 'diag3');
        let p = Event.toPromise(emitter.event).then(a => {
            assert.strictEqual(a.length, 1);
            assert.strictEqual(a[0].toString(), 'aa:bb');
            assert.ok(URI.isUri(a[0]));
        });
        collection.set(URI.parse('aa:bb'), []);
        await p;
        p = Event.toPromise(emitter.event).then(e => {
            assert.strictEqual(e.length, 2);
            assert.ok(URI.isUri(e[0]));
            assert.ok(URI.isUri(e[1]));
            assert.strictEqual(e[0].toString(), 'aa:bb');
            assert.strictEqual(e[1].toString(), 'aa:cc');
        });
        collection.set([
            [URI.parse('aa:bb'), [diag1]],
            [URI.parse('aa:cc'), [diag2, diag3]],
        ]);
        await p;
        p = Event.toPromise(emitter.event).then(e => {
            assert.strictEqual(e.length, 2);
            assert.ok(URI.isUri(e[0]));
            assert.ok(URI.isUri(e[1]));
        });
        collection.clear();
        await p;
    });
    test('vscode.languages.onDidChangeDiagnostics Does Not Provide Document URI #49582', async function () {
        const emitter = new Emitter();
        const collection = new DiagnosticCollection('ddd', 'test', 100, 100, versionProvider, extUri, new DiagnosticsShape(), emitter);
        const diag1 = new Diagnostic(new Range(1, 1, 2, 3), 'diag1');
        // delete
        collection.set(URI.parse('aa:bb'), [diag1]);
        let p = Event.toPromise(emitter.event).then(e => {
            assert.strictEqual(e[0].toString(), 'aa:bb');
        });
        collection.delete(URI.parse('aa:bb'));
        await p;
        // set->undefined (as delete)
        collection.set(URI.parse('aa:bb'), [diag1]);
        p = Event.toPromise(emitter.event).then(e => {
            assert.strictEqual(e[0].toString(), 'aa:bb');
        });
        collection.set(URI.parse('aa:bb'), undefined);
        await p;
    });
    test('diagnostics with related information', function (done) {
        const collection = new DiagnosticCollection('ddd', 'test', 100, 100, versionProvider, extUri, new class extends DiagnosticsShape {
            $changeMany(owner, entries) {
                const [[, data]] = entries;
                assert.strictEqual(entries.length, 1);
                assert.strictEqual(data.length, 1);
                const [diag] = data;
                assert.strictEqual(diag.relatedInformation.length, 2);
                assert.strictEqual(diag.relatedInformation[0].message, 'more1');
                assert.strictEqual(diag.relatedInformation[1].message, 'more2');
                done();
            }
        }, new Emitter());
        const diag = new Diagnostic(new Range(0, 0, 1, 1), 'Foo');
        diag.relatedInformation = [
            new DiagnosticRelatedInformation(new Location(URI.parse('cc:dd'), new Range(0, 0, 0, 0)), 'more1'),
            new DiagnosticRelatedInformation(new Location(URI.parse('cc:ee'), new Range(0, 0, 0, 0)), 'more2')
        ];
        collection.set(URI.parse('aa:bb'), [diag]);
    });
    test('vscode.languages.getDiagnostics appears to return old diagnostics in some circumstances #54359', function () {
        const ownerHistory = [];
        const diags = new ExtHostDiagnostics(new class {
            getProxy(id) {
                return new class DiagnosticsShape {
                    $clear(owner) {
                        ownerHistory.push(owner);
                    }
                };
            }
            set() {
                return null;
            }
            dispose() { }
            assertRegistered() {
            }
            drain() {
                return undefined;
            }
        }, new NullLogService(), fileSystemInfoService, new class extends mock() {
            getDocument() {
                return undefined;
            }
        });
        const collection1 = diags.createDiagnosticCollection(nullExtensionDescription.identifier, 'foo');
        const collection2 = diags.createDiagnosticCollection(nullExtensionDescription.identifier, 'foo'); // warns, uses a different owner
        collection1.clear();
        collection2.clear();
        assert.strictEqual(ownerHistory.length, 2);
        assert.strictEqual(ownerHistory[0], 'foo');
        assert.strictEqual(ownerHistory[1], 'foo0');
    });
    test('Error updating diagnostics from extension #60394', function () {
        let callCount = 0;
        const collection = new DiagnosticCollection('ddd', 'test', 100, 100, versionProvider, extUri, new class extends DiagnosticsShape {
            $changeMany(owner, entries) {
                callCount += 1;
            }
        }, new Emitter());
        const array = [];
        const diag1 = new Diagnostic(new Range(0, 0, 1, 1), 'Foo');
        const diag2 = new Diagnostic(new Range(0, 0, 1, 1), 'Bar');
        array.push(diag1, diag2);
        collection.set(URI.parse('test:me'), array);
        assert.strictEqual(callCount, 1);
        collection.set(URI.parse('test:me'), array);
        assert.strictEqual(callCount, 2); // equal array
        array.push(diag2);
        collection.set(URI.parse('test:me'), array);
        assert.strictEqual(callCount, 3); // same but un-equal array
    });
    test('getDiagnostics does not tolerate sparse diagnostic arrays', function () {
        const diags = new ExtHostDiagnostics(new class {
            getProxy() {
                return new DiagnosticsShape();
            }
            set() {
                return null;
            }
            dispose() { }
            assertRegistered() { }
            drain() {
                return undefined;
            }
        }, new NullLogService(), fileSystemInfoService, new class extends mock() {
            getDocument() {
                return undefined;
            }
        });
        const collection = diags.createDiagnosticCollection(nullExtensionDescription.identifier, 'sparse');
        const uri = URI.parse('sparse:uri');
        const diag = new Diagnostic(new Range(0, 0, 0, 0), 'holey');
        const sparseDiagnostics = new Array(3);
        sparseDiagnostics[1] = diag;
        collection.set(uri, sparseDiagnostics);
        const result = diags.getDiagnostics(uri);
        assert.strictEqual(result.length, 1);
        const resultWithPossibleHoles = [...result];
        assert.strictEqual(resultWithPossibleHoles.some(item => item === undefined), false);
    });
    test('Version id is set whenever possible', function () {
        const all = [];
        const collection = new DiagnosticCollection('ddd', 'test', 100, 100, uri => {
            return 7;
        }, extUri, new class extends DiagnosticsShape {
            $changeMany(_owner, entries) {
                all.push(...entries);
            }
        }, new Emitter());
        const array = [];
        const diag1 = new Diagnostic(new Range(0, 0, 1, 1), 'Foo');
        const diag2 = new Diagnostic(new Range(0, 0, 1, 1), 'Bar');
        array.push(diag1, diag2);
        collection.set(URI.parse('test:one'), array);
        collection.set(URI.parse('test:two'), [diag1]);
        collection.set(URI.parse('test:three'), [diag2]);
        const allVersions = all.map(tuple => tuple[1].map(t => t.modelVersionId)).flat();
        assert.deepStrictEqual(allVersions, [7, 7, 7, 7]);
    });
    test('Diagnostics created by tasks aren\'t accessible to extensions #47292', async function () {
        return runWithFakedTimers({}, async function () {
            const diags = new ExtHostDiagnostics(new class {
                getProxy(id) {
                    return {};
                }
                set() {
                    return null;
                }
                dispose() { }
                assertRegistered() {
                }
                drain() {
                    return undefined;
                }
            }, new NullLogService(), fileSystemInfoService, new class extends mock() {
                getDocument() {
                    return undefined;
                }
            });
            //
            const uri = URI.parse('foo:bar');
            const data = [{
                    message: 'message',
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: 1,
                    endColumn: 1,
                    severity: MarkerSeverity.Info
                }];
            const p1 = Event.toPromise(diags.onDidChangeDiagnostics);
            diags.$acceptMarkersChange([[uri, data]]);
            await p1;
            assert.strictEqual(diags.getDiagnostics(uri).length, 1);
            const p2 = Event.toPromise(diags.onDidChangeDiagnostics);
            diags.$acceptMarkersChange([[uri, []]]);
            await p2;
            assert.strictEqual(diags.getDiagnostics(uri).length, 0);
        });
    });
    test('languages.getDiagnostics doesn\'t handle case insensitivity correctly #128198', function () {
        const diags = new ExtHostDiagnostics(new class {
            getProxy(id) {
                return new DiagnosticsShape();
            }
            set() {
                return null;
            }
            dispose() { }
            assertRegistered() {
            }
            drain() {
                return undefined;
            }
        }, new NullLogService(), new class extends mock() {
            constructor() {
                super(...arguments);
                this.extUri = new ExtUri(uri => uri.scheme === 'insensitive');
            }
        }, new class extends mock() {
            getDocument() {
                return undefined;
            }
        });
        const col = diags.createDiagnosticCollection(nullExtensionDescription.identifier);
        const uriSensitive = URI.from({ scheme: 'foo', path: '/SOME/path' });
        const uriSensitiveCaseB = uriSensitive.with({ path: uriSensitive.path.toUpperCase() });
        const uriInSensitive = URI.from({ scheme: 'insensitive', path: '/SOME/path' });
        const uriInSensitiveUpper = uriInSensitive.with({ path: uriInSensitive.path.toUpperCase() });
        col.set(uriSensitive, [new Diagnostic(new Range(0, 0, 0, 0), 'sensitive')]);
        col.set(uriInSensitive, [new Diagnostic(new Range(0, 0, 0, 0), 'insensitive')]);
        // collection itself honours casing
        assert.strictEqual(col.get(uriSensitive)?.length, 1);
        assert.strictEqual(col.get(uriSensitiveCaseB)?.length, 0);
        assert.strictEqual(col.get(uriInSensitive)?.length, 1);
        assert.strictEqual(col.get(uriInSensitiveUpper)?.length, 1);
        // languages.getDiagnostics honours casing
        assert.strictEqual(diags.getDiagnostics(uriSensitive)?.length, 1);
        assert.strictEqual(diags.getDiagnostics(uriSensitiveCaseB)?.length, 0);
        assert.strictEqual(diags.getDiagnostics(uriInSensitive)?.length, 1);
        assert.strictEqual(diags.getDiagnostics(uriInSensitiveUpper)?.length, 1);
        const fromForEach = [];
        col.forEach(uri => fromForEach.push(uri));
        assert.strictEqual(fromForEach.length, 2);
        assert.strictEqual(fromForEach[0].toString(), uriSensitive.toString());
        assert.strictEqual(fromForEach[1].toString(), uriInSensitive.toString());
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdERpYWdub3N0aWNzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL3Rlc3QvYnJvd3Nlci9leHRIb3N0RGlhZ25vc3RpY3MudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RixPQUFPLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFLEtBQUssRUFBRSw0QkFBNEIsRUFBRSxRQUFRLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUU3SCxPQUFPLEVBQWUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDN0YsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXhFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFdEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFFekYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFaEcsS0FBSyxDQUFDLG9CQUFvQixFQUFFLEdBQUcsRUFBRTtJQUVoQyxNQUFNLGdCQUFpQixTQUFRLElBQUksRUFBOEI7UUFDdkQsV0FBVyxDQUFDLEtBQWEsRUFBRSxP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QUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQztTQUNsRCxDQUFDLENBQUM7UUFDSCxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUU7WUFDckMsSUFBSSxVQUFVLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDO1lBQ2xELElBQUksVUFBVSxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQztTQUNsRCxDQUFDLENBQUM7UUFDSCxVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDOUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFekIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsRCxVQUFVLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVsRCxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDdEIs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QzFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsTUFBTSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxHQUFHLFdBQVcsQ0FBQztRQUNoQyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDcEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzlDLFdBQVcsR0FBRyxTQUFVLENBQUM7UUFFekIsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxVQUFVLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDOUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUs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TUFBTSxDQUFDLENBQUM7UUFFUixDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNoQyxNQUFNLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQixNQUFNLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQixNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM5QyxDQUFDLENBQUMsQ0FBQztRQUNILFVBQVUsQ0FBQyxHQUFHLENBQUM7WUFDZCxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM3QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7U0FDcEMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLENBQUM7UUFFUixDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNoQyxNQUFNLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMs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Y0FBYyxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BFLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUd6RSxNQUFNLFdBQVcsR0FBVSxFQUFFLENBQUM7UUFDOUIsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMxQyxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsWUFBWSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDdkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsY0FBYyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDMUUsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9