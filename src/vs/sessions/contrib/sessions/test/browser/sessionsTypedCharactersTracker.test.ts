/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { TextModel } from '../../../../../editor/common/model/textModel.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { EditSources, TextModelEditSource } from '../../../../../editor/common/textModelEditSource.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ITypedCharactersEntry, MAX_TYPED_CHARACTERS_RETRIES, SessionsTypedCharactersTracker } from '../../browser/sessionsTypedCharactersTracker.js';

const FILE = URI.file('/repo/worktree/file.ts');

/** Flattens a reported batch to `sessionId`/`resource`/`characters` triples for assertions. */
interface IReported {
	readonly sessionId: string;
	readonly resource: URI;
	readonly characters: number;
}

function toReported(entries: readonly ITypedCharactersEntry[]): IReported[] {
	return entries.map(entry => ({ sessionId: entry.session.sessionId, resource: entry.resource, characters: entry.characters }));
}

function createSession(sessionId: string): IActiveSession {
	return upcastPartial<IActiveSession>({ sessionId });
}

suite('SessionsTypedCharactersTracker', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let onModelAdded: Emitter<ITextModel>;
	let onModelRemoved: Emitter<ITextModel>;
	let initialModels: ITextModel[];
	let reported: IReported[][];
	let activeSession: IActiveSession | undefined;
	/** Entries the consumer reports as not-yet-attributable, by resource path. */
	let deferPaths: Set<string>;

	setup(() => {
		onModelAdded = disposables.add(new Emitter<ITextModel>());
		onModelRemoved = disposables.add(new Emitter<ITextModel>());
		initialModels = [];
		reported = [];
		activeSession = createSession('session');
		deferPaths = new Set();
	});

	function createTracker(): SessionsTypedCharactersTracker {
		const modelService = new class extends mock<IModelService>() {
			override readonly onModelAdded = onModelAdded.event;
			override readonly onModelRemoved = onModelRemoved.event;
			override getModels() { return initialModels; }
		}();
		return disposables.add(new SessionsTypedCharactersTracker(
			() => activeSession,
			entries => {
				reported.push(toReported(entries));
				return entries.filter(entry => deferPaths.has(entry.resource.path));
			},
			modelService,
		));
	}

	function createModel(uri = FILE): TextModel {
		return disposables.add(createTextModel('', null, undefined, uri));
	}

	/** Appends `text` at the very start of `model` as if it came from `source`. */
	function edit(model: TextModel, text: string, source: TextModelEditSource): void {
		model.applyEdits([{ range: new Range(1, 1, 1, 1), text }], false, source);
	}

	const typed = () => EditSources.cursor({ kind: 'type', detailedSource: 'keyboard' });

	test('counts only characters the user typed', () => {
		const model = createModel();
		initialModels.push(model);
		const tracker = createTracker();

		edit(model, 'user', typed());
		edit(model, 'pasted', EditSources.cursor({ kind: 'paste', detailedSource: 'keyboard' }));
		edit(model, 'agent', EditSources.agentHostChatApplyEdits({ modelId: 'm', sessionId: 's', requestId: 'r', harness: 'h' }));
		edit(model, 'reloaded', EditSources.reloadFromDisk());
		tracker.flush();

		assert.deepStrictEqual(reported, [[{ sessionId: 'session', resource: FILE, characters: 4 }]]);
	});

	test('accumulates per resource and clears the buffer after reporting', () => {
		const other = URI.file('/repo/worktree/other.ts');
		const model = createModel();
		const otherModel = createModel(other);
		initialModels.push(model, otherModel);
		const tracker = createTracker();

		edit(model, 'ab', typed());
		edit(otherModel, 'xyz', typed());
		edit(model, 'c', typed());
		tracker.flush();
		tracker.flush();

		assert.deepStrictEqual(reported, [[
			{ sessionId: 'session', resource: FILE, characters: 3 },
			{ sessionId: 'session', resource: other, characters: 3 },
		]]);
	});

	test('attributes typing to the session that was active while it happened', () => {
		const model = createModel();
		initialModels.push(model);
		const tracker = createTracker();

		edit(model, 'abc', typed());
		// The user switches sessions before the buffered batch is reported.
		activeSession = createSession('second');
		edit(model, 'de', typed());
		tracker.flush();

		assert.deepStrictEqual(reported, [[
			{ sessionId: 'session', resource: FILE, characters: 3 },
			{ sessionId: 'second', resource: FILE, characters: 2 },
		]]);
	});

	test('ignores typing while no session is active', () => {
		const model = createModel();
		initialModels.push(model);
		const tracker = createTracker();
		activeSession = undefined;

		edit(model, 'abc', typed());
		tracker.flush();

		assert.deepStrictEqual(reported, []);
	});

	test('retains entries the consumer cannot attribute yet', () => {
		const model = createModel();
		initialModels.push(model);
		const tracker = createTracker();
		deferPaths.add(FILE.path);

		edit(model, 'abc', typed());
		tracker.flush();
		// The workspace resolves, so the retained typing is attributed rather
		// than lost to the flush that happened while it was hydrating.
		deferPaths.clear();
		tracker.flush();

		assert.deepStrictEqual(reported, [
			[{ sessionId: 'session', resource: FILE, characters: 3 }],
			[{ sessionId: 'session', resource: FILE, characters: 3 }],
		]);
	});

	test('merges characters typed while a deferred entry is outstanding', () => {
		const model = createModel();
		initialModels.push(model);
		const tracker = createTracker();
		deferPaths.add(FILE.path);

		edit(model, 'abc', typed());
		tracker.flush();
		edit(model, 'de', typed());
		deferPaths.clear();
		tracker.flush();

		assert.deepStrictEqual(reported[1], [{ sessionId: 'session', resource: FILE, characters: 5 }]);
	});

	test('gives up on entries that stay unattributable', () => {
		const model = createModel();
		initialModels.push(model);
		const tracker = createTracker();
		deferPaths.add(FILE.path);

		edit(model, 'abc', typed());
		for (let i = 0; i < MAX_TYPED_CHARACTERS_RETRIES + 3; i++) {
			tracker.flush();
		}

		assert.strictEqual(reported.length, MAX_TYPED_CHARACTERS_RETRIES + 1);
	});

	test('tracks models added later and stops tracking removed ones', () => {
		const tracker = createTracker();
		const model = createModel();

		onModelAdded.fire(model);
		edit(model, 'ab', typed());
		onModelRemoved.fire(model);
		edit(model, 'cde', typed());
		tracker.flush();

		assert.deepStrictEqual(reported, [[{ sessionId: 'session', resource: FILE, characters: 2 }]]);
	});

	test('reports buffered characters when disposed', () => {
		const model = createModel();
		initialModels.push(model);
		const tracker = createTracker();

		edit(model, 'abc', typed());
		tracker.dispose();

		assert.deepStrictEqual(reported, [[{ sessionId: 'session', resource: FILE, characters: 3 }]]);
	});
});
