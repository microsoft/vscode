/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode } from '../../common/remoteAuthorityResolver.js';
import { RemoteAuthorityResolverService } from '../../electron-browser/remoteAuthorityResolverService.js';

suite('RemoteAuthorityResolverService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #147318: RemoteAuthorityResolverError keeps the same type', async () => {
		const productService: IProductService = { _serviceBrand: undefined, ...product };
		// eslint-disable-next-line local/code-no-any-casts
		const service = new RemoteAuthorityResolverService(productService, undefined as any);
		const result = service.resolveAuthority('test+x');
		service._setResolvedAuthorityError('test+x', new RemoteAuthorityResolverError('something', RemoteAuthorityResolverErrorCode.TemporarilyNotAvailable));
		try {
			await result;
			assert.fail();
		} catch (err) {
			assert.strictEqual(RemoteAuthorityResolverError.isTemporarilyNotAvailable(err), true);
		}
		service.dispose();
	});
});
