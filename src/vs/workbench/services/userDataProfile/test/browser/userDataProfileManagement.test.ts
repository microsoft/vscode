/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService, toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, Workspace } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { IHostService } from '../../../host/browser/host.js';
import { UserDataProfileManagementService } from '../../browser/userDataProfileManagement.js';
import { IUserDataProfileService } from '../../common/userDataProfile.js';
import { UserDataProfileService } from '../../common/userDataProfileService.js';

suite('UserDataProfileManagementService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const firstProfile = toUserDataProfile('first', 'First', URI.file('/profiles/first'), URI.file('/cache'));
	const secondProfile = toUserDataProfile('second', 'Second', URI.file('/profiles/second'), URI.file('/cache'));

	function createService(remote = false, failRollback = false) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const profileService = disposables.add(new UserDataProfileService(firstProfile));
		const events: string[] = [];
		instantiationService.stub(IUserDataProfileService, profileService);
		instantiationService.stub(IUserDataProfilesService, {
			profiles: [firstProfile, secondProfile],
			onDidChangeProfiles: Event.None,
			setProfileForWorkspace: async (_workspace, profile) => {
				events.push(`associate ${profile.id}`);
				if (failRollback && profile.id === firstProfile.id) {
					throw new Error('Association recovery failed');
				}
			},
		});
		instantiationService.stub(IHostService, { reload: async () => { events.push('reload'); } });
		instantiationService.stub(IDialogService, {});
		instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => new Workspace('empty-window', [], false, null, () => false) });
		instantiationService.stub(IExtensionService, {
			stopExtensionHosts: async () => { events.push('stop'); return true; },
			startExtensionHosts: async () => { events.push('start'); },
		});
		instantiationService.stub(IWorkbenchEnvironmentService, { remoteAuthority: remote ? 'test-remote' : undefined });
		instantiationService.stub(IProductService, {});
		instantiationService.stub(IRequestService, {});
		instantiationService.stub(IConfigurationService, {});
		instantiationService.stub(IUriIdentityService, {});
		instantiationService.stub(ILogService, new NullLogService());
		const managementService = disposables.add(instantiationService.createInstance(UserDataProfileManagementService));
		disposables.add(profileService.onWillChangeCurrentProfile(event => event.join(Promise.reject(new Error('Save failed')))));
		return { managementService, profileService, events };
	}

	test('restores the window profile and restarts desktop extensions when preparation fails', async () => {
		const { managementService, profileService, events } = createService();
		await assert.rejects(managementService.switchProfile(secondProfile), /Save failed/);
		assert.deepStrictEqual({ profile: profileService.currentProfile.id, events }, {
			profile: firstProfile.id,
			events: ['associate second', 'stop', 'associate first', 'start'],
		});
	});

	test('restarts extensions even if restoring the workspace association fails', async () => {
		const { managementService, events } = createService(false, true);
		await assert.rejects(managementService.switchProfile(secondProfile), /Save failed/);
		assert.deepStrictEqual(events, ['associate second', 'stop', 'associate first', 'start']);
	});

	test('restores the remote window profile without restarting extensions or reloading', async () => {
		const { managementService, profileService, events } = createService(true);
		await assert.rejects(managementService.switchProfile(secondProfile), /Save failed/);
		assert.deepStrictEqual({ profile: profileService.currentProfile.id, events }, {
			profile: firstProfile.id,
			events: ['associate second', 'associate first'],
		});
	});
});
