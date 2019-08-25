/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataProviderService, IUserDataProvider } from 'vs/workbench/services/userData/common/userData';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Emitter, Event } from 'vs/base/common/event';

export class UserDataProviderService extends Disposable implements IUserDataProviderService {

	_serviceBrand: any;

	private readonly userDataProviders: Map<string, IUserDataProvider> = new Map<string, IUserDataProvider>();
	private activeUserDataProvider: IUserDataProvider | null = null;

	private readonly _ondDidChangeActiveUserDataProvider: Emitter<void> = this._register(new Emitter<void>());
	readonly ondDidChangeActiveUserDataProvider: Event<void> = this._ondDidChangeActiveUserDataProvider.event;

	constructor() {
		super();
		this._register(toDisposable(() => this.userDataProviders.clear()));
	}

	registerUserDataProvider(identity: string, userDataProvider: IUserDataProvider): void {
		this.userDataProviders.set(identity, userDataProvider);
		this.activeUserDataProvider = userDataProvider;
		this._ondDidChangeActiveUserDataProvider.fire();
	}

	deregisterAll(): void {
		this.userDataProviders.clear();
		this.activeUserDataProvider = null;
		this._ondDidChangeActiveUserDataProvider.fire();
	}

	getUserDataProvider(identity: string): IUserDataProvider | null {
		return this.userDataProviders.get(identity) || null;
	}

	getActiveUserDataProvider(): IUserDataProvider | null {
		return this.activeUserDataProvider;
	}

}

registerSingleton(IUserDataProviderService, UserDataProviderService);
