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
import { getCustomizationMigrationCategory, homepageMigrationCategories } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationMigrationCategories.js';
import { AICustomizationManagementCommands } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { isAgentHostSessionResource } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ICustomizationMigrationHint, ICustomizationMigrationService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/customizationMigrationService.js';
import { ICustomizationMigrationTelemetryService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/customizationMigrationTelemetryService.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

export class NewChatMigrationNotice extends Disposable {
	readonly element: HTMLElement;
	private readonly message: HTMLElement;
	private dismissalKey: string | undefined;
	private contextKey: string | undefined;
	private migrationHint: ICustomizationMigrationHint | undefined;

	constructor(
		container: HTMLElement,
		session: IObservable<IActiveSession | undefined>,
		private readonly focusInput: () => void,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICustomizationMigrationService private readonly migrationService: ICustomizationMigrationService,
		@ICustomizationMigrationTelemetryService private readonly migrationTelemetryService: ICustomizationMigrationTelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ICommandService commandService: ICommandService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
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
				void commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
					migration: true,
					sessionResource: session.get()?.resource,
					migrationHint: this.migrationHint,
				})
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
					if (this.migrationHint) {
						this.migrationTelemetryService.hintClicked(this.migrationHint, 'dismiss');
					}
					this.focusInput();
					this.storageService.store(this.dismissalKey, true, StorageScope.PROFILE, StorageTarget.MACHINE);
				}
			},
		)), { icon: true, label: false });

		const categories = homepageMigrationCategories.map(getCustomizationMigrationCategory);
		const configurationChanged = observableSignalFromEvent(this, Event.filter(configurationService.onDidChangeConfiguration,
			event => categories.some(category => event.affectsConfiguration(category.enablementSetting))));
		const customizationsChanged = observableSignalFromEvent(this, migrationService.onDidChangeCustomizations);
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
			void this.refresh(currentSession.resource, cancelOnDispose(reader.store));
		}));
	}

	private async refresh(sessionResource: URI, token: CancellationToken): Promise<void> {
		try {
			const hint = await this.migrationService.computeMigrationHint(sessionResource, token);
			if (token.isCancellationRequested) {
				return;
			}
			if (!hint) {
				this.setVisible(false);
				return;
			}
			this.migrationTelemetryService.hintComputed(hint);
			this.migrationHint = hint;
			this.message.textContent = hint.message;
			this.setVisible(true);
			this.migrationTelemetryService.hintShown(hint);
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
		if (!visible) {
			this.migrationHint = undefined;
		}
		dom.setVisibility(visible, this.element);
	}
}
