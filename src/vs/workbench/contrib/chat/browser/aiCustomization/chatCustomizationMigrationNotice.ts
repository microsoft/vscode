/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatCustomizationMigrationNotice.css';
import * as dom from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../../base/common/actions.js';
import { cancelOnDispose, CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Link } from '../../../../../platform/opener/browser/link.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { AICustomizationManagementCommands } from '../../common/aiCustomizationWorkspaceService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { ICustomizationMigrationHint, ICustomizationMigrationService } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { ICustomizationMigrationTelemetryService } from '../../common/promptSyntax/service/customizationMigrationTelemetryService.js';
import { getCustomizationMigrationCategory, homepageMigrationCategories } from './customizationMigrationCategories.js';
import { CUSTOMIZATION_MIGRATION_IGNORED_GROUPS_STORAGE_KEY, getIgnoredCustomizationMigrationGroups } from './customizationMigrationIgnoredGroups.js';

export interface IChatCustomizationMigrationNoticeContext {
	readonly sessionResource: URI;
	readonly workspace: URI | undefined;
	readonly projectRoot: URI | undefined;
}

/** Controls migration discovery behavior for a notice host. */
export interface IChatCustomizationMigrationNoticeOptions {
	readonly skipDiscoveryWhenDismissed?: boolean;
}

const CUSTOMIZATION_MIGRATION_NOTICE_DISMISSED_STORAGE_KEY_PREFIX = 'chat.customizationMigrationNotice.dismissed.';

export class ChatCustomizationMigrationNotice extends Disposable {
	readonly element: HTMLElement;
	private readonly message: HTMLElement;
	private readonly migrationHint = observableValue<ICustomizationMigrationHint | undefined>(this, undefined);
	private contextKey: string | undefined;
	private currentContext: IChatCustomizationMigrationNoticeContext | undefined;
	private visible = false;

