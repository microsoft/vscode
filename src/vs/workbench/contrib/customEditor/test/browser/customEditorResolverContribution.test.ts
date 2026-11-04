/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
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

	test('Registers the accessibility help of custom editors for when they have focus', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.get(IStorageService).store('memento/customEditors', JSON.stringify({
			editors: [{
				id: 'test.pdfEditor',
				displayName: 'Test PDF Editor',
				providerDisplayName: 'Test',
				selector: [{ filenamePattern: '*.pdf' }],
				priority: RegisteredEditorPriority.builtin,
				accessibilityHelpContent: 'Find with <keybinding:test.find>.',
			}]
		}), StorageScope.PROFILE, StorageTarget.MACHINE);

		const contribution = disposables.add(instantiationService.createInstance(CustomEditorResolverContribution));
		const help = AccessibleViewRegistry.getImplementations().find(implementation => implementation.name === 'test.pdfEditor');
		const provider = help && disposables.add(instantiationService.invokeFunction(accessor => help.getProvider(accessor))!);
		const registered = { type: help?.type, when: help?.when?.serialize(), content: provider?.provideContent() };
		contribution.dispose();

		assert.deepStrictEqual({ registered, unregisteredWithContribution: !AccessibleViewRegistry.getImplementations().includes(help!) }, {
			registered: {
				type: AccessibleViewType.Help,
				when: `editorAreaFocus && activeCustomEditorId == 'test.pdfEditor'`,
				content: 'Find with <keybinding:test.find>.',
			},
			unregisteredWithContribution: true,
		});
	});
});
