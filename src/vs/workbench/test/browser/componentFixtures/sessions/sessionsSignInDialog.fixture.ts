/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mock } from '../../../../../base/test/common/mock.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatSetupDialog, getChatSetupDialogButtons, getChatSetupDialogFooter } from '../../../../contrib/chat/browser/chatSetup/chatSetupRunner.js';
import { ChatEntitlement } from '../../../../services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
// eslint-disable-next-line local/code-import-patterns
import { createSessionsSignInDialogOptions, SessionsSigningInDialog } from '../../../../../sessions/browser/sessionsSignInDialog.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

const providers = {
	default: { name: 'GitHub' },
	enterprise: { name: 'GHE' },
	google: { name: 'Google' },
	apple: { name: 'Apple' },
};

const footerContent = {
	providerName: 'GitHub',
	termsStatementUrl: 'https://example.com/terms',
	privacyStatementUrl: 'https://example.com/privacy',
	publicCodeMatchesUrl: 'https://example.com/public-code',
};

export default defineThemedFixtureGroup({ path: 'sessions/signInDialog/' }, {
	SignIn: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderSignInDialog(context, false, true, true),
	}),
	SignInWithEditorWindowOpen: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderSignInDialog(context, false, false, true),
	}),
	SignInRequired: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderSignInDialog(context, false, true, false),
	}),
	EnterpriseSignIn: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderSignInDialog(context, true, true, true),
	}),
	SigningIn: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderSigningInDialog,
	}),
});

function renderSignInDialog(context: ComponentFixtureContext, enterpriseAuthentication: boolean, showReturnToVSCodeEditor: boolean, allowContinueWithoutSignIn: boolean): void {
	const instantiationService = createDialogServices(context);
	const presentation = createSessionsSignInDialogOptions(instantiationService.get(ICommandService), showReturnToVSCodeEditor, allowContinueWithoutSignIn);
	const dialog = context.disposableStore.add(instantiationService.createInstance(ChatSetupDialog, context.container, {
		title: presentation.dialogTitle,
		buttons: getChatSetupDialogButtons(ChatEntitlement.Unknown, presentation, enterpriseAuthentication, providers),
		icon: presentation.dialogIcon,
		disableCloseButton: presentation.disableCloseButton,
		footer: getChatSetupDialogFooter(undefined, TelemetryLevel.USAGE, 'https://github.com/settings/copilot/features', footerContent),
		extraClasses: presentation.dialogExtraClasses,
		renderFooter: presentation.renderDialogFooter,
	}));
	void dialog.show();
}

function renderSigningInDialog(context: ComponentFixtureContext): void {
	const instantiationService = createDialogServices(context);
	context.disposableStore.add(instantiationService.createInstance(SessionsSigningInDialog, () => { }));
}

function createDialogServices({ container, disposableStore, theme }: ComponentFixtureContext) {
	container.classList.add('agent-sessions-workbench');
	container.style.width = '720px';
	container.style.height = '520px';
	container.style.position = 'relative';
	container.style.overflow = 'hidden';
	container.style.transform = 'translate3d(0, 0, 0)';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	container.style.color = 'var(--vscode-editor-foreground)';

	return createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registration.define(IMarkdownRendererService, MarkdownRendererService);
			registration.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
				declare readonly _serviceBrand: undefined;
				override get mainContainer() { return container; }
				override get activeContainer() { return container; }
			}());
			registration.defineInstance(IHostService, new class extends mock<IHostService>() {
				declare readonly _serviceBrand: undefined;
				override async setWindowDimmed(): Promise<void> { }
			}());
		},
	});
}
