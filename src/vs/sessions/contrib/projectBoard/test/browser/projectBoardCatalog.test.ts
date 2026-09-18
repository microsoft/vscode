/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { autorun } from '../../../../../base/common/observable.js';
import { isUUID } from '../../../../../base/common/uuid.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ProjectBoardCatalogService } from '../../browser/projectBoardCatalog.js';
import { ProjectBoardState } from '../../browser/projectBoardState.js';
import { DEFAULT_PROJECT_BOARD_ID, IProjectBoardCollection } from '../../common/projectBoardCatalog.js';
import { defaultConfiguration, IProjectBoardConfiguration } from '../../common/projectBoardConfiguration.js';

suite('ProjectBoardCatalog', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const key = ProjectBoardCatalogService.STORAGE_KEY;
	const legacyKey = ProjectBoardCatalogService.LEGACY_STORAGE_KEY;
	const defaultId = DEFAULT_PROJECT_BOARD_ID;
	teardown(() => sinon.restore());

	function create(storage = disposables.add(new InMemoryStorageService())) {
		const notifications: (string | Error)[] = [];
		const log = disposables.add(new NullLogService());
		const errors = sinon.spy(log, 'error');
		const notification = new class extends mock<INotificationService>() {
			override error(message: string | Error): void { notifications.push(message); }
		}();
		const catalog = disposables.add(new ProjectBoardCatalogService(storage, log, notification));
		const state = (id: string) => disposables.add(new ProjectBoardState(id, catalog, log, notification));
		return { catalog, state, storage, notifications, errors };
	}

	function collection(configuration = defaultConfiguration()): IProjectBoardCollection {
		return { version: 2, boards: [{ id: defaultId, name: 'Default', configuration }], selectedBoardId: defaultId };
	}

	test('fresh initialization is memory-only and first mutation writes only profile-machine v2', () => {
		const { catalog, storage } = create();
		assert.deepStrictEqual({
			boards: catalog.boards.get(), selected: catalog.selectedBoardId.get(),
			keys: storage.keys(StorageScope.PROFILE, StorageTarget.MACHINE),
		}, { boards: collection().boards, selected: defaultId, keys: [] });
		catalog.renameBoard(defaultId, '  Work  ');
		assert.deepStrictEqual({
			saved: JSON.parse(storage.get(key, StorageScope.PROFILE)!),
			legacy: storage.get(legacyKey, StorageScope.PROFILE),
			userKeys: storage.keys(StorageScope.PROFILE, StorageTarget.USER),
		}, { saved: { ...collection(), boards: [{ ...collection().boards[0], name: 'Work' }] }, legacy: undefined, userKeys: [] });
	});

	test('migration preserves every placement, axis order and preference once, keeping legacy bytes untouched', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const configuration: IProjectBoardConfiguration = {
			version: 1,
			rows: [{ id: 'second', label: 'Second' }, { id: 'first', label: 'First' }],
			columns: [{ id: 'later', label: 'Later' }, { id: 'now', label: 'Now' }],
			placements: [{ cardId: 'missing:chat', rowId: 'second', columnId: 'now' }, { cardId: 'archived:chat', rowId: 'first', columnId: 'later' }],
			autoIncludeSessions: false,
			openChatInSidePanel: true,
			display: { showSessionList: true, showStateDuration: true, showCredits: false, showLastPrompt: false, showModelDetails: true, showPermissionDetails: false },
		};
		const legacy = JSON.stringify(configuration, undefined, 2);
		storage.store(legacyKey, legacy, StorageScope.PROFILE, StorageTarget.MACHINE);
		const store = sinon.spy(storage, 'store');
		const first = create(storage).catalog;
		const second = create(storage).catalog;
		assert.deepStrictEqual({
			first: first.boards.get(), second: second.boards.get(),
			saved: JSON.parse(storage.get(key, StorageScope.PROFILE)!),
			legacy: storage.get(legacyKey, StorageScope.PROFILE), writes: store.callCount,
		}, { first: collection(configuration).boards, second: collection(configuration).boards, saved: collection(configuration), legacy, writes: 1 });
	});

	test('legacy missing auto-inclusion and description toggle retain their established migration semantics', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const { autoIncludeSessions: _autoIncludeSessions, ...configuration } = defaultConfiguration();
		storage.store(legacyKey, JSON.stringify({
			...configuration, display: { showStateDuration: false, showCredits: true, showDescription: false },
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
		const { catalog } = create(storage);
		assert.deepStrictEqual(catalog.boards.get()[0].configuration, {
			...defaultConfiguration(), display: { showStateDuration: false, showCredits: true, showLastPrompt: false },
		});
	});

	test('v2 takes precedence over legacy including an intentionally empty catalog', () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(legacyKey, JSON.stringify(defaultConfiguration()), StorageScope.PROFILE, StorageTarget.MACHINE);
		storage.store(key, '{"version":2,"boards":[]}', StorageScope.PROFILE, StorageTarget.MACHINE);
		const { catalog } = create(storage);
		assert.deepStrictEqual({ boards: catalog.boards.get(), selected: catalog.selectedBoardId.get(), editable: catalog.canEdit }, { boards: [], selected: undefined, editable: true });
		const id = catalog.createBoard('First');
		assert.strictEqual(catalog.selectedBoardId.get(), id);
	});

	test('new boards start fresh and same-chat placements, axes and all settings remain independent', () => {
		const { catalog, state } = create();
		const first = state(defaultId);
		first.moveCard('shared', { rowId: 'general', columnId: 'p0' });
		first.setAutoIncludeSessions(false);
		first.setOpenChatInSidePanel(true);
		first.setDisplayOption('showCredits', true);
		first.addAxis('row', 'Custom');
		const id = catalog.createBoard('Second');
		assert.ok(isUUID(id));
		const second = state(id);
		assert.deepStrictEqual(second.configuration.get(), defaultConfiguration());
		assert.strictEqual(catalog.selectedBoardId.get(), defaultId);
		second.moveCard('shared', { rowId: 'general', columnId: 'p3' });
		second.renameAxis('column', 'p0', 'Now');
		second.setDisplayOption('showLastPrompt', true);
		catalog.selectBoard(id);
		assert.deepStrictEqual({
			firstPlacement: first.getPlacement('shared'), secondPlacement: second.getPlacement('shared'),
			firstId: first.boardId, secondId: second.boardId,
			firstColumn: first.configuration.get().columns[0].label, firstDisplay: first.configuration.get().display,
		}, {
			firstPlacement: { rowId: 'general', columnId: 'p0' }, secondPlacement: { rowId: 'general', columnId: 'p3' },
			firstId: defaultId, secondId: id, firstColumn: 'P0', firstDisplay: { showStateDuration: false, showCredits: true },
		});

		const retained = first.configuration.get();
		second.reset();
		assert.deepStrictEqual({ first: first.configuration.get(), second: second.configuration.get() }, { first: retained, second: defaultConfiguration() });
	});

	test('selection preserves board snapshots and does not republish unchanged configurations', () => {
		const { catalog, state, storage } = create();
		const second = catalog.createBoard('Second');
		const firstState = state(defaultId);
		const before = catalog.boards.get();
		const config = firstState.configuration.get();
		let boardChanges = 0;
		let configChanges = 0;
		disposables.add(autorun(reader => { catalog.boards.read(reader); boardChanges++; }));
		disposables.add(autorun(reader => { firstState.configuration.read(reader); configChanges++; }));
		catalog.selectBoard(second);
		assert.strictEqual(catalog.boards.get(), before);
		assert.strictEqual(firstState.configuration.get(), config);
		assert.deepStrictEqual([boardChanges, configChanges], [1, 1]);
		const write = sinon.spy(storage, 'store');
		catalog.selectBoard(second);
		assert.strictEqual(write.callCount, 0, 'Reselecting the current board does not write storage');
		catalog.renameBoard(second, 'Renamed');
		assert.strictEqual(catalog.boards.get()[0], before[0]);
		assert.strictEqual(catalog.boards.get()[1].configuration, before[1].configuration);
		assert.strictEqual(configChanges, 1);
	});

	test('external selection writes retain identities while real board changes still publish', () => {
		const first = create();
		const id = first.catalog.createBoard('Other');
		const second = create(first.storage);
		const initial = first.catalog.boards.get();
		second.catalog.selectBoard(id);
		assert.strictEqual(first.catalog.boards.get(), initial);
		assert.strictEqual(first.catalog.selectedBoardId.get(), id);
		second.state(id).setAutoIncludeSessions(false);
		assert.strictEqual(first.catalog.boards.get()[0], initial[0]);
		assert.notStrictEqual(first.catalog.boards.get()[1].configuration, initial[1].configuration);
	});

	test('deleting selection chooses first remaining board and deleting last persists empty without backend work', () => {
		const { catalog, state, storage } = create();
		const secondId = catalog.createBoard('Second');
		const thirdId = catalog.createBoard('Third');
		const second = state(secondId);
		second.moveCard('kept-chat', { rowId: 'general', columnId: 'p1' });
		const retained = second.configuration.get();
		const availability: boolean[] = [];
		disposables.add(autorun(reader => availability.push(second.isAvailable.read(reader))));
		catalog.selectBoard(secondId);
		catalog.deleteBoard(secondId);
		assert.deepStrictEqual({
			selected: catalog.selectedBoardId.get(), availability, configuration: second.configuration.get(), editable: second.canEdit,
		}, { selected: defaultId, availability: [true, false], configuration: retained, editable: false });
		assert.throws(() => second.reset(), /no longer exists/);
		assert.throws(() => second.moveCard('kept-chat', undefined), /no longer exists/);
		catalog.deleteBoard(defaultId);
		assert.strictEqual(catalog.selectedBoardId.get(), thirdId);
		catalog.deleteBoard(thirdId);
		assert.deepStrictEqual(JSON.parse(storage.get(key, StorageScope.PROFILE)!), { version: 2, boards: [] });
		assert.deepStrictEqual(create(storage).catalog.boards.get(), []);
	});

	test('concurrent catalogs retain sibling updates and re-read before delayed storage events', () => {
		const first = create();
		const secondId = first.catalog.createBoard('Second');
		const second = create(first.storage);
		first.state(defaultId).setAutoIncludeSessions(false);
		second.state(secondId).setOpenChatInSidePanel(true);
		const external = JSON.stringify({
			version: 2, boards: first.catalog.boards.get().map(board => board.id === secondId ? { ...board, name: 'External' } : board), selectedBoardId: secondId,
		});
		const get = sinon.stub(first.storage, 'get').callThrough();
		get.withArgs(key, StorageScope.PROFILE).returns(external);
		first.state(defaultId).renameAxis('row', 'general', 'Renamed');
		get.restore();
		const saved = JSON.parse(first.storage.get(key, StorageScope.PROFILE)!) as IProjectBoardCollection;
		assert.deepStrictEqual({
			firstAutoInclude: saved.boards[0].configuration.autoIncludeSessions, firstRow: saved.boards[0].configuration.rows[0].label,
			secondName: saved.boards[1].name, secondSidePanel: saved.boards[1].configuration.openChatInSidePanel, selected: saved.selectedBoardId,
		}, { firstAutoInclude: false, firstRow: 'Renamed', secondName: 'External', secondSidePanel: true, selected: secondId });
	});

	test('only deliberate global cleanup removes placements from all boards, including hidden chats', () => {
		const { catalog, state } = create();
		const id = catalog.createBoard('Second');
		for (const boardId of [defaultId, id]) {
			state(boardId).moveCards(['delete', 'hidden', 'retain'], { rowId: 'general', columnId: 'p2' });
		}
		state(defaultId).moveCard('retain', undefined);
		assert.strictEqual(state(id).configuration.get().placements.length, 3);
		catalog.removeCardPlacements(['delete', 'hidden']);
		assert.deepStrictEqual(catalog.boards.get().map(board => board.configuration.placements), [[], [{ cardId: 'retain', rowId: 'general', columnId: 'p2' }]]);
	});

	test('invalid mutation inputs and unknown board IDs never write', () => {
		const { catalog, state, storage } = create();
		const operations = [
			() => state('missing'), () => state(''),
			() => catalog.createBoard('  '), () => catalog.renameBoard(defaultId, ''),
			() => catalog.renameBoard('missing', 'Name'), () => catalog.deleteBoard('missing'),
			() => catalog.selectBoard('missing'), () => catalog.updateBoard('missing', configuration => configuration),
			() => catalog.updateBoard(defaultId, configuration => ({ ...configuration, rows: [] })),
			() => catalog.removeCardPlacements(['']),
		];
		for (const operation of operations) {
			assert.throws(operation);
		}
		assert.deepStrictEqual({ boards: catalog.boards.get(), saved: storage.get(key, StorageScope.PROFILE) }, { boards: collection().boards, saved: undefined });
	});

	const invalidCollections: [string, unknown][] = [
		['null', null], ['array', []], ['future version', { ...collection(), version: 3 }],
		['missing boards', { version: 2 }], ['unknown root field', { ...collection(), runtime: true }],
		['duplicate ids', { ...collection(), boards: [...collection().boards, ...collection().boards] }],
		['empty id', { ...collection(), boards: [{ ...collection().boards[0], id: '' }] }],
		['untrimmed id', { ...collection(), boards: [{ ...collection().boards[0], id: ' default ' }] }],
		['non-string id', { ...collection(), boards: [{ ...collection().boards[0], id: 12 }] }],
		['blank name', { ...collection(), boards: [{ ...collection().boards[0], name: ' ' }] }],
		['untrimmed name', { ...collection(), boards: [{ ...collection().boards[0], name: ' Default ' }] }],
		['non-string name', { ...collection(), boards: [{ ...collection().boards[0], name: false }] }],
		['unknown board field', { ...collection(), boards: [{ ...collection().boards[0], chats: [] }] }],
		['invalid configuration', collection({ ...defaultConfiguration(), rows: [] })],
		['unknown selection', { ...collection(), selectedBoardId: 'missing' }],
		['null selection', { ...collection(), selectedBoardId: null }],
		['selection in empty catalog', { version: 2, boards: [], selectedBoardId: defaultId }],
	];
	for (const [label, value] of invalidCollections) {
		test(`rejects ${label} without legacy fallback or overwriting saved bytes`, () => {
			const storage = disposables.add(new InMemoryStorageService());
			storage.store(legacyKey, JSON.stringify(defaultConfiguration()), StorageScope.PROFILE, StorageTarget.MACHINE);
			const raw = JSON.stringify(value);
			storage.store(key, raw, StorageScope.PROFILE, StorageTarget.MACHINE);
			const { catalog, notifications, errors } = create(storage);
			assert.deepStrictEqual({ editable: catalog.canEdit, boards: catalog.boards.get(), selected: catalog.selectedBoardId.get(), notices: notifications.length, errors: errors.callCount }, { editable: false, boards: [], selected: undefined, notices: 1, errors: 1 });
			assert.throws(() => catalog.createBoard('Do not overwrite'), /editing is disabled/);
			assert.strictEqual(storage.get(key, StorageScope.PROFILE), raw);
		});
	}

	test('corrupt and future legacy formats are retained without v2 writes', () => {
		for (const raw of ['{corrupt', JSON.stringify({ ...defaultConfiguration(), version: 9 })]) {
			const storage = disposables.add(new InMemoryStorageService());
			storage.store(legacyKey, raw, StorageScope.PROFILE, StorageTarget.MACHINE);
			const { catalog, notifications } = create(storage);
			assert.deepStrictEqual({
				editable: catalog.canEdit, notices: notifications.length,
				legacy: storage.get(legacyKey, StorageScope.PROFILE), current: storage.get(key, StorageScope.PROFILE),
			}, { editable: false, notices: 1, legacy: raw, current: undefined });
		}
	});

	test('failed migration preserves legacy and disables editing; a new instance retries safely', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const raw = JSON.stringify({ ...defaultConfiguration(), autoIncludeSessions: false });
		storage.store(legacyKey, raw, StorageScope.PROFILE, StorageTarget.MACHINE);
		const store = sinon.stub(storage, 'store').throws(new Error('disk unavailable'));
		const { catalog, notifications } = create(storage);
		assert.deepStrictEqual({
			editable: catalog.canEdit, notices: notifications.length,
			legacy: storage.get(legacyKey, StorageScope.PROFILE), current: storage.get(key, StorageScope.PROFILE),
		}, { editable: false, notices: 1, legacy: raw, current: undefined });
		store.restore();
		assert.strictEqual(create(storage).catalog.boards.get()[0].configuration.autoIncludeSessions, false);
	});

	test('failed create, rename, selection and delete retain snapshots and saved bytes', () => {
		const { catalog, storage, notifications } = create();
		const id = catalog.createBoard('Second');
		const previous = catalog.boards.get();
		const saved = storage.get(key, StorageScope.PROFILE);
		sinon.stub(storage, 'store').throws(new Error('save failed'));
		for (const operation of [() => catalog.createBoard('Third'), () => catalog.renameBoard(id, 'Renamed'), () => catalog.selectBoard(id), () => catalog.deleteBoard(defaultId)]) {
			assert.throws(operation, /save failed/);
			assert.strictEqual(catalog.boards.get(), previous);
		}
		assert.deepStrictEqual({ selected: catalog.selectedBoardId.get(), saved: storage.get(key, StorageScope.PROFILE), notices: notifications.length }, { selected: defaultId, saved, notices: 4 });
	});

	test('records and nested configuration snapshots are immutable', () => {
		const { catalog, state } = create();
		state(defaultId).moveCard('chat', { rowId: 'general', columnId: 'p0' });
		state(defaultId).setDisplayOption('showCredits', true);
		const boards = catalog.boards.get();
		const board = boards[0];
		for (const value of [boards, board, board.configuration, board.configuration.rows, board.configuration.rows[0], board.configuration.columns, board.configuration.columns[0], board.configuration.placements, board.configuration.placements[0], board.configuration.display]) {
			assert.ok(Object.isFrozen(value));
		}
		assert.throws(() => Object.assign(board, { name: 'Mutated' }), TypeError);
		assert.throws(() => Object.assign(board.configuration, { autoIncludeSessions: false }), TypeError);
	});
});
