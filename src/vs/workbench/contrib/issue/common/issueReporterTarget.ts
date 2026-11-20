/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../../base/common/arrays.js';
import { IProductConfiguration } from '../../../../base/common/product.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IssueReporterData, IssueReporterExtensionData, IssueSource } from './issue.js';
import { normalizeGitHubUrl } from './issueReporterUtil.js';

export const issueReporterAdditionalRepositoriesSettingId = 'issueReporter.additionalRepositories';
export const issueReporterRepositoryPattern = '^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}/(?!\\.{1,2}$)[a-zA-Z0-9_.-]{1,100}$(?![\\r\\n])';
export const internalIssueReporterUrl = 'https://github.com/microsoft/vscode-internalbacklog';

type IssueTargetData = Pick<IssueReporterData, 'issueSource' | 'extensionId' | 'enabledExtensions' | 'uri' | 'privateUri' | 'additionalRepositories' | 'issueRepository'>;
type IssueProduct = Pick<IProductConfiguration, 'reportIssueUrl' | 'reportMarketplaceIssueUrl'>;

export interface IssueReporterTarget {
	readonly url: string;
	readonly external: boolean;
	readonly isPrivate: boolean;
	readonly isPublic: boolean;
	readonly repository: { readonly owner: string; readonly repositoryName: string } | undefined;
}

const repositoryNameRegex = new RegExp(issueReporterRepositoryPattern);

export function parseIssueReporterRepositories(value: unknown): readonly string[] {
	if (value === undefined) {
		return [];
	}
	if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string' || !repositoryNameRegex.test(entry))) {
		throw new Error('Additional issue repositories must be an array of GitHub repositories in owner/repo format.');
	}
	return distinct<string>(value, entry => entry.toLowerCase());
}

