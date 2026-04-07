/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, Disposable, Uri } from 'vscode';

export interface TitleAndDescriptionProvider {
	provideTitleAndDescription(context: { commitMessages: string[]; patches: string[] | { patch: string; fileUri: string; previousFileUri?: string }[]; issues?: { reference: string; content: string }[] }, token: CancellationToken): Promise<{ title: string; description?: string } | undefined>;
}

export interface ReviewerComments {
	// To tell which files we should add a comment icon in the "Files Changed" view
	files: Uri[];
	succeeded: boolean;
	// For removing comments
	disposable?: Disposable;
}

export interface ReviewerCommentsProvider {
	provideReviewerComments(context: { repositoryRoot: string; commitMessages: string[]; patches: { patch: string; fileUri: string; previousFileUri?: string }[] }, token: CancellationToken): Promise<ReviewerComments>;
}

export interface RepositoryDescription {
	owner: string;
	repositoryName: string;
	defaultBranch: string;
	currentBranch?: string;
	pullRequest?: {
		title: string;
		url: string;
		number: number;
		id: number;
	};
}

export interface API {
	/**
	 * Register a PR title and description provider.
	 */
	registerTitleAndDescriptionProvider(title: string, provider: TitleAndDescriptionProvider): Disposable;

	/**
	 * Register a PR reviewer comments provider.
	 */
	registerReviewerCommentsProvider(title: string, provider: ReviewerCommentsProvider): Disposable;

	/**
	 * Get the repository description for a given URI.
	 * This includes the owner, repository name, default branch, current branch (if applicable),
	 * and pull request information (if applicable).
	 *
	 * @returns A promise that resolves to a `RepositoryDescription` object or `undefined` if no repository is found.
	 */
	getRepositoryDescription(uri: Uri): Promise<RepositoryDescription | undefined>;
}
