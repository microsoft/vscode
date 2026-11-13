/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../services/editor/common/editorGroupsService.js';
import { FOLDER_LOCATION_MAX_WORKING_SETS, FOLDER_LOCATION_WORKING_SET_NAME_PREFIX, FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, FolderLocationWorkingSetsContribution } from '../../browser/folderLocationWorkingSets.js';

suite('FolderLocationWorkingSetsContribution', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/project');
	const alternate = URI.file('/work/project-alt');

	const prefix = FOLDER_LOCATION_WORKING_SET_NAME_PREFIX;

	/** The editors of a fake editor area, and the working sets saved from it. */
	class EditorArea {
		content = '';
		counter = 0;
		readonly sets = new Map<string, { name: string; content: string }>();
		applyResult: boolean | 'throw' = true;
		/** When set, only applying a saved working set fails: applying an empty editor area works. */
		emptyAlwaysWorks = false;
		gate: Promise<void> | undefined;
		auxiliaryEditors = 0;

		saved(): Record<string, string> {
			return Object.fromEntries([...this.sets.values()].map(set => [set.name, set.content]));
		}
	}

	function createFixture(options?: { area?: EditorArea; storage?: InMemoryStorageService; folder?: URI }) {
		const errors: string[] = [];
		const onDidChangeCurrentLocation = ds.add(new Emitter<{ readonly reason: 'user' | 'programmatic' }>());
		const storage = options?.storage ?? ds.add(new InMemoryStorageService());
		const area = options?.area ?? new EditorArea();
		let folderUri = options?.folder ?? primary;

		const editorGroupsService = {
			parts: [
				{ get groups() { return [{ count: area.content ? 1 : 0 }]; } },
				{ get groups() { return [{ count: area.auxiliaryEditors }]; } },
				{ isTransient: true, groups: [{ count: 5 }] }
			],
			saveWorkingSet: (name: string): IEditorWorkingSet => { const id = `set-${++area.counter}`; area.sets.set(id, { name, content: area.content }); return { id, name }; },
			getWorkingSets: () => [...area.sets].map(([id, set]) => ({ id, name: set.name })),
			deleteWorkingSet: (ws: IEditorWorkingSet) => { area.sets.delete(ws.id); },
			applyWorkingSet: async (ws: IEditorWorkingSet | 'empty', applyOptions?: { preserveFocus?: boolean }) => {
				assert.strictEqual(applyOptions?.preserveFocus, true);
				await area.gate;
				const result = area.emptyAlwaysWorks && ws === 'empty' ? true : area.applyResult;
				if (result === 'throw') {
					throw new Error('apply failed');
				}
				if (result) {
					area.content = ws === 'empty' ? '' : area.sets.get(ws.id)!.content;
				}
				return result === true;
			}
		} as unknown as IEditorGroupsService;

		const contribution = ds.add(new FolderLocationWorkingSetsContribution(
			{ onDidChangeLocation: onDidChangeCurrentLocation.event } as unknown as IWorkspaceFolderLocationService,
			{ getWorkspace: () => new Workspace('id', [new WorkspaceFolder({ uri: folderUri, name: 'project', index: 0 })], false, null, () => false) } as unknown as IWorkspaceContextService,
			editorGroupsService,
			storage as unknown as IStorageService,
			{ asCanonicalUri: (uri: URI) => uri } as unknown as IUriIdentityService,
			{ error: (message: string) => errors.push(message) } as unknown as ILogService
		));

		return {
			area, errors, storage, contribution,
			switchTo(uri: URI, reason: 'user' | 'programmatic' = 'programmatic') { folderUri = uri; onDidChangeCurrentLocation.fire({ reason }); },
			holdApply() { let release!: () => void; area.gate = new Promise<void>(resolve => release = resolve); return () => { area.gate = undefined; release(); }; },
			stored() { return JSON.parse(storage.get(FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, StorageScope.WORKSPACE)!); }
		};
	}

	const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
	const p = primary.toString();
	const a = alternate.toString();

	test('the editors of each location are saved when leaving it and restored when returning, for user and programmatic switches', async () => {
		const fixture = createFixture();
		fixture.area.content = 'P1';

		fixture.switchTo(alternate, 'user');
		await settle();
		const firstVisit = fixture.area.content;
		fixture.area.content = 'A1';
		fixture.switchTo(primary, 'programmatic');
		await settle();
		const backAtPrimary = fixture.area.content;
		fixture.area.content = 'P2';
		fixture.switchTo(alternate);
		await settle();

		assert.deepStrictEqual({ firstVisit, backAtPrimary, backAtAlternate: fixture.area.content, saved: fixture.area.saved() }, {
			firstVisit: '',
			backAtPrimary: 'P1',
			backAtAlternate: 'A1',
			saved: { [prefix + a]: 'A1', [prefix + p]: 'P2' }
		});
	});

	test('an empty editor area saves nothing', async () => {
		const fixture = createFixture();
		fixture.switchTo(alternate);
		await settle();

		assert.deepStrictEqual(fixture.area.saved(), {});
	});

	test('editors that are only in another window are saved', async () => {
		const fixture = createFixture();
		fixture.area.auxiliaryEditors = 1;
		fixture.switchTo(alternate);
		await settle();

		assert.deepStrictEqual(Object.keys(fixture.area.saved()), [prefix + p]);
	});

	test('returning to the oldest location at capacity keeps its working set', async () => {
		const fixture = createFixture();
		fixture.area.content = 'P';
		for (let i = 0; i < FOLDER_LOCATION_MAX_WORKING_SETS; i++) {
			fixture.switchTo(URI.file(`/work/alt-${i}`));
			await settle();
			fixture.area.content = `alt-${i}`;
		}

		fixture.switchTo(primary);
		await settle();

		assert.deepStrictEqual({ content: fixture.area.content, sets: fixture.area.sets.size }, { content: 'P', sets: FOLDER_LOCATION_MAX_WORKING_SETS });
	});

	test('queued switches do not run once the contribution is disposed', async () => {
		const fixture = createFixture();
		fixture.area.content = 'P';
		const release = fixture.holdApply();
		fixture.switchTo(alternate);
		await settle();
		fixture.switchTo(primary);
		fixture.contribution.dispose();
		release();
		await settle();

		assert.deepStrictEqual({ content: fixture.area.content, saved: fixture.area.saved() }, { content: '', saved: { [prefix + p]: 'P' } });
	});

	test('a quick back and forth leaves the last location with its editors', async () => {
		const fixture = createFixture();
		fixture.area.content = 'P';
		fixture.switchTo(alternate);
		fixture.switchTo(primary);
		await settle();

		assert.strictEqual(fixture.area.content, 'P');
	});

	test('a location that stays the same, also one whose metadata changes, switches nothing', async () => {
		const fixture = createFixture();
		fixture.area.content = 'P';
		fixture.switchTo(primary);
		await settle();

		assert.deepStrictEqual({ content: fixture.area.content, saved: fixture.area.saved() }, { content: 'P', saved: {} });
	});

	test('a saved working set that cannot be applied leaves the location empty instead of with the editors of the previous one, which stay restorable', async () => {
		for (const failure of [false, 'throw'] as const) {
			const fixture = createFixture();
			fixture.area.content = 'P1';
			fixture.switchTo(alternate);
			await settle();
			fixture.area.content = 'A1';

			fixture.area.applyResult = failure;
			fixture.area.emptyAlwaysWorks = true;
			fixture.switchTo(primary);
			await settle();
			const afterFailure = { content: fixture.area.content, saved: fixture.area.saved(), owner: fixture.stored().owner, errors: fixture.errors.length };

			fixture.area.applyResult = true;
			fixture.switchTo(alternate);
			await settle();

			assert.deepStrictEqual({ afterFailure, content: fixture.area.content, saved: fixture.area.saved(), owner: fixture.stored().owner }, {
				afterFailure: { content: '', saved: { [prefix + a]: 'A1' }, owner: p, errors: 1 },
				content: 'A1',
				saved: { [prefix + a]: 'A1' },
				owner: a
			}, `${failure}`);
		}
	});

	test('when the empty fallback fails as well, the owner stays and the saved working sets survive, also over later switches', async () => {
		for (const failure of [false, 'throw'] as const) {
			const fixture = createFixture();
			fixture.area.content = 'P1';
			fixture.switchTo(alternate);
			await settle();
			fixture.area.content = 'A1';
			fixture.switchTo(primary);
			await settle();
			fixture.area.content = 'P1';

			fixture.area.applyResult = failure;
			fixture.switchTo(alternate);
			await settle();
			const afterFailure = { content: fixture.area.content, saved: fixture.area.saved(), errors: fixture.errors.length, owner: fixture.stored().owner };

			fixture.area.applyResult = true;
			fixture.switchTo(URI.file('/work/other'));
			await settle();

			assert.deepStrictEqual({ afterFailure, afterNextSwitch: fixture.area.saved() }, {
				afterFailure: { content: 'P1', saved: { [prefix + a]: 'A1', [prefix + p]: 'P1' }, errors: 2, owner: p },
				afterNextSwitch: { [prefix + a]: 'A1', [prefix + p]: 'P1' }
			}, `${failure}`);
		}
	});

	test('switching to another location and back while the first apply is pending restores the editors of the original location', async () => {
		const fixture = createFixture();
		fixture.area.content = 'P1';

		const release = fixture.holdApply();
		fixture.switchTo(alternate);
		await settle();
		fixture.switchTo(primary);
		await settle();
		release();
		await settle();

		assert.deepStrictEqual({ content: fixture.area.content, owner: fixture.stored().owner, errors: fixture.errors }, { content: 'P1', owner: p, errors: [] });
	});

	test('a window that starts at another location than the one it was closed at swaps the editors of the last session out', async () => {
		const first = createFixture();
		first.area.content = 'P1';
		first.switchTo(alternate);
		await settle();
		first.area.content = 'A1';

		// The alternate location is gone: the window starts at the primary with the editors of the alternate
		const restarted = createFixture({ area: first.area, storage: first.storage, folder: primary });
		await settle();
		const afterStartup = { content: restarted.area.content, saved: restarted.area.saved(), owner: restarted.stored().owner };

		restarted.switchTo(alternate);
		await settle();

		assert.deepStrictEqual({ afterStartup, content: restarted.area.content, saved: restarted.area.saved() }, {
			afterStartup: { content: 'P1', saved: { [prefix + a]: 'A1', [prefix + p]: 'P1' }, owner: p },
			content: 'A1',
			saved: { [prefix + a]: 'A1', [prefix + p]: 'P1' }
		});
	});

	test('a window that starts at the location it was closed at keeps its editors', async () => {
		const first = createFixture();
		first.area.content = 'P1';
		first.switchTo(alternate);
		await settle();
		first.area.content = 'A-edited';

		const restarted = createFixture({ area: first.area, storage: first.storage, folder: alternate });
		await settle();

		assert.deepStrictEqual({ content: restarted.area.content, saved: restarted.area.saved() }, { content: 'A-edited', saved: { [prefix + p]: 'P1' } });
	});

	test('working sets that were saved but never stored are deleted on startup, the ones of others and of the mapping are kept', async () => {
		const first = createFixture();
		first.area.content = 'P1';
		first.switchTo(alternate);
		await settle();
		first.area.sets.set('orphan', { name: prefix + '/work/crashed', content: 'x' });
		first.area.sets.set('foreign', { name: 'scm-branch', content: 'y' });

		const restarted = createFixture({ area: first.area, storage: first.storage, folder: alternate });
		await settle();

		assert.deepStrictEqual(Object.keys(restarted.area.saved()).sort(), [prefix + p, 'scm-branch']);
	});

	test('handles of deleted working sets are dropped on load', async () => {
		const first = createFixture();
		first.area.content = 'P1';
		first.switchTo(alternate);
		await settle();
		first.area.sets.clear();

		const restarted = createFixture({ area: first.area, storage: first.storage, folder: alternate });
		restarted.switchTo(primary);
		await settle();

		assert.deepStrictEqual({ content: restarted.area.content, stored: restarted.stored().entries.length }, { content: '', stored: 0 });
	});

	test('the number of stored working sets is capped', async () => {
		const fixture = createFixture();
		fixture.area.content = 'P';
		for (let i = 0; i <= FOLDER_LOCATION_MAX_WORKING_SETS; i++) {
			fixture.switchTo(URI.file(`/work/alt-${i}`));
			await settle();
			fixture.area.content = `alt-${i}`;
		}

		assert.strictEqual(fixture.area.sets.size, FOLDER_LOCATION_MAX_WORKING_SETS);
	});
});
