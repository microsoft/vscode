/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { parseMarketplaceReference } from '../../../common/plugins/marketplaceReference.js';
import { getStrictKnownMarketplaces, isMarketplaceReferenceAllowed, IStrictMarketplaceSource } from '../../../common/plugins/strictKnownMarketplaces.js';

suite('strictKnownMarketplaces', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function ref(value: string) {
		const parsed = parseMarketplaceReference(value);
		assert.ok(parsed, `expected '${value}' to parse`);
		return parsed!;
	}

	test('getStrictKnownMarketplaces coerces non-arrays to undefined', () => {
		assert.strictEqual(getStrictKnownMarketplaces(null), undefined);
		assert.strictEqual(getStrictKnownMarketplaces(undefined), undefined);
		assert.strictEqual(getStrictKnownMarketplaces(true), undefined);
		assert.strictEqual(getStrictKnownMarketplaces('[]'), undefined);
		assert.deepStrictEqual(getStrictKnownMarketplaces([]), []);
	});

	test('getStrictKnownMarketplaces drops malformed entries', () => {
		const value = [
			{ source: 'github', repo: 'owner/repo' },
			null,
			42,
			'github',
			{ repo: 'owner/repo' }, // missing source
		];
		assert.deepStrictEqual(getStrictKnownMarketplaces(value), [{ source: 'github', repo: 'owner/repo' }]);
	});

	test('undefined allowlist allows everything; empty allowlist blocks everything', () => {
		const r = ref('microsoft/vscode');
		assert.strictEqual(isMarketplaceReferenceAllowed(undefined, r), true);
		assert.strictEqual(isMarketplaceReferenceAllowed([], r), false);
	});

	test('github entry matches shorthand and equivalent URI forms', () => {
		const allowlist: IStrictMarketplaceSource[] = [{ source: 'github', repo: 'microsoft/vscode-team-kit' }];
		assert.strictEqual(isMarketplaceReferenceAllowed(allowlist, ref('microsoft/vscode-team-kit')), true);
		assert.strictEqual(isMarketplaceReferenceAllowed(allowlist, ref('https://github.com/microsoft/vscode-team-kit.git')), true);
		assert.strictEqual(isMarketplaceReferenceAllowed(allowlist, ref('git@github.com:microsoft/vscode-team-kit.git')), true);
		assert.strictEqual(isMarketplaceReferenceAllowed(allowlist, ref('microsoft/other-repo')), false);
	});

	test('github entry ref must match exactly (tri-state)', () => {
		const pinned: IStrictMarketplaceSource[] = [{ source: 'github', repo: 'owner/repo', ref: 'main' }];
		assert.strictEqual(isMarketplaceReferenceAllowed(pinned, ref('owner/repo#main')), true);
		assert.strictEqual(isMarketplaceReferenceAllowed(pinned, ref('owner/repo')), false);
		assert.strictEqual(isMarketplaceReferenceAllowed(pinned, ref('owner/repo#dev')), false);

		const unpinned: IStrictMarketplaceSource[] = [{ source: 'github', repo: 'owner/repo' }];
		assert.strictEqual(isMarketplaceReferenceAllowed(unpinned, ref('owner/repo')), true);
		assert.strictEqual(isMarketplaceReferenceAllowed(unpinned, ref('owner/repo#main')), false);
	});

	test('github entry with a path never matches (paths are not modeled)', () => {
		const allowlist: IStrictMarketplaceSource[] = [{ source: 'github', repo: 'owner/repo', path: 'sub' }];
		assert.strictEqual(isMarketplaceReferenceAllowed(allowlist, ref('owner/repo')), false);
	});

	test('git entry matches a git URL reference', () => {
		const allowlist: IStrictMarketplaceSource[] = [{ source: 'git', url: 'https://example.com/team/kit.git' }];
		assert.strictEqual(isMarketplaceReferenceAllowed(allowlist, ref('https://example.com/team/kit.git')), true);
		assert.strictEqual(isMarketplaceReferenceAllowed(allowlist, ref('https://example.com/team/other.git')), false);
	});

	test('url entry honors a pinned ref', () => {
		const pinned: IStrictMarketplaceSource[] = [{ source: 'url', url: 'https://example.com/team/kit.git', ref: 'main' }];
		assert.strictEqual(isMarketplaceReferenceAllowed(pinned, ref('https://example.com/team/kit.git#main')), true);
		assert.strictEqual(isMarketplaceReferenceAllowed(pinned, ref('https://example.com/team/kit.git')), false);
		assert.strictEqual(isMarketplaceReferenceAllowed(pinned, ref('https://example.com/team/kit.git#dev')), false);
	});

	test('npm entries never match', () => {
		const allowlist: IStrictMarketplaceSource[] = [{ source: 'npm', package: 'whatever' }];
		assert.strictEqual(isMarketplaceReferenceAllowed(allowlist, ref('owner/repo')), false);
	});

	test('file entry matches a local file URI reference', () => {
		const r = ref('file:///opt/approved/marketplace');
		assert.strictEqual(isMarketplaceReferenceAllowed([{ source: 'file', path: r.localRepositoryUri!.fsPath }], r), true);
		assert.strictEqual(isMarketplaceReferenceAllowed([{ source: 'directory', path: r.localRepositoryUri!.fsPath }], r), true);
		assert.strictEqual(isMarketplaceReferenceAllowed([{ source: 'file', path: '/opt/unapproved' }], r), false);
	});

	test('hostPattern matches by host; invalid regex is treated as non-matching', () => {
		assert.strictEqual(isMarketplaceReferenceAllowed([{ source: 'hostPattern', hostPattern: '^github\\.com$' }], ref('microsoft/vscode')), true);
		assert.strictEqual(isMarketplaceReferenceAllowed([{ source: 'hostPattern', hostPattern: '\\.internal\\.example\\.com$' }], ref('https://plugins.internal.example.com/team/kit.git')), true);
		assert.strictEqual(isMarketplaceReferenceAllowed([{ source: 'hostPattern', hostPattern: '^github\\.com$' }], ref('https://example.com/team/kit.git')), false);
		assert.strictEqual(isMarketplaceReferenceAllowed([{ source: 'hostPattern', hostPattern: '(' }], ref('microsoft/vscode')), false);
	});

	test('pathPattern matches resolved local path only', () => {
		const local = ref('file:///opt/approved/marketplace');
		assert.strictEqual(isMarketplaceReferenceAllowed([{ source: 'pathPattern', pathPattern: 'approved' }], local), true);
		assert.strictEqual(isMarketplaceReferenceAllowed([{ source: 'pathPattern', pathPattern: 'approved' }], ref('microsoft/vscode')), false);
	});
});
