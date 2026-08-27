/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type LinkPresentationKind =
	| 'resource'
	| 'issue'
	| 'pullRequest'
	| 'commit'
	| 'file'
	| 'folder'
	| 'session'
	| 'repository'
	| 'branch';

export type LinkPresentationStatusKind =
	| 'neutral'
	| 'pending'
	| 'success'
	| 'warning'
	| 'error'
	| 'open'
	| 'closed'
	| 'merged'
	| 'draft'
	| 'notPlanned';

export interface LinkPresentationStatus {
	readonly kind: LinkPresentationStatusKind;
	readonly label: string;
}

export interface LinkPresentation {
	readonly kind: LinkPresentationKind;
	readonly title?: string;
	readonly detail?: string;
	readonly reference?: string;
	readonly status?: LinkPresentationStatus;
	readonly secondaryStatus?: LinkPresentationStatus;
	readonly tooltip?: string;
	readonly ariaLabel?: string;
	readonly isLoading?: boolean;
}

export type GitHubIssueStatus = LinkPresentationStatus & {
	readonly kind: 'open' | 'closed' | 'notPlanned';
};

export type GitHubPullRequestStatus = LinkPresentationStatus & {
	readonly kind: 'open' | 'closed' | 'merged' | 'draft';
};

export type GitHubChecksStatus = LinkPresentationStatus & {
	readonly kind: 'pending' | 'success' | 'error';
};

interface GitHubResourcePresentationData {
	readonly owner: string;
	readonly repository: string;
}

export interface GitHubIssuePresentationData extends GitHubResourcePresentationData {
	readonly number: number;
	readonly title: string;
	readonly status: GitHubIssueStatus;
}

export function buildGitHubIssuePresentation(data: GitHubIssuePresentationData): LinkPresentation {
	return {
		kind: 'issue',
		title: data.title,
		reference: `#${data.number}`,
		status: data.status,
		tooltip: `${data.owner}/${data.repository}#${data.number} · ${data.status.label}`,
		ariaLabel: `Issue ${data.owner} slash ${data.repository} number ${data.number}, ${data.status.label}: ${data.title}`,
	};
}

export interface GitHubPullRequestPresentationData extends GitHubResourcePresentationData {
	readonly number: number;
	readonly title: string;
	readonly status: GitHubPullRequestStatus;
	readonly checksStatus?: GitHubChecksStatus;
}

export function buildGitHubPullRequestPresentation(data: GitHubPullRequestPresentationData): LinkPresentation {
	const checksStatus = data.status.kind === 'open' || data.status.kind === 'draft' ? data.checksStatus : undefined;
	return {
		kind: 'pullRequest',
		title: data.title,
		reference: `#${data.number}`,
		status: data.status,
		...(checksStatus ? { secondaryStatus: checksStatus } : {}),
		tooltip: [`${data.owner}/${data.repository}#${data.number}`, data.status.label, checksStatus?.label].filter(Boolean).join(' · '),
		ariaLabel: `Pull request ${data.owner} slash ${data.repository} number ${data.number}, ${data.status.label}${checksStatus ? `, ${checksStatus.label}` : ''}: ${data.title}`,
	};
}

export interface GitHubRepositoryPresentationData extends GitHubResourcePresentationData {
	readonly language?: string;
	readonly stars?: number;
}

export function buildGitHubRepositoryPresentation(data: GitHubRepositoryPresentationData): LinkPresentation {
	const details = [
		data.language,
		data.stars === undefined ? undefined : `${formatCount(data.stars)} stars`,
	].filter((value): value is string => !!value);
	return {
		kind: 'repository',
		...(details.length ? { detail: details.join(' · ') } : {}),
		tooltip: `${data.owner}/${data.repository}`,
		ariaLabel: `GitHub repository ${data.owner} slash ${data.repository}`,
	};
}

export interface GitHubFolderPresentationData extends GitHubResourcePresentationData {
	readonly path: string;
	readonly href: string;
}

export function buildGitHubFolderPresentation(data: GitHubFolderPresentationData): LinkPresentation {
	return {
		kind: 'folder',
		detail: `${data.owner}/${data.repository} · ${data.path}`,
		tooltip: data.href,
		ariaLabel: `Folder ${data.path} in ${data.owner} slash ${data.repository}`,
	};
}

export interface GitHubBranchPresentationData extends GitHubResourcePresentationData {
	readonly branch: string;
	readonly sha: string;
}

export function buildGitHubBranchPresentation(data: GitHubBranchPresentationData): LinkPresentation {
	return {
		kind: 'branch',
		detail: data.sha.slice(0, 7),
		tooltip: `${data.owner}/${data.repository} · ${data.branch}`,
		ariaLabel: `Branch ${data.branch} in ${data.owner} slash ${data.repository}`,
	};
}

