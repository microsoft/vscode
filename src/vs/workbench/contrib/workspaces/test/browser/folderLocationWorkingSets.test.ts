/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorGroupsService, IEditorWorkingSet } from '../../../../services/editor/common/editorGroupsService.js';
import { FOLDER_LOCATION_MAX_WORKING_SETS, FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, FolderLocationWorkingSetsContribution } from '../../browser/folderLocationWorkingSets.js';

suite('FolderLocationWorkingSetsContribution', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/project');
	const alternate = URI.file('/work/project-alt');

	function createFixture(options?: { enabled?: boolean; editors?: number; storage?: InMemoryStorageService; existingSets?: string[] }) {
		const calls: string[] = [];
		const onDidChangeCurrentLocation = ds.add(new Emitter<{ readonly reason: 'user' | 'programmatic' }>());
		const storage = options?.storage ?? ds.add(new InMemoryStorageService());
		let folderUri = primary;
		let editors = options?.editors ?? 1;
		let counter = 0;
		const sets = new Set(options?.existingSets ?? []);

		const editorGroupsService = {
			mainPart: { get groups() { return [{ count: editors }]; } },
			saveWorkingSet: (name: string): IEditorWorkingSet => { const id = `set-${++counter}`; sets.add(id); calls.push(`save ${name}`); return { id, name }; },
			getWorkingSets: () => [...sets].map(id => ({ id, name: id })),
			deleteWorkingSet: (ws: IEditorWorkingSet) => { sets.delete(ws.id); calls.push(`delete ${ws.id}`); },
			applyWorkingSet: async (ws: IEditorWorkingSet | 'empty', applyOptions?: { preserveFocus?: boolean }) => { calls.push(`apply ${ws === 'empty' ? ws : ws.id} focus=${applyOptions?.preserveFocus}`); return true; }
		} as unknown as IEditorGroupsService;

		const contribution = ds.add(new FolderLocationWorkingSetsContribution(
			{ onDidChangeCurrentLocation: onDidChangeCurrentLocation.event } as unknown as IWorkspaceFolderLocationService,
			{ getWorkspace: () => new Workspace('id', [new WorkspaceFolder({ uri: folderUri, name: 'project', index: 0 })], false, null, () => false) } as unknown as IWorkspaceContextService,
			editorGroupsService,
			{ getValue: () => options?.enabled ?? true } as unknown as IConfigurationService,
			storage as unknown as IStorageService,
			{ asCanonicalUri: (uri: URI) => uri } as unknown as IUriIdentityService,
			{ error: (message: string) => calls.push(`error ${message}`) } as unknown as ILogService
		));

		return {
			calls, storage, contribution, sets,
			switchTo(uri: URI) { folderUri = uri; onDidChangeCurrentLocation.fire({ reason: 'programmatic' }); },
			setEditors(count: number) { editors = count; }
		};
	}

	const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

	test('the first visit to a location is empty and the editors left behind are saved', async () => {
		const fixture = createFixture();
		fixture.switchTo(alternate);
		await settle();

		assert.deepStrictEqual(fixture.calls, [`save ${primary.toString()}`, 'apply empty focus=true']);
	});

	test('returning to a location restores its working set and replaces the saved one', async () => {
		const fixture = createFixture();
		fixture.switchTo(alternate);
		await settle();
		fixture.calls.length = 0;

		fixture.switchTo(primary);
		await settle();

		assert.deepStrictEqual(fixture.calls, [`save ${alternate.toString()}`, 'apply set-1 focus=true']);

		fixture.calls.length = 0;
		fixture.switchTo(alternate);
		await settle();

		assert.deepStrictEqual(fixture.calls, [`save ${primary.toString()}`, 'delete set-1', 'apply set-2 focus=true']);
	});

	test('an empty editor area saves nothing', async () => {
		const fixture = createFixture({ editors: 0 });
		fixture.switchTo(alternate);
		await settle();

		assert.deepStrictEqual(fixture.calls, ['apply empty focus=true']);
	});

	test('a quick back and forth leaves the last location with its working set', async () => {
		const fixture = createFixture();
		fixture.switchTo(alternate);
		fixture.switchTo(primary);
		await settle();

		assert.deepStrictEqual(fixture.calls, [`save ${primary.toString()}`, 'apply empty focus=true', `save ${alternate.toString()}`, 'apply set-1 focus=true']);
	});

	test('nothing happens when the setting is off or the location is unchanged', async () => {
		const disabled = createFixture({ enabled: false });
		disabled.switchTo(alternate);
		const unchanged = createFixture();
		unchanged.switchTo(primary);
		await settle();

		assert.deepStrictEqual({ disabled: disabled.calls, unchanged: unchanged.calls }, { disabled: [], unchanged: [] });
	});

	test('working sets are persisted and handles of deleted sets are dropped on load', async () => {
		const first = createFixture();
		first.switchTo(alternate);
		await settle();
		const stored = first.storage.get(FOLDER_LOCATION_WORKING_SETS_STORAGE_KEY, StorageScope.WORKSPACE);

		const restored = createFixture({ storage: first.storage, existingSets: ['set-1'] });
		restored.switchTo(alternate);
		await settle();
		const dropped = createFixture({ storage: first.storage, existingSets: [] });
		dropped.switchTo(alternate);
		await settle();

		assert.deepStrictEqual(
			{ stored: JSON.parse(stored!), restored: restored.calls, dropped: dropped.calls },
			{
				stored: { version: 1, entries: [{ key: primary.toString(), workingSet: { id: 'set-1', name: primary.toString() } }] },
				restored: [`save ${primary.toString()}`, 'delete set-1', 'apply empty focus=true'],
				dropped: [`save ${primary.toString()}`, 'apply empty focus=true']
			});
	});

	test('the number of stored working sets is capped', async () => {
		const fixture = createFixture();
		for (let i = 0; i <= FOLDER_LOCATION_MAX_WORKING_SETS; i++) {
			fixture.switchTo(URI.file(`/work/alt-${i}`));
			await settle();
		}

		assert.strictEqual(fixture.sets.size, FOLDER_LOCATION_MAX_WORKING_SETS);
	});
});
