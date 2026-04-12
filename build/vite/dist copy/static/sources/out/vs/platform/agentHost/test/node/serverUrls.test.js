/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { formatWebSocketUrl, resolveServerUrls } from '../../node/serverUrls.js';
suite('serverUrls', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('uses localhost for default local-only binding', () => {
        assert.deepStrictEqual(resolveServerUrls(undefined, 8081), {
            local: ['ws://localhost:8081'],
            network: [],
        });
    });
    test('formats IPv6 websocket URLs with brackets', () => {
        assert.strictEqual(formatWebSocketUrl('::1', 8081), 'ws://[::1]:8081');
        assert.deepStrictEqual(resolveServerUrls('::1', 8081), {
            local: ['ws://[::1]:8081'],
            network: [],
        });
        assert.deepStrictEqual(resolveServerUrls('0000:0000:0000:0000:0000:0000:0000:0001', 8081), {
            local: ['ws://[0000:0000:0000:0000:0000:0000:0000:0001]:8081'],
            network: [],
        });
    });
    test('treats wildcard binding as localhost plus network urls', () => {
        assert.deepStrictEqual(resolveServerUrls('0.0.0.0', 8081, {
            lo0: [
                { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' },
            ],
            en0: [
                { address: '192.168.1.20', netmask: '255.255.255.0', family: 'IPv4', mac: '11:22:33:44:55:66', internal: false, cidr: '192.168.1.20/24' },
                { address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', mac: '11:22:33:44:55:66', internal: false, cidr: 'fe80::1/64', scopeid: 0 },
            ],
        }), {
            local: ['ws://localhost:8081'],
            network: ['ws://192.168.1.20:8081'],
        });
        assert.deepStrictEqual(resolveServerUrls('0000:0000:0000:0000:0000:0000:0000:0000', 8081, {
            lo0: [
                { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' },
            ],
            en0: [
                { address: '192.168.1.20', netmask: '255.255.255.0', family: 'IPv4', mac: '11:22:33:44:55:66', internal: false, cidr: '192.168.1.20/24' },
            ],
        }), {
            local: ['ws://localhost:8081'],
            network: ['ws://192.168.1.20:8081'],
        });
    });
    test('treats explicit non-loopback host as a network url', () => {
        assert.deepStrictEqual(resolveServerUrls('example.test', 8081), {
            local: [],
            network: ['ws://example.test:8081'],
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyVXJscy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3Qvbm9kZS9zZXJ2ZXJVcmxzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRWpGLEtBQUssQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFO0lBQ3hCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEdBQUcsRUFBRTtRQUMxRCxNQUFNLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsRUFBRTtZQUMxRCxLQUFLLEVBQUUsQ0FBQyxxQkFBcUIsQ0FBQztZQUM5QixPQUFPLEVBQUUsRUFBRTtTQUNYLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtRQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxFQUFFO1lBQ3RELEtBQUssRUFBRSxDQUFDLGlCQUFpQixDQUFDO1lBQzFCLE9BQU8sRUFBRSxFQUFFO1NBQ1gsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyx5Q0FBeUMsRUFBRSxJQUFJLENBQUMsRUFBRTtZQUMxRixLQUFLLEVBQUUsQ0FBQyxxREFBcUQsQ0FBQztZQUM5RCxPQUFPLEVBQUUsRUFBRTtTQUNYLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdEQUF3RCxFQUFFLEdBQUcsRUFBRTtRQUNuRSxNQUFNLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUU7WUFDekQsR0FBRyxFQUFFO2dCQUNKLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLG1CQUFtQixFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRTthQUM3SDtZQUNELEdBQUcsRUFBRTtnQkFDSixFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxtQkFBbUIsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxpQkFBaUIsRUFBRTtnQkFDekksRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxtQkFBbUIsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRTthQUNuSjtTQUNELENBQUMsRUFBRTtZQUNILEtBQUssRUFBRSxDQUFDLHFCQUFxQixDQUFDO1lBQzlCLE9BQU8sRUFBRSxDQUFDLHdCQUF3QixDQUFDO1NBQ25DLENBQUMsQ0FBQztRQUVILE1BQU0sQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMseUNBQXlDLEVBQUUsSUFBSSxFQUFFO1lBQ3pGLEdBQUcsRUFBRTtnQkFDSixFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxtQkFBbUIsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUU7YUFDN0g7WUFDRCxHQUFHLEVBQUU7Z0JBQ0osRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsbUJBQW1CLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7YUFDekk7U0FDRCxDQUFDLEVBQUU7WUFDSCxLQUFLLEVBQUUsQ0FBQyxxQkFBcUIsQ0FBQztZQUM5QixPQUFPLEVBQUUsQ0FBQyx3QkFBd0IsQ0FBQztTQUNuQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxvREFBb0QsRUFBRSxHQUFHLEVBQUU7UUFDL0QsTUFBTSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLEVBQUU7WUFDL0QsS0FBSyxFQUFFLEVBQUU7WUFDVCxPQUFPLEVBQUUsQ0FBQyx3QkFBd0IsQ0FBQztTQUNuQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=