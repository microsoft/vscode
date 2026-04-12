/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogger } from '../../../../../platform/log/common/log.js';
import { McpIcons, parseAndValidateMcpIcon } from '../../common/mcpIcons.js';
const createHttpLaunch = (url) => ({
    type: 2 /* McpServerTransportType.HTTP */,
    uri: URI.parse(url),
    headers: []
});
const createStdioLaunch = () => ({
    type: 1 /* McpServerTransportType.Stdio */,
    cwd: undefined,
    command: 'cmd',
    args: [],
    env: {},
    envFile: undefined,
    sandbox: undefined
});
suite('MCP Icons', () => {
    suite('parseAndValidateMcpIcon', () => {
        ensureNoDisposablesAreLeakedInTestSuite();
        test('includes supported icons and sorts sizes ascending', () => {
            const logger = new NullLogger();
            const launch = createHttpLaunch('https://example.com');
            const result = parseAndValidateMcpIcon({
                icons: [
                    { src: 'ftp://example.com/ignored.png', mimeType: 'image/png' },
                    { src: 'data:image/png;base64,AAA', mimeType: 'image/png', sizes: ['64x64', '16x16'] },
                    { src: 'https://example.com/icon.png', mimeType: 'image/png', sizes: ['128x128'] }
                ]
            }, launch, logger);
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].src.toString(true), 'data:image/png;base64,AAA');
            assert.deepStrictEqual(result[0].sizes.map(s => s.width), [16, 64]);
            assert.strictEqual(result[1].src.toString(), 'https://example.com/icon.png');
            assert.deepStrictEqual(result[1].sizes, [{ width: 128, height: 128 }]);
        });
        test('requires http transport with matching authority for remote icons', () => {
            const logger = new NullLogger();
            const httpLaunch = createHttpLaunch('https://example.com');
            const stdioLaunch = createStdioLaunch();
            const icons = {
                icons: [
                    { src: 'https://example.com/icon.png', mimeType: 'image/png', sizes: ['64x64'] },
                    { src: 'https://other.com/icon.png', mimeType: 'image/png', sizes: ['64x64'] }
                ]
            };
            const httpResult = parseAndValidateMcpIcon(icons, httpLaunch, logger);
            assert.deepStrictEqual(httpResult.map(icon => icon.src.toString()), ['https://example.com/icon.png']);
            const stdioResult = parseAndValidateMcpIcon(icons, stdioLaunch, logger);
            assert.strictEqual(stdioResult.length, 0);
        });
        test('accepts file icons only for stdio transport', () => {
            const logger = new NullLogger();
            const stdioLaunch = createStdioLaunch();
            const httpLaunch = createHttpLaunch('https://example.com');
            const icons = {
                icons: [
                    { src: 'file:///tmp/icon.png', mimeType: 'image/png', sizes: ['32x32'] }
                ]
            };
            const stdioResult = parseAndValidateMcpIcon(icons, stdioLaunch, logger);
            assert.strictEqual(stdioResult.length, 1);
            assert.strictEqual(stdioResult[0].src.scheme, 'file');
            const httpResult = parseAndValidateMcpIcon(icons, httpLaunch, logger);
            assert.strictEqual(httpResult.length, 0);
        });
    });
    suite('McpIcons', () => {
        ensureNoDisposablesAreLeakedInTestSuite();
        test('getUrl returns undefined when no icons are available', () => {
            const icons = McpIcons.fromParsed(undefined);
            assert.strictEqual(icons.getUrl(16), undefined);
        });
        test('getUrl prefers theme-specific icons and keeps light fallback', () => {
            const logger = new NullLogger();
            const launch = createHttpLaunch('https://example.com');
            const parsed = parseAndValidateMcpIcon({
                icons: [
                    { src: 'https://example.com/dark.png', mimeType: 'image/png', sizes: ['16x16', '48x48'], theme: 'dark' },
                    { src: 'https://example.com/any.png', mimeType: 'image/png', sizes: ['24x24'] },
                    { src: 'https://example.com/light.png', mimeType: 'image/png', sizes: ['64x64'], theme: 'light' }
                ]
            }, launch, logger);
            const icons = McpIcons.fromParsed(parsed);
            const result = icons.getUrl(32);
            assert.ok(result);
            assert.strictEqual(result.dark.toString(), 'https://example.com/dark.png');
            assert.strictEqual(result.light?.toString(), 'https://example.com/light.png');
        });
        test('getUrl falls back to any-theme icons when no exact size exists', () => {
            const logger = new NullLogger();
            const launch = createHttpLaunch('https://example.com');
            const parsed = parseAndValidateMcpIcon({
                icons: [
                    { src: 'https://example.com/dark.png', mimeType: 'image/png', sizes: ['16x16'], theme: 'dark' },
                    { src: 'https://example.com/any.png', mimeType: 'image/png', sizes: ['64x64'] }
                ]
            }, launch, logger);
            const icons = McpIcons.fromParsed(parsed);
            const result = icons.getUrl(60);
            assert.ok(result);
            assert.strictEqual(result.dark.toString(), 'https://example.com/any.png');
            assert.strictEqual(result.light, undefined);
        });
        test('getUrl reuses light icons when dark theme assets are missing', () => {
            const logger = new NullLogger();
            const launch = createHttpLaunch('https://example.com');
            const parsed = parseAndValidateMcpIcon({
                icons: [
                    { src: 'https://example.com/light.png', mimeType: 'image/png', sizes: ['32x32'], theme: 'light' }
                ]
            }, launch, logger);
            const icons = McpIcons.fromParsed(parsed);
            const result = icons.getUrl(16);
            assert.ok(result);
            assert.strictEqual(result.dark.toString(), 'https://example.com/light.png');
            assert.strictEqual(result.light?.toString(), 'https://example.com/light.png');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwSWNvbnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC90ZXN0L2NvbW1vbi9tY3BJY29ucy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFFBQVEsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRzdFLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxHQUFXLEVBQTBCLEVBQUUsQ0FBQyxDQUFDO0lBQ2xFLElBQUkscUNBQTZCO0lBQ2pDLEdBQUcsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQztJQUNuQixPQUFPLEVBQUUsRUFBRTtDQUNYLENBQUMsQ0FBQztBQUVILE1BQU0saUJBQWlCLEdBQUcsR0FBNEIsRUFBRSxDQUFDLENBQUM7SUFDekQsSUFBSSxzQ0FBOEI7SUFDbEMsR0FBRyxFQUFFLFNBQVM7SUFDZCxPQUFPLEVBQUUsS0FBSztJQUNkLElBQUksRUFBRSxFQUFFO0lBQ1IsR0FBRyxFQUFFLEVBQUU7SUFDUCxPQUFPLEVBQUUsU0FBUztJQUNsQixPQUFPLEVBQUUsU0FBUztDQUNsQixDQUFDLENBQUM7QUFFSCxLQUFLLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtJQUN2QixLQUFLLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO1FBQ3JDLHVDQUF1QyxFQUFFLENBQUM7UUFFMUMsSUFBSSxDQUFDLG9EQUFvRCxFQUFFLEdBQUcsRUFBRTtZQUMvRCxNQUFNLE1BQU0sR0FBRyxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLHFCQUFxQixDQUFDLENBQUM7WUFFdkQsTUFBTSxNQUFNLEdBQUcsdUJBQXVCLENBQUM7Z0JBQ3RDLEtBQUssRUFBRTtvQkFDTixFQUFFLEdBQUcsRUFBRSwrQkFBK0IsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFO29CQUMvRCxFQUFFLEdBQUcsRUFBRSwyQkFBMkIsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsRUFBRTtvQkFDdEYsRUFBRSxHQUFHLEVBQUUsOEJBQThCLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxTQUFTLENBQUMsRUFBRTtpQkFDbEY7YUFDRCxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUVuQixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLFdBQVcsQ0FBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSwyQkFBMkIsQ0FBQyxDQUFDO1lBQ3ZGLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNwRSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsOEJBQThCLENBQUMsQ0FBQztZQUM3RSxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN4RSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxrRUFBa0UsRUFBRSxHQUFHLEVBQUU7WUFDN0UsTUFBTSxNQUFNLEdBQUcsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNoQyxNQUFNLFVBQVUsR0FBRyxnQkFBZ0IsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1lBQzNELE1BQU0sV0FBVyxHQUFHLGlCQUFpQixFQUFFLENBQUM7WUFFeEMsTUFBTSxLQUFLLEdBQUc7Z0JBQ2IsS0FBSyxFQUFFO29CQUNOLEVBQUUsR0FBRyxFQUFFLDhCQUE4QixFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUU7b0JBQ2hGLEVBQUUsR0FBRyxFQUFFLDRCQUE0QixFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUU7aUJBQzlFO2FBQ0QsQ0FBQztZQUVGLE1BQU0sVUFBVSxHQUFHLHVCQUF1QixDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDdEUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxFQUFFLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDO1lBRXRHLE1BQU0sV0FBVyxHQUFHLHVCQUF1QixDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDeEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDZDQUE2QyxFQUFFLEdBQUcsRUFBRTtZQUN4RCxNQUFNLE1BQU0sR0FBRyxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sV0FBVyxHQUFHLGlCQUFpQixFQUFFLENBQUM7WUFDeEMsTUFBTSxVQUFVLEdBQUcsZ0JBQWdCLENBQUMscUJBQXFCLENBQUMsQ0FBQztZQUUzRCxNQUFNLEtBQUssR0FBRztnQkFDYixLQUFLLEVBQUU7b0JBQ04sRUFBRSxHQUFHLEVBQUUsc0JBQXNCLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRTtpQkFDeEU7YUFDRCxDQUFDO1lBRUYsTUFBTSxXQUFXLEdBQUcsdUJBQXVCLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUN4RSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUV0RCxNQUFNLFVBQVUsR0FBRyx1QkFBdUIsQ0FBQyxLQUFLLEVBQUUsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3RFLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLFVBQVUsRUFBRSxHQUFHLEVBQUU7UUFDdEIsdUNBQXVDLEVBQUUsQ0FBQztRQUUxQyxJQUFJLENBQUMsc0RBQXNELEVBQUUsR0FBRyxFQUFFO1lBQ2pFLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ2pELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDhEQUE4RCxFQUFFLEdBQUcsRUFBRTtZQUN6RSxNQUFNLE1BQU0sR0FBRyxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLHFCQUFxQixDQUFDLENBQUM7WUFDdkQsTUFBTSxNQUFNLEdBQUcsdUJBQXVCLENBQUM7Z0JBQ3RDLEtBQUssRUFBRTtvQkFDTixFQUFFLEdBQUcsRUFBRSw4QkFBOEIsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFO29CQUN4RyxFQUFFLEdBQUcsRUFBRSw2QkFBNkIsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFO29CQUMvRSxFQUFFLEdBQUcsRUFBRSwrQkFBK0IsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUU7aUJBQ2pHO2FBQ0QsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDbkIsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMxQyxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRWhDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDbEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLDhCQUE4QixDQUFDLENBQUM7WUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFPLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFLCtCQUErQixDQUFDLENBQUM7UUFDaEYsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZ0VBQWdFLEVBQUUsR0FBRyxFQUFFO1lBQzNFLE1BQU0sTUFBTSxHQUFHLElBQUksVUFBVSxFQUFFLENBQUM7WUFDaEMsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMscUJBQXFCLENBQUMsQ0FBQztZQUN2RCxNQUFNLE1BQU0sR0FBRyx1QkFBdUIsQ0FBQztnQkFDdEMsS0FBSyxFQUFFO29CQUNOLEVBQUUsR0FBRyxFQUFFLDhCQUE4QixFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRTtvQkFDL0YsRUFBRSxHQUFHLEVBQUUsNkJBQTZCLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRTtpQkFDL0U7YUFDRCxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNuQixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzFDLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFaEMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsNkJBQTZCLENBQUMsQ0FBQztZQUMzRSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU8sQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDOUMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsOERBQThELEVBQUUsR0FBRyxFQUFFO1lBQ3pFLE1BQU0sTUFBTSxHQUFHLElBQUksVUFBVSxFQUFFLENBQUM7WUFDaEMsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMscUJBQXFCLENBQUMsQ0FBQztZQUN2RCxNQUFNLE1BQU0sR0FBRyx1QkFBdUIsQ0FBQztnQkFDdEMsS0FBSyxFQUFFO29CQUNOLEVBQUUsR0FBRyxFQUFFLCtCQUErQixFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRTtpQkFDakc7YUFDRCxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNuQixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzFDLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFaEMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsK0JBQStCLENBQUMsQ0FBQztZQUM3RSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU8sQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLEVBQUUsK0JBQStCLENBQUMsQ0FBQztRQUNoRixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==