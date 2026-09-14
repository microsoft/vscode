/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IGitHubPullRequestRef, ISessionArtifact } from './session.js';

export const SESSION_BOARD_VIEW_ID = 'sessions.board';

export const enum SessionReviewSection {
	Conversation = 'conversation',
	Artifacts = 'artifacts',
	Changes = 'changes',
	PullRequest = 'pullRequest',
}

/** Transient review navigation; the active session/chat remain owned by ISessionsService. */
export interface ISessionReviewState {
	readonly sessionResource: URI;
	readonly section: SessionReviewSection;
	readonly artifact?: ISessionArtifact;
	readonly pullRequest?: IGitHubPullRequestRef;
	/** The explicitly selected result to attach when the user chooses Discuss. */
	readonly resource?: URI;
}

export interface ISessionReviewOptions {
	readonly artifact?: ISessionArtifact;
	readonly pullRequest?: IGitHubPullRequestRef;
	readonly resource?: URI;
}
