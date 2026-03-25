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
	function labelFormatterDisplay(path: string, stripSegments: number): string {
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
	function computeScopedPathPrefix(uri: URI, displayPath: string): string {
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
	function pathFromUri(uri: URI, prefix: string, endWithSeparator: boolean = false): string {
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
	function remoteUriFrom(path: string, scheme: string, authority: string, prefix: string): URI {
		return URI.from({ scheme, authority, path: prefix + path });
	}

	test('computeScopedPathPrefix extracts prefix for agent host URI', () => {
		const authority = agentHostAuthority('localhost:8089');
		const uri = agentHostUri(authority, '/Users/roblou/code');

		const displayPath = labelFormatterDisplay(uri.path, AGENT_HOST_LABEL_FORMATTER.formatting.stripPathSegments!);
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

		const displayPath = labelFormatterDisplay(uri.path, AGENT_HOST_LABEL_FORMATTER.formatting.stripPathSegments!);
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
		const displayPath = labelFormatterDisplay(uri.path, AGENT_HOST_LABEL_FORMATTER.formatting.stripPathSegments!);
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
