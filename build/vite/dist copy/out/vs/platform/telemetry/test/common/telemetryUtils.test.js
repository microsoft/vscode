/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { cleanRemoteAuthority } from '../../common/telemetryUtils.js';
suite('TelemetryUtils', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('cleanRemoteAuthority', () => {
        test('returns "none" when remoteAuthority is undefined', () => {
            const config = {
                remoteExtensionTips: { 'ssh-remote': {} },
                virtualWorkspaceExtensionTips: { 'codespaces': {} }
            };
            const result = cleanRemoteAuthority(undefined, config);
            assert.strictEqual(result, 'none');
        });
        test('returns remoteName when it exists in remoteExtensionTips', () => {
            const config = {
                remoteExtensionTips: {
                    'ssh-remote': {},
                    'dev-container': {},
                    'wsl': {}
                }
            };
            assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'ssh-remote');
            assert.strictEqual(cleanRemoteAuthority('dev-container', config), 'dev-container');
            assert.strictEqual(cleanRemoteAuthority('wsl', config), 'wsl');
        });
        test('returns remoteName when it exists in virtualWorkspaceExtensionTips', () => {
            const config = {
                remoteExtensionTips: {},
                virtualWorkspaceExtensionTips: {
                    'codespaces': {},
                    'tunnel': {}
                }
            };
            assert.strictEqual(cleanRemoteAuthority('codespaces', config), 'codespaces');
            assert.strictEqual(cleanRemoteAuthority('tunnel', config), 'tunnel');
        });
        test('returns "other" when remoteName is not in either config', () => {
            const config = {
                remoteExtensionTips: {
                    'ssh-remote': {},
                    'dev-container': {}
                },
                virtualWorkspaceExtensionTips: {
                    'codespaces': {}
                }
            };
            assert.strictEqual(cleanRemoteAuthority('unknown-remote', config), 'other');
            assert.strictEqual(cleanRemoteAuthority('custom-remote', config), 'other');
        });
        test('returns "other" when config is empty', () => {
            const config = {
                remoteExtensionTips: {},
                virtualWorkspaceExtensionTips: {}
            };
            assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'other');
        });
        test('handles config with undefined remoteExtensionTips', () => {
            const config = {
                virtualWorkspaceExtensionTips: {
                    'codespaces': {}
                }
            };
            assert.strictEqual(cleanRemoteAuthority('codespaces', config), 'codespaces');
            assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'other');
        });
        test('handles config with undefined virtualWorkspaceExtensionTips', () => {
            const config = {
                remoteExtensionTips: {
                    'ssh-remote': {}
                }
            };
            assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'ssh-remote');
            assert.strictEqual(cleanRemoteAuthority('codespaces', config), 'other');
        });
        test('handles empty config object', () => {
            const config = {};
            assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'other');
            assert.strictEqual(cleanRemoteAuthority(undefined, config), 'none');
        });
        test('handles remoteAuthority with additional path segments', () => {
            const config = {
                remoteExtensionTips: {
                    'ssh-remote': {}
                }
            };
            // getRemoteName should extract just the authority name
            assert.strictEqual(cleanRemoteAuthority('ssh-remote+server1.example.com', config), 'ssh-remote');
        });
        test('handles undefined config object', () => {
            const config = undefined;
            assert.strictEqual(cleanRemoteAuthority('ssh-remote', config), 'other');
            assert.strictEqual(cleanRemoteAuthority(undefined, config), 'none');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVsZW1ldHJ5VXRpbHMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3RlbGVtZXRyeS90ZXN0L2NvbW1vbi90ZWxlbWV0cnlVdGlscy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUV0RSxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFO0lBRTVCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtRQUVsQyxJQUFJLENBQUMsa0RBQWtELEVBQUUsR0FBRyxFQUFFO1lBQzdELE1BQU0sTUFBTSxHQUFHO2dCQUNkLG1CQUFtQixFQUFFLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRTtnQkFDekMsNkJBQTZCLEVBQUUsRUFBRSxZQUFZLEVBQUUsRUFBRSxFQUFFO2FBQ25ELENBQUM7WUFFRixNQUFNLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDdkQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMERBQTBELEVBQUUsR0FBRyxFQUFFO1lBQ3JFLE1BQU0sTUFBTSxHQUFHO2dCQUNkLG1CQUFtQixFQUFFO29CQUNwQixZQUFZLEVBQUUsRUFBRTtvQkFDaEIsZUFBZSxFQUFFLEVBQUU7b0JBQ25CLEtBQUssRUFBRSxFQUFFO2lCQUNUO2FBQ0QsQ0FBQztZQUVGLE1BQU0sQ0FBQyxXQUFXLENBQUMsb0JB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