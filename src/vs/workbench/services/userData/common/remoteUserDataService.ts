/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Emitter, Event } from 'vs/base/common/event';
import { IRemoteUserDataService, IRemoteUserDataProvider, IUserData } from 'vs/workbench/services/userData/common/userData';
import { ILogService } from 'vs/platform/log/common/log';

export class RemoteUserDataService extends Disposable implements IRemoteUserDataService {

	_serviceBrand: any;

	private remoteUserDataProvider: IRemoteUserDataProvider | null = null;
	private name: string | null = null;

	private readonly _onDidChangeEnablement: Emitter<boolean> = this._register(new Emitter<boolean>());
	readonly onDidChangeEnablement: Event<boolean> = this._onDidChangeEnablement.event;

	constructor(
		@ILogService private logService: ILogService
	) {
		super();
	}

	registerRemoteUserDataProvider(name: string, remoteUserDataProvider: IRemoteUserDataProvider): void {
		if (this.remoteUserDataProvider) {
			this.logService.warn(`A remote user data provider '${this.name}' already exists hence ignoring the remote user data provider '${name}'.`);
			return;
		}
		this.remoteUserDataProvider = remoteUserDataProvider;
		this.name = name;
		this._onDidChangeEnablement.fire(true);
	}

	deregisterRemoteUserDataProvider(): void {
		this.remoteUserDataProvider = null;
		this.name = null;
		this._onDidChangeEnablement.fire(false);
	}

	getName(): string | null {
		return this.name;
	}

	isEnabled(): boolean {
		return !!this.remoteUserDataProvider;
	}

	read(key: string): Promise<IUserData | null> {
		if (!this.remoteUserDataProvider) {
			throw new Error('No remote user data provider exists.');
		}
		return this.remoteUserDataProvider.read(key);
	}

	write(key: string, version: number, content: string): Promise<void> {
		if (!this.remoteUserDataProvider) {
			throw new Error('No remote user data provider exists.');
		}
		return this.remoteUserDataProvider.write(key, version, content);
	}

}

registerSingleton(IRemoteUserDataService, RemoteUserDataService);