	constructor(
		container: HTMLElement,
		context: IObservable<IChatCustomizationMigrationNoticeContext | undefined>,
		showNotice: IObservable<boolean>,
		private readonly focusInput: () => void,
		private readonly onDidChangeAvailability: (available: boolean) => void,
		private readonly onDidChangeVisibility: (visible: boolean) => void,
		options: IChatCustomizationMigrationNoticeOptions | undefined,
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
		this.element = dom.append(container, dom.$('.chat-customization-migration-notice', {
			role: 'group',
			'aria-label': localize('migrationNotice', "Customization migrations"),
		}));
		dom.setVisibility(false, this.element);
		const content = dom.append(this.element, dom.$('.chat-customization-migration-notice-content'));
		this.message = dom.append(content, dom.$('span'));
		const getDismissalKey = (workspace: URI | undefined) =>
			`${CUSTOMIZATION_MIGRATION_NOTICE_DISMISSED_STORAGE_KEY_PREFIX}${workspace ? uriIdentityService.extUri.getComparisonKey(workspace) : 'noWorkspace'}`;
		this._register(instantiationService.createInstance(Link, content, {
			label: localize('reviewMigrations', "Review Migrations"),
			href: `command:${AICustomizationManagementCommands.OpenEditor}`,
		}, {
			opener: () => {
				void commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
					migration: true,
					sessionResource: this.currentContext?.sessionResource,
					migrationHint: this.migrationHint.get(),
				})
					.catch(error => this.logService.error('Failed to open customization migrations', error));
			},
		}));
		const actions = this._register(new ActionBar(this.element));
		actions.push(this._register(new Action(
			'chatCustomizationMigrationNotice.dismiss',
			localize('dismissMigrationNotice', "Dismiss Migration Notice for This Workspace"),
			ThemeIcon.asClassName(Codicon.close),
			true,
			() => {
				if (this.currentContext) {
					const hint = this.migrationHint.get();
					if (hint) {
						this.migrationTelemetryService.hintClicked(hint, 'dismiss');
					}
					this.focusInput();
					this.storageService.store(
						getDismissalKey(this.currentContext.workspace),
						true,
						StorageScope.PROFILE,
						StorageTarget.MACHINE,
					);
				}
			},
		)), { icon: true, label: false });

		const categories = homepageMigrationCategories.map(getCustomizationMigrationCategory);
		const configurationChanged = observableSignalFromEvent(this, Event.filter(configurationService.onDidChangeConfiguration,
			event => categories.some(category => event.affectsConfiguration(category.enablementSetting))));
		const customizationsChanged = observableSignalFromEvent(this, migrationService.onDidChangeCustomizations);
		const dismissalChanged = observableSignalFromEvent(this, Event.filter(
			storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store),
			event => event.key.startsWith(CUSTOMIZATION_MIGRATION_NOTICE_DISMISSED_STORAGE_KEY_PREFIX),
		));
		const ignoredGroupsChanged = observableSignalFromEvent(this, Event.filter(
			storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store),
			event => event.key === CUSTOMIZATION_MIGRATION_IGNORED_GROUPS_STORAGE_KEY,
		));
		this._register(autorun(reader => {
			configurationChanged.read(reader);
			customizationsChanged.read(reader);
			ignoredGroupsChanged.read(reader);
			const currentContext = context.read(reader);
			this.currentContext = currentContext;
			const nextContextKey = currentContext
				? [
					currentContext.sessionResource.toString(),
					currentContext.workspace ? uriIdentityService.extUri.getComparisonKey(currentContext.workspace) : 'noWorkspace',
					currentContext.projectRoot ? uriIdentityService.extUri.getComparisonKey(currentContext.projectRoot) : 'noProject',
				].join('\n')
				: undefined;
			if (this.contextKey !== nextContextKey) {
				this.contextKey = nextContextKey;
				this.migrationHint.set(undefined, undefined);
			}
			if (!currentContext || chatEntitlementService.sentimentObs.read(reader).hidden) {
				this.migrationHint.set(undefined, undefined);
				return;
			}
			if (options?.skipDiscoveryWhenDismissed) {
				dismissalChanged.read(reader);
				const dismissalKey = getDismissalKey(currentContext.workspace);
				if (storageService.getBoolean(dismissalKey, StorageScope.PROFILE, false)) {
					this.migrationHint.set(undefined, undefined);
					return;
				}
			}
			const enabledTypes = categories
				.filter(category => configurationService.getValue<boolean>(category.enablementSetting) === true)
				.map(category => category.migrationType);
			if (enabledTypes.length === 0) {
				this.migrationHint.set(undefined, undefined);
				return;
			}
			this.migrationHint.set(undefined, undefined);
			void this.refresh(currentContext, cancelOnDispose(reader.store));
		}));
		this._register(autorun(reader => {
			const hint = this.migrationHint.read(reader);
			this.onDidChangeAvailability(!!hint);
		}));
		this._register(autorun(reader => {
			dismissalChanged.read(reader);
			const currentContext = context.read(reader);
			const hint = this.migrationHint.read(reader);
			const workspace = currentContext?.workspace;
			const dismissalKey = getDismissalKey(workspace);
			const show = showNotice.read(reader)
				&& !!currentContext
				&& !!hint
				&& !chatEntitlementService.sentimentObs.read(reader).hidden
				&& !storageService.getBoolean(dismissalKey, StorageScope.PROFILE, false);
			if (show && hint) {
				this.message.textContent = hint.message;
			}
			this.setVisible(show);
		}));
	}

	private async refresh(context: IChatCustomizationMigrationNoticeContext, token: CancellationToken): Promise<void> {
		try {
			const ignoredGroups = getIgnoredCustomizationMigrationGroups(
				this.storageService,
				getChatSessionType(context.sessionResource),
				context.projectRoot,
			);
			const hint = await this.migrationService.computeMigrationHint(context.sessionResource, token, ignoredGroups);
			if (token.isCancellationRequested) {
				return;
			}
			if (hint) {
				this.migrationTelemetryService.hintComputed(hint);
			}
			this.migrationHint.set(hint, undefined);
		} catch (error) {
			if (!isCancellationError(error)) {
				this.logService.error('Failed to check customization migrations for the chat notice', error);
			}
			if (!token.isCancellationRequested) {
				this.migrationHint.set(undefined, undefined);
			}
		}
	}

	private setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}
		if (!visible && dom.isAncestorOfActiveElement(this.element)) {
			this.focusInput();
		}
		this.visible = visible;
		dom.setVisibility(visible, this.element);
		this.onDidChangeVisibility(visible);
		const hint = this.migrationHint.get();
		if (visible && hint) {
			this.migrationTelemetryService.hintShown(hint);
		}
	}

	override dispose(): void {
		this.onDidChangeAvailability(false);
		this.onDidChangeVisibility(false);
		super.dispose();
	}
}
