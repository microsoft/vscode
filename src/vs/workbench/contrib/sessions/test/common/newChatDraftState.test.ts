/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { InMemoryStorageService, StorageScope, StorageTarget, TARGET_KEY } from '../../../../../platform/storage/common/storage.js';
import { ComposerInputSnapshot, readNewChatDraftState, writeNewChatDraftState } from '../../common/newChatDraftState.js';
import { SavedSessionDrafts, hasSessionDraftContent } from '../../common/savedSessionDrafts.js';

suite('New chat draft state', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('saved drafts retain independent input, inline references, and provider choices across reload', () => {
		const storage = store.add(new InMemoryStorageService());
		const drafts = store.add(new SavedSessionDrafts(storage));
		const file = URI.file('/workspace/a.ts');
		const input = {
			inputText: '#attachment:a.ts',
			attachments: [{ kind: 'file' as const, id: 'a', name: 'a.ts', value: file }],
			references: [{ id: 'a', range: new Range(1, 1, 1, 17), data: file, isFile: true }],
		};
		const first = drafts.save(input, { folderUri: URI.file('/workspace'), providerId: 'host', sessionTypeId: 'agent', configuration: { modelId: 'model', sessionTemplate: { config: { mode: 'interactive' } }, branch: 'topic' } });
		const second = drafts.save({ inputText: '', attachments: input.attachments }, {});
		input.attachments.length = 0;
		const reloaded = store.add(new SavedSessionDrafts(storage));
		const restored = reloaded.drafts.get().find(draft => draft.id === first.id)!;
		assert.deepStrictEqual({
			ids: reloaded.drafts.get().map(draft => draft.id).sort(),
			file: restored.input.attachments[0].value,
			reference: restored.input.references?.[0].data,
			target: restored.target,
			content: [hasSessionDraftContent(second.input), hasSessionDraftContent({ inputText: ' \n ', attachments: [] })],
		}, {
			ids: [first.id, second.id].sort(),
			file,
			reference: file,
			target: first.target,
			content: [true, false],
		});
	});

	test('saved drafts merge independent writers and a late send completion cannot remove a newer edit', () => {
		const storage = store.add(new InMemoryStorageService());
		const firstWindow = store.add(new SavedSessionDrafts(storage));
		const secondWindow = store.add(new SavedSessionDrafts(storage));
		const sent = firstWindow.save({ inputText: 'old request', attachments: [] }, {});
		const other = secondWindow.save({ inputText: 'another composition', attachments: [] }, {});
		firstWindow.save({ inputText: 'newer edit', attachments: [] }, {}, sent.id);
		secondWindow.remove(sent.id, sent.revision);
		assert.deepStrictEqual(firstWindow.drafts.get().map(draft => [draft.id, draft.input.inputText]).sort(), [
			[sent.id, 'newer edit'],
			[other.id, 'another composition'],
		].sort());
	});

	test('unchanged drafts keep their revision and edits do not accumulate revision tombstones', () => {
		const storage = store.add(new InMemoryStorageService());
		const drafts = store.add(new SavedSessionDrafts(storage));
		const input = { inputText: 'same content', attachments: [] };
		const target = { folderUri: URI.file('/workspace') };
		const first = drafts.save(input, target);
		const unchanged = drafts.save(input, target, first.id);
		for (let i = 0; i < 10; i++) {
			drafts.save({ ...input, inputText: `edit ${i}` }, target, first.id);
		}
		assert.deepStrictEqual({
			unchanged: { revision: unchanged.revision, updatedAt: unchanged.updatedAt },
			revisions: storage.keys(StorageScope.PROFILE).filter(key => key.startsWith('sessions.savedDrafts.revision.')).length,
			tombstones: storage.keys(StorageScope.PROFILE).filter(key => key.startsWith('sessions.savedDrafts.removed.')).length,
		}, { unchanged: { revision: first.revision, updatedAt: first.updatedAt }, revisions: 1, tombstones: 0 });
	});

	test('unsupported saved-draft data remains recoverable and is never replaced by a save', () => {
		const storage = store.add(new InMemoryStorageService());
		const raw = '{"version":99,"drafts":[]}';
		storage.store('sessions.savedDrafts', raw, StorageScope.PROFILE, StorageTarget.MACHINE);
		const drafts = store.add(new SavedSessionDrafts(storage));
		assert.throws(() => drafts.save({ inputText: 'new input', attachments: [] }, {}), /Unsupported saved session draft storage/);
		assert.deepStrictEqual({
			error: drafts.error.get()?.message,
			stored: storage.get('sessions.savedDrafts', StorageScope.PROFILE),
		}, { error: 'Unsupported saved session draft storage.', stored: raw });
	});

	test('legacy drafts migrate without resurrecting a revision deleted by another window', () => {
		const storage = store.add(new InMemoryStorageService());
		const legacy = JSON.stringify({
			version: 1, drafts: [{
				id: 'legacy', revision: 'original', createdAt: 1, updatedAt: 1,
				input: { inputText: 'legacy input', attachments: [] }, target: {},
			}]
		});
		storage.store('sessions.savedDrafts', legacy, StorageScope.PROFILE, StorageTarget.MACHINE);
		const drafts = store.add(new SavedSessionDrafts(storage));
		drafts.save({ inputText: 'new input', attachments: [] }, {});
		drafts.remove('legacy', 'original');
		storage.store('sessions.savedDrafts', legacy, StorageScope.PROFILE, StorageTarget.MACHINE);
		drafts.save({ inputText: 'another window', attachments: [] }, {});
		const reloaded = store.add(new SavedSessionDrafts(storage));
		assert.deepStrictEqual({
			legacy: storage.get('sessions.savedDrafts', StorageScope.PROFILE),
			inputs: reloaded.drafts.get().map(draft => draft.input.inputText).sort(),
		}, { legacy: undefined, inputs: ['another window', 'new input'] });
	});

	test('independent window caches retain other drafts and newer revisions after delayed storage propagation', () => {
		const database = store.add(new InMemoryStorageService());
		const windows = [store.add(new InMemoryStorageService()), store.add(new InMemoryStorageService())];
		const writes: { key: string; value: string | undefined }[] = [];
		const listeners = store.add(new DisposableStore());
		let propagating = false;
		for (const storage of windows) {
			listeners.add(storage.onDidChangeValue(StorageScope.PROFILE, undefined, listeners)(event => {
				if (!propagating) {
					writes.push({ key: event.key, value: storage.get(event.key, StorageScope.PROFILE) });
				}
			}));
		}
		const flush = () => {
			propagating = true;
			for (const { key, value } of writes.splice(0)) {
				database.store(key, value, StorageScope.PROFILE, StorageTarget.MACHINE);
			}
			for (const storage of windows) {
				for (const key of new Set([...storage.keys(StorageScope.PROFILE), ...database.keys(StorageScope.PROFILE)])) {
					if (key !== TARGET_KEY) {
						storage.store(key, database.get(key, StorageScope.PROFILE), StorageScope.PROFILE, StorageTarget.MACHINE);
					}
				}
			}
			propagating = false;
		};
		const first = store.add(new SavedSessionDrafts(windows[0]));
		const second = store.add(new SavedSessionDrafts(windows[1]));
		const sent = first.save({ inputText: 'submitted', attachments: [] }, {});
		flush();
		first.save({ inputText: 'newer edit', attachments: [] }, {}, sent.id);
		second.save({ inputText: 'other window', attachments: [] }, {});
		second.remove(sent.id, sent.revision);
		flush();
		const reloaded = store.add(new SavedSessionDrafts(database));
		assert.deepStrictEqual([first, second, reloaded].map(model => model.drafts.get().map(draft => draft.input.inputText).sort()), [
			['newer edit', 'other window'], ['newer edit', 'other window'], ['newer edit', 'other window'],
		]);
	});

	test('keeps the references that bind mentions to attachments, and reads drafts saved without them', () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = { kind: 'file' as const, id: 'a', name: 'index.ts', value: URI.file('/a/index.ts') };
		const second = { kind: 'file' as const, id: 'b', name: 'index.ts', value: URI.file('/b/index.ts') };
		const references = [
			{ id: 'b', range: new Range(1, 1, 1, 21), data: second.value, isFile: true, isAttachmentReference: true },
			{ id: 'a', range: new Range(1, 26, 1, 46), data: first.value, isFile: true, isAttachmentReference: true },
		];
		writeNewChatDraftState(storageService, { inputText: '#attachment:index.ts and #attachment:index.ts', attachments: [first, second], references });
		const draft = readNewChatDraftState(storageService);

		// A draft without pills keeps no references, as drafts saved before them did.
		writeNewChatDraftState(storageService, { inputText: 'hello', attachments: [] });
		const withoutReferences = readNewChatDraftState(storageService);

		assert.deepStrictEqual({
			references: draft?.references?.map(reference => ({ id: reference.id, range: Range.lift(reference.range), data: URI.isUri(reference.data) ? reference.data.path : undefined })),
			withoutReferences,
		}, {
			references: [
				{ id: 'b', range: new Range(1, 1, 1, 21), data: '/b/index.ts' },
				{ id: 'a', range: new Range(1, 26, 1, 46), data: '/a/index.ts' },
			],
			withoutReferences: { inputText: 'hello', attachments: [], references: undefined },
		});
	});

	test('a composer input snapshot ends only the attempt of the completion that ends it, never a newer one', () => {
		const snapshot = new ComposerInputSnapshot();
		snapshot.set({ inputText: 'first', attachments: [] });
		const rejected = snapshot.beginSendAttempt({ inputText: 'first', attachments: [] });
		snapshot.set({ inputText: '', attachments: [] });
		const retried = snapshot.beginSendAttempt({ inputText: 'second', attachments: [] });
		// The rejected send's completion arrives late, after the retry started.
		snapshot.endSendAttempt(rejected);
		const afterLateCompletion = snapshot.get();
		snapshot.endSendAttempt(retried);

		assert.deepStrictEqual({ afterLateCompletion, afterRetry: snapshot.get() }, {
			afterLateCompletion: { input: { inputText: '', attachments: [] }, attempt: { id: retried, input: { inputText: 'second', attachments: [] } } },
			afterRetry: { input: { inputText: '', attachments: [] } },
		});
	});
});
