/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { ExtensionBisectService, IExtensionBisectService } from '../../browser/extensionBisect.js';
import { ILocalExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtension } from '../../../../../platform/extensions/common/extensions.js';

suite('ExtensionBisectService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let storageService: IStorageService;
	const logService = new NullLogService();
	const envService = {} as IWorkbenchEnvironmentService;

	setup(() => {
		storageService = disposables.add(new InMemoryStorageService());
	});

	function createService(): IExtensionBisectService {
		// the bisect service rehydrates its in-memory state from storage in its
		// constructor; a fresh instance is required after every state-changing
		// call to mimic the window reload that happens between bisect steps.
		return new ExtensionBisectService(logService, storageService, envService);
	}

	function makeExtension(id: string): ILocalExtension {
		return {
			identifier: { id },
			manifest: { name: id, version: '0.0.1', publisher: 'test', activationEvents: [] }
		} as unknown as ILocalExtension;
	}

	function disabledIds(service: IExtensionBisectService, extensions: ILocalExtension[]): string[] {
		return extensions
			.filter(e => service.isDisabledByBisect(e as unknown as IExtension))
			.map(e => e.identifier.id);
	}

	test('inactive before start', () => {
		const service = createService();
		assert.strictEqual(service.isActive, false);
		assert.strictEqual(service.disabledCount, -1);
	});

	test('start disables every extension and reports the full count', async () => {
		const extensions = Array.from({ length: 12 }, (_, i) => makeExtension(`pub.ext-${i}`));
		await createService().start(extensions);

		const service = createService();
		assert.strictEqual(service.isActive, true);
		assert.strictEqual(service.disabledCount, extensions.length);
		assert.deepStrictEqual(disabledIds(service, extensions), extensions.map(e => e.identifier.id));
	});

	test('first "I can\'t reproduce" disables the upper half', async () => {
		const extensions = Array.from({ length: 12 }, (_, i) => makeExtension(`pub.ext-${i}`));
		await createService().start(extensions);
		await createService().next(/*seeingBad*/ false);

		const service = createService();
		assert.strictEqual(service.disabledCount, 6);
		assert.deepStrictEqual(disabledIds(service, extensions), extensions.slice(6).map(e => e.identifier.id));
	});

	test('"still bad" keeps previously eliminated extensions disabled (issue #237092)', async () => {
		// Start -> "can't reproduce" -> "still bad". The upper half disabled in
		// step 1 must remain disabled in step 2, otherwise additional bad
		// extensions hiding there will keep the bisect from converging.
		const extensions = Array.from({ length: 12 }, (_, i) => makeExtension(`pub.ext-${i}`));
		await createService().start(extensions);
		await createService().next(false);
		await createService().next(true);

		const service = createService();
		// [0, 3) enabled (active search), [3, 12) disabled (3 active + 9 skipped).
		assert.strictEqual(service.disabledCount, 9);
		assert.deepStrictEqual(disabledIds(service, extensions), extensions.slice(3).map(e => e.identifier.id));
	});

	test('"can\'t reproduce" after narrowing keeps known-good extensions enabled', async () => {
		// Sequence: start -> not bad -> still bad -> not bad.
		// After the third answer the search range is [3, 6); extensions in
		// [0, 3) are known-good (enabled), [3, 4) is active-enabled, [4, 12)
		// is disabled (active + skipped).
		const extensions = Array.from({ length: 12 }, (_, i) => makeExtension(`pub.ext-${i}`));
		await createService().start(extensions);
		await createService().next(false);
		await createService().next(true);
		await createService().next(false);

		const service = createService();
		assert.strictEqual(service.disabledCount, 8);
		assert.deepStrictEqual(disabledIds(service, extensions), extensions.slice(4).map(e => e.identifier.id));
	});

	test('disabledCount always matches the size of the disabled set', async () => {
		const extensions = Array.from({ length: 12 }, (_, i) => makeExtension(`pub.ext-${i}`));
		await createService().start(extensions);

		const answers: boolean[] = [false, true, false, true];
		for (let i = 0; i <= answers.length; i++) {
			const service = createService();
			assert.strictEqual(service.disabledCount, disabledIds(service, extensions).length, `step ${i}`);
			if (i < answers.length) {
				await service.next(answers[i]);
			}
		}
	});

	test('identifies the bad extension when narrowed to a single candidate', async () => {
		// 4 extensions, the bad one is at index 0.
		const extensions = Array.from({ length: 4 }, (_, i) => makeExtension(`pub.ext-${i}`));
		await createService().start(extensions);
		// All disabled: bug gone.
		assert.strictEqual(await createService().next(false), undefined);
		// [0,2) enabled, [2,4) disabled: bug reproduces (idx 0 enabled).
		assert.strictEqual(await createService().next(true), undefined);
		// [0,1) enabled, [1,4) disabled (active + skipped): bug reproduces.
		assert.strictEqual(await createService().next(true), undefined);
		// Final step: [0] disabled, [1,4) skipped/disabled — everything disabled.
		// User answers "can't reproduce" and ext-0 is identified.
		const result = await createService().next(false);
		assert.deepStrictEqual(result, { id: 'pub.ext-0', bad: false });

		// And state should be cleared.
		assert.strictEqual(createService().isActive, false);
	});

	test('reports "no extension identified" when problem persists with all extensions disabled', async () => {
		const extensions = Array.from({ length: 4 }, (_, i) => makeExtension(`pub.ext-${i}`));
		await createService().start(extensions);
		const result = await createService().next(/*seeingBad*/ true);
		assert.deepStrictEqual(result, { bad: true, id: '' });
	});

	test('reset clears bisect state', async () => {
		const extensions = Array.from({ length: 4 }, (_, i) => makeExtension(`pub.ext-${i}`));
		await createService().start(extensions);
		assert.strictEqual(createService().isActive, true);

		await createService().reset();

		const service = createService();
		assert.strictEqual(service.isActive, false);
		assert.strictEqual(service.disabledCount, -1);
		assert.deepStrictEqual(disabledIds(service, extensions), []);
	});
});
