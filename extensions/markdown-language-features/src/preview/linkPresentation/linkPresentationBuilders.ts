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
