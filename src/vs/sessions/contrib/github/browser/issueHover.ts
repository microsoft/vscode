/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createIssueResourceHover, getIssueResourceStatus, type IGitHubIssueHoverModel, type IGitHubResourceHover } from '../../../../workbench/contrib/github/browser/githubResourceHover.js';
import { GitHubIssueStateReason, type IGitHubIssue } from '../common/types.js';

export interface IIssueHoverData {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	readonly repositoryHref: string;
	readonly referenceHref: string;
	readonly issue: IGitHubIssue;
	readonly density: 'default' | 'compact';
	readonly onDidClickRepository?: () => void;
	readonly onDidClickReference?: () => void;
}

export type IIssueHover = IGitHubResourceHover;

export function createIssueHover(data: IIssueHoverData): IIssueHover {
	return createIssueResourceHover({ ...data, issue: toIssueHoverModel(data.issue) });
}

export function createIssueHoverElement(data: IIssueHoverData): HTMLElement {
	return createIssueHover(data).element;
}

/** The issue's display state, used both for the hover's status pill and its accessible description. */
export function getIssueStatus(issue: IGitHubIssue): { readonly kind: 'open' | 'closed' | 'notPlanned' | 'duplicate'; readonly label: string } {
	return getIssueResourceStatus(toIssueHoverModel(issue));
}

function toIssueHoverModel(issue: IGitHubIssue): IGitHubIssueHoverModel {
	return {
		...issue,
		stateReason: issue.stateReason === GitHubIssueStateReason.NotPlanned
			? 'not_planned'
			: issue.stateReason === GitHubIssueStateReason.Duplicate
				? 'duplicate'
				: issue.stateReason === GitHubIssueStateReason.Completed
					? 'completed'
					: undefined,
	};
}
