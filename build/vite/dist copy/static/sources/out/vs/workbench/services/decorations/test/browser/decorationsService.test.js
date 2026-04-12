/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DecorationsService } from '../../browser/decorationsService.js';
import { URI } from '../../../../../base/common/uri.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import * as resources from '../../../../../base/common/resources.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('DecorationsService', function () {
    let service;
    setup(function () {
        service = new DecorationsService(new class extends mock() {
            constructor() {
                super(...arguments);
                this.extUri = resources.extUri;
            }
        }, new TestThemeService());
    });
    teardown(function () {
        service.dispose();
    });
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('Async provider, async/evented result', function () {
        return runWithFakedTimers({}, async function () {
            const uri = URI.parse('foo:bar');
            let callCounter = 0;
            const reg = service.registerDecorationsProvider(new class {
                constructor() {
                    this.label = 'Test';
                    this.onDidChange = Event.None;
                }
                provideDecorations(uri) {
                    callCounter += 1;
                    return new Promise(resolve => {
                        setTimeout(() => resolve({
                            color: 'someBlue',
                            tooltip: 'T',
                            strikethrough: true
                        }));
                    });
                }
            });
            // trigger -> async
            assert.strictEqual(service.getDecoration(uri, false), undefined);
            assert.strictEqual(callCounter, 1);
            // event when result is computed
            const e = await Event.toPromise(service.onDidChangeDecorations);
            assert.strictEqual(e.affectsResource(uri), true);
            // sync result
            assert.deepStrictEqual(service.getDecoration(uri, false).tooltip, 'T');
            assert.deepStrictEqual(service.getDecoration(uri, false).strikethrough, true);
            assert.strictEqual(callCounter, 1);
            reg.dispose();
        });
    });
    test('Sync provider, sync result', function () {
        const uri = URI.parse('foo:bar');
        let callCounter = 0;
        const reg = service.registerDecorationsProvider(new class {
            constructor() {
                this.label = 'Test';
                this.onDidChange = Event.None;
            }
            provideDecorations(uri) {
                callCounter += 1;
                return { color: 'someBlue', tooltip: 'Z' };
            }
        });
        // trigger -> sync
        assert.deepStrictEqual(service.getDecoration(uri, false).tooltip, 'Z');
        assert.deepStrictEqual(service.getDecoration(uri, false).strikethrough, false);
        assert.strictEqual(callCounter, 1);
        reg.dispose();
    });
    test('Clear decorations on provider dispose', async function () {
        return runWithFakedTimers({}, async function () {
            const uri = URI.parse('foo:bar');
            let callCounter = 0;
            const reg = service.registerDecorationsProvider(new class {
                constructor() {
                    this.label = 'Test';
                    this.onDidChange = Event.None;
                }
                provideDecorations(uri) {
                    callCounter += 1;
                    return { color: 'someBlue', tooltip: 'J' };
                }
            });
            // trigger -> sync
            assert.deepStrictEqual(service.getDecoration(uri, false).tooltip, 'J');
            assert.strictEqual(callCounter, 1);
            // un-register -> ensure good event
            let didSeeEvent = false;
            const p = new Promise(resolve => {
                const l = service.onDidChangeDecorations(e => {
                    assert.strictEqual(e.affectsResource(uri), true);
                    assert.deepStrictEqual(service.getDecoration(uri, false), undefined);
                    assert.strictEqual(callCounter, 1);
                    didSeeEvent = true;
                    l.dispose();
                    resolve();
                });
            });
            reg.dispose(); // will clear all data
            await p;
            assert.strictEqual(didSeeEvent, true);
        });
    });
    test('No default bubbling', function () {
        let reg = service.registerDecorationsProvider({
            label: 'Test',
            onDidChange: Event.None,
            provideDecorations(uri) {
                return uri.path.match(/\.txt/)
                    ? { tooltip: '.txt', weight: 17 }
                    : undefined;
            }
        });
        const childUri = URI.parse('file:///some/path/some/file.txt');
        let deco = service.getDecoration(childUri, false);
        assert.strictEqual(deco.tooltip, '.txt');
        deco = service.getDecoration(childUri.with({ path: 'some/path/' }), true);
        assert.strictEqual(deco, undefined);
        reg.dispose();
        // bubble
        reg = service.registerDecorationsProvider({
            label: 'Test',
            onDidChange: Event.None,
            provideDecorations(uri) {
                return uri.path.match(/\.txt/)
                    ? { tooltip: '.txt.bubble', weight: 71, bubble: true }
                    : undefined;
            }
        });
        deco = service.getDecoration(childUri, false);
        assert.strictEqual(deco.tooltip, '.txt.bubble');
        deco = service.getDecoration(childUri.with({ path: 'some/path/' }), true);
        assert.strictEqual(typeof deco.tooltip, 'string');
        reg.dispose();
    });
    test('Decorations not showing up for second root folder #48502', async function () {
        let cancelCount = 0;
        let callCount = 0;
        const provider = new class {
            constructor() {
                this._onDidChange = new Emitter();
                this.onDidChange = this._onDidChange.event;
                this.label = 'foo';
            }
            provideDecorations(uri, token) {
                store.add(token.onCancellationRequested(() => {
                    cancelCount += 1;
                }));
                return new Promise(resolve => {
                    callCount += 1;
                    setTimeout(() => {
                        resolve({ letter: 'foo' });
                    }, 10);
                });
            }
        };
        const reg = service.registerDecorationsProvider(provider);
        const uri = URI.parse('foo://bar');
        const d1 = service.getDecoration(uri, false);
        provider._onDidChange.fire([uri]);
        const d2 = service.getDecoration(uri, false);
        assert.strictEqual(cancelCount, 1);
        assert.strictEqual(callCount, 2);
        d1?.dispose();
        d2?.dispose();
        reg.dispose();
    });
    test('Decorations not bubbling... #48745', function () {
        const reg = service.registerDecorationsProvider({
            label: 'Test',
            onDidChange: Event.None,
            provideDecorations(uri) {
                if (uri.path.match(/hello$/)) {
                    return { tooltip: 'FOO', weight: 17, bubble: true };
                }
                else {
                    return new Promise(_resolve => { });
                }
            }
        });
        const data1 = service.getDecoration(URI.parse('a:b/'), true);
        assert.ok(!data1);
        const data2 = service.getDecoration(URI.parse('a:b/c.hello'), false);
        assert.ok(data2.tooltip);
        const data3 = service.getDecoration(URI.parse('a:b/'), true);
        assert.ok(data3);
        reg.dispose();
    });
    test('Folder decorations don\'t go away when file with problems is deleted #61919 (part1)', function () {
        const emitter = new Emitter();
        let gone = false;
        const reg = service.registerDecorationsProvider({
            label: 'Test',
            onDidChange: emitter.event,
            provideDecorations(uri) {
                if (!gone && uri.path.match(/file.ts$/)) {
                    return { tooltip: 'FOO', weight: 17, bubble: true };
                }
                return undefined;
            }
        });
        const uri = URI.parse('foo:/folder/file.ts');
        const uri2 = URI.parse('foo:/folder/');
        let data = service.getDecoration(uri, true);
        assert.strictEqual(data.tooltip, 'FOO');
        data = service.getDecoration(uri2, true);
        assert.ok(data.tooltip); // emphazied items...
        gone = true;
        emitter.fire([uri]);
        data = service.getDecoration(uri, true);
        assert.strictEqual(data, undefined);
        data = service.getDecoration(uri2, true);
        assert.strictEqual(data, undefined);
        reg.dispose();
    });
    test('Folder decorations don\'t go away when file with problems is deleted #61919 (part2)', function () {
        return runWithFakedTimers({}, async function () {
            const emitter = new Emitter();
            let gone = false;
            const reg = service.registerDecorationsProvider({
                label: 'Test',
                onDidChange: emitter.event,
                provideDecorations(uri) {
                    if (!gone && uri.path.match(/file.ts$/)) {
                        return { tooltip: 'FOO', weight: 17, bubble: true };
                    }
                    return undefined;
                }
            });
            const uri = URI.parse('foo:/folder/file.ts');
            const uri2 = URI.parse('foo:/folder/');
            let data = service.getDecoration(uri, true);
            assert.strictEqual(data.tooltip, 'FOO');
            data = service.getDecoration(uri2, true);
            assert.ok(data.tooltip); // emphazied items...
            return new Promise((resolve, reject) => {
                const l = service.onDidChangeDecorations(e => {
                    l.dispose();
                    try {
                        assert.ok(e.affectsResource(uri));
                        assert.ok(e.affectsResource(uri2));
                        resolve();
                        reg.dispose();
                    }
                    catch (err) {
                        reject(err);
                        reg.dispose();
                    }
                });
                gone = true;
                emitter.fire([uri]);
            });
        });
    });
    test('FileDecorationProvider intermittently fails #133210', async function () {
        const invokeOrder = [];
        store.add(service.registerDecorationsProvider(new class {
            constructor() {
                this.label = 'Provider-1';
                this.onDidChange = Event.None;
            }
            provideDecorations() {
                invokeOrder.push(this.label);
                return undefined;
            }
        }));
        store.add(service.registerDecorationsProvider(new class {
            constructor() {
                this.label = 'Provider-2';
                this.onDidChange = Event.None;
            }
            provideDecorations() {
                invokeOrder.push(this.label);
                return undefined;
            }
        }));
        service.getDecoration(URI.parse('test://me/path'), false);
        assert.deepStrictEqual(invokeOrder, ['Provider-2', 'Provider-1']);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVjb3JhdGlvbnNTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZGVjb3JhdGlvbnMvdGVzdC9icm93c2VyL2RlY29yYXRpb25zU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUV6RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEtBQUssU0FBUyxNQUFNLHlDQUF5QyxDQUFDO0FBRXJFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNqRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM1RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxLQUFLLENBQUMsb0JBQW9CLEVBQUU7SUFFM0IsSUFBSSxPQUEyQixDQUFDO0lBRWhDLEtBQUssQ0FBQztRQUNMLE9BQU8sR0FBRyxJQUFJLGtCQUFrQixDQUMvQixJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQXVCO1lBQXpDOztnQkFDTSxXQUFNLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQztZQUNwQyxDQUFDO1NBQUEsRUFDRCxJQUFJLGdCQUFnQixFQUFFLENBQ3RCLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQztRQUNSLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJ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