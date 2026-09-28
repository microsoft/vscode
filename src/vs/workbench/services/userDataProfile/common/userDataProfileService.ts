/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises, Sequencer } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { IUserDataProfile } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { DidChangeUserDataProfileEvent, IUserDataProfileService } from './userDataProfile.js';

export class UserDataProfileService extends Disposable implements IUserDataProfileService {

	readonly _serviceBrand: undefined;

	private readonly _onWillChangeCurrentProfile = this._register(new Emitter<DidChangeUserDataProfileEvent>());
	readonly onWillChangeCurrentProfile = this._onWillChangeCurrentProfile.event;

	private readonly _onDidFailCurrentProfileChange = this._register(new Emitter<void>());
	readonly onDidFailCurrentProfileChange = this._onDidFailCurrentProfileChange.event;

	private readonly _onDidChangeCurrentProfile = this._register(new Emitter<DidChangeUserDataProfileEvent>());
	readonly onDidChangeCurrentProfile = this._onDidChangeCurrentProfile.event;

	private readonly _onDidUpdateCurrentProfile = this._register(new Emitter<IUserDataProfile>());
	readonly onDidUpdateCurrentProfile = this._onDidUpdateCurrentProfile.event;

	private readonly profileChangeQueue = new Sequencer();

	private _currentProfile: IUserDataProfile;
	get currentProfile(): IUserDataProfile { return this._currentProfile; }

	constructor(
		currentProfile: IUserDataProfile
	) {
		super();
		this._currentProfile = currentProfile;
	}

	updateCurrentProfile(userDataProfile: IUserDataProfile): Promise<void> {
		return this.profileChangeQueue.queue(() => this.doUpdateCurrentProfile(userDataProfile));
	}

	private async doUpdateCurrentProfile(userDataProfile: IUserDataProfile): Promise<void> {
		if (equals(this._currentProfile, userDataProfile)) {
			return;
		}
		const previous = this._currentProfile;
		const beforeChangeJoiners: Promise<void>[] = [];
		this._onWillChangeCurrentProfile.fire({
			previous,
			profile: userDataProfile,
			join(promise) {
				beforeChangeJoiners.push(promise);
			}
		});
		try {
			await Promises.settled(beforeChangeJoiners);
		} catch (error) {
			this._onDidFailCurrentProfileChange.fire();
			throw error;
		}

		this._currentProfile = userDataProfile;
		const joiners: Promise<void>[] = [];
		this._onDidChangeCurrentProfile.fire({
			previous,
			profile: userDataProfile,
			join(promise) {
				joiners.push(promise);
			}
		});
		await Promises.settled(joiners);
		this._onDidUpdateCurrentProfile.fire(userDataProfile);
	}
}
