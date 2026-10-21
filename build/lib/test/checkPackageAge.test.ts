/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { assessPackageVersion, collectRegistryPackageVersions, findException, type PackageAgeExceptions } from '../../npm/check-package-age.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

suite('check-package-age', () => {

	test('collects registry package versions from a lockfile', () => {
		const versions = collectRegistryPackageVersions({
			packages: {
				'': { version: '1.0.0' },
				'node_modules/@playwright/test': { version: '1.64.1', resolved: 'https://registry.npmjs.org/@playwright/test/-/test-1.64.1.tgz' },
				'node_modules/a/node_modules/playwright-core': { version: '1.64.1', resolved: 'https://registry.npmjs.org/playwright-core/-/playwright-core-1.64.1.tgz' },
				'node_modules/alias': { version: '2.0.0', resolved: 'https://registry.npmjs.org/real-name/-/real-name-2.0.0.tgz' },
				'node_modules/from-git': { version: '0.1.0', resolved: 'git+ssh://git@github.com/microsoft/from-git.git#abc' },
				'node_modules/linked': { version: '0.0.1', link: true },
				'node_modules/bundled': { version: '3.0.0', inBundle: true },
				'node_modules/no-resolved': { version: '4.0.0' },
			}
		});
		assert.deepStrictEqual([...versions].sort(), ['@playwright/test@1.64.1', 'no-resolved@4.0.0', 'playwright-core@1.64.1', 'real-name@2.0.0']);
	});

	test('assesses package versions against the feed, the release age and exceptions', () => {
		const exceptions: PackageAgeExceptions = {
			packages: { '@vscode/*': 'internal', 'typescript': 'internal' },
			versions: { 'electron@44.9.1': 'security release' },
		};
		const now = Date.parse('2026-10-21T12:00:00Z');
		const daysAgo = (days: number) => new Date(now - days * DAY_MS);
		const assess = (spec: string, publishedAt: Date | undefined, servedByFeed?: boolean) => {
			const separator = spec.lastIndexOf('@');
			return assessPackageVersion({ name: spec.slice(0, separator), version: spec.slice(separator + 1) }, publishedAt, servedByFeed, exceptions, now).verdict;
		};
		assert.deepStrictEqual({
			old: assess('playwright@1.64.0', daysAgo(14)),
			young: assess('playwright@1.64.1', daysAgo(6.8)),
			youngServedByFeed: assess('playwright@1.64.1', daysAgo(6.8), true),
			unknownPublishTime: assess('private@1.0.0', undefined),
			scopeException: assess('@vscode/codicons@0.0.46', daysAgo(1)),
			nameException: assess('typescript@7.1.0', daysAgo(1)),
			scopeIsNotAPrefixMatch: assess('@vscode-fake/codicons@1.0.0', daysAgo(1)),
			versionException: assess('electron@44.9.1', daysAgo(1)),
			otherVersionOfException: assess('electron@44.9.2', daysAgo(1)),
		}, {
			old: 'ok',
			young: 'tooNew',
			youngServedByFeed: 'ok',
			unknownPublishTime: 'ok',
			scopeException: 'exception',
			nameException: 'exception',
			scopeIsNotAPrefixMatch: 'tooNew',
			versionException: 'exception',
			otherVersionOfException: 'tooNew',
		});
		assert.strictEqual(findException(exceptions, { name: 'typescript-eslint', version: '8.0.0' }), undefined);
	});
});
