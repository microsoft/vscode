/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MarketplaceReferenceKind, parseMarketplaceReference, parseMarketplaceReferences } from '../../../common/plugins/pluginMarketplaceService.js';

suite('PluginMarketplaceService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses GitHub shorthand marketplace', () => {
		const parsed = parseMarketplaceReference('microsoft/vscode');
		assert.ok(parsed);
		if (!parsed) {
			return;
		}
		assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitHubShorthand);
		assert.strictEqual(parsed.cloneUrl, 'https://github.com/microsoft/vscode.git');
		assert.strictEqual(parsed.canonicalId, 'github:microsoft/vscode');
		assert.strictEqual(parsed.displayLabel, 'microsoft/vscode');
		assert.deepStrictEqual(parsed.cacheSegments, ['github.com', 'microsoft', 'vscode']);
	});

	test('parses direct HTTPS and SSH marketplaces ending in .git', () => {
		const https = parseMarketplaceReference('https://example.com/org/repo.git');
		assert.ok(https);
		if (!https) {
			return;
		}
		assert.strictEqual(https.kind, MarketplaceReferenceKind.GitUri);
		assert.strictEqual(https.displayLabel, 'https://example.com/org/repo.git');
		assert.deepStrictEqual(https.cacheSegments, ['example.com', 'org', 'repo']);

		const ssh = parseMarketplaceReference('ssh://git@example.com/org/repo.git');
		assert.ok(ssh);
		if (!ssh) {
			return;
		}
		assert.strictEqual(ssh.kind, MarketplaceReferenceKind.GitUri);
		assert.deepStrictEqual(ssh.cacheSegments, ['git@example.com', 'org', 'repo']);
	});

	test('parses scp-like git URI marketplaces', () => {
		const parsed = parseMarketplaceReference('git@example.com:org/repo.git');
		assert.ok(parsed);
		if (!parsed) {
			return;
		}
		assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitUri);
		assert.strictEqual(parsed.cloneUrl, 'git@example.com:org/repo.git');
		assert.strictEqual(parsed.canonicalId, 'git:example.com/org/repo.git');
		assert.deepStrictEqual(parsed.cacheSegments, ['example.com', 'org', 'repo']);
	});

	test('parses local file marketplace references', () => {
		const parsed = parseMarketplaceReference('file:///tmp/marketplace-repo');
		assert.ok(parsed);
		if (!parsed) {
			return;
		}
		assert.strictEqual(parsed.kind, MarketplaceReferenceKind.LocalFileUri);
		assert.strictEqual(parsed.localRepositoryUri?.scheme, 'file');
		assert.strictEqual(parsed.cloneUrl, 'file:///tmp/marketplace-repo');
		assert.deepStrictEqual(parsed.cacheSegments, []);
	});

	test('rejects non-shorthand marketplace entries without .git', () => {
		assert.strictEqual(parseMarketplaceReference('https://example.com/org/repo'), undefined);
		assert.strictEqual(parseMarketplaceReference('ssh://git@example.com/org/repo'), undefined);
		assert.strictEqual(parseMarketplaceReference('git@example.com:org/repo'), undefined);
	});

	test('parses HTTPS URI with trailing slash after .git', () => {
		const parsed = parseMarketplaceReference('https://example.com/org/repo.git/');
		assert.ok(parsed);
		if (!parsed) {
			return;
		}
		assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitUri);
		assert.strictEqual(parsed.canonicalId, 'git:example.com/org/repo.git');
		assert.deepStrictEqual(parsed.cacheSegments, ['example.com', 'org', 'repo']);
	});

	test('deduplicates equivalent Git URI forms but keeps shorthand distinct', () => {
		const parsed = parseMarketplaceReferences([
			'microsoft/vscode',
			'https://github.com/microsoft/vscode.git',
			'git@github.com:microsoft/vscode.git',
		]);

		assert.deepStrictEqual(parsed.map(r => r.canonicalId), [
			'github:microsoft/vscode',
			'git:github.com/microsoft/vscode.git',
		]);
	});

	test('parseMarketplaceReferences ignores non-string entries', () => {
		const parsed = parseMarketplaceReferences([null, 42, {}, 'microsoft/vscode']);
		assert.strictEqual(parsed.length, 1);
		assert.strictEqual(parsed[0].canonicalId, 'github:microsoft/vscode');
	});
});
