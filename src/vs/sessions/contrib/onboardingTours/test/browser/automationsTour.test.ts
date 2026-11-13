/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { EditorPartModalVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { ICustomViewDescriptor, ICustomViewService } from '../../../../../workbench/contrib/sessions/browser/customView.js';
import { SessionsWelcomeVisibleContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ChatEntitlementContextKeys } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { NewSessionOnboardingHandoffContext } from '../../../../common/agentsWindowContextKeys.js';
import { AutomationsTourContribution } from '../../browser/automationsTourContribution.js';
import { AUTOMATIONS_TOUR_ID, createAutomationsTour } from '../../browser/tours/automationsTour.js';

suite('AutomationsTour', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('is eligible only while Automations is open, including a restored opening', () => {
		const automations = upcastPartial<ICustomViewDescriptor>({ id: AUTOMATIONS_CUSTOM_VIEW_ID });
		const activeCustomView = observableValue<ICustomViewDescriptor | undefined>('activeCustomView', automations);
		const contribution = disposables.add(new AutomationsTourContribution(new class extends mock<ICustomViewService>() {
			override readonly activeCustomView = activeCustomView;
		}()));
		const scenario = onboardingScenarioRegistry.getScenario(AUTOMATIONS_TOUR_ID)!;
		const triggered = () => scenario.trigger.kind === 'observable' && scenario.trigger.signal.get();
		const restored = triggered();
		activeCustomView.set(undefined, undefined);
		const hidden = triggered();
		activeCustomView.set(upcastPartial<ICustomViewDescriptor>({ id: 'other' }), undefined);
		const otherView = triggered();
		activeCustomView.set(automations, undefined);
		const reopened = triggered();
		contribution.dispose();

		assert.deepStrictEqual({ restored, hidden, otherView, reopened, unregistered: !onboardingScenarioRegistry.getScenario(AUTOMATIONS_TOUR_ID) }, {
			restored: true, hidden: false, otherView: false, reopened: true, unregistered: true,
		});
	});

	test('suppresses the introduction when AI or Automations is disabled, signed out, or blocked', () => {
		const configuration = new TestConfigurationService();
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const context = disposables.add(new ContextKeyService(configuration));
		const enabled = ChatContextKeys.enabled.bindTo(context);
		const automationsEnabled = ChatAutomationsEnabledContext.bindTo(context);
		enabled.set(true);
		automationsEnabled.set(true);
		const blockers = [
			ChatEntitlementContextKeys.Entitlement.signedOut.bindTo(context),
			EditorPartModalVisibleContext.bindTo(context),
			NewSessionOnboardingHandoffContext.bindTo(context),
			SessionsWelcomeVisibleContext.bindTo(context),
		];
		const scenario = createAutomationsTour(observableValue('visible', true));
		const eligible = () => context.contextMatchesRules(scenario.when);
		const initial = eligible();
		enabled.set(false);
		const aiDisabled = eligible();
		enabled.set(true);
		automationsEnabled.set(false);
		const automationsDisabled = eligible();
		automationsEnabled.set(true);
		const blocked = blockers.map(blocker => {
			blocker.set(true);
			const result = eligible();
			blocker.set(false);
			return result;
		});

		assert.deepStrictEqual({ initial, aiDisabled, automationsDisabled, blocked, unblocked: eligible() }, {
			initial: true, aiDisabled: false, automationsDisabled: false, blocked: [false, false, false, false], unblocked: true,
		});
	});
});
