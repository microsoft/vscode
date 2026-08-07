/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { SessionWorkspacePickerVisibleContext } from '../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IOnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { NewSessionViewTourTrigger } from '../../browser/newSessionViewTourTrigger.js';

suite('NewSessionViewTourTrigger', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('waits for the actual visible-session restore before triggering', () => {
		const configurationService = new TestConfigurationService();
		const contextKeyService = disposables.add(new ContextKeyService(configurationService));
		SessionWorkspacePickerVisibleContext.bindTo(contextKeyService).set(true);
		const initialRestoreComplete = observableValue<boolean>('initialRestoreComplete', false);
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = observableValue('activeSession', undefined);
			override readonly initialRestoreComplete = initialRestoreComplete;
		}();
		const entitlement = observableValue('entitlement', ChatEntitlement.Available);
		const entitlementService = new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeEntitlement = Event.None;
			override readonly entitlementObs = entitlement;
			override get entitlement(): ChatEntitlement { return entitlement.get(); }
		}();
		const onboardingService = new class extends mock<IOnboardingScenarioService>() {
			override hasBeenShown(): boolean { return false; }
		}();
		const trigger = disposables.add(new NewSessionViewTourTrigger(
			'test.restoreGatedTour',
			onboardingService,
			sessionsService,
			disposables.add(new InMemoryStorageService()),
			configurationService,
			contextKeyService,
			entitlementService,
		));

		const beforeRestore = trigger.signal.get();
		initialRestoreComplete.set(true, undefined);

		assert.deepStrictEqual({ beforeRestore, afterRestore: trigger.signal.get() }, { beforeRestore: false, afterRestore: true });
	});
});
