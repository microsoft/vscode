/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { DisposableStore, IDisposable, IReference } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IResolvedTextEditorModel } from '../../../../../editor/common/services/resolverService.js';
import { NewChatInputWidget } from '../../browser/newChatInput.js';

interface IInputModelReferenceHarness {
	readonly _store: DisposableStore;
	readonly textModelService: {
		createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>>;
	};
	readonly logService: {
		error(message: string, error: Error): void;
	};
	_register<T extends IDisposable>(disposable: T): T;
}

const holdInputModelReference = Reflect.get(NewChatInputWidget.prototype, '_holdInputModelReference') as (this: IInputModelReferenceHarness, uri: URI, model: ITextModel) => void;

class InputModelReferenceHarness implements IInputModelReferenceHarness, IDisposable {
	readonly _store = new DisposableStore();

	constructor(
		readonly textModelService: IInputModelReferenceHarness['textModelService'],
		readonly logService: IInputModelReferenceHarness['logService'],
	) { }

	_register<T extends IDisposable>(disposable: T): T {
		return this._store.add(disposable);
	}

	dispose(): void {
		this._store.dispose();
	}
}

suite('NewChatInputWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the input model alive until reference acquisition settles during disposal', async () => {
		const referenceDeferred = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
		let modelDisposed = false;
		let referenceDisposed = false;
		const errors: { message: string; error: Error }[] = [];
		const model = new class extends mock<ITextModel>() {
			override dispose(): void {
				modelDisposed = true;
			}
		}();
		const resolvedModel = new class extends mock<IResolvedTextEditorModel>() {
			override readonly textEditorModel = model;
		}();
		const harness = disposables.add(new InputModelReferenceHarness(
			{
				createModelReference: () => referenceDeferred.p,
			},
			{
				error: (message, error) => errors.push({ message, error }),
			},
		));

		holdInputModelReference.call(harness, URI.from({ scheme: Schemas.sessionsChatInput, path: 'input-test' }), model);
		harness.dispose();
		const disposedBeforeReferenceSettled = modelDisposed;

		referenceDeferred.complete({
			object: resolvedModel,
			dispose: () => {
				referenceDisposed = true;
				model.dispose();
			},
		});
		await referenceDeferred.p;
		await Promise.resolve();

		assert.deepStrictEqual({
			disposedBeforeReferenceSettled,
			modelDisposed,
			referenceDisposed,
			errors,
		}, {
			disposedBeforeReferenceSettled: false,
			modelDisposed: true,
			referenceDisposed: true,
			errors: [],
		});
	});
});
