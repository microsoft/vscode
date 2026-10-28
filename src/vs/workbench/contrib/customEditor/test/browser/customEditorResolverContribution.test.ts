/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { Memento } from '../../../../common/memento.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { CustomEditorResolverContribution } from '../../browser/customEditors.js';
import { CustomEditorCapabilities, ICustomEditorService } from '../../common/customEditor.js';

suite('CustomEditorResolverContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => Memento.clear(StorageScope.PROFILE));
	teardown(() => Memento.clear(StorageScope.PROFILE));

	test('Registers custom editors from the previous session without using the custom editor service #325506', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.get(IStorageService).store('memento/customEditors', JSON.stringify({
			editors: [{
				id: 'test.markdownEditor',
				displayName: 'Test Markdown Editor',
				providerDisplayName: 'Test',
				selector: [{ filenamePattern: '*.md' }],
				priority: RegisteredEditorPriority.default,
			}]
		}), StorageScope.PROFILE, StorageTarget.MACHINE);

		let customEditorServiceUsed = false;
		instantiationService.stub(ICustomEditorService, new class extends mock<ICustomEditorService>() {
			override getCustomEditorCapabilities(): CustomEditorCapabilities | undefined {
				customEditorServiceUsed = true;
				return undefined;
			}
		});

		disposables.add(instantiationService.createInstance(CustomEditorResolverContribution));

		const editors = instantiationService.get(IEditorResolverService).getEditors(URI.file('/test/readme.md'));
		assert.deepStrictEqual({
			registered: editors.some(editor => editor.id === 'test.markdownEditor'),
			customEditorServiceUsed,
		}, {
			registered: true,
			customEditorServiceUsed: false,
		});
	});
});
