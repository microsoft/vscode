/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './externalSessionBanner.fixture.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Dialog } from '../../../../../base/browser/ui/dialog/dialog.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ChatExternalSessionsMode } from '../../../../../platform/chat/common/chatSettings.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ExternalSessionBanner, getExternalSessionVisibilityConfirmation } from '../../browser/externalSessionBanner.js';

export default defineThemedFixtureGroup({ path: 'sessions/externalSessionBanner/' }, {
	InChat: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderBannerInChat(context),
	}),
	OptionSelected: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderBannerInChat(context, ChatExternalSessionsMode.Last24Hours),
	}),
	DisappearanceDialog: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderDisappearanceDialog,
	}),
});

function renderBannerInChat({ container, disposableStore, theme }: ComponentFixtureContext, initialMode?: ChatExternalSessionsMode): void {
	container.style.width = '900px';
	container.style.height = '540px';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.defineInstance(IProductService, new class extends mock<IProductService>() {
				override readonly nameShort = 'Code - OSS';
			});
		},
	});

	const chat = dom.append(container, dom.$('.external-session-banner-chat-fixture'));
	const banner = disposableStore.add(instantiationService.createInstance(
		ExternalSessionBanner,
		chat,
		{ initialMode }
	));
	banner.setSession(new class extends mock<ISession>() {
		override readonly resource = URI.parse('test://external-session');
		override readonly isExternal = constObservable(true);
		override readonly updatedAt = constObservable(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
	});

	const transcript = dom.append(chat, dom.$('.external-session-banner-chat-transcript'));
	const request = dom.append(transcript, dom.$('.external-session-banner-chat-request'));
	request.textContent = 'Can you update the project dependencies?';
	const response = dom.append(transcript, dom.$('.external-session-banner-chat-response'));
	response.textContent = 'I reviewed the project and updated the dependency configuration.';
	const input = dom.append(chat, dom.$('.external-session-banner-chat-input'));
	input.textContent = 'Ask a follow-up';
}

function renderDisappearanceDialog({ container, disposableStore }: ComponentFixtureContext): void {
	container.style.width = '800px';
	container.style.height = '500px';
	container.style.position = 'relative';

	const now = Date.now();
	const confirmation = getExternalSessionVisibilityConfirmation(
		ChatExternalSessionsMode.Last7Days,
		new Date(now - 8 * 24 * 60 * 60 * 1000),
		now,
		'Code - OSS'
	);
	if (typeof confirmation.detail !== 'string') {
		throw new Error('Expected plain-text confirmation detail.');
	}
	const dialog = disposableStore.add(new Dialog(
		container,
		confirmation.message,
		[confirmation.primaryButton ?? 'Save Anyway', 'Cancel'],
		{
			cancelId: 1,
			detail: confirmation.detail,
			type: 'warning',
			buttonStyles: defaultButtonStyles,
			checkboxStyles: defaultCheckboxStyles,
			inputBoxStyles: defaultInputBoxStyles,
			dialogStyles: defaultDialogStyles,
		}
	));
	void dialog.show();
}
