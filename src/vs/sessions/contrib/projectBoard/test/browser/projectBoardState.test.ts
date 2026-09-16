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
import { ProjectBoardState } from '../../browser/projectBoardState.js';
import { IProjectBoardConfiguration } from '../../common/projectBoardConfiguration.js';

suite('ProjectBoardState', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const key = ProjectBoardState.STORAGE_KEY;
	const defaults: IProjectBoardConfiguration = {
		version: 1,
		rows: [{ id: 'general', label: 'General' }],
		columns: [
			{ id: 'p0', label: 'P0' }, { id: 'p1', label: 'P1' },
			{ id: 'p2', label: 'P2' }, { id: 'p3', label: 'P3' },
		],
		placements: [],
		autoIncludeSessions: true,
	};

	teardown(() => sinon.restore());

	function create(storage = disposables.add(new InMemoryStorageService())) {
		const notifications: (string | Error)[] = [];
		const log = disposables.add(new NullLogService());
		const errors = sinon.spy(log, 'error');
		const notification = new class extends mock<INotificationService>() {
			override error(message: string | Error): void { notifications.push(message); }
		}();
		const state = disposables.add(new ProjectBoardState(storage, log, notification));
		return { state, storage, notifications, errors };
	}

	test('PB-06 defaults work without storage initialization and are not written on construction', () => {
		const { state, storage } = create();
		assert.deepStrictEqual(state.configuration.get(), defaults);
		assert.strictEqual(state.canEdit, true);
		assert.strictEqual(storage.get(key, StorageScope.PROFILE), undefined);
		assert.strictEqual(state.getPlacement('missing'), undefined);
	});

	test('PB-06 mutations roundtrip through new state and storage instances with only profile-machine configuration', () => {
		const { state, storage } = create();
		const row = state.addAxis('row', '  Engineering  ');
		const column = state.addAxis('column', 'Later');
		state.renameAxis('column', 'p0', 'Now');
		state.reorderAxis('column', column, 0);
		state.moveCard('missing-provider:chat', { rowId: row, columnId: column });
		const saved = storage.get(key, StorageScope.PROFILE)!;
		const restoredStorage = disposables.add(new InMemoryStorageService());
		restoredStorage.store(key, saved, StorageScope.PROFILE, StorageTarget.MACHINE);
		assert.deepStrictEqual(create(restoredStorage).state.configuration.get(), state.configuration.get());
		assert.deepStrictEqual(Object.keys(JSON.parse(saved)).sort(), ['autoIncludeSessions', 'columns', 'placements', 'rows', 'version']);
		assert.deepStrictEqual(storage.keys(StorageScope.PROFILE, StorageTarget.MACHINE), [key]);
		assert.deepStrictEqual(storage.keys(StorageScope.PROFILE, StorageTarget.USER), []);
		assert.strictEqual(storage.get(key, StorageScope.WORKSPACE), undefined);
		assert.strictEqual(storage.get(key, StorageScope.APPLICATION), undefined);
	});

	test('PB-18 display toggles are opt-in, independent, immutable and persist with placements', () => {
		const { state, storage } = create();
		assert.strictEqual(state.configuration.get().display, undefined);
		state.moveCard('chat', { rowId: 'general', columnId: 'p2' });
		state.setDisplayOption('showStateDuration', true);
		assert.deepStrictEqual(state.configuration.get().display, { showStateDuration: true, showCredits: false });
		const other = create(storage).state;
		other.setDisplayOption('showCredits', true);
		state.setDisplayOption('showStateDuration', false);
		assert.deepStrictEqual(other.configuration.get().display, { showStateDuration: false, showCredits: true });
		assert.deepStrictEqual(create(storage).state.configuration.get(), state.configuration.get());
		assert.deepStrictEqual(state.getPlacement('chat'), { rowId: 'general', columnId: 'p2' });
		assert.ok(Object.isFrozen(state.configuration.get().display));
		state.reset();
		assert.strictEqual(state.configuration.get().display, undefined);
	});

	test('auto-include sessions defaults on, persists, and legacy configuration remains enabled', () => {
		const { state, storage } = create();
		state.setAutoIncludeSessions(false);
		assert.strictEqual(create(storage).state.configuration.get().autoIncludeSessions, false);
		const legacy = {
			version: defaults.version,
			rows: defaults.rows,
			columns: defaults.columns,
			placements: defaults.placements,
		};
		storage.store(key, JSON.stringify(legacy), StorageScope.PROFILE, StorageTarget.MACHINE);
		assert.strictEqual(create(storage).state.configuration.get().autoIncludeSessions, true);
	});

	test('session list preference defaults off, persists and resets without changing placements', () => {
		const { state, storage } = create();
		const initiallyEnabled = !!state.configuration.get().display?.showSessionList;
		state.moveCard('chat', { rowId: 'general', columnId: 'p1' });
		state.setDisplayOption('showSessionList', true);
		const restored = create(storage).state;
		const enabled = restored.configuration.get().display?.showSessionList;
		restored.setDisplayOption('showSessionList', false);
		const disabled = state.configuration.get().display?.showSessionList;
		const placement = state.getPlacement('chat');
		state.reset();
		assert.deepStrictEqual({ initiallyEnabled, enabled, disabled, placement, reset: state.configuration.get() }, {
			initiallyEnabled: false, enabled: true, disabled: false,
			placement: { rowId: 'general', columnId: 'p1' }, reset: defaults,
		});
	});

	test('invalid saved session list preference is reported instead of silently ignored', () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(key, JSON.stringify({ ...defaults, display: { showStateDuration: false, showCredits: false, showSessionList: 'true' } }), StorageScope.PROFILE, StorageTarget.MACHINE);
		const { state, notifications } = create(storage);
		assert.deepStrictEqual({ canEdit: state.canEdit, errors: notifications.length }, { canEdit: false, errors: 1 });
	});

	test('side-panel opening defaults off and roundtrips independently of board contents', () => {
		const { state, storage } = create();
		const legacy = JSON.stringify(defaults);
		storage.store(key, legacy, StorageScope.PROFILE, StorageTarget.MACHINE);
		assert.strictEqual(!!create(storage).state.configuration.get().openChatInSidePanel, false);
		state.moveCard('child', { rowId: 'general', columnId: 'p1' });
		state.setDisplayOption('showCredits', true);
		state.setOpenChatInSidePanel(true);
		const restored = create(storage).state;
		assert.deepStrictEqual(restored.configuration.get(), {
			...defaults,
			placements: [{ cardId: 'child', rowId: 'general', columnId: 'p1' }],
			display: { showStateDuration: false, showCredits: true },
			openChatInSidePanel: true,
		});
		restored.setOpenChatInSidePanel(false);
		assert.strictEqual(state.configuration.get().openChatInSidePanel, false);
		state.reset();
		assert.deepStrictEqual(create(storage).state.configuration.get(), defaults);
	});

	test('failed side-panel preference writes preserve the previous choice and notify', () => {
		const { state, storage, notifications } = create();
		state.setOpenChatInSidePanel(true);
		const previous = state.configuration.get();
		sinon.stub(storage, 'store').throws(new Error('settings write failed'));
		assert.throws(() => state.setOpenChatInSidePanel(false), /settings write failed/);
		assert.deepStrictEqual({ configuration: state.configuration.get(), errors: notifications.length }, { configuration: previous, errors: 1 });
	});

	test('batch placement explicitly includes every visible chat from a dropped session', () => {
		const { state } = create();
		state.moveCards(['first', 'second'], { rowId: 'general', columnId: 'p1' });
		assert.deepStrictEqual(state.configuration.get().placements, [
			{ cardId: 'first', rowId: 'general', columnId: 'p1' },
			{ cardId: 'second', rowId: 'general', columnId: 'p1' },
		]);
	});

	test('PB-18 failed preference writes preserve the last value and notify', () => {
		const { state, storage, notifications } = create();
		state.setDisplayOption('showCredits', true);
		const previous = state.configuration.get();
		sinon.stub(storage, 'store').throws(new Error('settings write failed'));
		assert.throws(() => state.setDisplayOption('showCredits', false), /settings write failed/);
		assert.strictEqual(state.configuration.get(), previous);
		assert.strictEqual(notifications.length, 1);
	});

	test('PB-18 legacy description settings migrate to last prompt and new detail rows persist independently', () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(key, JSON.stringify({ ...defaults, display: { showStateDuration: true, showCredits: true, showDescription: false } }), StorageScope.PROFILE, StorageTarget.MACHINE);
		const { state, notifications } = create(storage);
		assert.strictEqual(state.canEdit, true);
		assert.strictEqual(state.configuration.get().display?.showLastPrompt, false);
		state.setDisplayOption('showModelDetails', true);
		state.setDisplayOption('showPermissionDetails', true);
		assert.deepStrictEqual(create(storage).state.configuration.get().display, { showStateDuration: true, showCredits: true, showLastPrompt: false, showModelDetails: true, showPermissionDetails: true });
		state.setDisplayOption('showCredits', false);
		assert.strictEqual(state.configuration.get().display?.showLastPrompt, false);
		state.setDisplayOption('showLastPrompt', true);
		assert.strictEqual(create(storage).state.configuration.get().display?.showLastPrompt, true);
		assert.deepStrictEqual(notifications, []);
	});

	for (const kind of ['row', 'column'] as const) {
		test(`PB-10 ${kind} IDs remain stable through rename and reorder`, () => {
			const { state } = create();
			const id = state.addAxis(kind, 'Added');
			const other = state.addAxis(kind, 'Other');
			const placement = { rowId: kind === 'row' ? id : 'general', columnId: kind === 'column' ? id : 'p0' };
			state.moveCard('chat', placement);
			state.renameAxis(kind, id, '  Renamed  ');
			state.reorderAxis(kind, id, 0);
			const axes = kind === 'row' ? state.configuration.get().rows : state.configuration.get().columns;
			assert.ok(isUUID(id));
			assert.notStrictEqual(id, other);
			assert.deepStrictEqual(axes[0], { id, label: 'Renamed' });
			assert.deepStrictEqual(state.getPlacement('chat'), placement);
		});

		test(`PB-09/PB-10/PB-12 deleting occupied ${kind} clears every placement including hidden archived and missing chats`, () => {
			const { state } = create();
			const id = state.addAxis(kind, 'Occupied');
			const placement = { rowId: kind === 'row' ? id : 'general', columnId: kind === 'column' ? id : 'p0' };
			for (const cardId of ['visible', 'hidden-archived', 'missing-provider', 'deleted-chat']) {
				state.moveCard(cardId, placement);
			}
			state.moveCard('unaffected', { rowId: 'general', columnId: 'p1' });
			assert.strictEqual(state.getAffectedCardCount(kind, id), 4);
			state.deleteAxis(kind, id);
			assert.deepStrictEqual(state.configuration.get().placements, [{ cardId: 'unaffected', rowId: 'general', columnId: 'p1' }]);
		});

		test(`PB-10 cannot delete last ${kind}`, () => {
			const { state, notifications } = create();
			if (kind === 'column') {
				for (const id of ['p1', 'p2', 'p3']) {
					state.deleteAxis(kind, id);
				}
			}
			const previous = state.configuration.get();
			assert.throws(() => state.deleteAxis(kind, kind === 'row' ? 'general' : 'p0'), /at least one/);
			assert.strictEqual(state.configuration.get(), previous);
			assert.strictEqual(notifications.length, 1);
		});
	}

	test('PB-03/PB-12 move accepts undiscovered chats, replaces a placement, and clears it without lifecycle operations', () => {
		const { state } = create();
		state.moveCard('absent', { rowId: 'general', columnId: 'p0' });
		state.moveCard('absent', { rowId: 'general', columnId: 'p3' });
		assert.deepStrictEqual(state.configuration.get().placements, [{ cardId: 'absent', rowId: 'general', columnId: 'p3' }]);
		state.moveCard('absent', undefined);
		assert.deepStrictEqual(state.configuration.get().placements, []);
	});

	test('PB-10 invalid labels, unknown IDs, and invalid reorder positions reject without changing state or storage', () => {
		const { state, storage, notifications, errors } = create();
		const operations = [
			...['', ' \t\n'].flatMap(label => [
				() => state.addAxis('row', label),
				() => state.renameAxis('column', 'p0', label),
			]),
			() => state.renameAxis('row', 'missing', 'Label'),
			() => state.reorderAxis('column', 'missing', 0),
			() => state.deleteAxis('row', 'missing'),
			...[-1, 4, 0.5, NaN, Infinity].map(index => () => state.reorderAxis('column', 'p0', index)),
			() => state.moveCard('', undefined),
			() => state.moveCard('chat', { rowId: 'missing', columnId: 'p0' }),
			() => state.moveCard('chat', { rowId: 'general', columnId: 'missing' }),
		];
		const previous = state.configuration.get();
		for (const operation of operations) {
			assert.throws(operation);
			assert.strictEqual(state.configuration.get(), previous);
			assert.strictEqual(storage.get(key, StorageScope.PROFILE), undefined);
		}
		assert.strictEqual(notifications.length, operations.length);
		assert.strictEqual(errors.callCount, operations.length);
		assert.throws(() => state.getAffectedCardCount('row', 'missing'));
	});

	const placement = { cardId: 'chat', rowId: 'general', columnId: 'p0' };
	const invalidStates: [string, unknown][] = [
		['null display', { ...defaults, display: null }],
		['missing display key', { ...defaults, display: { showCredits: true } }],
		['invalid display toggle', { ...defaults, display: { showStateDuration: true, showCredits: 'yes' } }],
		['invalid description toggle', { ...defaults, display: { showStateDuration: true, showCredits: false, showDescription: 'yes' } }],
		['invalid model details toggle', { ...defaults, display: { showStateDuration: true, showCredits: false, showModelDetails: 1 } }],
		['unknown display key', { ...defaults, display: { showStateDuration: true, showCredits: true, other: false } }],
		['invalid auto-include sessions option', { ...defaults, autoIncludeSessions: 'yes' }],
		['invalid side-panel opening option', { ...defaults, openChatInSidePanel: 'yes' }],
		['null side-panel opening option', { ...defaults, openChatInSidePanel: null }],
		['null', null],
		['array', []],
		['unknown version', { ...defaults, version: 2 }],
		['missing version', { rows: defaults.rows, columns: defaults.columns, placements: [] }],
		['empty rows', { ...defaults, rows: [] }],
		['empty columns', { ...defaults, columns: [] }],
		['wrong axis type', { ...defaults, rows: {} }],
		['duplicate rows', { ...defaults, rows: [...defaults.rows, ...defaults.rows] }],
		['duplicate columns', { ...defaults, columns: [...defaults.columns, ...defaults.columns] }],
		['blank label', { ...defaults, rows: [{ id: 'general', label: '  ' }] }],
		['untrimmed label', { ...defaults, rows: [{ id: 'general', label: ' General ' }] }],
		['empty axis ID', { ...defaults, rows: [{ id: '', label: 'General' }] }],
		['non-string axis ID', { ...defaults, rows: [{ id: 1, label: 'General' }] }],
		['runtime snapshot', { ...defaults, transcript: 'must not persist' }],
		['axis extra fields', { ...defaults, rows: [{ ...defaults.rows[0], status: 'busy' }] }],
		['null placement', { ...defaults, placements: [null] }],
		['empty card ID', { ...defaults, placements: [{ ...placement, cardId: '' }] }],
		['unknown row', { ...defaults, placements: [{ ...placement, rowId: 'missing' }] }],
		['unknown column', { ...defaults, placements: [{ ...placement, columnId: 'missing' }] }],
		['duplicate card', { ...defaults, placements: [placement, placement] }],
		['placement extra fields', { ...defaults, placements: [{ ...placement, prompt: 'not board data' }] }],
	];

	for (const [name, value] of invalidStates) {
		test(`PB-06 rejects ${name}, preserving original storage and disabling edits`, () => {
			const storage = disposables.add(new InMemoryStorageService());
			const raw = JSON.stringify(value);
			storage.store(key, raw, StorageScope.PROFILE, StorageTarget.MACHINE);
			const { state, notifications, errors } = create(storage);
			assert.strictEqual(state.canEdit, false);
			assert.strictEqual(notifications.length, 1);
			assert.strictEqual(errors.callCount, 1);
			assert.throws(() => state.addAxis('row', 'Do not overwrite'), /editing is disabled/);
			assert.strictEqual(storage.get(key, StorageScope.PROFILE), raw);
		});
	}

	for (const raw of ['', '{invalid json']) {
		test(`PB-06 rejects corrupt JSON ${JSON.stringify(raw)} without replacing it`, () => {
			const storage = disposables.add(new InMemoryStorageService());
			storage.store(key, raw, StorageScope.PROFILE, StorageTarget.MACHINE);
			const { state, notifications } = create(storage);
			assert.strictEqual(state.canEdit, false);
			assert.strictEqual(notifications.length, 1);
			assert.throws(() => state.moveCard('chat', undefined));
			assert.strictEqual(storage.get(key, StorageScope.PROFILE), raw);
		});
	}

	test('PB-06 failed stores retain previous configuration and report errors before throwing', () => {
		const { state, storage, notifications, errors } = create();
		state.moveCard('chat', { rowId: 'general', columnId: 'p0' });
		const previous = state.configuration.get();
		const saved = storage.get(key, StorageScope.PROFILE);
		const observations: IProjectBoardConfiguration[] = [];
		disposables.add(autorun(reader => observations.push(state.configuration.read(reader))));
		const failure = new Error('disk unavailable');
		const stub = sinon.stub(storage, 'store').throws(failure);
		assert.throws(() => state.deleteAxis('column', 'p0'), /disk unavailable/);
		assert.strictEqual(state.configuration.get(), previous);
		assert.strictEqual(storage.get(key, StorageScope.PROFILE), saved);
		assert.deepStrictEqual(observations, [previous]);
		assert.strictEqual(notifications.length, 1);
		assert.strictEqual(errors.callCount, 1);
		assert.strictEqual(state.canEdit, true);
		stub.restore();
		state.renameAxis('row', 'general', 'Retry succeeds');
		assert.strictEqual(state.configuration.get().rows[0].label, 'Retry succeeds');
	});

	test('PB-06 failed reads disable editing and preserve saved bytes', () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(key, JSON.stringify(defaults), StorageScope.PROFILE, StorageTarget.MACHINE);
		const get = sinon.stub(storage, 'get').throws(new Error('read failed'));
		const { state, notifications } = create(storage);
		assert.strictEqual(state.canEdit, false);
		assert.strictEqual(notifications.length, 1);
		get.restore();
		assert.throws(() => state.addAxis('row', 'Blocked'));
		assert.strictEqual(storage.get(key, StorageScope.PROFILE), JSON.stringify(defaults));
	});

	test('PB-06 profile changes are observed and subsequent mutations retain external updates', () => {
		const { state, storage } = create();
		const other = create(storage).state;
		const row = other.addAxis('row', 'Other window');
		assert.strictEqual(state.configuration.get().rows[1].id, row);
		state.moveCard('chat', { rowId: row, columnId: 'p0' });
		assert.deepStrictEqual(other.getPlacement('chat'), { rowId: row, columnId: 'p0' });
		storage.store(key, 'not valid', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		assert.strictEqual(state.canEdit, true);
		storage.remove(key, StorageScope.PROFILE);
		assert.deepStrictEqual(state.configuration.get(), defaults);
		assert.deepStrictEqual(other.configuration.get(), defaults);
	});

	test('PB-06 invalid external changes retain last valid state and lock editing until restart', () => {
		const { state, storage, notifications } = create();
		state.addAxis('row', 'Retained');
		const previous = state.configuration.get();
		const editable: boolean[] = [];
		disposables.add(autorun(reader => { state.configuration.read(reader); editable.push(state.canEdit); }));
		storage.store(key, '{"version":2}', StorageScope.PROFILE, StorageTarget.MACHINE, true);
		assert.deepStrictEqual(state.configuration.get(), previous);
		assert.deepStrictEqual(editable, [true, false]);
		assert.strictEqual(notifications.length, 1);
		assert.throws(() => state.renameAxis('row', 'general', 'Blocked'));
		assert.strictEqual(storage.get(key, StorageScope.PROFILE), '{"version":2}');
		storage.remove(key, StorageScope.PROFILE);
		assert.strictEqual(state.canEdit, false);
		assert.strictEqual(create(storage).state.canEdit, true);
	});

	test('PB-06 rechecks storage before editing when an external change event has not arrived', () => {
		const { state, storage } = create();
		const external = {
			...defaults,
			rows: [...defaults.rows, { id: 'external', label: 'External' }],
			placements: [{ cardId: 'external-chat', rowId: 'external', columnId: 'p0' }],
		};
		const get = sinon.stub(storage, 'get').callThrough();
		get.withArgs(key, StorageScope.PROFILE).returns(JSON.stringify(external));
		state.renameAxis('column', 'p1', 'Soon');
		get.restore();
		const saved = JSON.parse(storage.get(key, StorageScope.PROFILE)!);
		assert.deepStrictEqual(saved.rows, external.rows);
		assert.deepStrictEqual(saved.placements, external.placements);
		assert.strictEqual(saved.columns[1].label, 'Soon');
	});

	test('PB-06 explicit reset persists defaults and reactively unlocks a corrupt board', () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(key, '{"version":2}', StorageScope.PROFILE, StorageTarget.MACHINE);
		const { state } = create(storage);
		const editable: boolean[] = [];
		disposables.add(autorun(reader => { state.configuration.read(reader); editable.push(state.canEdit); }));
		state.reset();
		assert.deepStrictEqual(editable, [false, true]);
		assert.deepStrictEqual(state.configuration.get(), defaults);
		assert.deepStrictEqual(JSON.parse(storage.get(key, StorageScope.PROFILE)!), defaults);
		assert.deepStrictEqual(create(storage).state.configuration.get(), defaults);
		state.addAxis('row', 'Recovered');
		assert.strictEqual(state.configuration.get().rows[1].label, 'Recovered');
	});

	test('PB-06 failed reset preserves corrupt bytes, previous state, and the editing lock', () => {
		const { state, storage, notifications, errors } = create();
		state.addAxis('row', 'Retained');
		storage.store(key, '{"version":2}', StorageScope.PROFILE, StorageTarget.MACHINE);
		const previous = state.configuration.get();
		const observations: IProjectBoardConfiguration[] = [];
		disposables.add(autorun(reader => observations.push(state.configuration.read(reader))));
		sinon.stub(storage, 'store').throws(new Error('reset store failed'));
		assert.throws(() => state.reset(), /reset store failed/);
		assert.strictEqual(state.configuration.get(), previous);
		assert.strictEqual(state.canEdit, false);
		assert.strictEqual(storage.get(key, StorageScope.PROFILE), '{"version":2}');
		assert.deepStrictEqual(observations, [previous]);
		assert.strictEqual(notifications.length, 2);
		assert.strictEqual(errors.callCount, 2);
	});

	test('PB-06 reset on an editable board clears all axes and unavailable placements', () => {
		const { state, storage } = create();
		const rowId = state.addAxis('row', 'Custom');
		state.moveCard('unavailable-chat', { rowId, columnId: 'p0' });
		state.reset();
		assert.deepStrictEqual(state.configuration.get(), defaults);
		assert.deepStrictEqual(JSON.parse(storage.get(key, StorageScope.PROFILE)!), defaults);
		assert.strictEqual(state.canEdit, true);
	});

	test('configuration snapshots cannot be mutated outside persistence', () => {
		const { state } = create();
		const configuration = state.configuration.get();
		assert.ok(Object.isFrozen(configuration));
		assert.ok(Object.isFrozen(configuration.rows));
		assert.ok(Object.isFrozen(configuration.rows[0]));
	});
});
