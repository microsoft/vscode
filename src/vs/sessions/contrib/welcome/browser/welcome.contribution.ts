/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/welcomeOverlay.css';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { $, append } from '../../../../base/browser/dom.js';
import { localize, localize2 } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { AuthWizard, ProviderId } from './authWizard.js';

const WELCOME_COMPLETE_KEY = 'workbench.agentsession.welcomeComplete';

const PROVIDER_TO_COMMAND: Partial<Record<ProviderId, string>> = {
	'anthropic-oauth': 'sotaAuth.connect',
};

class SessionsAuthWizardOverlay extends Disposable {

	private readonly overlay: HTMLElement;
	private readonly wizard: AuthWizard;

	constructor(
		container: HTMLElement,
		onComplete: () => void,
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.overlay = append(container, $('.sessions-welcome-overlay'));
		this.overlay.setAttribute('role', 'dialog');
		this.overlay.setAttribute('aria-modal', 'true');
		this.overlay.setAttribute('aria-label', localize('welcomeOverlay.aria', "Get started with Son of Anton"));
		this._register(toDisposable(() => this.overlay.remove()));

		const card = append(this.overlay, $('.sessions-welcome-card'));

		this.wizard = this._register(new AuthWizard(card, {
			connect: providerId => this.connectProvider(providerId),
			openApiKeySettings: () => this.openApiKeySettings(),
			skip: () => { /* dismissal handled via onDidComplete */ },
		}));

		this._register(this.wizard.onDidComplete(() => onComplete()));

		this.wizard.focus();
	}

	private async connectProvider(providerId: Exclude<ProviderId, 'api-keys' | 'skip'>): Promise<void> {
		const command = PROVIDER_TO_COMMAND[providerId];
		if (!command) {
			throw new Error(localize('authWizard.providerUnavailable', "{0} sign-in is not available yet.", providerId));
		}
		try {
			await this.commandService.executeCommand(command, providerId);
		} catch (err) {
			this.logService.error(`[sessions welcome] Connect ${providerId} failed:`, err);
			throw err;
		}
	}

	private openApiKeySettings(): void {
		void this.commandService.executeCommand('workbench.action.openSettings', '@id:sota.apiKey');
	}

	dismiss(): void {
		this.overlay.classList.add('sessions-welcome-overlay-dismissed');
		const handle = setTimeout(() => this.dispose(), 200);
		this._register(toDisposable(() => clearTimeout(handle)));
	}
}

class SessionsWelcomeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsWelcome';

	private readonly overlayRef = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		if (this.storageService.getBoolean(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION, false)) {
			return;
		}

		this.showOverlay();
	}

	private showOverlay(): void {
		if (this.overlayRef.value) {
			return;
		}

		const store = new DisposableStore();
		this.overlayRef.value = store;

		const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(this.contextKeyService);
		welcomeVisibleKey.set(true);
		store.add(toDisposable(() => welcomeVisibleKey.reset()));

		let overlay: SessionsAuthWizardOverlay | undefined;
		const onComplete = () => {
			this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
			overlay?.dismiss();
			this.overlayRef.clear();
		};

		overlay = this.instantiationService.createInstance(
			SessionsAuthWizardOverlay,
			this.layoutService.mainContainer,
			onComplete,
		);
		store.add(overlay);
	}
}

registerWorkbenchContribution2(SessionsWelcomeContribution.ID, SessionsWelcomeContribution, WorkbenchPhase.BlockRestore);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.resetSessionsWelcome',
			title: localize2('resetSessionsWelcome', "Reset Sessions Welcome"),
			category: Categories.Developer,
			f1: true,
		});
	}
	run(accessor: ServicesAccessor): void {
		const storageService = accessor.get(IStorageService);
		storageService.remove(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION);
	}
});
