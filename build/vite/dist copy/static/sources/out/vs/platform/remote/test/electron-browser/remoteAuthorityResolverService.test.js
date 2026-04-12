/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import product from '../../../product/common/product.js';
import { RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode } from '../../common/remoteAuthorityResolver.js';
import { RemoteAuthorityResolverService } from '../../electron-browser/remoteAuthorityResolverService.js';
suite('RemoteAuthorityResolverService', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('issue #147318: RemoteAuthorityResolverError keeps the same type', async () => {
        const productService = { _serviceBrand: undefined, ...product };
        // eslint-disable-next-line local/code-no-any-casts
        const service = new RemoteAuthorityResolverService(productService, undefined);
        const result = service.resolveAuthority('test+x');
        service._setResolvedAuthorityError('test+x', new RemoteAuthorityResolverError('something', RemoteAuthorityResolverErrorCode.TemporarilyNotAvailable));
        try {
            await result;
            assert.fail();
        }
        catch (err) {
            assert.strictEqual(RemoteAuthorityResolverError.isTemporarilyNotAvailable(err), true);
        }
        service.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9yZW1vdGUvdGVzdC9lbGVjdHJvbi1icm93c2VyL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUV6RCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN6SCxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUUxRyxLQUFLLENBQUMsZ0NBQWdDLEVBQUUsR0FBRyxFQUFFO0lBRTVDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLGlFQUFpRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2xGLE1BQU0sY0FBYyxHQUFvQixFQUFFLGFBQWEsRUFBRSxTQUFTLEVBQUUsR0FBRyxPQUFPLEVBQUUsQ0FBQztRQUNqRixtREFBbUQ7UUFDbkQsTUFBTSxPQUFPLEdBQUcsSUFBSSw4QkFBOEIsQ0FBQyxjQUFjLEVBQUUsU0FBZ0IsQ0FBQyxDQUFDO1FBQ3JGLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNsRCxPQUFPLENBQUMsMEJBQTBCLENBQUMsUUFBUSxFQUFFLElBQUksNEJBQTRCLENBQUMsV0FBVyxFQUFFLGdDQUFnQyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQztRQUN0SixJQUFJLENBQUM7WUFDSixNQUFNLE1BQU0sQ0FBQztZQUNiLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNmLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2QsTUFBTSxDQUFDLFdBQVcsQ0FBQyw0QkFBNEIsQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN2RixDQUFDO1FBQ0QsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ25CLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==