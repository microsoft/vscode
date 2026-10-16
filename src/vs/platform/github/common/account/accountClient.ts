/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { IApiRequestProvider } from '../client/request.js';
import { ContentClient } from '../content/contentClient.js';
import { ActionsClient } from '../core/actionsClient.js';
import { ChecksClient } from '../core/checksClient.js';
import { CoreClient } from '../core/coreClient.js';
import { IssuesClient } from '../core/issuesClient.js';
import { NotificationsClient } from '../core/notificationsClient.js';
import { OrganizationsClient } from '../core/organizationsClient.js';
import { PullRequestsClient } from '../core/pullRequestsClient.js';
import { RepositoriesClient } from '../core/repositoriesClient.js';
import { ReviewsClient } from '../core/reviewsClient.js';
import { SearchClient } from '../core/searchClient.js';
import { UsersClient } from '../core/usersClient.js';
import { GistsClient } from '../gists/gistsClient.js';
import { GitHubAuthorizationContext } from '../githubTypes.js';
import { AutomationsClient } from '../missionControl/automationsClient.js';
import { EnvironmentsClient } from '../missionControl/environmentsClient.js';
import { MissionControlClient } from '../missionControl/missionControlClient.js';
import { TasksClient } from '../missionControl/tasksClient.js';
import { IGitHubAccountClient } from './account.js';

interface AccountClientProviders {
	readonly rest: IApiRequestProvider;
	readonly graphql: IApiRequestProvider;
	readonly rawContent?: IApiRequestProvider;
	readonly missionControl?: IApiRequestProvider;
	readonly onDidInvalidate?: Event<void>;
	readonly onDidChangeCredentials?: Event<void>;
}

/** Portable account facade over request providers owned by one explicit grant lease. */
export class AccountClient extends Disposable implements IGitHubAccountClient {
	readonly authorization: GitHubAuthorizationContext;
	private readonly _onDidInvalidate = this._register(new Emitter<void>());
	readonly onDidInvalidate = this._onDidInvalidate.event;
	private readonly _onDidChangeCredentials = this._register(new Emitter<void>());
	readonly onDidChangeCredentials = this._onDidChangeCredentials.event;
	readonly automations: IGitHubAccountClient['automations'];
	readonly environments: IGitHubAccountClient['environments'];
	readonly tasks: IGitHubAccountClient['tasks'];
	readonly content: IGitHubAccountClient['content'];
	readonly gist: IGitHubAccountClient['gist'];
	readonly search: IGitHubAccountClient['search'];
	readonly actions: IGitHubAccountClient['actions'];
	readonly checks: IGitHubAccountClient['checks'];
	readonly issues: IGitHubAccountClient['issues'];
	readonly notifications: IGitHubAccountClient['notifications'];
	readonly organizations: IGitHubAccountClient['organizations'];
	readonly pullRequests: IGitHubAccountClient['pullRequests'];
	readonly repositories: IGitHubAccountClient['repositories'];
	readonly reviews: IGitHubAccountClient['reviews'];
	readonly users: IGitHubAccountClient['users'];

	constructor(
		authorization: GitHubAuthorizationContext,
		providers: AccountClientProviders,
		lifetime: IDisposable,
	) {
		super();
		this._register(lifetime);
		if (providers.onDidInvalidate) {
			this._register(providers.onDidInvalidate(() => this._onDidInvalidate.fire()));
		}
		if (providers.onDidChangeCredentials) {
			this._register(providers.onDidChangeCredentials(() => this._onDidChangeCredentials.fire()));
		}
		this.authorization = Object.freeze({ ...authorization, scopes: Object.freeze([...authorization.scopes]) });
		const core = new CoreClient(providers.rest, providers.graphql);
		const missionControl = new MissionControlClient(providers.missionControl);
		this.automations = new AutomationsClient(missionControl);
		this.environments = new EnvironmentsClient(missionControl);
		this.tasks = new TasksClient(missionControl);
		this.content = new ContentClient(providers.rest, providers.rawContent);
		this.gist = new GistsClient(providers.rest);
		this.search = new SearchClient(core);
		this.actions = new ActionsClient(core);
		this.checks = new ChecksClient(core);
		this.issues = new IssuesClient(core);
		this.notifications = new NotificationsClient(core);
		this.organizations = new OrganizationsClient(core);
		this.pullRequests = new PullRequestsClient(core);
		this.repositories = new RepositoriesClient(core);
		this.reviews = new ReviewsClient(core);
		this.users = new UsersClient(core);
	}
}
