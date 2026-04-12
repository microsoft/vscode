/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME, AGENT_HOST_LABEL_FORMATTER, agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { agentHostUri } from '../../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
/**
 * Tests for the scoped path prefix logic used by SimpleFileDialog.
 *
 * SimpleFileDialog is tightly coupled to many services and difficult to
 * instantiate in isolation. Instead of mocking the full dialog, we test
 * the underlying data transformations that drive the fix:
 *
 * 1. computeScopedPathPrefix - derived from comparing the raw URI path
 *    with the label-service-formatted output.
 * 2. pathFromUri - stripping the prefix from the raw path.
 * 3. remoteUriFrom - re-adding the prefix to user input.
 */
suite('SimpleFileDialog - scoped path prefix', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    /**
     * Replicates the stripPathSegments logic from the label service to
     * produce the display path that the label formatter would return.
     */
    function labelFormatterDisplay(path, stripSegments) {
        let pos = 0;
        for (let i = 0; i < stripSegments; i++) {
            const next = path.indexOf('/', pos + 1);
            if (next === -1) {
                break;
            }
            pos = next;
        }
        return path.substring(pos);
    }
    /**
     * Replicates SimpleFileDialog.computeScopedPathPrefix:
     * compares raw URI path with formatted display path to find the prefix.
     */
    function computeScopedPathPrefix(uri, displayPath) {
        const fullPath = uri.path;
        if (displayPath && fullPath.endsWith(displayPath)) {
            return fullPath.substring(0, fullPath.length - displayPath.length);
        }
        return '';
    }
    /**
     * Replicates the scoped branch of SimpleFileDialog.pathFromUri:
     * strips the prefix from the raw URI path.
     */
    function pathFromUri(uri, prefix, endWithSeparator = false) {
        let path = uri.path;
        if (prefix && path.startsWith(prefix)) {
            path = path.substring(prefix.length);
        }
        let result = path.replace(/\n/g, '');
        result = result.replace(/\\/g, '/');
        if (endWithSeparator && !result.endsWith('/')) {
            result = result + '/';
        }
        return result;
    }
    /**
     * Replicates the scoped branch of SimpleFileDialog.remoteUriFrom:
     * re-adds the prefix to construct a proper URI.
     */
    function remoteUriFrom(path, scheme, authority, prefix) {
        return URI.from({ scheme, authority, path: prefix + path });
    }
    test('computeScopedPathPrefix extracts prefix for agent host URI', () => {
        const authority = agentHostAuthority('localhost:8089');
        const uri = agentHostUri(authority, '/Users/roblou/code');
        const displayPath = labelFormatterDisplay(uri.path, AGENT_HOST_LABEL_FORMATTER.formatting.stripPathSegments);
        const prefix = computeScopedPathPrefix(uri, displayPath);
        assert.strictEqual(prefix, '/file/-');
        assert.strictEqual(displayPath, '/Users/roblou/code');
    });
    test('computeScopedPathPrefix works for URI with original authority', () => {
        const authority = agentHostAuthority('localhost:8089');
        const originalUri = URI.from({ scheme: 'agenthost-content', authority: 'session1', path: '/snap/before' });
        const uri = URI.from({
            scheme: AGENT_HOST_SCHEME,
            authority,
            path: `/${originalUri.scheme}/${originalUri.authority}${originalUri.path}`,
        });
        const displayPath = labelFormatterDisplay(uri.path, AGENT_HOST_LABEL_FORMATTER.formatting.stripPathSegments);
        const prefix = computeScopedPathPrefix(uri, displayPath);
        assert.strictEqual(prefix, '/agenthost-content/session1');
        assert.strictEqual(displayPath, '/snap/before');
    });
    test('computeScopedPathPrefix returns empty for scheme without stripping', () => {
        const uri = URI.from({ scheme: 'file', path: '/Users/roblou/code' });
        // If display matches the full path, prefix is empty
        const prefix = computeScopedPathPrefix(uri, '/Users/roblou/code');
        assert.strictEqual(prefix, '');
    });
    test('pathFromUri strips prefix to show clean path', () => {
        const authority = agentHostAuthority('localhost:8089');
        const uri = agentHostUri(authority, '/Users/roblou/code');
        const prefix = '/file/-';
        assert.strictEqual(pathFromUri(uri, prefix), '/Users/roblou/code');
    });
    test('pathFromUri with trailing separator', () => {
        const authority = agentHostAuthority('localhost:8089');
        const uri = agentHostUri(authority, '/Users/roblou/code');
        const prefix = '/file/-';
        assert.strictEqual(pathFromUri(uri, prefix, true), '/Users/roblou/code/');
    });
    test('pathFromUri without prefix returns raw path', () => {
        const uri = URI.from({ scheme: 'file', path: '/Users/roblou/code' });
        assert.strictEqual(pathFromUri(uri, ''), '/Users/roblou/code');
    });
    test('remoteUriFrom re-adds prefix to reconstruct encoded URI', () => {
        const authority = agentHostAuthority('localhost:8089');
        const prefix = '/file/-';
        const cleanPath = '/Users/roblou/code';
        const result = remoteUriFrom(cleanPath, AGENT_HOST_SCHEME, authority, prefix);
        assert.strictEqual(result.scheme, AGENT_HOST_SCHEME);
        assert.strictEqual(result.authority, authority);
        assert.strictEqual(result.path, '/file/-/Users/roblou/code');
    });
    test('full round-trip: URI -> pathFromUri -> remoteUriFrom -> same URI', () => {
        const authority = agentHostAuthority('localhost:8089');
        const originalPath = '/Users/roblou/code/vscode';
        const uri = agentHostUri(authority, originalPath);
        // Compute prefix
        const displayPath = labelFormatterDisplay(uri.path, AGENT_HOST_LABEL_FORMATTER.formatting.stripPathSegments);
        const prefix = computeScopedPathPrefix(uri, displayPath);
        // pathFromUri extracts clean path
        const cleanPath = pathFromUri(uri, prefix);
        assert.strictEqual(cleanPath, originalPath);
        // remoteUriFrom reconstructs the original URI
        const reconstructed = remoteUriFrom(cleanPath, AGENT_HOST_SCHEME, authority, prefix);
        assert.strictEqual(reconstructed.path, uri.path);
        assert.strictEqual(reconstructed.scheme, uri.scheme);
        assert.strictEqual(reconstructed.authority, uri.authority);
    });
    test('createBackItem root detection with prefix', () => {
        const authority = agentHostAuthority('localhost:8089');
        const prefix = '/file/-';
        // Simulate root folder: path = prefix + '/'
        const rootUri = URI.from({ scheme: AGENT_HOST_SCHEME, authority, path: prefix + '/' });
        const pathAfterPrefix = rootUri.path.substring(prefix.length);
        assert.strictEqual(pathAfterPrefix === '/' || pathAfterPrefix === '', true, 'root should be detected');
        // Simulate non-root folder
        const subUri = URI.from({ scheme: AGENT_HOST_SCHEME, authority, path: prefix + '/Users/roblou' });
        const subPathAfterPrefix = subUri.path.substring(prefix.length);
        assert.notStrictEqual(subPathAfterPrefix, '/');
        assert.notStrictEqual(subPathAfterPrefix, '');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlRmlsZURpYWxvZy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2RpYWxvZ3MvdGVzdC9icm93c2VyL3NpbXBsZUZpbGVEaWFsb2cudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSwwQkFBMEIsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzdJLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUV2Rzs7Ozs7Ozs7Ozs7R0FXRztBQUNILEtBQUssQ0FBQyx1Q0FBdUMsRUFBRSxHQUFHLEVBQUU7SUFFbkQsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQzs7O09BR0c7SUFDSCxTQUFTLHFCQUFxQixDQUFDLElBQVksRUFBRSxhQUFxQjtRQUNqRSxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFDWixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsYUFBYSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDeEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLElBQUksSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ2pCLE1BQU07WUFDUCxDQUFDO1lBQ0QsR0FBRyxHQUFHLElBQUksQ0FBQztRQUNaLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxD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