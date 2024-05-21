/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

export class UserDataProfilesCleaner extends Disposable {

	constructor(
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService
	) {
		super();

		const scheduler = this._register(new RunOnceScheduler(() => {
			userDataProfilesService.cleanUp();
		}, 10 * 1000 /* after 10s */));
		scheduler.schedule();
	}
}
