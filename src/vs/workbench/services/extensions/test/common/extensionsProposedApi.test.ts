/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { nullExtensionDescription } from '../../common/extensions.js';
import { ExtensionsProposedApi } from '../../common/extensionsProposedApi.js';

suite('ExtensionsProposedApi', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const builtEnvironment = { isBuilt: true, isExtensionDevelopment: false, extensionEnabledProposedApi: undefined } as IWorkbenchEnvironmentService;

	function getEnabledApiProposals(extensionEnabledApiProposals: IProductService['extensionEnabledApiProposals'], declared: string[]): readonly string[] | undefined {
		const productService: IProductService = { ...TestProductService, extensionEnabledApiProposals };
		const extension: IExtensionDescription = { ...nullExtensionDescription, identifier: new ExtensionIdentifier('pub.ext'), enabledApiProposals: declared };
		new ExtensionsProposedApi(new NullLogService(), builtEnvironment, productService).updateEnabledApiProposals([extension]);
		return extension.enabledApiProposals;
	}

	test('product.json allowlist overrides the extension declaration', () => {
		assert.deepStrictEqual(getEnabledApiProposals({ 'pub.ext': ['externalUriOpener'] }, ['externalUriOpener', 'terminalShellEnv']), ['externalUriOpener']);
	});

	test('product.json wildcard allows every declared proposal', () => {
		assert.deepStrictEqual(getEnabledApiProposals({ 'Pub.Ext': ['*'] }, ['externalUriOpener', 'terminalShellEnv', 'doesNotExist']), ['externalUriOpener', 'terminalShellEnv']);
	});

	test('extensions not listed in product.json cannot use proposals', () => {
		assert.deepStrictEqual(getEnabledApiProposals({ 'other.ext': ['*'] }, ['externalUriOpener']), []);
	});
});
