/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';

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
