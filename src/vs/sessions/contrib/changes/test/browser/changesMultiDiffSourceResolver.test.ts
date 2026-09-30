/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ISessionChangeset, ISessionFileChange } from '../../../../services/sessions/common/session.js';
import { ChangesMultiDiffSourceResolver } from '../../browser/changesMultiDiffSourceResolver.js';
import { ISessionChangesService } from '../../common/sessionChangesService.js';
import { IChangesViewService } from '../../common/changesViewService.js';

suite('ChangesMultiDiffSourceResolver', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('clears the previous diff while a newly selected changeset loads', async () => {
		const sessionResource = URI.parse('agent-host:test-session');
		const sourceResource = URI.parse('changes-multi-diff-source:test-session');
		const branchChangeset = upcastPartial<ISessionChangeset>({ id: 'branch' });
		const turnChangeset = upcastPartial<ISessionChangeset>({ id: 'turn' });
		const branchChange = createChange('/workspace/branch.ts');
		const turnChange = createChange('/workspace/turn.ts');
		const activeChangeset = observableValue<ISessionChangeset | undefined>('activeChangeset', branchChangeset);
		const activeChanges = observableValue<readonly ISessionFileChange[]>('activeChanges', [branchChange]);
		const loading = observableValue('loading', false);

		const changesViewService = new class extends mock<IChangesViewService>() {
			override readonly activeSessionResourceObs = observableValue<URI | undefined>(this, sessionResource);
			override readonly activeSessionChangesetObs = activeChangeset;
			override readonly activeSessionChangesObs = activeChanges;
			override readonly activeSessionLoadingObs = derived(this, reader => loading.read(reader));
		}();
		let resolver: IMultiDiffSourceResolver | undefined;
		const resolverService = new class extends mock<IMultiDiffSourceResolverService>() {
			override registerResolver(value: IMultiDiffSourceResolver) {
				resolver = value;
				return Disposable.None;
			}
		}();
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override getSessionResource(resource: URI): URI | undefined {
				return resource.toString() === sourceResource.toString() ? sessionResource : undefined;
			}
		}();
		disposables.add(new ChangesMultiDiffSourceResolver(changesViewService, resolverService, sessionChangesService));
		const source = await resolver!.resolveDiffSource(sourceResource);
		const observedChanges: string[][] = [];
		const recordChanges = () => observedChanges.push(source.resources.value.map(item => item.modifiedUri!.path));

		recordChanges();
		disposables.add(source.resources.onDidChange(recordChanges));
		transaction(tx => {
			loading.set(true, tx);
			activeChanges.set([], tx);
		});
		transaction(tx => {
			activeChangeset.set(turnChangeset, tx);
			activeChanges.set([], tx);
		});
		transaction(tx => {
			activeChanges.set([turnChange], tx);
			loading.set(false, tx);
		});

		assert.deepStrictEqual(observedChanges, [
			['/workspace/branch.ts'],
			[],
			['/workspace/turn.ts'],
		]);
	});

	test('preserves the previous diff while an equivalent changeset projection loads', async () => {
		const sessionResource = URI.parse('agent-host:test-session');
		const sourceResource = URI.parse('changes-multi-diff-source:test-session');
		const backingResource = URI.parse('ahp-folder-changeset://scope/session/folder/changeset/branch');
		const initialChangeset = upcastPartial<ISessionChangeset>({ id: 'branch', resource: backingResource });
		const replacementChangeset = upcastPartial<ISessionChangeset>({ id: 'branch', resource: backingResource });
		const branchChange = createChange('/workspace/branch.ts');
		const activeChangeset = observableValue<ISessionChangeset | undefined>('activeChangeset', initialChangeset);
		const activeChanges = observableValue<readonly ISessionFileChange[]>('activeChanges', [branchChange]);
		const loading = observableValue('loading', false);

		const changesViewService = new class extends mock<IChangesViewService>() {
			override readonly activeSessionResourceObs = observableValue<URI | undefined>(this, sessionResource);
			override readonly activeSessionChangesetObs = activeChangeset;
			override readonly activeSessionChangesObs = activeChanges;
			override readonly activeSessionLoadingObs = derived(this, reader => loading.read(reader));
		}();
		let resolver: IMultiDiffSourceResolver | undefined;
		const resolverService = new class extends mock<IMultiDiffSourceResolverService>() {
			override registerResolver(value: IMultiDiffSourceResolver) {
				resolver = value;
				return Disposable.None;
			}
		}();
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override getSessionResource(resource: URI): URI | undefined {
				return resource.toString() === sourceResource.toString() ? sessionResource : undefined;
			}
		}();
		disposables.add(new ChangesMultiDiffSourceResolver(changesViewService, resolverService, sessionChangesService));
		const source = await resolver!.resolveDiffSource(sourceResource);
		const observedChanges: string[][] = [];
		const recordChanges = () => observedChanges.push(source.resources.value.map(item => item.modifiedUri!.path));

		recordChanges();
		disposables.add(source.resources.onDidChange(recordChanges));
		transaction(tx => {
			activeChangeset.set(replacementChangeset, tx);
			activeChanges.set([], tx);
			loading.set(true, tx);
		});

		assert.deepStrictEqual(observedChanges, [
			['/workspace/branch.ts'],
		]);
	});
});

function createChange(path: string): ISessionFileChange {
	const resource = URI.file(path);
	return upcastPartial<ISessionFileChange>({
		uri: resource,
		modifiedUri: resource,
	});
}
