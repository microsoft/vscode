/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, toAction } from '../../../../../base/common/actions.js';
import { cancelOnDispose, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../base/common/map.js';
import Severity from '../../../../../base/common/severity.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CloudSandboxRepositoryAccessResult, ICloudSandboxApiService, ICloudSandboxRepositoryAccessRecovery, isCloudSandboxEnabled } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatCommandButton } from '../../common/chatService/chatService.js';

const CHECK_ACCESS_COMMAND_ID = 'workbench.action.chat.cloudSandbox.checkRepositoryAccess';
const AUTHORIZE_ACCESS_COMMAND_ID = 'workbench.action.chat.cloudSandbox.authorizeRepositoryAccess';
const checkAccessTitle = localize2('cloudSandbox.checkRepositoryAccess', "Check Repository Access");
const authorizeAccessTitle = localize2('cloudSandbox.authorizeRepositoryAccess', "Authorize Access");

interface IRepositoryAccessActions {
	readonly repository: string;
	readonly ssoRequired: boolean;
	readonly actions: IAction[];
	readonly commands: IChatCommandButton[];
}

interface IRepositoryAccessEntry {
	readonly recovery: ICloudSandboxRepositoryAccessRecovery;
	ssoRequired: boolean;
	readonly pending: { check?: Promise<void>; authorize?: Promise<void> };
}

export const ICloudSandboxRepositoryAccessService = createDecorator<ICloudSandboxRepositoryAccessService>('cloudSandboxRepositoryAccessService');

export interface ICloudSandboxRepositoryAccessService {
	readonly _serviceBrand: undefined;
	createActions(error: unknown): IRepositoryAccessActions | undefined;
	checkAccess(id: string): Promise<void>;
	authorizeAccess(id: string): Promise<void>;
}

/** Keeps account-bound recovery operations in memory, never in notification or transcript arguments. */
export class CloudSandboxRepositoryAccessService extends Disposable implements ICloudSandboxRepositoryAccessService {
	declare readonly _serviceBrand: undefined;

	private readonly _entries = new LRUCache<string, IRepositoryAccessEntry>(32);
	private readonly _lifetimeToken = cancelOnDispose(this._store);

	constructor(
		@ICloudSandboxApiService private readonly _apiService: ICloudSandboxApiService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IProgressService private readonly _progressService: IProgressService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	createActions(error: unknown): IRepositoryAccessActions | undefined {
		if (this._lifetimeToken.isCancellationRequested || !this._enabled()) {
			return undefined;
		}
		const recovery = this._apiService.getRepositoryAccessRecovery(error);
		if (!recovery) {
			return undefined;
		}
		const id = generateUuid();
		this._entries.set(id, { recovery, ssoRequired: recovery.ssoRequired, pending: {} });
		const choices = [
			...(recovery.ssoRequired ? [{ command: AUTHORIZE_ACCESS_COMMAND_ID, label: authorizeAccessTitle.value, run: () => this.authorizeAccess(id) }] : []),
			{ command: CHECK_ACCESS_COMMAND_ID, label: checkAccessTitle.value, run: () => this.checkAccess(id) },
		];
		return {
			repository: recovery.repository,
			ssoRequired: recovery.ssoRequired,
			actions: choices.map(choice => toAction({ id: choice.command, label: choice.label, run: choice.run })),
			commands: choices.map(choice => ({ kind: 'command', command: { id: choice.command, title: choice.label, arguments: [id] } })),
		};
	}

	checkAccess(id: string): Promise<void> {
		return this._run(id, 'check', entry => this._check(id, entry));
	}

	authorizeAccess(id: string): Promise<void> {
		return this._run(id, 'authorize', async entry => {
			if (!entry.ssoRequired) {
				this._notificationService.info(localize('cloudSandbox.ssoNotConfirmed', "Check repository access first. This failure has not been confirmed as an organization sign-in problem."));
				return;
			}
			const { recovery } = entry;
			const opened = await this._openerService.open(URI.from({ scheme: 'https', authority: 'github.com', path: `/${recovery.repository}/pulls` }), { openExternal: true, allowContributedOpeners: false });
			this._throwIfUnavailable();
			if (!opened) {
				throw new Error('The repository sign-in page could not be opened.');
			}
			const confirmation = await this._dialogService.confirm({
				message: localize('cloudSandbox.completeOrganizationSignIn', "Authorize access to {0}", recovery.repository),
				detail: localize('cloudSandbox.completeOrganizationSignInDetail', "In your browser, follow GitHub's organization sign-in instructions for this repository using the account {0}. Then choose Continue to authorize VS Code again with the same account and permissions. This will not send your draft or create a cloud session.", recovery.accountLabel),
				primaryButton: localize('cloudSandbox.continueAuthorization', "Continue"),
			});
			if (!confirmation.confirmed) {
				return;
			}
			this._throwIfUnavailable();
			const result = await recovery.reauthenticate(this._lifetimeToken);
			this._throwIfUnavailable();
			this._showResult(id, entry, result);
		});
	}

	private async _check(id: string, entry: IRepositoryAccessEntry): Promise<void> {
		const store = new DisposableStore();
		const source = store.add(new CancellationTokenSource(this._lifetimeToken));
		try {
			const result = await this._progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('cloudSandbox.checkingRepositoryAccess', "Checking GitHub repository access"),
				cancellable: true,
			}, () => entry.recovery.checkAccess(source.token), () => source.cancel());
			if (source.token.isCancellationRequested) {
				throw new CancellationError();
			}
			this._throwIfUnavailable();
			this._showResult(id, entry, result);
		} finally {
			source.cancel();
			store.dispose();
		}
	}

	private _showResult(id: string, entry: IRepositoryAccessEntry, result: CloudSandboxRepositoryAccessResult): void {
		entry.ssoRequired = result === 'ssoRequired';
		switch (result) {
			case 'available':
				this._notificationService.info(localize('cloudSandbox.repositoryAccessAvailable', "The repository access check succeeded for {0}. Cloud session access may still require other permissions. This check did not create a session or send your message.", entry.recovery.repository));
				break;
			case 'ssoRequired':
				this._notificationService.prompt(Severity.Warning,
					localize('cloudSandbox.repositorySsoRequired', "GitHub requires organization sign-in to access {0}. Sign in to the organization, then authorize VS Code in GitHub Settings > Applications. Your organization may require administrator approval.", entry.recovery.repository), [
					{ label: authorizeAccessTitle.value, run: () => this.authorizeAccess(id) },
					{ label: localize('cloudSandbox.openApplicationSettings', "Open Application Settings"), run: () => this._openerService.open(URI.parse('https://github.com/settings/applications'), { openExternal: true, allowContributedOpeners: false }) },
				]);
				break;
			case 'authenticationChanged':
				this._notificationService.warn(localize('cloudSandbox.repositoryAccountChanged', "The GitHub sign-in used for this request has changed. Select the account {0} with its original permissions before checking access again.", entry.recovery.accountLabel));
				break;
			case 'denied':
				this._notificationService.warn(localize('cloudSandbox.repositoryAccessDenied', "GitHub denied the repository access check. Check repository permissions and organization policies; this response does not confirm an SSO problem."));
				break;
			case 'notFound':
				this._notificationService.warn(localize('cloudSandbox.repositoryAccessNotFound', "GitHub could not find or allow access to this repository. Check the selected repository and account; this response does not confirm an SSO problem."));
				break;
			case 'rateLimited':
				this._notificationService.warn(localize('cloudSandbox.repositoryAccessRateLimited', "GitHub is limiting repository access checks. Wait before trying again."));
				break;
		}
	}

	private _enabled(): boolean {
		return isCloudSandboxEnabled(this._configurationService)
			&& this._configurationService.getValue<boolean>(ChatAIDisabledSettingId) !== true
			&& !this._chatEntitlementService.sentiment.hidden;
	}

	private _throwIfUnavailable(): void {
		if (this._lifetimeToken.isCancellationRequested || !this._enabled()) {
			throw new CancellationError();
		}
	}

	private async _run(id: string, operation: 'check' | 'authorize', run: (entry: IRepositoryAccessEntry) => Promise<void>): Promise<void> {
		if (!this._enabled()) {
			this._notificationService.warn(localize('cloudSandbox.accessRecoveryDisabled', "Cloud sessions are disabled. No access check or sign-in was started."));
			return;
		}
		const entry = this._entries.get(id);
		if (!entry) {
			this._notificationService.warn(localize('cloudSandbox.accessRecoveryExpired', "This repository access check is no longer available. You can review organization access in GitHub Settings > Applications."));
			return;
		}
		if (entry.pending[operation]) {
			if (operation === 'authorize') {
				this._notificationService.info(localize('cloudSandbox.signInPending', "GitHub sign-in is already in progress. Complete or cancel that sign-in before starting another."));
			}
			return entry.pending[operation];
		}
		const pending = (async () => {
			try {
				this._throwIfUnavailable();
				await run(entry);
			} catch (error) {
				if (!isCancellationError(error) && !this._lifetimeToken.isCancellationRequested) {
					this._logService.error('[CloudSandbox] Repository access recovery failed.');
					this._notificationService.error(localize('cloudSandbox.accessRecoveryFailed', "Could not complete the repository access check or sign-in. Check your connection and try again. No cloud session was started by this action."));
				}
			}
		})();
		entry.pending[operation] = pending;
		try {
			await pending;
		} finally {
			delete entry.pending[operation];
		}
	}

	override dispose(): void {
		this._entries.clear();
		super.dispose();
	}
}

registerSingleton(ICloudSandboxRepositoryAccessService, CloudSandboxRepositoryAccessService, InstantiationType.Delayed);

for (const [id, title, authorize] of [
	[CHECK_ACCESS_COMMAND_ID, checkAccessTitle, false],
	[AUTHORIZE_ACCESS_COMMAND_ID, authorizeAccessTitle, true],
] as const) {
	registerAction2(class extends Action2 {
		constructor() {
			super({ id, title, f1: false, precondition: ChatContextKeys.enabled });
		}

		override async run(accessor: ServicesAccessor, recoveryId: unknown): Promise<void> {
			if (typeof recoveryId !== 'string') {
				throw new Error(localize('cloudSandbox.invalidRecovery', "The repository access action is invalid."));
			}
			const service = accessor.get(ICloudSandboxRepositoryAccessService);
			await (authorize ? service.authorizeAccess(recoveryId) : service.checkAccess(recoveryId));
		}
	});
}
