/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createServiceIdentifier } from '../../../util/common/services';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { isEqual } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import type { CopilotToken } from './copilotToken';


export const ICopilotTokenStore = createServiceIdentifier<ICopilotTokenStore>('ICopilotTokenStore');

/**
 * A simple store that holds the Copilot token and selected enterprise URI. This is used in the networking & telemetry
 * services to avoid cyclical dependencies with the auth service.
 * @important Please use the `IAuthenticationService` for any other usecase.
 */
export interface ICopilotTokenStore {
	readonly _serviceBrand: undefined;
	copilotToken: CopilotToken | undefined;
	onDidStoreUpdate: Event<void>;
	/** Token envelope replacement, including metadata updates with an unchanged bearer token. */
	readonly onDidChangeTokenData: Event<void>;
	githubEnterpriseUri: URI | undefined;
	readonly onDidChangeGitHubEnterpriseUri: Event<void>;
	/** Unknown until session discovery completes; token absence alone does not establish sign-out. */
	authenticationState: 'unknown' | 'signedIn' | 'signedOut';
	readonly onDidChangeAuthenticationState: Event<void>;
}

export class CopilotTokenStore extends Disposable implements ICopilotTokenStore {
	declare readonly _serviceBrand: undefined;
	private _copilotToken: CopilotToken | undefined;
	private readonly _onDidStoreUpdate = this._register(new Emitter<void>());
	onDidStoreUpdate: Event<void> = this._onDidStoreUpdate.event;
	private readonly _onDidChangeTokenData = this._register(new Emitter<void>());
	readonly onDidChangeTokenData = this._onDidChangeTokenData.event;
	private _githubEnterpriseUri: URI | undefined;
	private readonly _onDidChangeGitHubEnterpriseUri = this._register(new Emitter<void>());
	readonly onDidChangeGitHubEnterpriseUri = this._onDidChangeGitHubEnterpriseUri.event;
	private _authenticationState: ICopilotTokenStore['authenticationState'] = 'unknown';
	private readonly _onDidChangeAuthenticationState = this._register(new Emitter<void>());
	readonly onDidChangeAuthenticationState = this._onDidChangeAuthenticationState.event;

	get authenticationState(): ICopilotTokenStore['authenticationState'] {
		return this._authenticationState;
	}
	set authenticationState(state: ICopilotTokenStore['authenticationState']) {
		if (state !== this._authenticationState) {
			this._authenticationState = state;
			this._onDidChangeAuthenticationState.fire();
		}
	}

	get githubEnterpriseUri(): URI | undefined {
		return this._githubEnterpriseUri;
	}
	set githubEnterpriseUri(uri: URI | undefined) {
		if (!isEqual(this._githubEnterpriseUri, uri)) {
			this._githubEnterpriseUri = uri;
			this._onDidChangeGitHubEnterpriseUri.fire();
		}
	}

	get copilotToken(): CopilotToken | undefined {
		return this._copilotToken;
	}
	set copilotToken(token: CopilotToken | undefined) {
		const oldToken = this._copilotToken;
		this._copilotToken = token;
		if (oldToken !== token) {
			this._onDidChangeTokenData.fire();
		}
		if (oldToken?.token !== token?.token) {
			this._onDidStoreUpdate.fire();
		}
	}
}
