/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ILoopbackClient, ServerAuthorizationCodeResponse } from '@azure/msal-node';
import type { UriEventHandler } from '../UriEventHandler';
import { Disposable, env, l10n, LogOutputChannel, Uri, window } from 'vscode';
import { DeferredPromise, toPromise } from './async';
import { isSupportedClient } from './env';

export interface ILoopbackClientAndOpener extends ILoopbackClient {
	openBrowser(url: string): Promise<void>;
}

export class UriHandlerLoopbackClient implements ILoopbackClientAndOpener {
	private _responseDeferred: DeferredPromise<ServerAuthorizationCodeResponse> | undefined;

	constructor(
		private readonly _uriHandler: UriEventHandler,
		private readonly _redirectUri: string,
		private readonly _logger: LogOutputChannel
	) { }

	async listenForAuthCode(): Promise<ServerAuthorizationCodeResponse> {
		await this._responseDeferred?.cancel();
		this._responseDeferred = new DeferredPromise();
		const result = await this._responseDeferred.p;
		this._responseDeferred = undefined;
		if (result) {
			return result;
		}
		throw new Error('No valid response received for authorization code.');
	}

	getRedirectUri(): string {
		// We always return the constant redirect URL because
		// it will handle redirecting back to the extension
		return this._redirectUri;
	}

	closeServer(): void {
		// No-op
	}

	async openBrowser(url: string): Promise<void> {
		const callbackUri = await env.asExternalUri(Uri.parse(`${env.uriScheme}://vscode.microsoft-authentication`));

		if (isSupportedClient(callbackUri)) {
			void this._getCodeResponseFromUriHandler();
		} else {
			// Unsupported clients will be shown the code in the browser, but it will not redirect back since this
			// isn't a supported client. Instead, they will copy that code in the browser and paste it in an input box
			// that will be shown to them by the extension.
			void this._getCodeResponseFromQuickPick();
		}

		const uri = Uri.parse(url + `&state=${encodeURI(callbackUri.toString(true))}`);
		await env.openExternal(uri);
	}

	private async _getCodeResponseFromUriHandler(): Promise<void> {
		if (!this._responseDeferred) {
			throw new Error('No listener for auth code');
		}
		const url = await toPromise(this._uriHandler.event);
		this._logger.debug(`Received URL event. Authority: ${url.authority}`);
		const result = new URL(url.toString(true));

		this._responseDeferred?.complete({
			code: result.searchParams.get('code') ?? undefined,
			state: result.searchParams.get('state') ?? undefined,
			error: result.searchParams.get('error') ?? undefined,
			error_description: result.searchParams.get('error_description') ?? undefined,
			error_uri: result.searchParams.get('error_uri') ?? undefined,
		});
	}

	private async _getCodeResponseFromQuickPick(): Promise<void> {
		if (!this._responseDeferred) {
			throw new Error('No listener for auth code');
		}
		const inputBox = window.createInputBox();
		inputBox.ignoreFocusOut = true;
		inputBox.title = l10n.t('Microsoft Authentication');
		inputBox.prompt = l10n.t('Provide the authorization code to complete the sign in flow.');
		inputBox.placeholder = l10n.t('Paste authorization code here...');
		inputBox.show();
		const code = await new Promise<string | undefined>((resolve) => {
			let resolvedValue: string | undefined = undefined;
			const disposable = Disposable.from(
				inputBox,
				inputBox.onDidAccept(async () => {
					if (!inputBox.value) {
						inputBox.validationMessage = l10n.t('Authorization code is required.');
						return;
					}
					const code = inputBox.value;
					resolvedValue = code;
					resolve(code);
					inputBox.hide();
				}),
				inputBox.onDidChangeValue(() => {
					inputBox.validationMessage = undefined;
				}),
				inputBox.onDidHide(() => {
					disposable.dispose();
					if (!resolvedValue) {
						resolve(undefined);
					}
				})
			);
			Promise.allSettled([this._responseDeferred?.p]).then(() => disposable.dispose());
		});
		// Something canceled the original deferred promise, so just return.
		if (this._responseDeferred.isSettled) {
			return;
		}
		if (code) {
			this._logger.debug('Received auth code from quick pick');
			this._responseDeferred.complete({
				code,
				state: undefined,
				error: undefined,
				error_description: undefined,
				error_uri: undefined
			});
			return;
		}
		this._responseDeferred.complete({
			code: undefined,
			state: undefined,
			error: 'User cancelled',
			error_description: 'User cancelled',
			error_uri: undefined
		});
	}
}
