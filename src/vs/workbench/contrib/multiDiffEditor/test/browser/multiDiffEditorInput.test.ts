/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
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
});
