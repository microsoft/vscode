/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { TextModel } from '../../../../../editor/common/model/textModel.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { EditSources, TextModelEditSource } from '../../../../../editor/common/textModelEditSource.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ITypedCharactersEntry, SessionsTypedCharactersTracker } from '../../browser/sessionsTypedCharactersTracker.js';

const FILE = URI.file('/repo/worktree/file.ts');

suite('SessionsTypedCharactersTracker', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let onModelAdded: Emitter<ITextModel>;
	let onModelRemoved: Emitter<ITextModel>;
	let initialModels: ITextModel[];
	let reported: ITypedCharactersEntry[][];

	setup(() => {
		onModelAdded = disposables.add(new Emitter<ITextModel>());
		onModelRemoved = disposables.add(new Emitter<ITextModel>());
		initialModels = [];
		reported = [];
	});

	function createTracker(): SessionsTypedCharactersTracker {
		const modelService = new class extends mock<IModelService>() {
			override readonly onModelAdded = onModelAdded.event;
			override readonly onModelRemoved = onModelRemoved.event;
			override getModels() { return initialModels; }
		}();
		return disposables.add(new SessionsTypedCharactersTracker(entries => reported.push([...entries]), modelService));
	}

	function createModel(uri = FILE): TextModel {
		return disposables.add(createTextModel('', null, undefined, uri));
	}

	/** Appends `text` at the very start of `model` as if it came from `source`. */
	function edit(model: TextModel, text: string, source: TextModelEditSource): void {
		model.applyEdits([{ range: new Range(1, 1, 1, 1), text }], false, source);
	}

	function flushed(tracker: SessionsTypedCharactersTracker): readonly ITypedCharactersEntry[][] {
		tracker.flush();
		return reported;
	}

	test('counts only characters the user typed', () => {
		const model = createModel();
		initialModels.push(model);
		const tracker = createTracker();

		edit(model, 'user', EditSources.cursor({ kind: 'type', detailedSource: 'keyboard' }));
		edit(model, 'pasted', EditSources.cursor({ kind: 'paste', detailedSource: 'keyboard' }));
		edit(model, 'agent', EditSources.agentHostChatApplyEdits({ modelId: 'm', sessionId: 's', requestId: 'r', harness: 'h' }));
		edit(model, 'reloaded', EditSources.reloadFromDisk());

		assert.deepStrictEqual(flushed(tracker), [[{ resource: FILE, characters: 4 }]]);
	});

	test('accumulates per resource and clears the buffer after reporting', () => {
		const other = URI.file('/repo/worktree/other.ts');
		const model = createModel();
		const otherModel = createModel(other);
		initialModels.push(model, otherModel);
		const tracker = createTracker();
		const typed = EditSources.cursor({ kind: 'type', detailedSource: 'keyboard' });

		edit(model, 'ab', typed);
		edit(otherModel, 'xyz', typed);
		edit(model, 'c', typed);

		assert.deepStrictEqual(flushed(tracker), [[
			{ resource: FILE, characters: 3 },
			{ resource: other, characters: 3 },
		]]);

		tracker.flush();
		assert.strictEqual(reported.length, 1);
	});

	test('tracks models added later and stops tracking removed ones', () => {
		const tracker = createTracker();
		const model = createModel();
		const typed = EditSources.cursor({ kind: 'type', detailedSource: 'keyboard' });

		onModelAdded.fire(model);
		edit(model, 'ab', typed);
		onModelRemoved.fire(model);
		edit(model, 'cde', typed);

		assert.deepStrictEqual(flushed(tracker), [[{ resource: FILE, characters: 2 }]]);
	});

	test('reports buffered characters when disposed', () => {
		const model = createModel();
		initialModels.push(model);
		const tracker = createTracker();

		edit(model, 'abc', EditSources.cursor({ kind: 'type', detailedSource: 'keyboard' }));
		tracker.dispose();

		assert.deepStrictEqual(reported, [[{ resource: FILE, characters: 3 }]]);
	});
});
