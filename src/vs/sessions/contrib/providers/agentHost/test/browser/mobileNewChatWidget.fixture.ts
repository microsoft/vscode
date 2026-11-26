/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMenuService, isIMenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { Menus } from '../../../../../../workbench/contrib/sessions/browser/menus.js';
import { MobileChatInputConfigPickerAction, MobileChatInputConfigPickerContribution } from '../../../../../../workbench/contrib/sessions/providers/agentHost/browser/mobile/mobileChatInputConfigPicker.js';
import { FixtureMenuService } from '../../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { INewChatWidgetFixtureOptions, renderNewChatWidget } from '../../../../chat/test/browser/newChatWidget.fixture.js';
import { MobileAgentHostFilterContribution } from '../../../remoteAgentHost/browser/mobileHostFilter.contribution.js';
import { MobileChatPhoneInputPresenterContribution } from '../../browser/mobile/mobileChatPhoneInputPresenter.js';

function renderMobileWelcome(context: ComponentFixtureContext, options: INewChatWidgetFixtureOptions = {}): Promise<void> {
	return renderNewChatWidget(context, {
		width: 390,
		height: 760,
		phoneLayout: true,
		mobileHost: 'Cloud',
		...options,
		configurePresentation: (instantiationService, store) => {
			store.add(instantiationService.createInstance(MobileChatPhoneInputPresenterContribution));
			store.add(instantiationService.createInstance(MobileChatInputConfigPickerContribution));
			store.add(instantiationService.createInstance(MobileAgentHostFilterContribution));
			const menuService = instantiationService.get(IMenuService) as FixtureMenuService;
			for (const item of MenuRegistry.getMenuItems(Menus.NewSessionPlace)) {
				if (isIMenuItem(item)) {
					menuService.addItem(Menus.NewSessionPlace, item);
				}
			}
			const configAction = new MobileChatInputConfigPickerAction();
			menuService.addItem(Menus.NewSessionChatInputToolbar, {
				command: configAction.desc,
				group: 'navigation',
				order: 0,
			});
		},
	});
}

export default defineThemedFixtureGroup({ path: 'sessions/mobile/welcome/' }, {
	CloudWelcome: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderMobileWelcome(context),
	}),
	CloudRepository: defineComponentFixture({
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderMobileWelcome(context, { withWorkspace: true, withConfiguredModel: true, withVoiceInputMode: true }),
	}),
	ComputerRepository: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderMobileWelcome(context, { mobileHost: 'Computer', withRemoteWorkspace: true, withConfiguredModel: true }),
	}),
	KeyboardHeight: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderMobileWelcome(context, { height: 300, withWorkspace: true, withConfiguredModel: true }),
	}),
	Landscape: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderMobileWelcome(context, { width: 760, height: 300, mobileHost: 'Computer', withRemoteWorkspace: true, withConfiguredModel: true }),
	}),
	WelcomePhrase: defineComponentFixture({
		virtualTime: { enabled: false },
		render: context => renderMobileWelcome(context, { width: 320, height: 568, withWorkspace: true, withConfiguredModel: true, withVoiceInputMode: true, welcomePhrases: true }),
	}),
});
