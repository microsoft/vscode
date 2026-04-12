/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseComponentPathConfig, resolveComponentDirs, normalizeMcpServerConfiguration, shellQuotePluginRootInCommand, convertBareEnvVarsToVsCodeSyntax, } from '../../common/pluginParsers.js';
suite('pluginParsers', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    // ---- parseComponentPathConfig ---------------------------------------
    suite('parseComponentPathConfig', () => {
        test('returns empty config for undefined', () => {
            const result = parseComponentPathConfig(undefined);
            assert.deepStrictEqual(result, { paths: [], exclusive: false });
        });
        test('returns empty config for null', () => {
            const result = parseComponentPathConfig(null);
            assert.deepStrictEqual(result, { paths: [], exclusive: false });
        });
        test('parses a string to single-element paths', () => {
            const result = parseComponentPathConfig('custom/skills');
            assert.deepStrictEqual(result, { paths: ['custom/skills'], exclusive: false });
        });
        test('trims whitespace from string', () => {
            const result = parseComponentPathConfig('  spaced  ');
            assert.deepStrictEqual(result, { paths: ['spaced'], exclusive: false });
        });
        test('returns empty for blank string', () => {
            const result = parseComponentPathConfig('   ');
            assert.deepStrictEqual(result, { paths: [], exclusive: false });
        });
        test('parses a string array', () => {
            const result = parseComponentPathConfig(['a', 'b', 'c']);
            assert.deepStrictEqual(result, { paths: ['a', 'b', 'c'], exclusive: false });
        });
        test('filters non-string entries from arrays', () => {
            const result = parseComponentPathConfig(['valid', 42, null, 'ok']);
            assert.deepStrictEqual(result, { paths: ['valid', 'ok'], exclusive: false });
        });
        test('parses object with paths and exclusive', () => {
            const result = parseComponentPathConfig({ paths: ['x', 'y'], exclusive: true });
            assert.deepStrictEqual(result, { paths: ['x', 'y'], exclusive: true });
        });
        test('object without exclusive defaults to false', () => {
            const result = parseComponentPathConfig({ paths: ['z'] });
            assert.deepStrictEqual(result, { paths: ['z'], exclusive: false });
        });
        test('returns empty for unrecognized types', () => {
            const result = parseComponentPathConfig(42);
            assert.deepStrictEqual(result, { paths: [], exclusive: false });
        });
    });
    // ---- resolveComponentDirs -------------------------------------------
    suite('resolveComponentDirs', () => {
        const pluginUri = URI.file('/workspace/.plugin-root');
        test('includes default directory when not exclusive', () => {
            const dirs = resolveComponentDirs(pluginUri, 'skills', { paths: [], exclusive: false });
            assert.strictEqual(dirs.length, 1);
            assert.ok(dirs[0].path.endsWith('/skills'));
        });
        test('excludes default directory when exclusive', () => {
            const dirs = resolveComponentDirs(pluginUri, 'skills', { paths: ['custom'], exclusive: true });
            assert.ok(!dirs.some(d => d.path.endsWith('/skills')));
            assert.ok(dirs.some(d => d.path.endsWith('/custom')));
        });
        test('resolves relative paths from plugin root', () => {
            const dirs = resolveComponentDirs(pluginUri, 'skills', { paths: ['other/skills'], exclusive: false });
            assert.strictEqual(dirs.length, 2);
            assert.ok(dirs[1].path.endsWith('/other/skills'));
        });
        test('rejects paths that escape plugin root', () => {
            const dirs = resolveComponentDirs(pluginUri, 'skills', { paths: ['../../outside'], exclusive: false });
            // Should only have the default dir, the traversal path is rejected
            assert.strictEqual(dirs.length, 1);
        });
    });
    // ---- normalizeMcpServerConfiguration --------------------------------
    suite('normalizeMcpServerConfiguration', () => {
        test('returns undefined for non-object input', () => {
            assert.strictEqual(normalizeMcpServerConfiguration(null), undefined);
            assert.strictEqual(normalizeMcpServerConfiguration('string'), undefined);
            assert.strictEqual(normalizeMcpServerConfiguration(42), undefined);
        });
        test('parses local server with command', () => {
            const result = normalizeMcpServerConfiguration({
                type: 'stdio',
                command: 'node',
                args: ['server.js'],
                env: { KEY: 'value' },
                cwd: '/workspace',
            });
            assert.ok(result);
            assert.strictEqual(result.type, "stdio" /* McpServerType.LOCAL */);
            assert.strictEqual(result.command, 'node');
        });
        test('infers local type from command without explicit type', () => {
            const result = normalizeMcpServerConfiguration({ command: 'python' });
            assert.ok(result);
            assert.strictEqual(result.type, "stdio" /* McpServerType.LOCAL */);
        });
        test('parses remote server with url', () => {
            const result = normalizeMcpServerConfiguration({
                type: 'sse',
                url: 'https://example.com',
                headers: { 'X-Key': 'val' },
            });
            assert.ok(result);
            assert.strictEqual(result.type, "http" /* McpServerType.REMOTE */);
        });
        test('infers remote type from url without explicit type', () => {
            const result = normalizeMcpServerConfiguration({ url: 'https://example.com' });
            assert.ok(result);
            assert.strictEqual(result.type, "http" /* McpServerType.REMOTE */);
        });
        test('rejects ws type', () => {
            const result = normalizeMcpServerConfiguration({ type: 'ws', url: 'ws://localhost:3000' });
            assert.strictEqual(result, undefined);
        });
        test('rejects local type without command', () => {
            const result = normalizeMcpServerConfiguration({ type: 'stdio' });
            assert.strictEqual(result, undefined);
        });
        test('filters non-string args', () => {
            const result = normalizeMcpServerConfiguration({
                command: 'test',
                args: ['valid', 42, null, 'also-valid'],
            });
            assert.ok(result);
            const args = result.args;
            assert.deepStrictEqual(args, ['valid', 'also-valid']);
        });
    });
    // ---- shellQuotePluginRootInCommand -----------------------------------
    suite('shellQuotePluginRootInCommand', () => {
        test('replaces token with path when no special chars', () => {
            const result = shellQuotePluginRootInCommand('cd ${PLUGIN_ROOT} && run', '/simple/path', '${PLUGIN_ROOT}');
            assert.strictEqual(result, 'cd /simple/path && run');
        });
        test('quotes path with spaces', () => {
            const result = shellQuotePluginRootInCommand('cd ${PLUGIN_ROOT} && run', '/path with spaces', '${PLUGIN_ROOT}');
            assert.ok(result.includes('"'), 'should add quotes for path with spaces');
            assert.ok(result.includes('/path with spaces'));
        });
        test('returns unchanged when token not present', () => {
            const result = shellQuotePluginRootInCommand('echo hello', '/path', '${PLUGIN_ROOT}');
            assert.strictEqual(result, 'echo hello');
        });
        test('handles already-quoted token', () => {
            const result = shellQuotePluginRootInCommand('"${PLUGIN_ROOT}/script.sh"', '/path with spaces', '${PLUGIN_ROOT}');
            assert.ok(!result.includes('""'), 'should not double-quote');
        });
    });
    // ---- convertBareEnvVarsToVsCodeSyntax -------------------------------
    suite('convertBareEnvVarsToVsCodeSyntax', () => {
        test('converts bare env vars to VS Code syntax', () => {
            const def = {
                name: 'test',
                uri: URI.file('/plugin'),
                configuration: {
                    type: "stdio" /* McpServerType.LOCAL */,
                    command: '${MY_TOOL}',
                    args: ['--key=${API_KEY}'],
                },
            };
            const result = convertBareEnvVarsToVsCodeSyntax(def);
            assert.strictEqual(result.configuration.command, '${env:MY_TOOL}');
            assert.deepStrictEqual(result.configuration.args, ['--key=${env:API_KEY}']);
        });
        test('does not convert already-qualified vars', () => {
            const def = {
                name: 'test',
                uri: URI.file('/plugin'),
                configuration: {
                    type: "stdio" /* McpServerType.LOCAL */,
                    command: '${env:ALREADY_QUALIFIED}',
                },
            };
            const result = convertBareEnvVarsToVsCodeSyntax(def);
            assert.strictEqual(result.configuration.command, '${env:ALREADY_QUALIFIED}');
        });
        test('ignores lowercase vars', () => {
            const def = {
                name: 'test',
                uri: URI.file('/plugin'),
                configuration: {
                    type: "stdio" /* McpServerType.LOCAL */,
                    command: '${lowercase}',
                },
            };
            const result = convertBareEnvVarsToVsCodeSyntax(def);
            assert.strictEqual(result.configuration.command, '${lowercase}');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luUGFyc2Vycy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRQbHVnaW5zL3Rlc3QvY29tbW9uL3BsdWdpblBhcnNlcnMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLE9BQU8sRUFDTix3QkFBd0IsRUFDeEIsb0JBQW9CLEVBQ3BCLCtCQUErQixFQUMvQiw2QkFBNkIsRUFDN0IsZ0NBQWdDLEdBQ2hDLE1BQU0sK0JBQStCLENBQUM7QUFFdkMsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7SUFFM0IsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyx3RUFBd0U7SUFFeEUsS0FBSyxDQUFDLDBCQUEwQixFQUFFLEdBQUcsRUFBRTtRQUV0QyxJQUFJLENBQUMsb0NBQW9DLEVBQUUsR0FBRyxFQUFFO1lBQy9DLE1BQU0sTUFBTSxHQUFHLHdCQUF3QixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ25ELE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUNqRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywrQkFBK0IsRUFBRSxHQUFHLEVBQUU7WUFDMUMsTUFBTSxNQUFNLEdBQUcsd0JBQXdCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDOUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ2pFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLEdBQUcsRUFBRTtZQUNwRCxNQUFNLE1BQU0sR0FBRyx3QkFBd0IsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUN6RCxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLGVBQWUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ2hGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDhCQUE4QixFQUFFLEdBQUcsRUFBRTtZQUN6QyxNQUFNLE1BQU0sR0FBRyx3QkFBd0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUN0RCxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ3pFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRTtZQUMzQyxNQUFNLE1BQU0sR0FBRyx3QkFBd0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMvQyxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDakUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFO1lBQ2xDLE1BQU0sTUFBTSxHQUFHLHdCQUF3QixDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3pELE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUM5RSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx3Q0FBd0MsRUFBRSxHQUFHLEVBQUU7WUFDbkQsTUFBTSxNQUFNLEdBQUcsd0JBQXdCLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ25FLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQzlFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHdDQUF3QyxFQUFFLEdBQUcsRUFBRTtZQUNuRCxNQUFNLE1BQU0sR0FBRyx3QkFBd0IsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNoRixNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN4RSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxHQUFHLEVBQUU7WUFDdkQsTUFBTSxNQUFNLEdBQUcsd0JBQXdCLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDMUQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUNwRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxzQ0FBc0MsRUFBRSxHQUFHLEVBQUU7WUFDakQsTUFBTSxNQUFNLEdBQUcsd0JBQXdCLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDNUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ2pFLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCx3RUFBd0U7SUFFeEUsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtRQUVsQyxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFFdEQsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEdBQUcsRUFBRTtZQUMxRCxNQUFNLElBQUksR0FBRyxvQkFBb0IsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUN4RixNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbkMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQzdDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtZQUN0RCxNQUFNLElBQUksR0FBRyxvQkFBb0IsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDL0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdkQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDBDQUEwQyxFQUFFLEdBQUcsRUFBRTtZQUNyRCxNQUFNLElBQUksR0FBRyxvQkFBb0IsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsY0FBYyxDQUFDLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDdEcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ25DLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUNuRCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxHQUFHLEVBQUU7WUFDbEQsTUFBTSxJQUFJLEdBQUcsb0JBQW9CLENBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLGVBQWUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZHLG1FQUFtRTtZQUNuRSxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILHdFQUF3RTtJQUV4RSxLQUFLLENBQUMsaUNBQWlDLEVBQUUsR0FBRyxFQUFFO1FBRTdDLElBQUksQ0FBQyx3Q0FBd0MsRUFBRSxHQUFHLEVBQUU7WUFDbkQsTUFBTSxDQUFDLFdBQVcsQ0FBQywrQkFBK0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLCtCQUErQixDQUFDLFFBQVEsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsK0JBQStCLENBQUMsRUFBRSxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDcEUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxFQUFFO1lBQzdDLE1BQU0sTUFBTSxHQUFHLCtCQUErQixDQUFDO2dCQUM5QyxJQUFJLEVBQUUsT0FBTztnQkFDYixPQUFPLEVBQUUsTUFBTTtnQkFDZixJQUFJLEVBQUUsQ0FBQyxXQUFXLENBQUM7Z0JBQ25CLEdBQUcsRUFBRSxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUU7Z0JBQ3JCLEdBQUcsRUFBRSxZQUFZO2FBQ2pCLENBQUMsQ0FBQztZQUNILE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDbEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFPLENBQUMsSUFBSSxvQ0FBc0IsQ0FBQztZQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFFLE1BQThCLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3JFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHNEQUFzRCxFQUFFLEdBQUcsRUFBRTtZQUNqRSxNQUFNLE1BQU0sR0FBRywrQkFBK0IsQ0FBQyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQ3RFLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDbEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFPLENBQUMsSUFBSSxvQ0FBc0IsQ0FBQztRQUN2RCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywrQkFBK0IsRUFBRSxHQUFHLEVBQUU7WUFDMUMsTUFBTSxNQUFNLEdBQUcsK0JBQStCLENBQUM7Z0JBQzlDLElBQUksRUFBRSxLQUFLO2dCQUNYLEdBQUcsRUFBRSxxQkFBcUI7Z0JBQzFCLE9BQU8sRUFBRSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUU7YUFDM0IsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU8sQ0FBQyxJQUFJLG9DQUF1QixDQUFDO1FBQ3hELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG1EQUFtRCxFQUFFLEdBQUcsRUFBRTtZQUM5RCxNQUFNLE1BQU0sR0FBRywrQkFBK0IsQ0FBQyxFQUFFLEdBQUcsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLENBQUM7WUFDL0UsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU8sQ0FBQyxJQUFJLG9DQUF1QixDQUFDO1FBQ3hELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtZQUM1QixNQUFNLE1BQU0sR0FBRywrQkFBK0IsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQztZQUMzRixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN2QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7WUFDL0MsTUFBTSxNQUFNLEdBQUcsK0JBQStCLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUNsRSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN2QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7WUFDcEMsTUFBTSxNQUFNLEdBQUcsK0JBQStCLENBQUM7Z0JBQzlDLE9BQU8sRUFBRSxNQUFNO2dCQUNmLElBQUksRUFBRSxDQUFDLE9BQU8sRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFlBQVksQ0FBQzthQUN2QyxDQUFDLENBQUM7WUFDSCxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sSUFBSSxHQUFJLE1BQThCLENBQUMsSUFBSSxDQUFDO1lBQ2xELE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFDdkQsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILHlFQUF5RTtJQUV6RSxLQUFLLENBQUMsK0JBQStCLEVBQUUsR0FBRyxFQUFFO1FBRTNDLElBQUksQ0FBQyxnREFBZ0QsRUFBRSxHQUFHLEVBQUU7WUFDM0QsTUFBTSxNQUFNLEdBQUcsNkJBQTZCLENBQzNDLDBCQUEwQixFQUMxQixjQUFjLEVBQ2QsZ0JBQWdCLENBQ2hCLENBQUM7WUFDRixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1FBQ3RELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtZQUNwQyxNQUFNLE1BQU0sR0FBRyw2QkFBNkIsQ0FDM0MsMEJBQTBCLEVBQzFCLG1CQUFtQixFQUNuQixnQkFBZ0IsQ0FDaEIsQ0FBQztZQUNGLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSx3Q0FBd0MsQ0FBQyxDQUFDO1lBQzFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUM7UUFDakQsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMENBQTBDLEVBQUUsR0FBRyxFQUFFO1lBQ3JELE1BQU0sTUFBTSxHQUFHLDZCQUE2QixDQUFDLFlBQVksRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztZQUN0RixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxZQUFZLENBQUMsQ0FBQztRQUMxQyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7WUFDekMsTUFBTSxNQUFNLEdBQUcsNkJBQTZCLENBQzNDLDRCQUE0QixFQUM1QixtQkFBbUIsRUFDbkIsZ0JBQWdCLENBQ2hCLENBQUM7WUFDRixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO1FBQzlELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCx3RUFBd0U7SUFFeEUsS0FBSyxDQUFDLGtDQUFrQyxFQUFFLEdBQUcsRUFBRTtRQUU5QyxJQUFJLENBQUMsMENBQTBDLEVBQUUsR0FBRyxFQUFFO1lBQ3JELE1BQU0sR0FBRyxHQUFHO2dCQUNYLElBQUksRUFBRSxNQUFNO2dCQUNaLEdBQUcsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDeEIsYUFBYSxFQUFFO29CQUNkLElBQUksRUFBRSxpQ0FBNEI7b0JBQ2xDLE9BQU8sRUFBRSxZQUFZO29CQUNyQixJQUFJLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQztpQkFDMUI7YUFDRCxDQUFDO1lBQ0YsTUFBTSxNQUFNLEdBQUcsZ0NBQWdDLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBRSxNQUFNLENBQUMsYUFBcUMsQ0FBQyxPQUFPLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztZQUM1RixNQUFNLENBQUMsZUFBZSxDQUFFLE1BQU0sQ0FBQyxhQUErQyxDQUFDLElBQUksRUFBRSxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUNoSCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx5Q0FBeUMsRUFBRSxHQUFHLEVBQUU7WUFDcEQsTUFBTSxHQUFHLEdBQUc7Z0JBQ1gsSUFBSSxFQUFFLE1BQU07Z0JBQ1osR0FBRyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUN4QixhQUFhLEVBQUU7b0JBQ2QsSUFBSSxFQUFFLGlDQUE0QjtvQkFDbEMsT0FBTyxFQUFFLDBCQUEwQjtpQkFDbkM7YUFDRCxDQUFDO1lBQ0YsTUFBTSxNQUFNLEdBQUcsZ0NBQWdDLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBRSxNQUFNLENBQUMsYUFBcUMsQ0FBQyxPQUFPLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztRQUN2RyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7WUFDbkMsTUFBTSxHQUFHLEdBQUc7Z0JBQ1gsSUFBSSxFQUFFLE1BQU07Z0JBQ1osR0FBRyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUN4QixhQUFhLEVBQUU7b0JBQ2QsSUFBSSxFQUFFLGlDQUE0QjtvQkFDbEMsT0FBTyxFQUFFLGNBQWM7aUJBQ3ZCO2FBQ0QsQ0FBQztZQUNGLE1BQU0sTUFBTSxHQUFHLGdDQUFnQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3JELE1BQU0sQ0FBQyxXQUFXLENBQUUsTUFBTSxDQUFDLGFBQXFDLENBQUMsT0FBTyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQzNGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9