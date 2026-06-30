/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IReader, autorun } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../../workbench/common/contributions.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionHasGitRepositoryContext, SessionProviderIdContext, SessionTypeContext, IsNewChatSessionContext } from '../../../../common/contextkeys.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { BranchPicker } from './branchPicker.js';
import { ClaudePermissionModePicker } from './claudePermissionModePicker.js';
import { ClaudeCodeSessionType, COPILOT_PROVIDER_ID, CopilotChatSessionsProvider } from './copilotChatSessionsProvider.js';
import { LocalSessionType } from '../../localChatSessions/browser/localChatSessionsProvider.js';
import { IsolationPicker } from './isolationPicker.js';
import { ModePicker, ModePickerModel } from './modePicker.js';
import { CopilotPermissionPickerDelegate, PermissionPicker } from './permissionPicker.js';
import { BaseAgentHostSessionsProvider, CopilotCLISessionType } from '../../agentHost/browser/baseAgentHostSessionsProvider.js';
import { ISessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';

const IsActiveSessionCopilotCLI = ContextKeyExpr.equals(SessionTypeContext.key, CopilotCLISessionType.id);
const IsActiveSessionLocal = ContextKeyExpr.equals(SessionTypeContext.key, LocalSessionType.id);
const IsActiveCopilotChatSessionProvider = ContextKeyExpr.equals(SessionProviderIdContext.key, COPILOT_PROVIDER_ID);
const IsActiveSessionCopilotChatCLI = ContextKeyExpr.and(IsActiveSessionCopilotCLI, IsActiveCopilotChatSessionProvider);
const IsActiveSessionClaudeCode = ContextKeyExpr.equals(SessionTypeContext.key, ClaudeCodeSessionType.id);
const IsActiveSessionCopilotChatClaudeCode = ContextKeyExpr.and(IsActiveSessionClaudeCode, IsActiveCopilotChatSessionProvider);
const IsActiveSessionCopilotChatLocal = ContextKeyExpr.and(IsActiveSessionLocal, IsActiveCopilotChatSessionProvider);

// -- Actions --

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.isolationPicker',
			title: localize2('isolationPicker', "Isolation Mode"),
			f1: false,
			menu: [{
				id: Menus.NewSessionRepositoryConfig,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(
					IsNewChatSessionContext,
					IsActiveSessionCopilotChatCLI,
					ContextKeyExpr.equals('config.github.copilot.chat.cli.isolationOption.enabled', true),
				),
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.branchPicker',
			title: localize2('branchPicker', "Branch"),
			f1: false,
			precondition: SessionHasGitRepositoryContext,
			menu: [{
				id: Menus.NewSessionRepositoryConfig,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(IsNewChatSessionContext, IsActiveSessionCopilotChatCLI),
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.modePicker',
			title: localize2('modePicker', "Mode"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.or(IsActiveSessionCopilotChatCLI, IsActiveSessionCopilotChatLocal, IsActiveSessionLocal),
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.permissionPicker',
			title: localize2('permissionPicker', "Permissions"),
			f1: false,
			menu: [{
				id: Menus.NewSessionControl,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.or(IsActiveSessionCopilotChatCLI, IsActiveSessionCopilotChatLocal, IsActiveSessionLocal),
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.claudePermissionModePicker',
			title: localize2('claudePermissionModePicker', "Permission Mode"),
			f1: false,
			menu: [{
				id: Menus.NewSessionControl,
				group: 'navigation',
				order: 1,
				when: IsActiveSessionCopilotChatClaudeCode,
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

// -- Helper --

/**
 * Wraps a standalone picker widget as a {@link BaseActionViewItem}
 * so it can be rendered by a {@link MenuWorkbenchToolBar}.
 *
 * Exported so the web-only `CopilotPermissionPickerWebContribution`
 * (in `mobilePermissionPicker.contribution.ts`) can reuse the same
 * wrapper for its `MobilePermissionPicker` registration.
 */
export class PickerActionViewItem extends BaseActionViewItem {
	constructor(private readonly picker: { render(container: HTMLElement): void; dispose(): void }, disposable?: IDisposable) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
		if (disposable) {
			this._register(disposable);
		}
	}

	override render(container: HTMLElement): void {
		this.picker.render(container);
	}

	override dispose(): void {
		this.picker.dispose();
		super.dispose();
	}
}

// -- Action View Item Registrations --

class CopilotPickerActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotPickerActionViewItems';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@ISessionsService sessionsService: ISessionsService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const modePickerModel = this._register(instantiationService.createInstance(ModePickerModel));
		this._register(autorun(reader => {
			const session = sessionsService.activeSession.read(reader);
			if (session) {
				const provider = sessionsProvidersService.getProvider(session.providerId);
				if (provider instanceof CopilotChatSessionsProvider) {
					const selectedModeId = session.mode.read(reader)?.id;
					modePickerModel.setSession(session, selectedModeId);
					return;
				}
			}
			modePickerModel.setSession(undefined, undefined);
		}));

		this._register(actionViewItemService.register(
			Menus.NewSessionRepositoryConfig, 'sessions.defaultCopilot.isolationPicker',
			(_action, _options, scopedInstantiationService) => {
				const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
				const picker = scopedInstantiationService.createInstance(IsolationPicker, session);
				return new PickerActionViewItem(picker);
			},
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionRepositoryConfig, 'sessions.defaultCopilot.branchPicker',
			(_action, _options, scopedInstantiationService) => {
				const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
				const picker = scopedInstantiationService.createInstance(BranchPicker, session);
				return new PickerActionViewItem(picker);
			},
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionConfig, 'sessions.defaultCopilot.modePicker',
			(_action, _options, scopedInstantiationService) => {
				const picker = scopedInstantiationService.createInstance(ModePicker, modePickerModel);
				const disposableStore = new DisposableStore();
				disposableStore.add(picker.onDidSelect(mode => {
					const session = sessionsService.activeSession.get();
					if (!session) {
						return;
					}
					const provider = sessionsProvidersService.getProvider(session.providerId);
					if (provider instanceof CopilotChatSessionsProvider) {
						provider.getSession(session.sessionId)?.setMode(mode);
					}
				}));
				return new PickerActionViewItem(picker, disposableStore);
			},
		));
		// Permission picker registration is skipped on web so the
		// web-only `CopilotPermissionPickerWebContribution` (registered
		// from `sessions.web.main.ts`) can install the mobile-aware
		// {@link MobilePermissionPicker} variant instead. On Electron
		// desktop, register the standard {@link PermissionPicker}
		// directly — the mobile-only sheet rendering never runs there
		// and importing the mobile picker would needlessly drag
		// `mobilePickerSheet.ts` into the desktop bundle.
		if (!isWeb) {
			this._register(actionViewItemService.register(
				Menus.NewSessionControl, 'sessions.defaultCopilot.permissionPicker',
				(_action, _options, scopedInstantiationService) => {
					const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
					const delegate = scopedInstantiationService.createInstance(CopilotPermissionPickerDelegate, session);
					const picker = scopedInstantiationService.createInstance(PermissionPicker, delegate);
					return new PickerActionViewItem(picker, delegate);
				},
			));
		}
		this._register(actionViewItemService.register(
			Menus.NewSessionControl, 'sessions.defaultCopilot.claudePermissionModePicker',
			(_action, _options, scopedInstantiationService) => {
				const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
				const picker = scopedInstantiationService.createInstance(ClaudePermissionModePicker, session);
				return new PickerActionViewItem(picker);
			},
		));
	}
}


// -- Context Key Contribution --

class CopilotActiveSessionContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotActiveSession';

	constructor(
		@ISessionsService sessionsService: ISessionsService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const hasRepositoryKey = SessionHasGitRepositoryContext.bindTo(contextKeyService);

		this._register(autorun((reader: IReader) => {
			const session = sessionsService.activeSession.read(reader);
			if (session?.providerId === COPILOT_PROVIDER_ID) {
				const provider = sessionsProvidersService.getProvider(session.providerId);
				const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session.sessionId) : undefined;
				const isLoading = providerSession?.loading.read(reader);
				hasRepositoryKey.set(!isLoading && !!providerSession?.gitRepository);
			} else if (session?.providerId === LOCAL_AGENT_HOST_PROVIDER_ID) {
				const provider = sessionsProvidersService.getProvider(session.providerId);
				const providerSession = provider instanceof BaseAgentHostSessionsProvider
					? provider.getSessionByResource(session.resource)
					: undefined;

				const isLoading = providerSession?.loading.read(reader);
				const workspace = providerSession?.workspace.read(reader);
				const hasGitRepository = workspace?.folders
					.some(folder => folder.gitRepository !== undefined) ?? false;

				hasRepositoryKey.set(!isLoading && hasGitRepository);
			} else {
				hasRepositoryKey.set(false);
			}
		}));
	}
}

registerWorkbenchContribution2(CopilotPickerActionViewItemContribution.ID, CopilotPickerActionViewItemContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(CopilotActiveSessionContribution.ID, CopilotActiveSessionContribution, WorkbenchPhase.AfterRestored);
