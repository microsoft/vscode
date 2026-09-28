/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../common/userDataProfileService.js';

suite('UserDataProfileService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const firstProfile = toUserDataProfile('first', 'First', URI.file('/profiles/first'), URI.file('/cache'));
	const secondProfile = toUserDataProfile('second', 'Second', URI.file('/profiles/second'), URI.file('/cache'));
	const thirdProfile = toUserDataProfile('third', 'Third', URI.file('/profiles/third'), URI.file('/cache'));

	test('saves the outgoing profile before switching and notifies after joined changes finish', async () => {
		const service = disposables.add(new UserDataProfileService(firstProfile));
		const savingStarted = new DeferredPromise<void>();
		const savingFinished = new DeferredPromise<void>();
		const storageSwitchStarted = new DeferredPromise<void>();
		const storageSwitchFinished = new DeferredPromise<void>();
		const events: string[] = [];
		disposables.add(service.onWillChangeCurrentProfile(event => {
			events.push(`saving ${service.currentProfile.id}`);
			event.join(savingFinished.p);
			void savingStarted.complete();
		}));
		disposables.add(service.onDidChangeCurrentProfile(event => {
			events.push(`switching ${event.previous.id} to ${service.currentProfile.id}`);
			event.join(storageSwitchFinished.p);
			void storageSwitchStarted.complete();
		}));
		disposables.add(service.onDidUpdateCurrentProfile(profile => events.push(`ready ${profile.id}`)));

		const update = service.updateCurrentProfile(secondProfile);
		await savingStarted.p;
		assert.deepStrictEqual({ profile: service.currentProfile.id, events }, { profile: 'first', events: ['saving first'] });

		await savingFinished.complete();
		await storageSwitchStarted.p;
		assert.deepStrictEqual(events, ['saving first', 'switching first to second']);

		await storageSwitchFinished.complete();
		await update;
		assert.deepStrictEqual(events, ['saving first', 'switching first to second', 'ready second']);
	});

	test('failed outgoing saves abort the change and wait for other saves before retrying', async () => {
		const service = disposables.add(new UserDataProfileService(firstProfile));
		const savingStarted = new DeferredPromise<void>();
		const savingFinished = new DeferredPromise<void>();
		const events: string[] = [];
		disposables.add(service.onWillChangeCurrentProfile(event => {
			events.push(`saving ${event.previous.id} for ${event.profile.id}`);
			if (event.profile.id === secondProfile.id) {
				event.join(Promise.reject(new Error('Save failed')));
				event.join(savingFinished.p);
				void savingStarted.complete();
			}
		}));
		disposables.add(service.onDidFailCurrentProfileChange(() => events.push(`aborted in ${service.currentProfile.id}`)));
		disposables.add(service.onDidChangeCurrentProfile(event => events.push(`changed to ${event.profile.id}`)));
		disposables.add(service.onDidUpdateCurrentProfile(profile => events.push(`ready ${profile.id}`)));

		const failedUpdate = assert.rejects(service.updateCurrentProfile(secondProfile), /Save failed/);
		const nextUpdate = service.updateCurrentProfile(thirdProfile);
		await savingStarted.p;
		assert.deepStrictEqual({ profile: service.currentProfile.id, events }, { profile: 'first', events: ['saving first for second'] });

		await savingFinished.complete();
		await failedUpdate;
		await nextUpdate;
		assert.deepStrictEqual(events, ['saving first for second', 'aborted in first', 'saving first for third', 'changed to third', 'ready third']);
	});

	test('serializes concurrent profile changes through storage completion', async () => {
		const service = disposables.add(new UserDataProfileService(firstProfile));
		const storageSwitchStarted = new DeferredPromise<void>();
		const storageSwitchFinished = new DeferredPromise<void>();
		const events: string[] = [];
		disposables.add(service.onWillChangeCurrentProfile(event => events.push(`${event.previous.id} to ${event.profile.id}`)));
		disposables.add(service.onDidChangeCurrentProfile(event => {
			if (event.profile.id === secondProfile.id) {
				event.join(storageSwitchFinished.p);
				void storageSwitchStarted.complete();
			}
		}));
		disposables.add(service.onDidUpdateCurrentProfile(profile => events.push(`ready ${profile.id}`)));

		const firstUpdate = service.updateCurrentProfile(secondProfile);
		const secondUpdate = service.updateCurrentProfile(thirdProfile);
		await storageSwitchStarted.p;
		assert.deepStrictEqual(events, ['first to second']);

		await storageSwitchFinished.complete();
		await Promise.all([firstUpdate, secondUpdate]);
		assert.deepStrictEqual(events, ['first to second', 'ready second', 'second to third', 'ready third']);
	});

	test('does not announce a completed update when a change participant fails', async () => {
		const service = disposables.add(new UserDataProfileService(firstProfile));
		const completed: string[] = [];
		disposables.add(service.onDidChangeCurrentProfile(event => event.join(Promise.reject(new Error('Storage failed')))));
		disposables.add(service.onDidFailCurrentProfileChange(() => completed.push('aborted')));
		disposables.add(service.onDidUpdateCurrentProfile(profile => completed.push(profile.id)));

		await assert.rejects(service.updateCurrentProfile(secondProfile), /Storage failed/);
		assert.deepStrictEqual(completed, []);
	});

	test('does not emit change events when the profile is unchanged', async () => {
		const service = disposables.add(new UserDataProfileService(firstProfile));
		const events: string[] = [];
		disposables.add(service.onWillChangeCurrentProfile(() => events.push('will')));
		disposables.add(service.onDidChangeCurrentProfile(() => events.push('did')));
		disposables.add(service.onDidUpdateCurrentProfile(() => events.push('ready')));

		await service.updateCurrentProfile(firstProfile);
		assert.deepStrictEqual(events, []);
	});
});
