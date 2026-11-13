/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { extUriIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../services/editor/common/editorGroupsService.js';
import { IWorkingCopyBackupService } from '../../../../services/workingCopy/common/workingCopyBackup.js';
import { IWorkingCopyIdentifier } from '../../../../services/workingCopy/common/workingCopy.js';
import { IWorkingCopyService } from '../../../../services/workingCopy/common/workingCopyService.js';
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
		/** When set, a failing apply first leaves this content behind, like closing some editors before an editor vetoes. */
		contentOnFailure: string | undefined;
		gate: Promise<void> | undefined;
		auxiliaryEditors = 0;
		/** The editors of the main part, for the backup checks. */
		editors: { resource: URI; dirty?: boolean }[] = [];
		backups: IWorkingCopyIdentifier[] = [];
		readonly registered = new Set<string>();

		saved(): Record<string, string> {
			return Object.fromEntries([...this.sets.values()].map(set => [set.name, set.content]));
		}
	}

	function createFixture(options?: { area?: EditorArea; storage?: InMemoryStorageService; folder?: URI; otherFolders?: URI[]; whenRestored?: Promise<void> }) {
		const errors: string[] = [];
		const infos: string[] = [];
		const onDidChangeCurrentLocation = ds.add(new Emitter<{ readonly reason: 'user' | 'programmatic' }>());
		const onDidRegisterWorkingCopy = ds.add(new Emitter<{ resource: URI }>());
		const storage = options?.storage ?? ds.add(new InMemoryStorageService());
		const area = options?.area ?? new EditorArea();
		let folderUri = options?.folder ?? primary;
		const otherFolders = options?.otherFolders ?? [];

		const editorGroupsService = {
			whenRestored: options?.whenRestored ?? Promise.resolve(),
			parts: [
				{ get groups() { return [{ count: area.content ? 1 : 0, editors: area.editors.map(editor => ({ resource: editor.resource, isDirty: () => !!editor.dirty })) }]; } },
				{ get groups() { return [{ count: area.auxiliaryEditors, editors: [] }]; } },
				{ isTransient: true, groups: [{ count: 5, editors: [] }] }
			],
			saveWorkingSet: (name: string): IEditorWorkingSet => { const id = `set-${++area.counter}`; area.sets.set(id, { name, content: area.content }); return { id, name }; },
			getWorkingSets: () => [...area.sets].map(([id, set]) => ({ id, name: set.name })),
			deleteWorkingSet: (ws: IEditorWorkingSet) => { area.sets.delete(ws.id); },
			applyWorkingSet: async (ws: IEditorWorkingSet | 'empty', applyOptions?: { preserveFocus?: boolean }) => {
				assert.strictEqual(applyOptions?.preserveFocus, true);
				await area.gate;
				const result = area.emptyAlwaysWorks && ws === 'empty' ? true : area.applyResult;
				if (result !== true && area.contentOnFailure !== undefined) {
					area.content = area.contentOnFailure;
				}
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
			{ onDidChangeLocation: onDidChangeCurrentLocation.event, onDidChangeCanSetLocation: Event.None, canSetLocation: () => otherFolders.length === 0 } as unknown as IWorkspaceFolderLocationService,
			{ getWorkspace: () => new Workspace('id', [folderUri, ...otherFolders].map((uri, index) => new WorkspaceFolder({ uri, name: `folder-${index}`, index })), false, null, () => false) } as unknown as IWorkspaceContextService,
			editorGroupsService,
			storage as unknown as IStorageService,
			{ asCanonicalUri: (uri: URI) => uri, extUri: extUriIgnorePathCase } as unknown as IUriIdentityService,
			{ error: (message: string) => errors.push(message), info: (message: string) => infos.push(message) } as unknown as ILogService,
			{ getBackups: async () => area.backups } as unknown as IWorkingCopyBackupService,
			{ has: (identifier: IWorkingCopyIdentifier) => area.registered.has(identifier.resource.toString()), onDidRegister: onDidRegisterWorkingCopy.event } as unknown as IWorkingCopyService
		));

		return {
			area, errors, infos, storage, contribution,
			switchTo(uri: URI, reason: 'user' | 'programmatic' = 'programmatic') { folderUri = uri; onDidChangeCurrentLocation.fire({ reason }); },
			registerWorkingCopy(resource: URI) { area.registered.add(resource.toString()); onDidRegisterWorkingCopy.fire({ resource }); },
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
				afterFailure: { content: '', saved: { [prefix + p]: 'P1', [prefix + a]: 'A1' }, owner: p, errors: 1 },
				content: 'A1',
				saved: { [prefix + p]: 'P1', [prefix + a]: 'A1' },
				owner: a
			}, `${failure}`);
		}
	});

	test('the saved working set of a location that failed to apply is kept until the location is left with editors open, which replaces it', async () => {
		const fixture = createFixture();
		fixture.area.content = 'P1';
		fixture.switchTo(alternate);
		await settle();
		fixture.area.content = 'A1';

		fixture.area.applyResult = 'throw';
		fixture.area.emptyAlwaysWorks = true;
		fixture.switchTo(primary);
		await settle();
		const kept = fixture.area.saved();

		fixture.area.applyResult = true;
		fixture.area.content = 'P2';
		fixture.switchTo(alternate);
		await settle();

		assert.deepStrictEqual({ kept, replaced: fixture.area.saved(), content: fixture.area.content }, {
			kept: { [prefix + p]: 'P1', [prefix + a]: 'A1' },
			replaced: { [prefix + p]: 'P2', [prefix + a]: 'A1' },
			content: 'A1'
		});
	});

	test('a partially applied working set never replaces the saved one of the owner, also after a restart', async () => {
		for (const failure of [false, 'throw'] as const) {
			const storage = ds.add(new InMemoryStorageService());
			const area = new EditorArea();
			const fixture = createFixture({ area, storage });
			area.content = 'P1';
			fixture.switchTo(alternate);
			await settle();
			area.content = 'A1';

			area.applyResult = failure;
			area.contentOnFailure = 'PARTIAL';
			fixture.switchTo(primary);
			await settle();
			const afterFailure = { content: area.content, saved: area.saved() };

			area.applyResult = true;
			fixture.switchTo(URI.file('/work/other'));
			await settle();
			const afterNextSwitch = { content: area.content, saved: area.saved() };

			fixture.switchTo(alternate);
			await settle();

			assert.deepStrictEqual({ afterFailure, afterNextSwitch, content: area.content, saved: area.saved() }, {
				afterFailure: { content: 'PARTIAL', saved: { [prefix + p]: 'P1', [prefix + a]: 'A1' } },
				afterNextSwitch: { content: '', saved: { [prefix + p]: 'P1', [prefix + a]: 'A1' } },
				content: 'A1',
				saved: { [prefix + p]: 'P1', [prefix + a]: 'A1' }
			}, `${failure}`);
		}
	});

	test('a window that starts with a partially applied editor area restores the saved working set of its location', async () => {
		const storage = ds.add(new InMemoryStorageService());
		const area = new EditorArea();
		const first = createFixture({ area, storage });
		area.content = 'P1';
		first.switchTo(alternate);
		await settle();
		area.content = 'A1';
		area.applyResult = false;
		area.contentOnFailure = 'PARTIAL';
		first.switchTo(primary);
		await settle();

		area.applyResult = true;
		createFixture({ area, storage, folder: alternate });
		await settle();

		assert.deepStrictEqual({ content: area.content, saved: area.saved() }, { content: 'A1', saved: { [prefix + p]: 'P1', [prefix + a]: 'A1' } });
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

	test('nothing is switched before the editors are restored, also not a location change that comes in meanwhile', async () => {
		let restored!: () => void;
		const fixture = createFixture({ whenRestored: new Promise<void>(resolve => restored = resolve) });
		fixture.area.content = 'P';
		fixture.switchTo(alternate);
		await settle();
		const beforeRestored = { content: fixture.area.content, saved: fixture.area.saved() };

		restored();
		await settle();

		assert.deepStrictEqual({ beforeRestored, content: fixture.area.content, saved: fixture.area.saved() }, {
			beforeRestored: { content: 'P', saved: {} },
			content: '',
			saved: { [prefix + p]: 'P' }
		});
	});

	test('a switch is deferred while an editor that would close has a backup that is not restored yet, and happens once it is', async () => {
		const untitled = URI.from({ scheme: 'untitled', path: 'Untitled-1' });
		const results: Record<string, string> = {};
		for (const [name, editor, backup] of [['unrestored backup', { resource: untitled }, true], ['dirty editor', { resource: untitled, dirty: true }, true], ['no backup', { resource: untitled }, false]] as const) {
			const fixture = createFixture();
			fixture.area.content = 'P';
			fixture.area.editors = [editor];
			fixture.area.backups = backup ? [{ resource: untitled, typeId: '' }] : [];
			await settle();
			fixture.switchTo(alternate);
			await settle();
			results[name] = fixture.area.content;
			if (name === 'unrestored backup') {
				results.stored = String(fixture.storage.get(FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, StorageScope.WORKSPACE));
				results.infos = String(fixture.infos.length);
				fixture.registerWorkingCopy(untitled);
				await settle();
				results.afterRegister = fixture.area.content;
			}
		}

		assert.deepStrictEqual(results, { 'unrestored backup': 'P', stored: 'undefined', infos: '1', afterRegister: '', 'dirty editor': '', 'no backup': '' });
	});

	test('stored locations that only differ in the casing of their path are the same location', async () => {
		const storage = ds.add(new InMemoryStorageService());
		const area = new EditorArea();
		area.sets.set('legacy', { name: prefix + 'file:///work/Project-Alt', content: 'A1' });
		storage.store(FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, JSON.stringify({ version: 1, owner: 'file:///work/Project', entries: [{ key: 'file:///work/Project-Alt', workingSet: { id: 'legacy', name: prefix + 'file:///work/Project-Alt' } }] }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		area.content = 'P1';

		const fixture = createFixture({ area, storage, folder: primary });
		await settle();
		const afterStartup = area.content;

		fixture.switchTo(alternate);
		await settle();

		assert.deepStrictEqual({ afterStartup, content: area.content }, { afterStartup: 'P1', content: 'A1' });
	});

	test('a workspace with more than one folder switches and saves nothing and keeps the stored working sets', async () => {
		const first = createFixture();
		first.area.content = 'P1';
		first.switchTo(alternate);
		await settle();
		first.area.content = 'M';
		const stored = first.storage.get(FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, StorageScope.WORKSPACE);

		const multiRoot = createFixture({ area: first.area, storage: first.storage, folder: primary, otherFolders: [URI.file('/work/other')] });
		await settle();
		multiRoot.switchTo(URI.file('/work/third'));
		await settle();

		assert.deepStrictEqual({ content: multiRoot.area.content, saved: multiRoot.area.saved(), unchanged: multiRoot.storage.get(FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, StorageScope.WORKSPACE) === stored }, {
			content: 'M',
			saved: { [prefix + p]: 'P1' },
			unchanged: true
		});
	});

	test('the editor area is stored as partial while a working set is applied, so that a restart during the apply restores the saved working set of the owner', async () => {
		const first = createFixture();
		first.area.content = 'P1';
		first.switchTo(alternate);
		await settle();
		first.area.content = 'A1';
		first.switchTo(primary);
		await settle();

		first.holdApply();
		first.switchTo(alternate);
		await settle();
		const duringApply = { partial: first.stored().partial, owner: first.stored().owner };

		// The apply replaced the editors before the window restarted
		first.area.content = 'A-PARTIAL';
		first.area.gate = undefined;
		const restarted = createFixture({ area: first.area, storage: first.storage, folder: primary });
		await settle();

		assert.deepStrictEqual({ duringApply, content: restarted.area.content, saved: restarted.area.saved(), partial: restarted.stored().partial }, {
			duringApply: { partial: true, owner: p },
			content: 'P1',
			saved: { [prefix + p]: 'P1', [prefix + a]: 'A1' },
			partial: undefined
		});
	});
});
