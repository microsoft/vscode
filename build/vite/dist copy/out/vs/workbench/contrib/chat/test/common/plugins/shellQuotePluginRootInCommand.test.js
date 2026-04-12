/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { shellQuotePluginRootInCommand } from '../../../common/plugins/agentPluginServiceImpl.js';
suite('shellQuotePluginRootInCommand', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const TOKEN = '${PLUGIN_ROOT}';
    test('returns command unchanged when token is not present', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('echo hello', '/safe/path', TOKEN), 'echo hello');
    });
    test('plain replacement when path has no special characters', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('${PLUGIN_ROOT}/run.sh', '/safe/path', TOKEN), '/safe/path/run.sh');
    });
    test('plain replacement for multiple occurrences with safe path', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('${PLUGIN_ROOT}/a && ${PLUGIN_ROOT}/b', '/safe', TOKEN), '/safe/a && /safe/b');
    });
    test('quotes path with spaces', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('${PLUGIN_ROOT}/run.sh', '/path with spaces', TOKEN), '"/path with spaces/run.sh"');
    });
    test('quotes path with ampersand', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('${PLUGIN_ROOT}/run.sh', '/path&dir', TOKEN), '"/path&dir/run.sh"');
    });
    test('quotes multiple occurrences with unsafe path', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('${PLUGIN_ROOT}/a && ${PLUGIN_ROOT}/b', '/my dir', TOKEN), '"/my dir/a" && "/my dir/b"');
    });
    test('does not double-quote when already in double quotes', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('"${PLUGIN_ROOT}/run.sh"', '/my dir', TOKEN), '"/my dir/run.sh"');
    });
    test('does not double-quote when already in single quotes', () => {
        assert.strictEqual(shellQuotePluginRootInCommand(`'\${PLUGIN_ROOT}/run.sh'`, '/my dir', TOKEN), `'/my dir/run.sh'`);
    });
    test('escapes embedded double-quote characters in path', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('${PLUGIN_ROOT}/run.sh', '/path"with"quotes', TOKEN), '"/path\\"with\\"quotes/run.sh"');
    });
    test('handles token without trailing path suffix', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('cd ${PLUGIN_ROOT} && run', '/my dir', TOKEN), 'cd "/my dir" && run');
    });
    test('does not consume shell operators adjacent to token', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('cd ${PLUGIN_ROOT}&& echo ok', '/my dir', TOKEN), 'cd "/my dir"&& echo ok');
    });
    test('handles token at start, middle and end of command', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('${PLUGIN_ROOT}/a ${PLUGIN_ROOT}/b ${PLUGIN_ROOT}/c', '/sp ace', TOKEN), '"/sp ace/a" "/sp ace/b" "/sp ace/c"');
    });
    test('uses default CLAUDE_PLUGIN_ROOT token when not specified', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('${CLAUDE_PLUGIN_ROOT}/run.sh', '/safe/path', '${CLAUDE_PLUGIN_ROOT}'), '/safe/path/run.sh');
    });
    test('uses default CLAUDE_PLUGIN_ROOT token with quoting', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('${CLAUDE_PLUGIN_ROOT}/run.sh', '/my dir', '${CLAUDE_PLUGIN_ROOT}'), '"/my dir/run.sh"');
    });
    test('handles Windows-style paths with spaces', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('${PLUGIN_ROOT}\\scripts\\run.bat', 'C:\\Program Files\\plugin', TOKEN), '"C:\\Program Files\\plugin\\scripts\\run.bat"');
    });
    test('handles path with parentheses', () => {
        assert.strictEqual(shellQuotePluginRootInCommand('${PLUGIN_ROOT}/run.sh', '/path(1)', TOKEN), '"/path(1)/run.sh"');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcGx1Z2lucy9zaGVsbFF1b3RlUGx1Z2luUm9vdEluQ29tbWFuZC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUVsRyxLQUFLLENBQUMsK0JBQStCLEVBQUUsR0FBRyxFQUFFO0lBQzNDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsTUFBTSxLQUFLLEdBQUcsZ0JBQWdCLENBQUM7SUFFL0IsSUFBSSxDQUFDLHFEQUFxRCxFQUFFLEdBQUcsRUFBRTtRQUNoRSxNQUFNLENBQUMsV0FBVyxDQUNqQiw2QkFBNkIsQ0FBQyxZQUFZLEVBQUUsWUFBWSxFQUFFLEtBQUssQ0FBQyxFQUNoRSxZQUFZLENBQ1osQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVEQUF1RCxFQUFFLEdBQUcsRUFBRTtRQUNsRSxNQUFNLENBQUMsV0FBVyxDQUNqQiw2QkFBNkIsQ0FBQyx1QkFBdUIsRUFBRSxZQUFZLEVBQUUsS0FBSyxDQUFDLEVBQzNFLG1CQUFtQixDQUNuQixDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMkRBQTJELEVBQUUsR0FBRyxFQUFFO1FBQ3RFLE1BQU0sQ0FBQyxXQUFXLENBQ2pCLDZCQUE2QixDQUFDLHNDQUFzQyxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsRUFDckYsb0JBQW9CLENBQ3BCLENBQUM7SUFD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