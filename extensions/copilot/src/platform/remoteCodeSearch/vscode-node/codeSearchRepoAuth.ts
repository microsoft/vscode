/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { t } from '@vscode/l10n';
import * as vscode from 'vscode';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { IAuthenticationChatUpgradeService } from '../../authentication/common/authenticationUpgrade';
import { ResolvedRepoRemoteInfo } from '../../git/common/gitService';
import { ICodeSearchAuthenticationService } from '../node/codeSearchRepoAuth';


export class VsCodeCodeSearchAuthenticationService implements ICodeSearchAuthenticationService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@IAuthenticationChatUpgradeService private readonly _authUpgradeService: IAuthenticationChatUpgradeService,
	) { }

	async tryAuthenticating(repo: ResolvedRepoRemoteInfo | undefined): Promise<void> {
		const fetchUrl = repo?.fetchUrl;

		const signInButton: vscode.MessageItem = {
			title: t`Sign In`,
		};
		const cancelButton: vscode.MessageItem = {
			title: t`Cancel`,
			isCloseAffordance: true
		};

		if (repo?.repoId.type === 'ado') {
			const result = await vscode.window.showWarningMessage(t`Sign in to use remote index`, {
				modal: true,
				detail: fetchUrl
					? t`Sign in to Azure DevOps to use remote workspace index for: ${fetchUrl.toString()}`
					: t`Sign in to Azure DevOps to use remote workspace index for a repo in this workspace`
			}, signInButton, cancelButton);

			if (result === signInButton) {
				await this._authService.getAdoAccessTokenBase64({ createIfNone: true });
				return;
			}
		} else {
			const result = await vscode.window.showWarningMessage(t`Sign in to use remote index`, {
				modal: true,
				detail: fetchUrl
					? t`Sign in to GitHub to use remote workspace index for: ${fetchUrl.toString()}`
					: t`Sign in to GitHub to use remote workspace index for a repo in this workspace`
			}, signInButton, cancelButton);

			if (result === signInButton) {
				await this._authService.getGitHubSession('any', { createIfNone: { detail: t('Sign in to GitHub to use remote workspace index.') } });
				return;
			}
		}
	}

	async tryReauthenticating(repo: ResolvedRepoRemoteInfo | undefined): Promise<void> {
		const fetchUrl = repo?.fetchUrl;

		const signInButton: vscode.MessageItem = {
			title: t`Sign In`,
		};
		const cancelButton: vscode.MessageItem = {
			title: t`Cancel`,
			isCloseAffordance: true
		};

		if (repo?.repoId.type === 'ado') {
			const result = await vscode.window.showWarningMessage(t`Reauthenticate to use remote workspace index`, {
				modal: true,
				detail: fetchUrl
					? t`Sign in to Azure DevOps again to use remote workspace index for: ${fetchUrl}`
					: t`Sign in to Azure DevOps again to use remote workspace index for a repo in this workspace`
			}, signInButton, cancelButton);

			if (result === signInButton) {
				await this._authService.getAdoAccessTokenBase64({ createIfNone: true });
				return;
			}
		} else {
			const result = await vscode.window.showWarningMessage(t`Reauthenticate to use remote workspace index`, {
				modal: true,
				detail: fetchUrl
					? t`Sign in to GitHub again to use remote workspace index for: ${fetchUrl}`
					: t`Sign in to GitHub again to use remote workspace index for a repo in this workspace`
			}, signInButton, cancelButton);

			if (result === signInButton) {
				await this._authUpgradeService.showPermissiveSessionModal();
				return;
			}
		}
	}

	async promptForExpandedLocalIndexing(fileCount: number): Promise<boolean> {
		const confirmButton: vscode.MessageItem = {
			title: t`Enable`,
		};
		const cancelButton: vscode.MessageItem = {
			title: t`Cancel`,
			isCloseAffordance: true
		};

		const result = await vscode.window.showWarningMessage(
			t`Build local index for this workspace?`,
			{
				modal: true,
				detail: t`This workspace contains ${fileCount} files. Building a local index may take a while but will improve search performance.`,
			},
			confirmButton,
			cancelButton
		);

		return result === confirmButton;
	}
}