/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { buildUpgradeUrlWithRedirect } from '../../../browser/chatSetup/chatSetup.js';

/**
 * Parses the final URL and extracts the decoded return_to value,
 * then extracts the decoded vscode URI from the return_to redirect.
 */
function parseRedirectUrl(url: string): { returnTo: string; redirectHost: string; vscodeUri: string } {
	const questionIdx = url.indexOf('return_to=');
	const returnTo = decodeURIComponent(url.slice(questionIdx + 'return_to='.length));
	const redirectUrl = new URL(returnTo);
	const vscodeUri = decodeURIComponent(redirectUrl.searchParams.get('url')!);
	return { returnTo, redirectHost: redirectUrl.host, vscodeUri };
}

suite('buildUpgradeUrlWithRedirect', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('stable quality uses vscode.dev host', () => {
		const result = buildUpgradeUrlWithRedirect(
			'https://github.com/github-copilot/upgrade?utm_source=vscode',
			'vscode',
			'stable'
		);
		const { redirectHost, vscodeUri } = parseRedirectUrl(result);
		assert.strictEqual(redirectHost, 'vscode.dev');
		assert.strictEqual(vscodeUri, 'vscode://GitHub.copilot-chat/upgrade-success');
	});

	test('insider quality uses insiders.vscode.dev host', () => {
		const result = buildUpgradeUrlWithRedirect(
			'https://github.com/github-copilot/upgrade?utm_source=vscode',
			'vscode-insiders',
			'insider'
		);
		const { redirectHost, vscodeUri } = parseRedirectUrl(result);
		assert.strictEqual(redirectHost, 'insiders.vscode.dev');
		assert.strictEqual(vscodeUri, 'vscode-insiders://GitHub.copilot-chat/upgrade-success');
	});

	test('undefined quality defaults to insiders.vscode.dev host', () => {
		const result = buildUpgradeUrlWithRedirect(
			'https://github.com/github-copilot/upgrade?utm_source=vscode',
			'code-oss',
			undefined
		);
		const { redirectHost, vscodeUri } = parseRedirectUrl(result);
		assert.strictEqual(redirectHost, 'insiders.vscode.dev');
		assert.strictEqual(vscodeUri, 'code-oss://GitHub.copilot-chat/upgrade-success');
	});

	test('appends with & when base URL already has query params', () => {
		const result = buildUpgradeUrlWithRedirect(
			'https://github.com/github-copilot/upgrade?utm_source=vscode',
			'vscode',
			'stable'
		);
		assert.ok(result.startsWith('https://github.com/github-copilot/upgrade?utm_source=vscode&return_to='));
	});

	test('appends with ? when base URL has no query params', () => {
		const result = buildUpgradeUrlWithRedirect(
			'https://github.com/github-copilot/upgrade',
			'vscode',
			'stable'
		);
		assert.ok(result.startsWith('https://github.com/github-copilot/upgrade?return_to='));
	});

	test('GHE URL is handled correctly', () => {
		const result = buildUpgradeUrlWithRedirect(
			'https://github.example.com/github-copilot/upgrade?utm_source=vscode',
			'vscode',
			'stable'
		);
		assert.ok(result.startsWith('https://github.example.com/github-copilot/upgrade?utm_source=vscode&return_to='));
		const { vscodeUri } = parseRedirectUrl(result);
		assert.strictEqual(vscodeUri, 'vscode://GitHub.copilot-chat/upgrade-success');
	});
});
