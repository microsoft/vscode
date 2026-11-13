/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceTree } from '../../../../../base/common/resourceTree.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { SCMAccessibilityProvider } from '../../browser/scmViewPane.js';
import { ISCMResource, ISCMResourceGroup } from '../../common/scm.js';

suite('SCMAccessibilityProvider', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('includes resource folder status in accessible labels', () => {
		const provider = new SCMAccessibilityProvider(
			new class extends mock<IAccessibilityService>() { }(),
			new class extends mock<IConfigurationService>() { }(),
			new class extends mock<IKeybindingService>() { }(),
			new class extends mock<ILabelService>() {
				override getUriLabel(uri: URI): string {
					return uri.path;
				}
			}()
		);
		const group = new class extends mock<ISCMResourceGroup>() { }();
		const tree = new ResourceTree<ISCMResource, ISCMResourceGroup>(group);
		const createResource = (path: string, tooltip?: string): ISCMResource => new class extends mock<ISCMResource>() {
			override readonly resourceGroup = group;
			override readonly sourceUri = URI.file(path);
			override readonly decorations = { tooltip };
		}();
		const folder = createResource('/src/test', 'Modified folder');
		const file = createResource('/src/test/realfile', 'Modified file');
		for (const resource of [
			folder,
			file,
			createResource('/src/no-description'),
			createResource('/src/no-description/child'),
			createResource('/src/empty-description', ''),
			createResource('/src/empty-description/child')
		]) {
			tree.add(resource.sourceUri, resource);
		}

		assert.deepStrictEqual({
			folder: provider.getAriaLabel(tree.getNode(folder.sourceUri)!),
			structuralFolder: provider.getAriaLabel(tree.getNode(URI.file('/src'))!),
			noDescription: provider.getAriaLabel(tree.getNode(URI.file('/src/no-description'))!),
			emptyDescription: provider.getAriaLabel(tree.getNode(URI.file('/src/empty-description'))!),
			file: provider.getAriaLabel(file)
		}, {
			folder: '/src/test, Modified folder',
			structuralFolder: '/src',
			noDescription: '/src/no-description',
			emptyDescription: '/src/empty-description',
			file: 'realfile, Modified file, /src/test'
		});
	});
});
