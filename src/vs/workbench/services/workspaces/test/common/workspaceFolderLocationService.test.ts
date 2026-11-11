/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFolderLocation, IWorkspaceFolderLocationProvider } from '../../../../../platform/workspace/common/folderLocations.js';
import { WorkspaceFolderLocationService } from '../../common/workspaceFolderLocationService.js';

suite('WorkspaceFolderLocationService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/primary');
	const a = URI.file('/a');
	const b = URI.file('/b');

	function provider(id: string, locations: IFolderLocation[], fail = false): IWorkspaceFolderLocationProvider {
		return {
			id,
			provideLocations: async () => { if (fail) { throw new Error('fail'); } return locations; },
			resolveLocation: async (_primary, location) => { if (fail) { throw new Error('fail'); } return locations.find(l => l.uri.toString() === location.toString()); }
		};
	}

	test('getLocations merges providers, dedupes and reports failures', async () => {
		const reported: string[] = [];
		const previous = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => reported.push(error.message));
		disposables.add(toDisposable(() => setUnexpectedErrorHandler(previous)));
		const service = disposables.add(new WorkspaceFolderLocationService());
		disposables.add(service.registerProvider(provider('x', [{ uri: a, label: 'A' }], true)));
		disposables.add(service.registerProvider(provider('y', [{ uri: a, label: 'A' }, { uri: b, label: 'B' }])));
		disposables.add(service.registerProvider(provider('z', [{ uri: a, label: 'A2' }])));

		const actual = await service.getLocations(primary, CancellationToken.None);

		assert.deepStrictEqual({ labels: actual.map(l => l.label), reported }, { labels: ['A', 'B'], reported: ['fail'] });
	});

	test('resolveLocation reports provider and built-in flag', async () => {
		const service = disposables.add(new WorkspaceFolderLocationService());
		const registration = disposables.add(service.registerProvider(provider('x', [{ uri: a, label: 'A' }]), { builtIn: true }));
		disposables.add(service.registerProvider(provider('y', [{ uri: b, label: 'B' }])));

		const resolvedA = await service.resolveLocation(primary, a, CancellationToken.None);
		const resolvedB = await service.resolveLocation(primary, b, CancellationToken.None);
		const unknown = await service.resolveLocation(primary, URI.file('/c'), CancellationToken.None);
		registration.dispose();
		const afterDispose = await service.resolveLocation(primary, a, CancellationToken.None);

		assert.deepStrictEqual(
			{ a: [resolvedA?.providerId, resolvedA?.builtIn], b: [resolvedB?.providerId, resolvedB?.builtIn], unknown, afterDispose },
			{ a: ['x', true], b: ['y', false], unknown: undefined, afterDispose: undefined });
	});

	test('setCurrentLocation fires an event', () => {
		const service = disposables.add(new WorkspaceFolderLocationService());
		let fired = 0;
		disposables.add(service.onDidChangeCurrentLocation(() => fired++));

		service.setCurrentLocation({ uri: a, label: 'A', providerId: 'x', builtIn: false });
		service.setCurrentLocation(undefined);

		assert.deepStrictEqual({ fired, current: service.currentLocation }, { fired: 2, current: undefined });
	});
});
