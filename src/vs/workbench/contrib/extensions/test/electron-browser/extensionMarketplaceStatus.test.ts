/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { Context } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionGalleryManifestStatus, IExtensionGalleryManifestService } from '../../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions, IViewsRegistry } from '../../../../common/views.js';
import { IActivity, IActivityService, WarningBadge } from '../../../../services/activity/common/activity.js';
import { IExtensionGalleryAccountService } from '../../../../services/extensionManagement/common/extensionGalleryAccount.js';
import { IExtensionManagementServerService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { VIEW_CONTAINER } from '../../browser/extensions.contribution.js';
import { ExtensionMarketplaceStatusUpdater, ExtensionsViewletViewsContribution } from '../../browser/extensionsViewlet.js';
import { CONTEXT_EXTENSIONS_GALLERY_STATUS, DefaultViewsContext } from '../../common/extensions.js';

suite('Extension marketplace status', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const viewId = 'workbench.views.extensions.marketplaceAccess';
	const signInCommand = 'workbench.extensions.actions.gallery.signIn';
	const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);

	let instantiationService: TestInstantiationService;
	let status: ExtensionGalleryManifestStatus;
	let statusChanged: Emitter<ExtensionGalleryManifestStatus>;
	let marketplaceActivity: IActivity | undefined;
	let accountsActivity: IActivity | undefined;
	let signIns: number;

	setup(() => {
		status = ExtensionGalleryManifestStatus.RequiresSignIn;
		statusChanged = store.add(new Emitter<ExtensionGalleryManifestStatus>());
		marketplaceActivity = undefined;
		accountsActivity = undefined;
		signIns = 0;
		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
		instantiationService.stub(IExtensionManagementServerService, {});
		instantiationService.stub(ILabelService, { onDidChangeFormatters: Event.None });
		instantiationService.stub(IExtensionGalleryManifestService, new class extends mock<IExtensionGalleryManifestService>() {
			override get extensionGalleryManifestStatus() { return status; }
			override readonly onDidChangeExtensionGalleryManifestStatus = statusChanged.event;
		}());
		instantiationService.stub(IExtensionGalleryAccountService, new class extends mock<IExtensionGalleryAccountService>() {
			override async signIn() { signIns++; }
		}());
		instantiationService.stub(IActivityService, new class extends mock<IActivityService>() {
			override showViewContainerActivity(_viewContainerId: string, activity: IActivity) {
				marketplaceActivity = activity;
				return toDisposable(() => {
					if (marketplaceActivity === activity) {
						marketplaceActivity = undefined;
					}
				});
			}
			override showAccountsActivity(activity: IActivity) {
				accountsActivity = activity;
				return toDisposable(() => {
					if (accountsActivity === activity) {
						accountsActivity = undefined;
					}
				});
			}
		}());

		const previousViews = new Set(viewsRegistry.getViews(VIEW_CONTAINER));
		store.add(instantiationService.createInstance(ExtensionsViewletViewsContribution));
		const registeredViews = viewsRegistry.getViews(VIEW_CONTAINER).filter(view => !previousViews.has(view));
		store.add(toDisposable(() => viewsRegistry.deregisterViews(registeredViews, VIEW_CONTAINER)));
		store.add(instantiationService.createInstance(ExtensionMarketplaceStatusUpdater));
	});

	function setStatus(value: ExtensionGalleryManifestStatus): void {
		status = value;
		statusChanged.fire(value);
	}

	function presentation() {
		const context = new Context(0, null);
		context.setValue(CONTEXT_EXTENSIONS_GALLERY_STATUS.key, status);
		context.setValue(DefaultViewsContext.key, true);
		const view = viewsRegistry.getView(viewId);
		const contents = viewsRegistry.getViewWelcomeContent(viewId)
			.filter(content => !content.when || content.when === 'default' || content.when.evaluate(context))
			.map(content => content.content);
		const signInMenu = MenuRegistry.getMenuItems(MenuId.AccountsContext)
			.filter(isIMenuItem)
			.find(item => item.command.id === signInCommand);
		return {
			viewVisible: view?.when?.evaluate(context),
			contents,
			signInMenuVisible: signInMenu && (!signInMenu.when || signInMenu.when.evaluate(context)),
			signInEnabled: signInMenu?.command.precondition?.evaluate(context),
			warningBadge: marketplaceActivity?.badge instanceof WarningBadge,
			badgeDescription: marketplaceActivity?.badge.getDescription(),
			accountBadgeDescription: accountsActivity?.badge.getDescription(),
		};
	}

	test('a scope configuration error explains the administrator action without offering sign-in', () => {
		setStatus(ExtensionGalleryManifestStatus.RequiresConfiguration);
		const configuration = presentation();
		setStatus(ExtensionGalleryManifestStatus.RequiresSignIn);
		const signIn = presentation();
		setStatus(ExtensionGalleryManifestStatus.AccessDenied);
		const denied = presentation();
		setStatus(ExtensionGalleryManifestStatus.Available);
		const available = presentation();

		assert.deepStrictEqual({ configuration, signIn, denied, available }, {
			configuration: {
				viewVisible: true,
				contents: ['The Extensions Marketplace requires authentication, but does not advertise usable marketplace scopes. Contact your marketplace administrator to configure scopes_supported in its protected resource metadata, then reload this window.'],
				signInMenuVisible: false,
				signInEnabled: false,
				warningBadge: true,
				badgeDescription: 'Marketplace authentication scopes are not configured. Contact your marketplace administrator.',
				accountBadgeDescription: undefined,
			},
			signIn: {
				viewVisible: true,
				contents: ['[Sign in to access Extensions Marketplace](command:workbench.extensions.actions.gallery.signIn)'],
				signInMenuVisible: true,
				signInEnabled: true,
				warningBadge: false,
				badgeDescription: 'Sign in required to access marketplace',
				accountBadgeDescription: 'Sign in to access Marketplace',
			},
			denied: {
				viewVisible: true,
				contents: ['Your account does not have access to the Extensions Marketplace. Please contact your administrator.'],
				signInMenuVisible: true,
				signInEnabled: true,
				warningBadge: true,
				badgeDescription: 'Access denied to marketplace',
				accountBadgeDescription: undefined,
			},
			available: {
				viewVisible: false,
				contents: [],
				signInMenuVisible: false,
				signInEnabled: true,
				warningBadge: false,
				badgeDescription: undefined,
				accountBadgeDescription: undefined,
			},
		});
	});

	test('a stale sign-in command does not prompt for configuration errors and works again for consent', async () => {
		const command = CommandsRegistry.getCommand(signInCommand);
		assert.ok(command);
		setStatus(ExtensionGalleryManifestStatus.RequiresConfiguration);
		await instantiationService.invokeFunction(accessor => command.handler(accessor));
		const blockedSignIns = signIns;
		setStatus(ExtensionGalleryManifestStatus.RequiresSignIn);
		await instantiationService.invokeFunction(accessor => command.handler(accessor));

		assert.deepStrictEqual({ blockedSignIns, signIns }, { blockedSignIns: 0, signIns: 1 });
	});
});
