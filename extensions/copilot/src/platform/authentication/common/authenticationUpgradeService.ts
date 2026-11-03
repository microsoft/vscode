/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type { ChatContext, ChatRequest, ChatResponseStream } from 'vscode';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { findLast } from '../../../util/vs/base/common/arraysFind';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { URI } from '../../../util/vs/base/common/uri';
import { ChatRequestTurn } from '../../../vscodeTypes';
import { AuthPermissionMode, ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { getGitHubRepoInfoFromContext, IGitService } from '../../git/common/gitService';
import { IGithubRepositoryService } from '../../github/common/githubService';
import { ILogService } from '../../log/common/logService';
import { IAuthenticationService } from './authentication';
import { IAuthenticationChatUpgradeService } from './authenticationUpgrade';

export class AuthenticationChatUpgradeService extends Disposable implements IAuthenticationChatUpgradeService {
	declare _serviceBrand: undefined;

	private hasRequestedPermissiveSessionUpgrade = false;

	//#region Localization
	private _permissionRequest = l10n.t('Permission Request');
	private _permissionRequestGrant = l10n.t('Grant');
	private _permissionRequestNotNow = l10n.t('Not Now');
	private _permissionRequestNeverAskAgain = l10n.t('Never Ask Again');

	private readonly _onDidGrantAuthUpgrade = this._register(new Emitter<void>());
	public readonly onDidGrantAuthUpgrade = this._onDidGrantAuthUpgrade.event;

	//#endregion
	constructor(
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IGitService private readonly gitService: IGitService,
		@ILogService private readonly logService: ILogService,
		@IGithubRepositoryService private readonly ghRepoService: IGithubRepositoryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		// If the user signs out, reset the upgrade state
		this._register(this._authenticationService.onDidAuthenticationChange(() => {
			if (this._authenticationService.anyGitHubSession) {
				this.hasRequestedPermissiveSessionUpgrade = false;
			}
		}));
	}

	async shouldRequestPermissiveSessionUpgrade(): Promise<boolean> {
		let reason: string = 'true';
		try {
			// We don't want to be annoying
			if (this.hasRequestedPermissiveSessionUpgrade) {
				reason = 'false - already requested';
				return false;
			}
			// The user does not want to be asked
			if (this._authenticationService.isMinimalMode) {
				reason = 'false - minimal mode';
				return false;
			}
			// We already have a permissive session
			if (await this._authenticationService.getGitHubSession('permissive', { silent: true })) {
				reason = 'false - already have permissive session';
				return false;
			}
			// The user is not signed in at all
			if (!(await this._authenticationService.getGitHubSession('any', { silent: true }))) {
				reason = 'false - not signed in';
				return false;
			}
			// The user has access to all repositories
			if (await this._canAccessAllRepositories()) {
				reason = 'false - access to all repositories';
				return false;
			}
			return true;
		} finally {
			this.logService.trace(`Should request permissive session upgrade: ${reason}`);
		}
	}

	async showPermissiveSessionModal(skipRepeatCheck = false): Promise<boolean> {
		if (this.hasRequestedPermissiveSessionUpgrade && !skipRepeatCheck) {
			this.logService.trace('Already requested permissive session upgrade');
			return false;
		}
		this.logService.trace('Requesting permissive session upgrade');
		this.hasRequestedPermissiveSessionUpgrade = true;
		try {
			await this._authenticationService.getGitHubSession('permissive', {
				forceNewSession: {
					detail: l10n.t('To get more relevant Chat results, we need permission to read the contents of your repository on GitHub.'),
					learnMore: URI.parse('https://aka.ms/copilotRepoScope'),
				},
				clearSessionPreference: true
			});
			return true;
		} catch (e) {
			// User cancelled so show the badge
			await this._authenticationService.getGitHubSession('permissive', {});
			return false;
		}
	}

	showPermissiveSessionUpgradeInChat(
		stream: ChatResponseStream,
		data: ChatRequest,
		detail?: string,
		context?: ChatContext
	): void {
		this.logService.trace('Requesting permissive session upgrade in chat');
		this.hasRequestedPermissiveSessionUpgrade = true;
		stream.confirmation(
			this._permissionRequest,
			detail || l10n.t('To get more relevant Chat results, we need permission to read the contents of your repository on GitHub.'),
			// TODO: Change this shape to include request via a dedicated field
			{ authPermissionPrompted: true, ...data, context },
			[
				this._permissionRequestGrant,
				this._permissionRequestNotNow,
				this._permissionRequestNeverAskAgain
			]
		);
	}

	async handleConfirmationRequest(stream: ChatResponseStream, request: ChatRequest, history: ChatContext['history']): Promise<ChatRequest> {
		const findConfirmationRequested: ChatRequest | undefined = request.acceptedConfirmationData?.find(ref => ref?.authPermissionPrompted);
		if (!findConfirmationRequested) {
			return request;
		}
		this.logService.trace('Handling confirmation request');
		switch (request.prompt) {
			case `${this._permissionRequestGrant}: "${this._permissionRequest}"`:
				this.logService.trace('User granted permission');
				try {
					await this._authenticationService.getGitHubSession('permissive', { createIfNone: { detail: l10n.t('Sign in to GitHub with additional permissions for enhanced features.') } });
					this._onDidGrantAuthUpgrade.fire();
				} catch (e) {
					// User cancelled so show the badge
					await this._authenticationService.getGitHubSession('permissive', {});
				}
				break;
			case `${this._permissionRequestNotNow}: "${this._permissionRequest}"`:
				this.logService.trace('User declined permission');
				stream.markdown(l10n.t("Ok. I won't bother you again for now. If you change your mind, you can react to the authentication request in the Account menu.") + '\n\n');
				await this._authenticationService.getGitHubSession('permissive', {});
				break;
			case `${this._permissionRequestNeverAskAgain}: "${this._permissionRequest}"`:
				this.logService.trace('User chose never ask again for permission');
				await this.configurationService.setConfig(ConfigKey.Shared.AuthPermissions, AuthPermissionMode.Minimal);
				// Change this back to false to handle if the user changes back to allowing permissive tokens.
				this.hasRequestedPermissiveSessionUpgrade = false;
				stream.markdown(l10n.t('Ok. I saved this decision to the `{0}` setting', ConfigKey.Shared.AuthPermissions.fullyQualifiedId) + '\n\n');
				break;
		}

		const previousRequest = findLast(history, item => item instanceof ChatRequestTurn) as ChatRequestTurn | undefined;
		// Simple types can be used from the findConfirmationRequested request. Classes will have been serialized and not deserialized into class instances.
		// Props that exist on the history entry are used, otherwise fall back to either the current request or the saved request.
		if (previousRequest) {
			return {
				prompt: previousRequest.prompt,
				command: previousRequest.command,
				references: previousRequest.references,
				toolReferences: previousRequest.toolReferences,

				toolInvocationToken: request.toolInvocationToken,
				attempt: request.attempt,
				enableCommandDetection: request.enableCommandDetection,
				isParticipantDetected: findConfirmationRequested.isParticipantDetected,
				location: request.location,
				location2: request.location2,
				model: request.model,
				tools: new Map(),
				id: request.id,
				sessionId: '1',
				sessionResource: request.sessionResource,
				hasHooksEnabled: request.hasHooksEnabled,
			};
		} else {
			// Something went wrong, history item was deleted or lost?
			return {
				prompt: findConfirmationRequested.prompt,
				command: findConfirmationRequested.command,
				references: [],
				toolReferences: [],

				toolInvocationToken: request.toolInvocationToken,
				attempt: request.attempt,
				enableCommandDetection: request.enableCommandDetection,
				isParticipantDetected: findConfirmationRequested.isParticipantDetected,
				location: request.location,
				location2: request.location2,
				model: request.model,
				tools: new Map(),
				id: request.id,
				sessionId: '1',
				sessionResource: request.sessionResource,
				hasHooksEnabled: request.hasHooksEnabled,
			};
		}
	}

	private async _canAccessAllRepositories(): Promise<boolean> {
		const repoContexts = this.gitService?.repositories;
		if (!repoContexts) {
			this.logService.debug('No git repositories found');
			return false;
		}

		const repoIds = coalesce(repoContexts.map(x => getGitHubRepoInfoFromContext(x)?.id));
		const result = await Promise.all(repoIds.map(repoId => {
			return this.ghRepoService.isAvailable(repoId.org, repoId.repo);
		}));

		return result.every(level => level);
	}
}
