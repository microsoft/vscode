/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IGitHubAnonymousClient } from '../anonymous/anonymous.js';
import { IConnectorsClient } from '../connectors/connectors.js';
import { IActionsClient } from '../core/actions.js';
import { IChecksClient } from '../core/checks.js';
import { IIssuesClient } from '../core/issues.js';
import { INotificationsClient } from '../core/notifications.js';
import { IOrganizationsClient } from '../core/organizations.js';
import { IPullRequestsClient } from '../core/pullRequests.js';
import { IRepositoriesClient } from '../core/repositories.js';
import { IReviewsClient } from '../core/reviews.js';
import { ISearchClient } from '../core/search.js';
import { IUsersClient } from '../core/users.js';
import { IGistsClient } from '../gists/gists.js';
import { GitHubAuthorizationContext } from '../githubTypes.js';
import { IAutomationsClient } from '../missionControl/automations.js';
import { IEnvironmentsClient } from '../missionControl/environments.js';
import { ITasksClient } from '../missionControl/tasks.js';

/** A disposable GitHub client bound to a fixed authorization grant. */
export interface IGitHubAccountClient extends IGitHubAnonymousClient {
	/** The authorization grant used for this client's authenticated requests. */
	readonly authorization: GitHubAuthorizationContext;
	/** Fires when an authorization or account change makes this client unusable. */
	readonly onDidInvalidate: Event<void>;
	/** Fires when credentials for the selected grant are replaced or invalidated. */
	readonly onDidChangeCredentials: Event<void>;
	/** Copilot Connector catalog and connection management. */
	readonly connectors: IConnectorsClient;
	/** Mission Control automation management and run requests. */
	readonly automations: IAutomationsClient;
	/** Mission Control environment discovery and connection credentials. */
	readonly environments: IEnvironmentsClient;
	/** Mission Control task management, steering, and history. */
	readonly tasks: ITasksClient;
	/** Gist retrieval and creation. */
	readonly gist: IGistsClient;
	/** Repository, issue, and pull request search. */
	readonly search: ISearchClient;
	/** Workflow runs, jobs, log URLs, reruns, and cancellation. */
	readonly actions: IActionsClient;
	/** Check runs, suites, annotations, and commit statuses. */
	readonly checks: IChecksClient;
	/** Issues, conversation comments, labels, milestones, assignees, and reactions. */
	readonly issues: IIssuesClient;
	/** Notification threads and their read/done state. */
	readonly notifications: INotificationsClient;
	/** Organizations, memberships, teams, and team members. */
	readonly organizations: IOrganizationsClient;
	/** Pull request lifecycle, diffs, merges, auto-merge, and merge queues. */
	readonly pullRequests: IPullRequestsClient;
	/** Repositories, branches, protection rules, commits, and comparisons. */
	readonly repositories: IRepositoriesClient;
	/** Pull request reviews, inline comments, threads, and file-viewed state. */
	readonly reviews: IReviewsClient;
	/** User profiles and the authenticated user's email addresses. */
	readonly users: IUsersClient;
}
