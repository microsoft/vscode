/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isResourceMultiDiffEditorInput } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { EditorChatResponseFileChangesService } from '../../browser/editorChatResponseFileChangesService.js';

suite('EditorChatResponseFileChangesService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens request changes in a standalone multi-diff editor', () => {
		let opened: unknown;
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				opened = args[0];
				return undefined;
			}
		}();
		const service = disposables.add(new EditorChatResponseFileChangesService(editorService));
		disposables.add(service.registerProvider('test', {
			getChangesForRequest: (_sessionResource, requestId) => requestId === 'request'
				? constObservable([{
					originalURI: URI.file('/before.ts'),
					modifiedURI: URI.file('/after.ts'),
					added: 2,
					removed: 1,
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

		assert.ok(isResourceMultiDiffEditorInput(opened));
		assert.deepStrictEqual({
			label: opened.label,
			resources: opened.resources?.map(resource => ({
				original: resource.original.resource?.toString(),
				modified: resource.modified.resource?.toString(),
			})),
		}, {
			label: 'Turn File Changes',
			resources: [{
				original: 'file:///before.ts',
				modified: 'file:///after.ts',
			}, {
				original: 'file:///deleted-before.ts',
				modified: undefined,
			}],
		});
	});
});
