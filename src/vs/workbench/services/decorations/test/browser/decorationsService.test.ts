/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DecorationsService } from 'vs/workbench/services/decorations/browser/decorationsService';
import { IDecorationsProvider, IDecorationData } from 'vs/workbench/services/decorations/common/decorations';
import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import * as resources from 'vs/base/common/resources';
import { CancellationToken } from 'vs/base/common/cancellation';
import { mock } from 'vs/base/test/common/mock';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('DecorationsService', function () {

	let service: DecorationsService;

	setup(function () {
		service = new DecorationsService(
			new class extends mock<IUriIdentityService>() {
				override extUri = resources.extUri;
			},
			new TestThemeService()
		);
	});

	teardown(function () {
		service.dispose();
	});

	const store = ensureNoDisposablesAreLeakedInTestSuite();


	test('Async provider, async/evented result', function () {

		return runWithFakedTimers({}, async function () {

			const uri = URI.parse('foo:bar');
			let callCounter = 0;

			const reg = service.registerDecorationsProvider(new class implements IDecorationsProvider {
				readonly label: string = 'Test';
				readonly onDidChange: Event<readonly URI[]> = Event.None;
				provideDecorations(uri: URI) {
					callCounter += 1;
					return new Promise<IDecorationData>(resolve => {
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
			assert.deepStrictEqual(service.getDecoration(uri, false)!.tooltip, 'T');
			assert.deepStrictEqual(service.getDecoration(uri, false)!.strikethrough, true);
			assert.strictEqual(callCounter, 1);

			reg.dispose();
		});
	});

	test('Sync provider, sync result', function () {

		const uri = URI.parse('foo:bar');
		let callCounter = 0;

		const reg = service.registerDecorationsProvider(new class implements IDecorationsProvider {
			readonly label: string = 'Test';
			readonly onDidChange: Event<readonly URI[]> = Event.None;
			provideDecorations(uri: URI) {
				callCounter += 1;
				return { color: 'someBlue', tooltip: 'Z' };
			}
		});

		// trigger -> sync
		assert.deepStrictEqual(service.getDecoration(uri, false)!.tooltip, 'Z');
		assert.deepStrictEqual(service.getDecoration(uri, false)!.strikethrough, false);
		assert.strictEqual(callCounter, 1);

		reg.dispose();
	});

	test('Clear decorations on provider dispose', async function () {
		return runWithFakedTimers({}, async function () {

			const uri = URI.parse('foo:bar');
			let callCounter = 0;

			const reg = service.registerDecorationsProvider(new class implements IDecorationsProvider {
				readonly label: string = 'Test';
				readonly onDidChange: Event<readonly URI[]> = Event.None;
				provideDecorations(uri: URI) {
					callCounter += 1;
					return { color: 'someBlue', tooltip: 'J' };
				}
			});

			// trigger -> sync
			assert.deepStrictEqual(service.getDecoration(uri, false)!.tooltip, 'J');
			assert.strictEqual(callCounter, 1);

			// un-register -> ensure good event
			let didSeeEvent = false;
			const p = new Promise<void>(resolve => {
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
			provideDecorations(uri: URI) {
				return uri.path.match(/\.txt/)
					? { tooltip: '.txt', weight: 17 }
					: undefined;
			}
		});

		const childUri = URI.parse('file:///some/path/some/file.txt');

		let deco = service.getDecoration(childUri, false)!;
		assert.strictEqual(deco.tooltip, '.txt');

		deco = service.getDecoration(childUri.with({ path: 'some/path/' }), true)!;
		assert.strictEqual(deco, undefined);
		reg.dispose();

		// bubble
		reg = service.registerDecorationsProvider({
			label: 'Test',
			onDidChange: Event.None,
			provideDecorations(uri: URI) {
				return uri.path.match(/\.txt/)
					? { tooltip: '.txt.bubble', weight: 71, bubble: true }
					: undefined;
			}
		});

		deco = service.getDecoration(childUri, false)!;
		assert.strictEqual(deco.tooltip, '.txt.bubble');

		deco = service.getDecoration(childUri.with({ path: 'some/path/' }), true)!;
		assert.strictEqual(typeof deco.tooltip, 'string');
		reg.dispose();
	});

	test('Decorations not showing up for second root folder #48502', async function () {

		let cancelCount = 0;
		let callCount = 0;

		const provider = new class implements IDecorationsProvider {

			_onDidChange = new Emitter<URI[]>();
			onDidChange: Event<readonly URI[]> = this._onDidChange.event;

			label: string = 'foo';

			provideDecorations(uri: URI, token: CancellationToken): Promise<IDecorationData> {

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
			provideDecorations(uri: URI) {
				if (uri.path.match(/hello$/)) {
					return { tooltip: 'FOO', weight: 17, bubble: true };
				} else {
					return new Promise<IDecorationData>(_resolve => { });
				}
			}
		});

		const data1 = service.getDecoration(URI.parse('a:b/'), true);
		assert.ok(!data1);

		const data2 = service.getDecoration(URI.parse('a:b/c.hello'), false)!;
		assert.ok(data2.tooltip);

		const data3 = service.getDecoration(URI.parse('a:b/'), true);
		assert.ok(data3);


		reg.dispose();
	});

	test('Folder decorations don\'t go away when file with problems is deleted #61919 (part1)', function () {

		const emitter = new Emitter<URI[]>();
		let gone = false;
		const reg = service.registerDecorationsProvider({
			label: 'Test',
			onDidChange: emitter.event,
			provideDecorations(uri: URI) {
				if (!gone && uri.path.match(/file.ts$/)) {
					return { tooltip: 'FOO', weight: 17, bubble: true };
				}
				return undefined;
			}
		});

		const uri = URI.parse('foo:/folder/file.ts');
		const uri2 = URI.parse('foo:/folder/');
		let data = service.getDecoration(uri, true)!;
		assert.strictEqual(data.tooltip, 'FOO');

		data = service.getDecoration(uri2, true)!;
		assert.ok(data.tooltip); // emphazied items...

		gone = true;
		emitter.fire([uri]);

		data = service.getDecoration(uri, true)!;
		assert.strictEqual(data, undefined);

		data = service.getDecoration(uri2, true)!;
		assert.strictEqual(data, undefined);

		reg.dispose();
	});

	test('Folder decorations don\'t go away when file with problems is deleted #61919 (part2)', function () {

		return runWithFakedTimers({}, async function () {

			const emitter = new Emitter<URI[]>();
			let gone = false;
			const reg = service.registerDecorationsProvider({
				label: 'Test',
				onDidChange: emitter.event,
				provideDecorations(uri: URI) {
					if (!gone && uri.path.match(/file.ts$/)) {
						return { tooltip: 'FOO', weight: 17, bubble: true };
					}
					return undefined;
				}
			});

			const uri = URI.parse('foo:/folder/file.ts');
			const uri2 = URI.parse('foo:/folder/');
			let data = service.getDecoration(uri, true)!;
			assert.strictEqual(data.tooltip, 'FOO');

			data = service.getDecoration(uri2, true)!;
			assert.ok(data.tooltip); // emphazied items...

			return new Promise<void>((resolve, reject) => {
				const l = service.onDidChangeDecorations(e => {
					l.dispose();
					try {
						assert.ok(e.affectsResource(uri));
						assert.ok(e.affectsResource(uri2));
						resolve();
						reg.dispose();
					} catch (err) {
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

		const invokeOrder: string[] = [];

		store.add(service.registerDecorationsProvider(new class {
			label = 'Provider-1';
			onDidChange = Event.None;
			provideDecorations() {
				invokeOrder.push(this.label);
				return undefined;
			}
		}));

		store.add(service.registerDecorationsProvider(new class {
			label = 'Provider-2';
			onDidChange = Event.None;
			provideDecorations() {
				invokeOrder.push(this.label);
				return undefined;
			}
		}));

		service.getDecoration(URI.parse('test://me/path'), false);

		assert.deepStrictEqual(invokeOrder, ['Provider-2', 'Provider-1']);
	});
});
