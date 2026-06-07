/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME, agentHostAuthority, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
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
	 * Replicates SimpleFileDialog.computeScopedPathPrefix:
	 * compares raw URI path with formatted display path to find the prefix.
	 * With the label-friendly agent-host scheme the URI path already IS the
	 * display path, so the prefix is empty.
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
	function remoteUriFrom(path: string, scheme: string, authority: string, prefix: string, query?: string): URI {
		return URI.from({ scheme, authority, path: prefix + path, query });
	}

	test('computeScopedPathPrefix is empty for label-friendly agent host URI', () => {
		const authority = agentHostAuthority('localhost:8089');
		const uri = agentHostUri(authority, '/Users/roblou/code');

		// The label formatter renders the path verbatim, so display === path
		// and there is no prefix to strip.
		const prefix = computeScopedPathPrefix(uri, uri.path);

		assert.strictEqual(prefix, '');
		assert.strictEqual(uri.path, '/Users/roblou/code');
	});

	test('computeScopedPathPrefix is empty for URI with original authority', () => {
		const originalUri = URI.from({ scheme: 'agenthost-content', authority: 'session1', path: '/snap/before' });
		const uri = toAgentHostUri(originalUri, agentHostAuthority('localhost:8089'));

		// The wrapped path is the original path verbatim.
		const prefix = computeScopedPathPrefix(uri, uri.path);

		assert.strictEqual(prefix, '');
		assert.strictEqual(uri.path, '/snap/before');
	});

	test('computeScopedPathPrefix returns empty for plain file URI', () => {
		const uri = URI.from({ scheme: 'file', path: '/Users/roblou/code' });
		// If display matches the full path, prefix is empty
		const prefix = computeScopedPathPrefix(uri, '/Users/roblou/code');
		assert.strictEqual(prefix, '');
	});

	test('pathFromUri returns the label-friendly path unchanged', () => {
		const authority = agentHostAuthority('localhost:8089');
		const uri = agentHostUri(authority, '/Users/roblou/code');

		assert.strictEqual(pathFromUri(uri, ''), '/Users/roblou/code');
	});

	test('pathFromUri with trailing separator', () => {
		const authority = agentHostAuthority('localhost:8089');
		const uri = agentHostUri(authority, '/Users/roblou/code');

		assert.strictEqual(pathFromUri(uri, '', true), '/Users/roblou/code/');
	});

	test('pathFromUri without prefix returns raw path', () => {
		const uri = URI.from({ scheme: 'file', path: '/Users/roblou/code' });
		assert.strictEqual(pathFromUri(uri, ''), '/Users/roblou/code');
	});

	test('remoteUriFrom reconstructs the URI with the real path and meta query', () => {
		const authority = agentHostAuthority('localhost:8089');
		const source = agentHostUri(authority, '/Users/roblou/code');
		const cleanPath = '/Users/roblou/code';

		// Production re-applies the (empty) prefix and carries the meta query
		// from the hint URI.
		const result = remoteUriFrom(cleanPath, AGENT_HOST_SCHEME, authority, '', source.query);

		assert.strictEqual(result.scheme, AGENT_HOST_SCHEME);
		assert.strictEqual(result.authority, authority);
		assert.strictEqual(result.path, '/Users/roblou/code');
		assert.strictEqual(result.toString(), source.toString());
	});

	test('full round-trip: URI -> pathFromUri -> remoteUriFrom -> same URI', () => {
		const authority = agentHostAuthority('localhost:8089');
		const originalPath = '/Users/roblou/code/vscode';
		const uri = agentHostUri(authority, originalPath);

		// Display path equals the URI path, so the prefix is empty.
		const prefix = computeScopedPathPrefix(uri, uri.path);
		assert.strictEqual(prefix, '');

		// pathFromUri returns the real path
		const cleanPath = pathFromUri(uri, prefix);
		assert.strictEqual(cleanPath, originalPath);

		// remoteUriFrom reconstructs the original URI (carrying the meta query)
		const reconstructed = remoteUriFrom(cleanPath, AGENT_HOST_SCHEME, authority, prefix, uri.query);
		assert.strictEqual(reconstructed.toString(), uri.toString());
	});

	test('createBackItem root detection without a prefix', () => {
		const authority = agentHostAuthority('localhost:8089');

		// Root folder: path is '/'
		const rootUri = agentHostUri(authority, '/');
		assert.strictEqual(rootUri.path === '/' || rootUri.path === '', true, 'root should be detected');

		// Non-root folder
		const subUri = agentHostUri(authority, '/Users/roblou');
		assert.notStrictEqual(subUri.path, '/');
		assert.notStrictEqual(subUri.path, '');
	});
});