export interface GitHubFilePresentationData extends GitHubResourcePresentationData {
	readonly path: string;
	readonly href: string;
}

export function buildGitHubFilePresentation(data: GitHubFilePresentationData): LinkPresentation {
	return {
		kind: 'file',
		detail: `${data.owner}/${data.repository} · ${data.path}`,
		tooltip: data.href,
		ariaLabel: `File ${data.path} in ${data.owner} slash ${data.repository}`,
	};
}

export interface GitHubLookupFailurePresentationData {
	readonly kind: 'resource' | 'issue' | 'pullRequest' | 'file' | 'repository';
	readonly label: string;
	readonly detail: string;
	readonly errorMessage?: string;
}

export function buildGitHubLookupFailurePresentation(data: GitHubLookupFailurePresentationData): LinkPresentation {
	return {
		kind: data.kind,
		status: { kind: 'error', label: data.label },
		tooltip: `${data.detail} ${data.errorMessage ?? ''}`.trim(),
		ariaLabel: `GitHub ${data.kind} lookup failed: ${data.label}`,
	};
}

export interface GitCommitPresentationData {
	readonly hash: string;
	readonly message: string;
	readonly shortStat?: {
		readonly insertions: number;
		readonly deletions: number;
	};
}

export function buildGitCommitPresentation(commit: GitCommitPresentationData): LinkPresentation {
	const title = commit.message.split(/\r?\n/, 1)[0];
	const insertions = commit.shortStat?.insertions ?? 0;
	const deletions = commit.shortStat?.deletions ?? 0;
	const shortHash = commit.hash.slice(0, 7);
	return {
		kind: 'commit',
		detail: title,
		tooltip: `${shortHash} · ${title} · ${insertions} insertions, ${deletions} deletions`,
		ariaLabel: `Commit ${shortHash}, ${insertions} insertions and ${deletions} deletions: ${title}`,
	};
}

export function buildGitCommitLookupFailurePresentation(shortHash: string, tooltip: string): LinkPresentation {
	return {
		kind: 'commit',
		status: { kind: 'error', label: 'Not available' },
		tooltip,
		ariaLabel: `Git commit ${shortHash} could not be resolved`,
	};
}

export interface WorkspaceRepositoryPresentationData {
	readonly label: string;
	readonly href: string;
	readonly branch?: string;
	readonly changeCount: number;
}

export function buildWorkspaceRepositoryPresentation(data: WorkspaceRepositoryPresentationData): LinkPresentation {
	const detail = [data.branch, data.changeCount ? `${data.changeCount} changes` : 'clean'].filter((value): value is string => !!value).join(' · ');
	return {
		kind: 'repository',
		...(detail ? { detail } : {}),
		status: data.branch ? { kind: data.changeCount ? 'warning' : 'success', label: data.branch } : undefined,
		tooltip: data.href,
		ariaLabel: `Local repository ${data.label}${data.branch ? ` on branch ${data.branch}` : ''}, ${data.changeCount ? `${data.changeCount} changes` : 'clean'}`,
	};
}

export interface WorkspaceResourcePresentationData {
	readonly kind: 'file' | 'folder';
	readonly label: string;
	readonly href: string;
	readonly branch?: string;
	readonly modified: boolean;
}

export function buildWorkspaceResourcePresentation(data: WorkspaceResourcePresentationData): LinkPresentation {
	const details = [
		compactParent(data.label),
		data.branch,
		data.modified ? 'modified' : undefined,
	].filter((value): value is string => !!value);
	return {
		kind: data.kind,
		...(details.length ? { detail: details.join(' · ') } : {}),
		tooltip: data.href,
		ariaLabel: `${data.kind === 'folder' ? 'Folder' : 'File'} ${data.label}`,
	};
}

export function buildLoadingLinkPresentation(kind: LinkPresentation['kind'], label = 'Loading'): LinkPresentation {
	return {
		kind,
		status: { kind: 'pending', label },
	};
}

export function buildWorkspaceLookupFailurePresentation(
	kind: 'file' | 'folder',
	label: string,
	tooltip: string,
	ariaLabel: string,
): LinkPresentation {
	return {
		kind,
		status: { kind: 'error', label },
		tooltip,
		ariaLabel,
	};
}

export function buildLoadingPresentationFromCached(presentation: LinkPresentation): LinkPresentation {
	return { ...presentation, isLoading: true };
}

function relativeParent(value: string): string | undefined {
	const separator = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
	return separator > 0 ? value.slice(0, separator) : undefined;
}

function compactParent(value: string): string | undefined {
	const parent = relativeParent(value);
	if (!parent) {
		return undefined;
	}
	if (!/^(?:[a-z]:[\\/]|[\\/])/i.test(parent)) {
		return parent;
	}
	return parent.split(/[\\/]+/).filter(Boolean).slice(-4).join('/');
}

function formatCount(value: number): string {
	return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : String(value);
}
