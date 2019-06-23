/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IUserDataService, IUserDataChangesEvent, IUserDataProvider, UserDataChangesEvent } from 'vs/workbench/services/userData/common/userData';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';

export class CustomUserDataService extends Disposable implements IUserDataService {
	_serviceBrand: any;

	private _onDidChange: Emitter<IUserDataChangesEvent> = this._register(new Emitter<IUserDataChangesEvent>());
	readonly onDidChange: Event<IUserDataChangesEvent> = this._onDidChange.event;

	constructor(
		private readonly userDataProvider: IUserDataProvider
	) {
		super();
		this._register(this.userDataProvider.onDidChange(key => this._onDidChange.fire(new UserDataChangesEvent([key]))));
	}

	read(key: string): Promise<string> {
		return this.userDataProvider.read(key);
	}

	write(key: string, value: string): Promise<void> {
		return this.userDataProvider.write(key, value);
	}

	toResource(key: string): URI {
		return URI.from({ scheme: Schemas.userData, path: key });
	}

	toKey(resource: URI): string | undefined {
		return resource.scheme === Schemas.userData ? resource.path : undefined;
	}

}