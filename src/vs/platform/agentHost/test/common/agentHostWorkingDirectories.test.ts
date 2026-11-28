/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isLinux } from '../../../../base/common/platform.js';
import { extUri, extUriBiasedIgnorePathCase, extUriIgnorePathCase } from '../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getWorkingDirectoryKey, getWorkingDirectoryScopeId, isMultiRootSession } from '../../common/agentHostWorkingDirectories.js';
import { readWorkingDirectoryKey, readWorkingDirectoryScopeId, SESSION_META_WORKING_DIRECTORY_KEY_POLICY_KEY, SESSION_META_WORKING_DIRECTORY_KEYS_KEY, type SessionSummaryMeta } from '../../common/state/sessionState.js';

suite('agentHostWorkingDirectories', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('scope identity supports case-preserving comparison without changing the default', () => {
		const upper = 'file:///workspace/App';
		const lower = 'file:///workspace/app';
		const other = 'file:///workspace/other';
		assert.deepStrictEqual({
			defaultCaseEqual: getWorkingDirectoryScopeId([upper]) === getWorkingDirectoryScopeId([lower]),
			explicitCaseEqual: getWorkingDirectoryScopeId([upper], extUri) === getWorkingDirectoryScopeId([lower], extUri),
			defaultSetEqual: getWorkingDirectoryScopeId([upper, other]) === getWorkingDirectoryScopeId([other, upper, upper]),
			explicitSetEqual: getWorkingDirectoryScopeId([upper, other], extUri) === getWorkingDirectoryScopeId([other, upper, upper], extUri),
		}, { defaultCaseEqual: !isLinux, explicitCaseEqual: false, defaultSetEqual: true, explicitSetEqual: true });
	});

	test('folder keys follow the supplied comparer and keep the OS-biased default', () => {
		const sameKey = (a: string, b: string, comparer?: typeof extUri) => getWorkingDirectoryKey(a, comparer) === getWorkingDirectoryKey(b, comparer);
		assert.deepStrictEqual({
			defaultPosix: sameKey('file:///w/Repo', 'file:///w/repo'),
			biasedPosix: sameKey('file:///w/Repo', 'file:///w/repo', extUriBiasedIgnorePathCase),
			matchCasePosix: sameKey('file:///w/Repo', 'file:///w/repo', extUri),
			ignoreCasePosix: sameKey('file:///w/Repo', 'file:///w/repo', extUriIgnorePathCase),
			ignoreCaseWindowsDrive: sameKey('file:///C:/Repo', 'file:///c%3A/repo', extUriIgnorePathCase),
			ignoreCaseUnc: sameKey('file://Server/Share/repo', 'file://server/share/REPO', extUriIgnorePathCase),
			matchCaseUnc: sameKey('file://Server/Share/repo', 'file://server/share/REPO', extUri),
		}, { defaultPosix: !isLinux, biasedPosix: !isLinux, matchCasePosix: false, ignoreCasePosix: true, ignoreCaseWindowsDrive: true, ignoreCaseUnc: true, matchCaseUnc: false });
	});

	suite('host working-directory key policy', () => {
		const policyMeta = (policy: string | undefined): SessionSummaryMeta | undefined => policy === undefined ? undefined : { [SESSION_META_WORKING_DIRECTORY_KEY_POLICY_KEY]: policy };
		const sameFallbacks = (meta: SessionSummaryMeta | undefined, a: string, b: string) => ({
			key: readWorkingDirectoryKey(meta, a) === readWorkingDirectoryKey(meta, b),
			scope: readWorkingDirectoryScopeId(meta, [a]) === readWorkingDirectoryScopeId(meta, [b]),
		});

		test('fallback keys follow the host policy instead of the client OS', () => {
			assert.deepStrictEqual({
				matchCasePosix: sameFallbacks(policyMeta('matchCase'), 'file:///w/Repo', 'file:///w/repo'),
				ignoreCasePosix: sameFallbacks(policyMeta('ignoreCase'), 'file:///w/Repo', 'file:///w/repo'),
				ignoreCaseWindowsDrive: sameFallbacks(policyMeta('ignoreCase'), 'file:///C:/Repo', 'file:///c%3A/repo'),
				ignoreCaseUnc: sameFallbacks(policyMeta('ignoreCase'), 'file://Server/Share/repo', 'file://server/share/REPO'),
				matchCaseUnc: sameFallbacks(policyMeta('matchCase'), 'file://Server/Share/repo', 'file://server/share/REPO'),
				matchCaseRemoteScheme: sameFallbacks(policyMeta('matchCase'), 'vscode-vfs://github/owner/Repo', 'vscode-vfs://github/owner/repo'),
			}, {
				matchCasePosix: { key: false, scope: false },
				ignoreCasePosix: { key: true, scope: true },
				ignoreCaseWindowsDrive: { key: true, scope: true },
				ignoreCaseUnc: { key: true, scope: true },
				matchCaseUnc: { key: false, scope: false },
				matchCaseRemoteScheme: { key: true, scope: true },
			});
		});

		test('meta without a known policy keeps OS-biased fallback keys, and recorded keys win', () => {
			const today = { key: !isLinux, scope: !isLinux };
			assert.deepStrictEqual({
				noMeta: sameFallbacks(policyMeta(undefined), 'file:///w/Repo', 'file:///w/repo'),
				noPolicy: sameFallbacks({}, 'file:///w/Repo', 'file:///w/repo'),
				unknownPolicy: sameFallbacks(policyMeta('somethingElse'), 'file:///w/Repo', 'file:///w/repo'),
				recorded: readWorkingDirectoryKey({ [SESSION_META_WORKING_DIRECTORY_KEY_POLICY_KEY]: 'ignoreCase', [SESSION_META_WORKING_DIRECTORY_KEYS_KEY]: { 'file:///w/Repo': 'recorded-key' } }, 'file:///w/Repo'),
			}, { noMeta: today, noPolicy: today, unknownPolicy: today, recorded: 'recorded-key' });
		});
	});

	suite('isMultiRootSession', () => {
		test('is false for undefined, empty, and single-root sessions', () => {
			assert.deepStrictEqual([
				isMultiRootSession(undefined),
				isMultiRootSession([]),
				isMultiRootSession(['file:///workspace/primary']),
			], [false, false, false]);
		});

		test('is true for two or more working directories', () => {
			assert.deepStrictEqual([
				isMultiRootSession(['file:///workspace/a', 'file:///workspace/b']),
				isMultiRootSession(['file:///workspace/a', 'file:///workspace/b', 'file:///workspace/c']),
			], [true, true]);
		});
	});
});
