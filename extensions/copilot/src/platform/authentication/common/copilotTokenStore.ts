/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createServiceIdentifier } from '../../../util/common/services';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import type { CopilotToken } from './copilotToken';


export const ICopilotTokenStore = createServiceIdentifier<ICopilotTokenStore>('ICopilotTokenStore');

/**
 * A simple store that holds the Copilot Token. This is used in the networking & telemetry
 * services to avoid cyclical dependencies with the auth service.
 * @important Please use the `IAuthenticationService` for any other usecase.
 */
export interface ICopilotTokenStore {
	readonly _serviceBrand: undefined;
	copilotToken: CopilotToken | undefined;
	onDidStoreUpdate: Event<void>;
}

export class CopilotTokenStore extends Disposable implements ICopilotTokenStore {
	declare readonly _serviceBrand: undefined;
	private _copilotToken: CopilotToken | undefined;
	private readonly _onDidStoreUpdate = this._register(new Emitter<void>());
	onDidStoreUpdate: Event<void> = this._onDidStoreUpdate.event;

	get copilotToken(): CopilotToken | undefined {
		return this._copilotToken;
	}
	set copilotToken(token: CopilotToken | undefined) {
		const oldToken = this._copilotToken?.token;
		this._copilotToken = token;
		if (oldToken !== token?.token) {
			this._onDidStoreUpdate.fire();
		}
	}
}
