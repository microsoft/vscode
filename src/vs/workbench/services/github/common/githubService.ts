/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IReference } from '../../../../base/common/lifecycle.js';
import { IGitHubClient, IGitHubService } from '../../../../platform/github/common/githubService.js';
import { refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IGitHubAccountClient } from '../../../../platform/github/common/account/account.js';
import { IGitHubAnonymousClient } from '../../../../platform/github/common/anonymous/anonymous.js';
import { GitHubAuthorizationContext } from '../../../../platform/github/common/githubTypes.js';
import { AuthenticationSession } from '../../authentication/common/authentication.js';

export const IWorkbenchGitHubService = refineServiceDecorator<IGitHubService, IWorkbenchGitHubService>(IGitHubService);

export interface IWorkbenchGitHubService extends IGitHubService {
	/**
	 * Fires when the client returned by the default-account methods may be a different one. The default account is the default GitHub
	 * account or, while the default account is not a GitHub account, the person's GitHub account for repository data; not for Copilot features.
	 */
	readonly onDidChangeDefaultClient: Event<void>;
	acquireAnonymousApiClient(cancellationToken: CancellationToken): Promise<IGitHubAnonymousClient>;
	acquireAccountApiClient(providerId: string, session: AuthenticationSession, cancellationToken: CancellationToken): Promise<IGitHubAccountClient>;
	/** Acquires a client for the default GitHub account, or, while the default account is not a GitHub account, the person's GitHub account for repository data; not for Copilot features. */
	acquireDefaultAccountClient(cancellationToken: CancellationToken): Promise<IReference<IGitHubClient>>;
	/** Acquires an API client for the default GitHub account, or, while the default account is not a GitHub account, the person's GitHub account for repository data; not for Copilot features. */
	acquireDefaultAccountApiClient(cancellationToken: CancellationToken): Promise<IGitHubAccountClient>;
}

/** Captures the selected session's grant without retaining its tokens. */
export function toGitHubAuthorizationContext(providerId: string, session: AuthenticationSession): GitHubAuthorizationContext {
	return {
		providerId,
		sessionId: session.id,
		accountId: session.account.id,
		scopes: [...session.scopes],
		authorizationServer: session.authorizationServer?.toString(),
	};
}
