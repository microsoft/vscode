/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { isResourceMultiDiffEditorInput } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { EditorChatResponseFileChangesService, openReadableChatFileChanges } from '../../browser/editorChatResponseFileChangesService.js';

suite('EditorChatResponseFileChangesService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens request changes in a standalone multi-diff editor', async () => {
		let opened: unknown;
		const didOpen = new DeferredPromise<void>();
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				opened = args[0];
				didOpen.complete();
				return undefined;
			}
		}();
		const service = disposables.add(new EditorChatResponseFileChangesService(editorService));
		disposables.add(service.registerProvider('test', {
			getChangesForRequest: (_sessionResource, requestId) => requestId === 'request'
				? constObservable([{
					originalURI: URI.file('/before.ts'),
					modifiedURI: URI.file('/after.ts'),
					modifiedSnapshotURI: URI.parse('snapshot:/after.ts'),
					added: 2,
					removed: 1,
					quitEarly: false,
					identical: false,
					isFinal: true,
					isBusy: false,
				}, {
					originalURI: URI.file('/created.ts'),
					modifiedURI: URI.file('/created.ts'),
					modifiedSnapshotURI: URI.parse('snapshot:/created.ts'),
					isCreated: true,
					added: 4,
					removed: 0,
					quitEarly: false,
					identical: false,
					isFinal: true,
					isBusy: false,
				}, {
					originalURI: URI.file('/deleted-before.ts'),
					modifiedURI: URI.file('/deleted.ts'),
					isDeleted: true,
					added: 0,
					removed: 3,
					quitEarly: false,
					identical: false,
					isFinal: true,
					isBusy: false,
				}])
				: undefined,
		}));

		service.openChangesForRequest(URI.parse('test:session'), 'request', { isLastTurn: false });
		service.openChangesForRequest(URI.parse('test:session'), 'missing', { isLastTurn: true });
		await didOpen.p;

		assert.ok(isResourceMultiDiffEditorInput(opened));
		assert.deepStrictEqual({
			label: opened.label,
			resources: opened.resources?.map(resource => ({
				original: resource.original.resource?.toString(),
				modified: resource.modified.resource?.toString(),
				goToFile: resource.goToFileResource?.toString(),
			})),
		}, {
			label: 'Turn File Changes',
			resources: [{
				original: 'file:///before.ts',
				modified: 'snapshot:/after.ts',
				goToFile: 'file:///after.ts',
			}, {
				original: undefined,
				modified: 'snapshot:/created.ts',
				goToFile: 'file:///created.ts',
			}, {
				original: 'file:///deleted-before.ts',
				modified: undefined,
				goToFile: 'file:///deleted.ts',
			}],
		});
	});

	test('falls back to the live file when Agent Host snapshots are unreadable', async () => {
		let opened: unknown;
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				opened = args[0];
				return undefined;
			}
		}();
		const fileService = new class extends mock<IFileService>() {
			override readFile(): Promise<never> {
				return Promise.reject(new Error('Snapshot was pruned'));
			}
		}();

		await openReadableChatFileChanges(editorService, fileService, 'Session Changes', [{
			originalURI: URI.from({ scheme: AGENT_HOST_SCHEME, path: '/pruned-before.ts' }),
			modifiedURI: URI.file('/live-after.ts'),
			modifiedSnapshotURI: URI.from({ scheme: AGENT_HOST_SCHEME, path: '/pruned-after.ts' }),
			added: 1,
			removed: 1,
			quitEarly: false,
			identical: false,
			isFinal: true,
			isBusy: false,
		}]);

		assert.ok(isResourceMultiDiffEditorInput(opened));
		assert.deepStrictEqual(opened.resources?.map(resource => ({
			original: resource.original.resource?.toString(),
			modified: resource.modified.resource?.toString(),
			goToFile: resource.goToFileResource?.toString(),
		})), [{
			original: undefined,
			modified: 'file:///live-after.ts',
			goToFile: 'file:///live-after.ts',
		}]);
	});
});
