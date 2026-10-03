/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ISessionFileChange } from '../../../../services/sessions/common/session.js';
import { ChangesMultiDiffSourceResolver } from '../../browser/changesMultiDiffSourceResolver.js';
import { ISessionChangesService } from '../../common/sessionChangesService.js';
import { IChangesViewService } from '../../common/changesViewService.js';

suite('ChangesMultiDiffSourceResolver', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('publishes file changes while the active session remains loading', async () => {
		const sessionResource = URI.parse('agent-host:test-session');
		const sourceResource = URI.parse('changes-multi-diff-source:test-session');
		const branchChange = createChange('/workspace/branch.ts');
		const turnChange = createChange('/workspace/turn.ts');
		const activeChanges = observableValue<readonly ISessionFileChange[]>('activeChanges', [branchChange]);
		const loading = observableValue('loading', true);

		const changesViewService = new class extends mock<IChangesViewService>() {
			override readonly activeSessionResourceObs = observableValue<URI | undefined>(this, sessionResource);
			override readonly activeSessionChangesObs = activeChanges;
			override readonly activeSessionLoadingObs = loading;
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
		activeChanges.set([turnChange], undefined);

		assert.deepStrictEqual(observedChanges, [
			['/workspace/branch.ts'],
			['/workspace/turn.ts'],
		]);
	});

	test('preserves the previous diff while another session is active', async () => {
		const sessionResource = URI.parse('agent-host:test-session');
		const otherSessionResource = URI.parse('agent-host:other-session');
		const sourceResource = URI.parse('changes-multi-diff-source:test-session');
		const branchChange = createChange('/workspace/branch.ts');
		const otherChange = createChange('/workspace/other.ts');
		const activeSessionResource = observableValue<URI | undefined>('activeSessionResource', sessionResource);
		const activeChanges = observableValue<readonly ISessionFileChange[]>('activeChanges', [branchChange]);

		const changesViewService = new class extends mock<IChangesViewService>() {
			override readonly activeSessionResourceObs = activeSessionResource;
			override readonly activeSessionChangesObs = activeChanges;
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
		activeSessionResource.set(otherSessionResource, undefined);
		activeChanges.set([otherChange], undefined);

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
