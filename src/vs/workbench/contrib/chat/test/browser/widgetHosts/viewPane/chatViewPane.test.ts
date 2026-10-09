/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { Event } from '../../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullManagedSettingsService } from '../../../../../../../platform/policy/common/copilotManagedSettings.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { AccountPolicyGateState } from '../../../../../../services/policies/common/accountPolicyService.js';
import { TestContextService, TestStorageService } from '../../../../../../test/common/workbenchTestServices.js';
import { ChatViewPane } from '../../../../browser/widgetHosts/viewPane/chatViewPane.js';
import { MockChatSessionsService } from '../../../common/mockChatSessionsService.js';
import { IChatModelReference } from '../../../../common/chatService/chatService.js';
import { getChatSessionType } from '../../../../common/model/chatUri.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { URI } from '../../../../../../../base/common/uri.js';

suite('ChatViewPane managed permission rules', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const policyKey of ['permissions.deny', 'permissions.disableBypassPermissionsMode', 'permissions.defaultMode', 'sandbox.enabled']) {
		for (const result of ['missing', 'error'] as const) {
			test(`${policyKey} waits for policy and rejects ${result} Copilot without a Local fallback`, async () => {
				const ready = new DeferredPromise<void>();
				let rules: string | boolean | undefined = undefined;
				const selected: string[] = [];
				const errors: string[] = [];
				const pane: { acquireDefaultNewSession(token: CancellationToken): Promise<{ modelRef?: IChatModelReference }> } = Object.assign(Object.create(ChatViewPane.prototype), {
					accountPolicyGateService: { gateInfo: { state: AccountPolicyGateState.Inactive }, onDidChangeGateInfo: Event.None, whenInitialized: () => ready.p },
					managedSettingsService: new class extends NullManagedSettingsService {
						override getManagedSettingValue(key: string) { return key === policyKey ? rules : undefined; }
						override getManagedSettings() { return rules === undefined ? {} : { [policyKey]: rules }; }
					}(),
					configurationService: new TestConfigurationService(),
					workspaceContextService: new TestContextService(),
					storageService: store.add(new TestStorageService()),
					chatSessionsService: new MockChatSessionsService(),
					agentHostEnablementService: { enabled: constObservable(false), managedSandboxEnforced: constObservable(false) },
					logService: new NullLogService(),
					notificationService: { error: (message: string) => errors.push(message) },
					chatService: {
						startNewLocalSession: () => assert.fail('Local fallback is not allowed'),
						acquireOrLoadSession: async (resource: URI): Promise<IChatModelReference | undefined> => {
							selected.push(getChatSessionType(resource));
							if (result === 'error') {
								throw new Error('host unavailable');
							}
							return undefined;
						},
					},
				});
				const pending = pane.acquireDefaultNewSession(CancellationToken.None);
				const before = [...selected];
				rules = policyKey === 'sandbox.enabled' ? true : policyKey === 'permissions.defaultMode' ? 'manual' : policyKey === 'permissions.disableBypassPermissionsMode' ? 'disable' : '[]';
				ready.complete();
				await assert.rejects(pending);
				assert.deepStrictEqual({ before, selected, explained: errors.some(error => error.includes('organization requires the new Copilot experience')) }, {
					before: [], selected: [SessionType.AgentHostCopilot], explained: true,
				});
			});
		}
	}
});
