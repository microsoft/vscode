/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserIdentityService, IUserIdentity, IUserLoginProvider } from 'vs/workbench/services/userData/common/userData';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { values } from 'vs/base/common/map';
import { Emitter, Event } from 'vs/base/common/event';

export class UserIdentityService extends Disposable implements IUserIdentityService {

	_serviceBrand: any;

	private readonly userIdentities: Map<string, IUserIdentity> = new Map<string, IUserIdentity>();
	private readonly userLoginProviders: Map<string, IUserLoginProvider> = new Map<string, IUserLoginProvider>();

	private readonly _onDidRegisterUserIdentities: Emitter<IUserIdentity[]> = this._register(new Emitter<IUserIdentity[]>());
	readonly onDidRegisterUserIdentities: Event<IUserIdentity[]> = this._onDidRegisterUserIdentities.event;

	private readonly _onDidDeregisterUserIdentities: Emitter<IUserIdentity[]> = this._register(new Emitter<IUserIdentity[]>());
	readonly onDidDeregisterUserIdentities: Event<IUserIdentity[]> = this._onDidDeregisterUserIdentities.event;

	private readonly _onDidRegisterUserLoginProvider: Emitter<string> = this._register(new Emitter<string>());
	readonly onDidRegisterUserLoginProvider: Event<string> = this._onDidRegisterUserLoginProvider.event;

	private readonly _onDidDeregisterUserLoginProvider: Emitter<string> = this._register(new Emitter<string>());
	readonly onDidDeregisterUserLoginProvider: Event<string> = this._onDidDeregisterUserLoginProvider.event;

	constructor() {
		super();
		this._register(toDisposable(() => {
			this.userIdentities.clear();
			this.userLoginProviders.clear();
		}));
	}

	registerUserIdentities(userIdentities: IUserIdentity[]): void {
		const registered: IUserIdentity[] = [];
		for (const userIdentity of userIdentities) {
			if (!this.userIdentities.has(userIdentity.identity)) {
				this.userIdentities.set(userIdentity.identity, userIdentity);
				registered.push(userIdentity);
			}
		}
		this._onDidRegisterUserIdentities.fire(registered);
	}

	deregisterUserIdentities(identities: string[]): void {
		const deregistered: IUserIdentity[] = [];
		for (const identity of identities) {
			const userIdentity = this.userIdentities.get(identity);
			if (userIdentity) {
				this.userIdentities.delete(identity);
				deregistered.push(userIdentity);
			}
		}
		this._onDidDeregisterUserIdentities.fire(deregistered);
	}

	registerUserLoginProvider(identity: string, userLoginProvider: IUserLoginProvider): void {
		if (!this.userLoginProviders.has(identity)) {
			this.userLoginProviders.set(identity, userLoginProvider);
			this._onDidRegisterUserLoginProvider.fire(identity);
		}
	}

	deregisterUserLoginProvider(identity: string): void {
		if (this.userLoginProviders.has(identity)) {
			this.userLoginProviders.delete(identity);
			this._onDidDeregisterUserLoginProvider.fire(identity);
		}
	}

	getUserIdentity(identity: string): IUserIdentity | null {
		return this.userIdentities.get(identity) || null;
	}

	getUserIndetities(): ReadonlyArray<IUserIdentity> {
		return values(this.userIdentities);
	}

	getUserLoginProvider(identity: string): IUserLoginProvider | null {
		return this.userLoginProviders.get(identity) || null;
	}

}

registerSingleton(IUserIdentityService, UserIdentityService);
