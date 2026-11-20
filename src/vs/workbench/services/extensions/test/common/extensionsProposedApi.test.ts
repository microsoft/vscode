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
import { extensionsAllowedAnyApiProposal } from '../../common/extensionsProposedApiExceptions.js';

suite('ExtensionsProposedApi', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const builtEnvironment = { isBuilt: true, isExtensionDevelopment: false, extensionEnabledProposedApi: undefined } as IWorkbenchEnvironmentService;

	function getEnabledApiProposals(extensionId: string, extensionEnabledApiProposals: IProductService['extensionEnabledApiProposals'], declared: string[]): readonly string[] | undefined {
		const productService: IProductService = { ...TestProductService, extensionEnabledApiProposals };
		const extension: IExtensionDescription = { ...nullExtensionDescription, identifier: new ExtensionIdentifier(extensionId), enabledApiProposals: declared };
		new ExtensionsProposedApi(new NullLogService(), builtEnvironment, productService).updateEnabledApiProposals([extension]);
		return extension.enabledApiProposals;
	}

	test('product.json allowlist overrides the extension declaration', () => {
		assert.deepStrictEqual(getEnabledApiProposals('pub.ext', { 'pub.ext': ['externalUriOpener'] }, ['externalUriOpener', 'terminalShellEnv']), ['externalUriOpener']);
	});

	test('extensions not listed in product.json cannot use proposals', () => {
		assert.deepStrictEqual(getEnabledApiProposals('pub.ext', {}, ['externalUriOpener']), []);
	});

	test('hard-coded exceptions use every declared proposal, even when product.json lists fewer', () => {
		assert.deepStrictEqual(getEnabledApiProposals('MS-VSCODE.vscode-team-tools', { 'ms-vscode.vscode-team-tools': ['externalUriOpener'] }, ['externalUriOpener', 'terminalShellEnv', 'doesNotExist']), ['externalUriOpener', 'terminalShellEnv']);
	});

	test('hard-coded exceptions are stored in lower case', () => {
		for (const id of extensionsAllowedAnyApiProposal) {
			assert.strictEqual(id, ExtensionIdentifier.toKey(id));
		}
	});
});
