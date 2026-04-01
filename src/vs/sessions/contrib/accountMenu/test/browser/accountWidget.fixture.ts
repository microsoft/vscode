/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICopilotTokenInfo, IDefaultAccount, IPolicyData } from '../../../../../base/common/defaultAccount.js';
import { Action } from '../../../../../base/common/actions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IUpdateService, State, UpdateType } from '../../../../../platform/update/common/update.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { AccountWidget } from '../../browser/account.contribution.js';

// Ensure color registrations are loaded
import '../../../../common/theme.js';
import '../../../../../platform/theme/common/colors/inputColors.js';

// Import the CSS
import '../../../../browser/media/sidebarActionButton.css';
import '../../browser/media/accountWidget.css';

import { ChatEntitlementService, IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

const mockUpdate = { version: '1.0.0' };

function createMockUpdateService(state: State): IUpdateService {
	const onStateChange = new Emitter<State>();
	const service: IUpdateService = {
		_serviceBrand: undefined,
		state,
		onStateChange: onStateChange.event,
		checkForUpdates: async () => { },
		downloadUpdate: async () => { },
		applyUpdate: async () => { },
		quitAndInstall: async () => { },
		isLatestVersion: async () => true,
		_applySpecificUpdate: async () => { },
		setInternalOrg: async () => { },
	};
	return service;
}

function createMockDefaultAccountService(accountPromise: Promise<IDefaultAccount | null>): IDefaultAccountService {
	const onDidChangeDefaultAccount = new Emitter<IDefaultAccount | null>();
	const onDidChangePolicyData = new Emitter<IPolicyData | null>();
	const onDidChangeCopilotTokenInfo = new Emitter<ICopilotTokenInfo | null>();
	const service: IDefaultAccountService = {
		_serviceBrand: undefined,
		onDidChangeDefaultAccount: onDidChangeDefaultAccount.event,
		onDidChangePolicyData: onDidChangePolicyData.event,
		onDidChangeCopilotTokenInfo: onDidChangeCopilotTokenInfo.event,
		policyData: null,
		copilotTokenInfo: null,
		getDefaultAccount: () => accountPromise,
		getDefaultAccountAuthenticationProvider: () => ({ id: 'github', name: 'GitHub', enterprise: false }),
		setDefaultAccountProvider: () => { },
		refresh: () => accountPromise,
		signIn: async () => null,
		signOut: async () => { },
	};
	return service;
}

function renderAccountWidget(ctx: ComponentFixtureContext, state: State, accountPromise: Promise<IDefaultAccount | null>): void {
	ctx.container.style.padding = '16px';
	ctx.container.style.width = '340px';
	ctx.container.style.backgroundColor = 'var(--vscode-sideBar-background)';

	const mockUpdateService = createMockUpdateService(state);
	const mockAccountService = createMockDefaultAccountService(accountPromise);

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: registerWorkbenchServices,
	});

	const action = ctx.disposableStore.add(new Action('sessions.action.accountWidget', 'Agents Account'));
	const contextMenuService = instantiationService.get(IContextMenuService);
	const menuService = instantiationService.get(IMenuService);
	const contextKeyService = instantiationService.get(IContextKeyService);
	const hoverService = instantiationService.get(IHoverService);
	const productService = instantiationService.get(IProductService);
	const openerService = instantiationService.get(IOpenerService);
	const dialogService = instantiationService.get(IDialogService);
	const hostService = instantiationService.get(IHostService);
	const widget = new AccountWidget(action, {}, mockAccountService, mockUpdateService, contextMenuService, menuService, contextKeyService, hoverService, productService, openerService, dialogService, hostService, instantiationService.get(IChatEntitlementService) as ChatEntitlementService, instantiationService.get(IChatSessionsService), instantiationService.get(IInstantiationService));
	ctx.disposableStore.add(widget);
	widget.render(ctx.container);
}

const signedInAccount: IDefaultAccount = {
	authenticationProvider: {
		id: 'github',
		name: 'GitHub',
		enterprise: false,
	},
	accountName: 'avery.long.account.name@example.com',
	sessionId: 'session-id',
	enterprise: false,
};

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	LoadingSignedOutNoUpdate: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderAccountWidget(ctx, State.Idle(UpdateType.Setup), new Promise<IDefaultAccount | null>(() => { })),
	}),

	SignedOutNoUpdate: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderAccountWidget(ctx, State.Idle(UpdateType.Setup), Promise.resolve(null)),
	}),

	SignedInNoUpdate: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderAccountWidget(ctx, State.Idle(UpdateType.Setup), Promise.resolve(signedInAccount)),
	}),

	CheckingForUpdatesHidden: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderAccountWidget(ctx, State.CheckingForUpdates(true), Promise.resolve(signedInAccount)),
	}),

	Ready: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderAccountWidget(ctx, State.Ready(mockUpdate, true, false), Promise.resolve(signedInAccount)),
	}),

	AvailableForDownload: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderAccountWidget(ctx, State.AvailableForDownload(mockUpdate), Promise.resolve(signedInAccount)),
	}),

	Downloading30Percent: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderAccountWidget(ctx, State.Downloading(mockUpdate, true, false, 30_000_000, 100_000_000), Promise.resolve(signedInAccount)),
	}),

	DownloadedInstalling: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderAccountWidget(ctx, State.Downloaded(mockUpdate, true, false), Promise.resolve(signedInAccount)),
	}),

	Updating: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderAccountWidget(ctx, State.Updating(mockUpdate, true), Promise.resolve(signedInAccount)),
	}),

	Overwriting: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderAccountWidget(ctx, State.Overwriting(mockUpdate, true), Promise.resolve(signedInAccount)),
	}),
});
