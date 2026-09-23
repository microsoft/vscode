/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/newChatMigrationNotice.css';
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../base/common/actions.js';
import { cancelOnDispose, CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IAgentHostCustomizationService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { getCustomizationMigrationCategory, homepageMigrationCategories } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationMigrationCategories.js';
import { AICustomizationManagementCommands } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { isAgentHostSessionResource } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { CustomizationMigrationType, ICustomizationMigrationService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/customizationMigrationService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IMcpWorkbenchService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

export class NewChatMigrationNotice extends Disposable {
	readonly element: HTMLElement;
	private readonly message: HTMLElement;
	private dismissalKey: string | undefined;
	private contextKey: string | undefined;

	constructor(
		container: HTMLElement,
		session: IObservable<IActiveSession | undefined>,
		private readonly focusInput: () => void,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICustomizationMigrationService private readonly migrationService: ICustomizationMigrationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ICommandService commandService: ICommandService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IPromptsService promptsService: IPromptsService,
		@IAgentHostCustomizationService agentHostCustomizationService: IAgentHostCustomizationService,
		@IMcpWorkbenchService mcpWorkbenchService: IMcpWorkbenchService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.element = dom.append(container, dom.$('.new-chat-migration-notice', {
			role: 'group',
			'aria-label': localize('migrationNotice', "Customization migrations"),
		}));
		this.setVisible(false);
		const content = dom.append(this.element, dom.$('.new-chat-migration-notice-content'));
		this.message = dom.append(content, dom.$('span'));
		this._register(instantiationService.createInstance(Link, content, {
			label: localize('reviewMigrations', "Review Migrations"),
			href: `command:${AICustomizationManagementCommands.OpenEditor}`,
		}, {
			opener: () => {
				void commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, { migration: true, sessionResource: session.get()?.resource })
					.catch(error => this.logService.error('Failed to open customization migrations', error));
			},
		}));
		const actions = this._register(new ActionBar(this.element));
		actions.push(this._register(new Action(
			'newChatMigrationNotice.dismiss',
			localize('dismissMigrationNotice', "Dismiss Migration Notice for This Workspace"),
			ThemeIcon.asClassName(Codicon.close),
			true,
			() => {
				if (this.dismissalKey) {
					this.focusInput();
					this.storageService.store(this.dismissalKey, true, StorageScope.PROFILE, StorageTarget.MACHINE);
				}
			},
		)), { icon: true, label: false });

		const categories = homepageMigrationCategories.map(getCustomizationMigrationCategory);
		const configurationChanged = observableSignalFromEvent(this, Event.filter(configurationService.onDidChangeConfiguration,
			event => categories.some(category => event.affectsConfiguration(category.enablementSetting))));
		const customizationsChanged = observableSignalFromEvent(this, Event.any(
			promptsService.onDidChangeSlashCommands,
			promptsService.onDidChangeCustomAgents,
			promptsService.onDidChangeInstructions,
			promptsService.onDidChangeAgentInstructions,
			agentHostCustomizationService.onDidChangeCustomizations,
			mcpWorkbenchService.onChange,
			mcpWorkbenchService.onReset,
		));
		const storageChanged = observableSignalFromEvent(this, Event.filter(
			storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store),
			event => event.key === this.dismissalKey,
		));
		this._register(autorun(reader => {
			configurationChanged.read(reader);
			storageChanged.read(reader);
			const currentSession = session.read(reader);
			const workspace = currentSession?.workspace.read(reader);
			this.dismissalKey = `sessions.customizationMigrationNotice.dismissed.${workspace ? uriIdentityService.extUri.getComparisonKey(workspace.uri) : 'noWorkspace'}`;
			const contextKey = `${currentSession?.resource.toString()}\n${this.dismissalKey}`;
			if (this.contextKey !== contextKey) {
				this.contextKey = contextKey;
				this.setVisible(false);
			}
			if (!currentSession || currentSession.isCreated.read(reader) || currentSession.loading.read(reader)
				|| chatEntitlementService.sentimentObs.read(reader).hidden
				|| !isAgentHostSessionResource(currentSession.resource)
				|| storageService.getBoolean(this.dismissalKey, StorageScope.PROFILE, false)) {
				this.setVisible(false);
				return;
			}
			const enabledTypes = categories
				.filter(category => configurationService.getValue<boolean>(category.enablementSetting) === true)
				.map(category => category.migrationType);
			if (enabledTypes.length === 0) {
				this.setVisible(false);
				return;
			}
			customizationsChanged.read(reader);
			void this.refresh(currentSession.resource, enabledTypes, cancelOnDispose(reader.store));
		}));
	}

	private async refresh(sessionResource: URI, types: readonly CustomizationMigrationType[], token: CancellationToken): Promise<void> {
		try {
			const migrations = await Promise.all(types.map(type => type === CustomizationMigrationType.McpServers
				? this.migrationService.computeMigration(sessionResource, type, token)
				: this.migrationService.computeMigration(sessionResource, type, token)));
			if (token.isCancellationRequested) {
				return;
			}
			const count = migrations.reduce((total, migration) => total + migration.candidates.length, 0);
			this.message.textContent = count === 1
				? localize('migrationNoticeSingle', "1 agent customization needs an update to keep working.")
				: localize('migrationNoticeMultiple', "{0} agent customizations need an update to keep working.", count);
			this.setVisible(count > 0);
		} catch (error) {
			if (!isCancellationError(error)) {
				this.logService.error('Failed to check customization migrations for the new chat notice', error);
			}
			if (!token.isCancellationRequested) {
				this.setVisible(false);
			}
		}
	}

	private setVisible(visible: boolean): void {
		if (!visible && dom.isAncestorOfActiveElement(this.element)) {
			this.focusInput();
		}
		dom.setVisibility(visible, this.element);
	}
}
