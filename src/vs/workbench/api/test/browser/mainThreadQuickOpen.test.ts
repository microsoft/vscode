/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IPickOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';
import { ICustomEditorLabelService } from '../../../services/editor/common/customEditorLabelService.js';
import { MainThreadQuickOpen } from '../../browser/mainThreadQuickOpen.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadQuickOpen pending item lifetime', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(pickError?: Error) {
		const operations: { close(): Promise<void>; accept(): Promise<void>; error(error: Error): Promise<void> }[] = [];
		const quickInput = new class extends mock<IQuickInputService>() {
			override pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: true }): Promise<T[] | undefined>;
			override pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: false }): Promise<T | undefined>;
			override pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>): Promise<T | undefined>;
			override pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T>): Promise<T | T[] | undefined> {
				if (pickError) {
					throw pickError;
				}
				const result = new DeferredPromise<T | T[] | undefined>();
				const contents = Promise.resolve(picks);
				// Like the real widget, item production errors reject the operation.
				void contents.catch(error => result.error(error));
				operations.push({
					close: () => result.complete(undefined),
					error: error => result.error(error),
					accept: async () => {
						const items = (await contents).filter((item): item is T => item.type !== 'separator');
						await result.complete(options?.canPickMany ? items : items[0]);
					}
				});
				return result.p;
			}
		};
		const service = store.add(new MainThreadQuickOpen(
			SingleProxyRPCProtocol({ $onItemSelected() { } }), quickInput,
			new class extends mock<ILabelService>() { }, new class extends mock<ICustomEditorLabelService>() { },
			new class extends mock<IModelService>() { }, new class extends mock<ILanguageService>() { }
		));
		const pending = () => Object.keys(Reflect.get(service, '_items'));
		return { service, operations, pending };
	}

	for (const canPickMany of [false, true]) {
		for (const completion of ['close', 'cancel', 'error'] as const) {
			test(`releases pending items after ${completion}, multiple=${canPickMany}`, async () => {
				const { service, operations, pending } = createService();
				const result = service.$show(1, { canPickMany }, CancellationToken.None);
				assert.deepStrictEqual(pending(), ['1']);
				if (completion === 'close') {
					await operations[0].close();
					assert.strictEqual(await result, undefined);
				} else {
					const error = completion === 'cancel' ? new CancellationError() : new Error('Owned widget error');
					const rejected = assert.rejects(result, error);
					await operations[0].error(error);
					await rejected;
				}
				assert.deepStrictEqual(pending(), []);
			});
		}

		test(`preserves accepted items, multiple=${canPickMany}`, async () => {
			const { service, operations, pending } = createService();
			const result = service.$show(1, { canPickMany }, CancellationToken.None);
			await service.$setItems(1, [{ label: 'first', handle: 3 }, { label: 'second', handle: 8 }]);
			assert.deepStrictEqual(pending(), []);
			await operations[0].accept();
			assert.deepStrictEqual(await result, canPickMany ? [3, 8] : 3);
		});
	}

	test('item production errors preserve their original error and release the request', async () => {
		const { service, pending } = createService();
		const error = new Error('Owned item production error');
		const result = service.$show(1, {}, CancellationToken.None);
		const rejected = assert.rejects(result, error);
		await service.$setError(1, error);
		await rejected;
		assert.deepStrictEqual(pending(), []);
	});

	test('synchronous widget creation errors release the request', async () => {
		const error = new Error('Owned widget creation error');
		const { service, pending } = createService(error);
		await assert.rejects(async () => service.$show(1, {}, CancellationToken.None), error);
		assert.deepStrictEqual(pending(), []);
	});

	test('settlement only releases its own request and late items are harmless', async () => {
		const { service, operations, pending } = createService();
		const first = service.$show(1, {}, CancellationToken.None);
		const second = service.$show(2, {}, CancellationToken.None);
		await operations[0].close();
		await first;
		assert.deepStrictEqual(pending(), ['2']);
		await service.$setItems(1, [{ label: 'late', handle: 9 }]);
		await service.$setError(1, new Error('Ignored late error'));
		assert.deepStrictEqual(pending(), ['2']);
		await service.$setItems(2, [{ label: 'current', handle: 4 }]);
		await operations[1].accept();
		assert.strictEqual(await second, 4);
		assert.deepStrictEqual(pending(), []);
	});
});