export function parseGitHubRepository(url: string): IssueReporterTarget['repository'] {
	const match = /^https?:\/\/github\.com\/(?<owner>[^/?#]+)\/(?<repository>[^/?#]+)(?<path>[^?#]*)/i.exec(url);
	if (!match?.groups || url.includes('\\') || match.groups.path.split('/').some(segment => segment === '.' || segment === '..' || segment.includes('%'))) {
		return undefined;
	}
	const { owner, repository } = match.groups;
	const repositoryName = !match.groups.path || match.groups.path === '/' ? repository.replace(/\.git$/, '') : repository;
	return repositoryNameRegex.test(`${owner}/${repositoryName}`) ? { owner, repositoryName } : undefined;
}

export function isPublicVSCodeIssueUrl(url: string | undefined): boolean {
	const repository = url ? parseGitHubRepository(url) : undefined;
	return repository?.owner.toLowerCase() === 'microsoft' && repository.repositoryName.toLowerCase() === 'vscode';
}

function getExtensionIssueUrl(extension: IssueReporterExtensionData): string | undefined {
	if (extension.uri) {
		return URI.revive(extension.uri).toString(true);
	}
	if (extension.bugsUrl && /^https?:\/\/github\.com\/([^/]*)\/([^/]*)\/?(\/issues)?\/?$/.test(extension.bugsUrl)) {
		return `${normalizeGitHubUrl(extension.bugsUrl)}/issues/new`;
	}
	if (extension.repositoryUrl && /^https?:\/\/github\.com\/([^/]*)\/([^/]*)\/?$/.test(extension.repositoryUrl)) {
		return `${normalizeGitHubUrl(extension.repositoryUrl)}/issues/new`;
	}
	return extension.bugsUrl || extension.repositoryUrl;
}

function createIssueReporterTarget(url: string | undefined, privateUrl?: string): IssueReporterTarget | undefined {
	if (!url || !/^https?:\/\//i.test(url) || url.includes('\\')) {
		return undefined;
	}
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return undefined;
	}
	if (parsed.username || parsed.password) {
		return undefined;
	}
	const repository = parseGitHubRepository(url);
	if (parsed.hostname.toLowerCase() === 'github.com' && !repository) {
		return undefined;
	}
	const isPublic = isPublicVSCodeIssueUrl(url)
		|| (repository?.owner.toLowerCase() === 'microsoft' && repository.repositoryName.toLowerCase() === 'vsmarketplace');
	const privateRepository = privateUrl ? parseGitHubRepository(privateUrl) : undefined;
	const isPrivate = !isPublic && ((repository?.owner.toLowerCase() === 'microsoft' && repository.repositoryName.toLowerCase() === 'vscode-internalbacklog')
		|| (!!privateUrl && (repository && privateRepository
			? repository.owner.toLowerCase() === privateRepository.owner.toLowerCase() && repository.repositoryName.toLowerCase() === privateRepository.repositoryName.toLowerCase()
			: isEqual(URI.parse(url), URI.parse(privateUrl)))));
	return { url, repository, isPrivate, isPublic, external: !repository };
}

function getDefaultIssueReporterTarget(data: IssueTargetData, product: IssueProduct): IssueReporterTarget | undefined {
	let url: string | undefined;
	let privateUrl: string | undefined;
	if (data.issueSource === IssueSource.Extension) {
		const extension = data.enabledExtensions.find(extension => extension.id.toLowerCase() === data.extensionId?.toLowerCase());
		if (!extension) {
			return undefined;
		}
		url = getExtensionIssueUrl(extension);
		privateUrl = URI.revive(extension.privateUri)?.toString(true);
	} else if (data.issueSource === IssueSource.Marketplace) {
		url = product.reportMarketplaceIssueUrl ?? product.reportIssueUrl;
	} else {
		privateUrl = URI.revive(data.privateUri)?.toString(true);
		url = URI.revive(data.uri)?.toString(true) ?? product.reportIssueUrl;
	}
	const target = createIssueReporterTarget(url, privateUrl);
	return target && {
		...target,
		external: target.external && (data.issueSource === IssueSource.Extension || (data.issueSource !== IssueSource.Marketplace && !!data.uri)),
	};
}

function supportsRepositorySelection(data: IssueTargetData, target: IssueReporterTarget | undefined): boolean {
	return data.issueSource !== IssueSource.Extension && data.issueSource !== IssueSource.Marketplace && !!target && isPublicVSCodeIssueUrl(target.url);
}

export function getIssueReporterRepositoryChoices(data: IssueTargetData, product: IssueProduct): readonly IssueReporterTarget[] {
	const defaultTarget = getDefaultIssueReporterTarget(data, product);
	if (!defaultTarget) {
		return [];
	}
	if (!supportsRepositorySelection(data, defaultTarget)) {
		return [defaultTarget];
	}
	let repositories: readonly string[];
	try {
		repositories = parseIssueReporterRepositories(data.additionalRepositories);
	} catch {
		return [];
	}
	const choices = [defaultTarget];
	const privateUrl = URI.revive(data.privateUri)?.toString(true);
	const privateTarget = createIssueReporterTarget(privateUrl, privateUrl);
	if (privateTarget?.repository && privateTarget.isPrivate) {
		choices.push(privateTarget);
	}
	for (const repository of repositories) {
		choices.push(createIssueReporterTarget(`https://github.com/${repository}/issues/new`)!);
	}
	return distinct(choices, target => `${target.repository!.owner}/${target.repository!.repositoryName}`.toLowerCase());
}

export function resolveIssueReporterTarget(data: IssueTargetData, product: IssueProduct): IssueReporterTarget | undefined {
	const defaultTarget = getDefaultIssueReporterTarget(data, product);
	if (data.issueRepository === undefined || !supportsRepositorySelection(data, defaultTarget)) {
		return defaultTarget;
	}
	if (!repositoryNameRegex.test(data.issueRepository)) {
		return undefined;
	}
	return getIssueReporterRepositoryChoices(data, product).find(target =>
		`${target.repository?.owner}/${target.repository?.repositoryName}`.toLowerCase() === data.issueRepository!.toLowerCase());
}

export function getIssueReporterUrlWithTitle(issueTitle: string, issueUrl: string): string {
	const repository = parseGitHubRepository(issueUrl);
	const url = new URL(issueUrl);
	if (repository) {
		url.pathname = `/${repository.owner}/${repository.repositoryName}/issues/new`;
	}
	url.searchParams.set('title', issueTitle);
	return url.toString();
}
