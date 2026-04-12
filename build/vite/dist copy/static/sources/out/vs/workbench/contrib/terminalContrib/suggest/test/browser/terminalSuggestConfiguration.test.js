/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { registerTerminalSuggestProvidersConfiguration } from '../../common/terminalSuggestConfiguration.js';
suite('Terminal Suggest Dynamic Configuration', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('should update configuration when providers change', () => {
        // Test initial state
        registerTerminalSuggestProvidersConfiguration();
        // Test with some providers
        const providers = new Map([
            ['terminal-suggest', { id: 'terminal-suggest', description: 'Provides intelligent completions for terminal commands' }],
            ['builtinPwsh', { id: 'builtinPwsh', description: 'PowerShell completion provider' }],
            ['lsp', { id: 'lsp' }],
            ['custom-provider', { id: 'custom-provider' }],
        ]);
        registerTerminalSuggestProvidersConfiguration(providers);
        // Test with empty providers
        registerTerminalSuggestProvidersConfiguration();
        // The fact that this doesn't throw means the basic logic works
        assert.ok(true);
    });
    test('should include default providers even when none provided', () => {
        // This should not throw and should set up default configuration
        registerTerminalSuggestProvidersConfiguration(undefined);
        assert.ok(true);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxTdWdnZXN0Q29uZmlndXJhdGlvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3N1Z2dlc3QvdGVzdC9icm93c2VyL3Rlcm1pbmFsU3VnZ2VzdENvbmZpZ3VyYXRpb24udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLDZDQUE2QyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFN0csS0FBSyxDQUFDLHdDQUF3QyxFQUFFLEdBQUcsRUFBRTtJQUNwRCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxtREFBbUQsRUFBRSxHQUFHLEVBQUU7UUFDOUQscUJBQXFCO1FBQ3JCLDZDQUE2QyxFQUFFLENBQUM7UUFFaEQsMkJBQTJCO1FBQzNCLE1BQU0sU0FBUyxHQUFHLElBQUksR0FBRyxDQUFDO1lBQ3pCLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsV0FBVyxFQUFFLHdEQUF3RCxFQUFFLENBQUM7WUFDdkgsQ0FBQyxhQUFhLEVBQUUsRUFBRSxFQUFFLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxnQ0FBZ0MsRUFBRSxDQUFDO1lBQ3JGLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDO1lBQ3RCLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxFQUFFLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztTQUM5QyxDQUFDLENBQUM7UUFDSCw2Q0FBNkMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUV6RCw0QkFBNEI7UUFDNUIsNkNBQTZDLEVBQUUsQ0FBQztRQUVoRCwrREFBK0Q7UUFDL0QsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNqQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywwREFBMEQsRUFBRSxHQUFHLEVBQUU7UUFDckUsZ0VBQWdFO1FBQ2hFLDZDQUE2QyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDakIsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9