/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextResourceConfigurationChangeEvent } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { ResourceConfigurationEventDispatcher } from '../../browser/multiDiffEditorInput.js';

suite('Workbench - MultiDiffEditorInput', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('should multiplex resource configuration listeners', () => {
		let upstreamListeners = 0;
		const emitter = disposables.add(new Emitter<ITextResourceConfigurationChangeEvent>({
			onWillAddFirstListener: () => upstreamListeners++,
			onDidRemoveLastListener: () => upstreamListeners--,
		}));
		const dispatcher = new ResourceConfigurationEventDispatcher(emitter.event, resource => resource.toString());
		const store = disposables.add(new DisposableStore());
		const resources = Array.from({ length: 200 }, (_, index) => URI.file(`/workspace/file${index}.ts`));
		const changeCounts = resources.map(() => 0);

		for (let i = 0; i < resources.length; i++) {
			store.add(dispatcher.filteredEvent(resources[i])(() => changeCounts[i]++));
		}

		strictEqual(upstreamListeners, 1);

		emitter.fire({
			affectedKeys: new Set(['editor.fontSize']),
			affectsConfiguration: (resource, section) => section === 'editor' && resource?.toString() === resources[42].toString(),
		});

		strictEqual(changeCounts[42], 1);
		strictEqual(changeCounts.reduce((sum, value) => sum + value, 0), 1);

		emitter.fire({
			affectedKeys: new Set(['diffEditor.ignoreTrimWhitespace']),
			affectsConfiguration: (resource, section) => section === 'diffEditor' && resource?.toString() === resources[100].toString(),
		});

		strictEqual(changeCounts[100], 1);
		strictEqual(changeCounts.reduce((sum, value) => sum + value, 0), 2);

		store.clear();
		strictEqual(upstreamListeners, 0);
	});

	test('should support event disposables, thisArgs, duplicate listeners, and listener errors', () => {
		const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		let unexpectedErrors = 0;
		setUnexpectedErrorHandler(() => unexpectedErrors++);

		try {
			let upstreamListeners = 0;
			const emitter = disposables.add(new Emitter<ITextResourceConfigurationChangeEvent>({
				onWillAddFirstListener: () => upstreamListeners++,
				onDidRemoveLastListener: () => upstreamListeners--,
			}));
			const dispatcher = new ResourceConfigurationEventDispatcher(emitter.event, resource => resource.toString());
			const store = disposables.add(new DisposableStore());
			const resource = URI.file('/workspace/file.ts');
			const event = dispatcher.filteredEvent(resource);

			let duplicateCalls = 0;
			const duplicateListener = () => duplicateCalls++;
			event(duplicateListener, undefined, store);
			event(duplicateListener, undefined, store);

			const thisArg = { calls: 0 };
			event(function (this: typeof thisArg) {
				this.calls++;
			}, thisArg, store);

			let listenerAfterErrorCalls = 0;
			event(() => {
				throw new Error('expected');
			}, undefined, store);
			event(() => listenerAfterErrorCalls++, undefined, store);

			strictEqual(upstreamListeners, 1);

			emitter.fire({
				affectedKeys: new Set(['editor.fontSize']),
				affectsConfiguration: (changedResource, section) => section === 'editor' && changedResource?.toString() === resource.toString(),
			});

			strictEqual(duplicateCalls, 2);
			strictEqual(thisArg.calls, 1);
			strictEqual(unexpectedErrors, 1);
			strictEqual(listenerAfterErrorCalls, 1);

			store.clear();
			strictEqual(upstreamListeners, 0);
		} finally {
			setUnexpectedErrorHandler(originalErrorHandler);
		}
	});
});
