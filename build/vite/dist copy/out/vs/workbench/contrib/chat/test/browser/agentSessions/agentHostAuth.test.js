/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { resolveTokenForResource } from '../../../browser/agentSessions/agentHost/agentHostAuth.js';
function createMockAuthService(overrides) {
    return {
        getOrActivateProviderIdForServer: overrides.getOrActivateProviderIdForServer ?? (() => Promise.resolve(undefined)),
        getSessions: overrides.getSessions ?? (() => Promise.resolve([])),
    };
}
suite('resolveTokenForResource', () => {
    const log = new NullLogService();
    const resource = URI.parse('https://api.example.com');
    ensureNoDisposablesAreLeakedInTestSuite();
    test('returns undefined when no authorization servers provided', async () => {
        const authService = createMockAuthService({});
        const token = await resolveTokenForResource(resource, [], ['read'], authService, log, 'test');
        assert.strictEqual(token, undefined);
    });
    test('returns undefined when no provider matches the server', async () => {
        const authService = createMockAuthService({
            getOrActivateProviderIdForServer: () => Promise.resolve(undefined),
        });
        const token = await resolveTokenForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test');
        assert.strictEqual(token, undefined);
    });
    test('returns token from exact scope match', async () => {
        const authService = createMockAuthService({
            getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
            getSessions: (_providerId, scopes) => {
                if (scopes && scopes.length === 1 && scopes[0] === 'read') {
                    return Promise.resolve([{ scopes: ['read'], accessToken: 'exact-token' }]);
                }
                return Promise.resolve([]);
            },
        });
        const token = await resolveTokenForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test');
        assert.strictEqual(token, 'exact-token');
    });
    test('falls back to narrowest superset session when exact match fails', async () => {
        const authService = createMockAuthService({
            getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
            getSessions: (_providerId, scopes) => {
                if (scopes !== undefined) {
                    // Exact match returns empty
                    return Promise.resolve([]);
                }
                // All sessions — return two superset options
                return Promise.resolve([
                    { scopes: ['read', 'write', 'admin'], accessToken: 'wide-token' },
                    { scopes: ['read', 'write'], accessToken: 'narrow-token' },
                ]);
            },
        });
        const token = await resolveTokenForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test');
        assert.strictEqual(token, 'narrow-token');
    });
    test('returns undefined when no session has matching scopes', async () => {
        const authService = createMockAuthService({
            getOrActivateProviderIdForServer: () => Promise.resolve('provider-1'),
            getSessions: (_providerId, scopes) => {
                if (scopes !== undefined) {
                    return Promise.resolve([]);
                }
                // No session contains the 'read' scope
                return Promise.resolve([
                    { scopes: ['write'], accessToken: 'wrong-token' },
                ]);
            },
        });
        const token = await resolveTokenForResource(resource, ['https://auth.example.com'], ['read'], authService, log, 'test');
        assert.strictEqual(token, undefined);
    });
    test('tries multiple authorization servers in order', async () => {
        const calls = [];
        const authService = createMockAuthService({
            getOrActivateProviderIdForServer: (serverUri) => {
                calls.push(serverUri.toString());
                if (serverUri.toString() === 'https://auth2.example.com/') {
                    return Promise.resolve('provider-2');
                }
                return Promise.resolve(undefined);
            },
            getSessions: () => Promise.resolve([{ scopes: ['read'], accessToken: 'server2-token' }]),
        });
        const token = await resolveTokenForResource(resource, ['https://auth1.example.com', 'https://auth2.example.com'], ['read'], authService, log, 'test');
        assert.strictEqual(token, 'server2-token');
        assert.strictEqual(calls.length, 2);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0QXV0aC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3RBdXRoLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFOUUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFFcEcsU0FBUyxxQkFBcUIsQ0FBQyxTQUc5QjtJQUNBLE9BQU87UUFDTixnQ0FBZ0MsRUFBRSxTQUFTLENBQUMsZ0NBQWdDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2xILFdBQVcsRUFBRSxTQUFTLENBQUMsV0FBVyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztLQUM1QixDQUFDO0FBQ3hDLENBQUM7QUFFRCxLQUFLLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO0lBRXJDLE1BQU0sR0FBRyxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7SUFDakMsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBRXRELHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLDBEQUEwRCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzNFLE1BQU0sV0FBVyxHQUFH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