/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IResolvedTextEditorModel } from '../../../../../editor/common/services/resolverService.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ChatInputEditorState } from '../../browser/widget/input/chatInputEditorState.js';

suite('ChatInputEditorState', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('retains the input and undo history across presentation handoffs', async () => {
		const model = store.add(createTextModel('draft'));
		let releases = 0;
		const reference: IReference<IResolvedTextEditorModel> = {
			object: new class extends mock<IResolvedTextEditorModel>() { override readonly textEditorModel = model; }(),
			dispose: () => releases++,
		};
		const source = store.add(ChatInputEditorState.create(model, Promise.resolve(reference)));
		model.pushEditOperations([], [{ range: model.getFullModelRange(), text: 'edited draft' }], () => null);
		model.pushStackElement();
		const transfer = store.add(source.acquire());
		source.dispose();
		const target = store.add(transfer.acquire());
		transfer.dispose();
		await target.model.undo();
		const restored = { sameModel: target.model === model, text: target.model.getValue(), releases };
		target.dispose();
		assert.deepStrictEqual({ restored, disposed: model.isDisposed(), releases }, {
			restored: { sameModel: true, text: 'draft', releases: 0 },
			disposed: true,
			releases: 1,
		});
	});

	test('waits for reference acquisition before disposing the final owner', async () => {
		const model = store.add(createTextModel('draft'));
		const pending = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
		let releases = 0;
		const state = store.add(ChatInputEditorState.create(model, pending.p));
		state.dispose();
		const disposedBeforeResolution = model.isDisposed();
		await pending.complete({
			object: new class extends mock<IResolvedTextEditorModel>() { override readonly textEditorModel = model; }(),
			dispose: () => releases++,
		});
		await Promise.resolve();
		assert.deepStrictEqual({ disposedBeforeResolution, disposed: model.isDisposed(), releases }, {
			disposedBeforeResolution: false,
			disposed: true,
			releases: 1,
		});
	});
});
