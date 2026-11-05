/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IssueReporterData, IssueReporterExtensionData, IssueSource } from '../../common/issue.js';
import { getIssueReporterRepositoryChoices, getIssueReporterUrlWithTitle, internalIssueReporterUrl, issueReporterRepositoryPattern, parseGitHubRepository, parseIssueReporterRepositories, resolveIssueReporterTarget } from '../../common/issueReporterTarget.js';

suite('Issue reporter targets', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const product = {
		reportIssueUrl: 'https://github.com/microsoft/vscode/issues/new',
		reportMarketplaceIssueUrl: 'https://github.com/microsoft/vsmarketplace/issues/new',
	};
	const extension: IssueReporterExtensionData = {
		id: 'publisher.extension', name: 'extension', displayName: 'Extension', version: '1',
		publisher: 'publisher', isBuiltin: false, isTheme: false,
		bugsUrl: 'https://github.com/publisher/extension/issues', repositoryUrl: undefined,
	};
	const data: IssueReporterData = {
		styles: {}, zoomLevel: 0, enabledExtensions: [extension], restrictedMode: false,
		isInstallationPure: true, isSessionsWindow: false, githubAccessToken: '',
	};

	const cases: { name: string; overrides: Partial<IssueReporterData>; url: string | undefined; isPrivate?: boolean; isPublic?: boolean; choice?: boolean; external?: boolean }[] = [
		{ name: 'ordinary Help report', overrides: {}, url: product.reportIssueUrl, isPublic: true },
		{ name: 'private capability without a URI', overrides: { privateUri: URI.parse(internalIssueReporterUrl) }, url: product.reportIssueUrl, choice: true },
		{ name: 'private capability with a public URI', overrides: { uri: URI.parse('https://github.com/microsoft/vscode'), privateUri: URI.parse(internalIssueReporterUrl) }, url: 'https://github.com/microsoft/vscode', choice: true },
		{ name: 'explicit internal choice', overrides: { privateUri: URI.parse(internalIssueReporterUrl), issueRepository: 'microsoft/vscode-internalbacklog' }, url: internalIssueReporterUrl, isPrivate: true, choice: true },
		{ name: 'internal choice overrides the paired public URI', overrides: { uri: URI.parse(product.reportIssueUrl), privateUri: URI.parse(internalIssueReporterUrl), issueRepository: 'microsoft/vscode-internalbacklog' }, url: internalIssueReporterUrl, isPrivate: true, choice: true },
		{ name: 'explicitly private diagnostics URI', overrides: { uri: URI.parse(internalIssueReporterUrl), privateUri: URI.parse(internalIssueReporterUrl) }, url: internalIssueReporterUrl, isPrivate: true },
		{ name: 'private URI alone is recognized', overrides: { uri: URI.parse(internalIssueReporterUrl) }, url: internalIssueReporterUrl, isPrivate: true },
		{ name: 'explicit unrelated URI', overrides: { uri: URI.parse('https://github.com/owner/custom/issues/new?labels=bug'), privateUri: URI.parse(internalIssueReporterUrl) }, url: 'https://github.com/owner/custom/issues/new?labels=bug' },
		{ name: 'missing selected repository fails closed', overrides: { issueRepository: 'owner/missing' }, url: undefined },
		{ name: 'invalid selected repository fails closed', overrides: { issueRepository: 'owner/repo?query=bad' }, url: undefined },
		{ name: 'empty selected repository fails closed', overrides: { issueRepository: '' }, url: undefined },
		{ name: 'known-public capability does not mislabel the normal public default', overrides: { privateUri: URI.parse(product.reportIssueUrl) }, url: product.reportIssueUrl },
		{ name: 'Marketplace ignores product repository selection', overrides: { issueSource: IssueSource.Marketplace, uri: URI.parse(internalIssueReporterUrl), issueRepository: 'owner/alternative' }, url: product.reportMarketplaceIssueUrl, isPublic: true },
		{ name: 'extension ignores product repository selection', overrides: { issueSource: IssueSource.Extension, extensionId: 'PUBLISHER.EXTENSION', uri: URI.parse(internalIssueReporterUrl), issueRepository: 'owner/alternative' }, url: 'https://github.com/publisher/extension/issues/new' },
		{ name: 'missing extension never falls back to product', overrides: { issueSource: IssueSource.Extension, extensionId: 'missing.extension' }, url: undefined },
		{ name: 'external extension issue handler', overrides: { issueSource: IssueSource.Extension, extensionId: extension.id, enabledExtensions: [{ ...extension, uri: URI.parse('https://example.com/feedback') }] }, url: 'https://example.com/feedback', external: true },
		{ name: 'extension explicitly private override', overrides: { issueSource: IssueSource.Extension, extensionId: extension.id, enabledExtensions: [{ ...extension, uri: URI.parse('https://github.com/publisher/private/issues/new'), privateUri: URI.parse('https://github.com/publisher/private') }] }, url: 'https://github.com/publisher/private/issues/new', isPrivate: true },
		{ name: 'custom URI ignores product alternatives', overrides: { uri: URI.parse('https://github.com/owner/custom?labels=bug#context'), additionalRepositories: ['owner/alternative'], issueRepository: 'owner/alternative' }, url: 'https://github.com/owner/custom?labels=bug#context' },
		{ name: 'private diagnostics ignore product alternatives', overrides: { uri: URI.parse(internalIssueReporterUrl), privateUri: URI.parse(internalIssueReporterUrl), additionalRepositories: ['owner/alternative'], issueRepository: 'microsoft/vscode' }, url: internalIssueReporterUrl, isPrivate: true },
		{ name: 'invalid explicit URI fails closed', overrides: { uri: URI.parse('command:extension.report') }, url: undefined },
		{ name: 'path escape fails closed', overrides: { uri: URI.parse('https://github.com/owner/repo/../other') }, url: undefined },
	];
	for (const testCase of cases) {
		test(testCase.name, () => {
			const input = { ...data, ...testCase.overrides };
			const target = resolveIssueReporterTarget(input, product);
			assert.deepStrictEqual({
				url: target?.url,
				isPrivate: target?.isPrivate,
				isPublic: target?.isPublic,
				external: target?.external,
				choice: getIssueReporterRepositoryChoices(input, product).length > 1,
			}, {
				url: testCase.url,
				isPrivate: testCase.url ? testCase.isPrivate ?? false : undefined,
				isPublic: testCase.url ? testCase.isPublic ?? (testCase.url.startsWith('https://github.com/microsoft/vscode') && !testCase.isPrivate) : undefined,
				external: testCase.url ? testCase.external ?? false : undefined,
				choice: testCase.choice ?? false,
			});
		});
	}

	test('additional repositories preserve order, deduplicate case and leave the default selected', () => {
		const input = { ...data, additionalRepositories: ['MICROSOFT/VSCODE', 'Team/second', 'team/SECOND', 'owner/third'] };
		assert.deepStrictEqual({
			choices: getIssueReporterRepositoryChoices(input, product).map(target => target.url),
			initial: resolveIssueReporterTarget(input, product)?.url,
			second: resolveIssueReporterTarget({ ...input, issueRepository: 'team/second' }, product),
			third: resolveIssueReporterTarget({ ...input, issueRepository: 'owner/third' }, product)?.url,
		}, {
			choices: [product.reportIssueUrl, 'https://github.com/Team/second/issues/new', 'https://github.com/owner/third/issues/new'],
			initial: product.reportIssueUrl,
			second: { url: 'https://github.com/Team/second/issues/new', repository: { owner: 'Team', repositoryName: 'second' }, isPublic: false, isPrivate: false, external: false },
			third: 'https://github.com/owner/third/issues/new',
		});
	});

	test('configured product repository casing is preserved while choices are deduplicated case-insensitively', () => {
		const capitalizedProduct = { ...product, reportIssueUrl: 'https://github.com/Microsoft/vscode/issues/new' };
		const input = { ...data, additionalRepositories: ['microsoft/vscode', 'owner/second'] };
		assert.deepStrictEqual({
			choices: getIssueReporterRepositoryChoices(input, capitalizedProduct).map(target => target.url),
			selected: resolveIssueReporterTarget({ ...input, issueRepository: 'MICROSOFT/VSCODE' }, capitalizedProduct),
		}, {
			choices: [capitalizedProduct.reportIssueUrl, 'https://github.com/owner/second/issues/new'],
			selected: { url: capitalizedProduct.reportIssueUrl, repository: { owner: 'Microsoft', repositoryName: 'vscode' }, isPublic: true, isPrivate: false, external: false },
		});
	});

	test('non-GitHub product and Marketplace defaults retain body-prefill behavior', () => {
		const customProduct = { reportIssueUrl: 'https://example.com/product', reportMarketplaceIssueUrl: 'https://example.com/marketplace' };
		assert.deepStrictEqual([
			resolveIssueReporterTarget(data, customProduct),
			resolveIssueReporterTarget({ ...data, issueSource: IssueSource.Marketplace }, customProduct),
			resolveIssueReporterTarget({ ...data, uri: URI.parse('https://example.com/custom') }, customProduct),
		].map(target => ({ url: target?.url, external: target?.external })), [
			{ url: customProduct.reportIssueUrl, external: false },
			{ url: customProduct.reportMarketplaceIssueUrl, external: false },
			{ url: 'https://example.com/custom', external: true },
		]);
	});

	test('empty and default-only lists do not add alternatives', () => {
		assert.deepStrictEqual([undefined, [], ['microsoft/vscode', 'MICROSOFT/VSCODE']].map(additionalRepositories =>
			getIssueReporterRepositoryChoices({ ...data, additionalRepositories }, product).map(target => target.url)),
			[[product.reportIssueUrl], [product.reportIssueUrl], [product.reportIssueUrl]]);
	});

	test('runtime configuration and schema reject malformed names and arrays', () => {
		const invalidNames = ['', 'https://github.com/owner/repo', 'owner/repo?labels=bug', 'owner/repo#private', 'owner/../repo', 'owner/..', 'owner/.', 'owner/%2e%2e', 'owner/repo/other', 'owner\\repo', 'owner/repo\n', 'owner/repo\r\n', '-owner/repo', 'owner-/repo', 'ow--ner/repo', 'ow_ner/repo', `${'o'.repeat(40)}/repo`, `owner/${'r'.repeat(101)}`, 'command:report'];
		const pattern = new RegExp(issueReporterRepositoryPattern);
		assert.deepStrictEqual(invalidNames.map(name => pattern.test(name)), invalidNames.map(() => false));
		for (const value of [null, true, 'owner/repo', {}, [123], ['owner/valid', false], ...invalidNames.map(name => [name])]) {
			assert.throws(() => parseIssueReporterRepositories(value), /owner\/repo format/);
		}
		assert.deepStrictEqual(parseIssueReporterRepositories(['Owner/repo', 'owner/REPO', 'team-a/repo.name_1']), ['Owner/repo', 'team-a/repo.name_1']);
	});

	test('unsafe explicit GitHub URLs do not become other repositories', () => {
		assert.deepStrictEqual([
			'https://github.com/owner/repo/../other', 'https://github.com/owner/repo/%2e%2e/other',
			'https://github.com/owner/%2e%2e', 'https://github.com/owner/repo\\other',
			'https://github.com@evil.example/owner/repo', 'https://github.com/owner:token/repo',
		].map(parseGitHubRepository), Array(6).fill(undefined));
	});

	test('normalizes explicit repository overrides without losing their query', () => {
		assert.strictEqual(
			getIssueReporterUrlWithTitle('Title #1 & more', 'https://github.com/owner/custom?labels=bug'),
			'https://github.com/owner/custom/issues/new?labels=bug&title=Title+%231+%26+more',
		);
	});
});
