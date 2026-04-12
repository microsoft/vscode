/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { extractLocalHostUriMetaDataForPortMapping, extractQueryLocalHostUriMetaDataForPortMapping } from '../../common/tunnel.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('Tunnel', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function portMappingDoTest(uri, func, expectedAddress, expectedPort) {
        const res = func(URI.parse(uri));
        assert.strictEqual(!expectedAddress, !res);
        assert.strictEqual(res?.address, expectedAddress);
        assert.strictEqual(res?.port, expectedPort);
    }
    function portMappingTest(uri, expectedAddress, expectedPort) {
        portMappingDoTest(uri, extractLocalHostUriMetaDataForPortMapping, expectedAddress, expectedPort);
    }
    function portMappingTestQuery(uri, expectedAddress, expectedPort) {
        portMappingDoTest(uri, extractQueryLocalHostUriMetaDataForPortMapping, expectedAddress, expectedPort);
    }
    test('portMapping', () => {
        portMappingTest('file:///foo.bar/baz');
        portMappingTest('http://foo.bar:1234');
        portMappingTest('http://localhost:8080', 'localhost', 8080);
        portMappingTest('https://localhost:443', 'localhost', 443);
        portMappingTest('http://127.0.0.1:3456', '127.0.0.1', 3456);
        portMappingTest('http://0.0.0.0:7654', '0.0.0.0', 7654);
        portMappingTest('http://localhost:8080/path?foo=bar', 'localhost', 8080);
        portMappingTest('http://localhost:8080/path?foo=http%3A%2F%2Flocalhost%3A8081', 'localhost', 8080);
        portMappingTestQuery('http://foo.bar/path?url=http%3A%2F%2Flocalhost%3A8081', 'localhost', 8081);
        portMappingTestQuery('http://foo.bar/path?url=http%3A%2F%2Flocalhost%3A8081&url2=http%3A%2F%2Flocalhost%3A8082', 'localhost', 8081);
        portMappingTestQuery('http://foo.bar/path?url=http%3A%2F%2Fmicrosoft.com%2Fbad&url2=http%3A%2F%2Flocalhost%3A8081', 'localhost', 8081);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVubmVsLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90dW5uZWwvdGVzdC9jb21tb24vdHVubmVsLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQ04seUNBQXlDLEVBQ3pDLDhDQUE4QyxFQUM5QyxNQUFNLHdCQUF3QixDQUFDO0FBQ2hDLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBR2hHLEtBQUssQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFO0lBQ3BCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsU0FBUyxpQkFBaUIsQ0FBQyxHQUFXLEVBQ3JDLElBQWlFLEVBQ2pFLGVBQXdCLEVBQ3hCLFlBQXFCO1FBQ3JCLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsR0FBRyxFQUFFLE9BQU8sRUFBRSxlQUFlLENBQUMsQ0FBQztRQUNsRCxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVELFNBQVMsZUFBZSxDQUFDLEdBQVcsRUFBRSxlQUF3QixFQUFFLFlBQXFCO1FBQ3BGLGlCQUFpQixDQUFDLEdBQUcsRUFBRSx5Q0FBeUMsRUFBRSxlQUFlLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDbEcsQ0FBQztJQUVELFNBQVMsb0JBQW9CLENBQUMsR0FBVyxFQUFFLGVBQXdCLEVBQUUsWUFBcUI7UUFDekYsaUJBQWlCLENBQUMsR0FBRyxFQUFFLDhDQUE4QyxFQUFFLGVBQWUsRUFBRSxZQUFZLENBQUMsQ0FBQztJQUN2RyxDQUFDO0lBRUQsSUFBSSxDQUFDLGFBQWEsRUFBRSxHQUFHLEVBQUU7UUFDeEIsZUFBZSxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDdkMsZUFBZSxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDdkMsZUFBZSxDQUFDLHVCQUF1QixFQUFFLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1RCxlQUFlLENBQUMsdUJBQXVCLEVBQUUsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzNELGVBQWUsQ0FBQyx1QkFBdUIsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDNUQsZUFBZSxDQUFDLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN4RCxlQUFlLENBQUMsb0NBQW9DLEVBQUUsV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pFLGVBQWUsQ0FBQyw4REFBOEQsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbkcsb0JBQW9CLENBQUMsdURBQXVELEVBQUUsV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2pHLG9CQUFvQixDQUFDLDBGQUEwRixFQUFFLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNwSSxvQkFBb0IsQ0FBQyw2RkFBNkYsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDeEksQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9