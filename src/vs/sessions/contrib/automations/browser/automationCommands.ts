/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { basename, dirname, isEqual, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { ICommandAction } from '../../../../platform/action/common/action.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { getAutomationAfterDate, isAutomationAfterDateExpired } from '../../../../platform/agentHost/common/automationDisableConditions.js';
import { AutomationDisableConditionKind } from '../../../../platform/agentHost/common/state/protocol/channels-automation/state.js';
import { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import type { IAutomationDescriptor } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { AUTOMATION_BLUEPRINT_FILE_SUFFIX, AutomationBlueprintParseError, automationToBlueprint, createAutomationBlueprintFileName, parseAutomationBlueprint, serializeAutomationBlueprint } from '../../../../workbench/contrib/chat/common/automations/automationBlueprint.js';
import { IAutomationDialogResult, IAutomationDialogService } from '../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { IAutomationRunDispatch, IAutomationRunner } from '../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { type IAutomationRefreshOptions, IAutomationService, type IUpdateAutomationOptions } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { hasAutomationEventTrigger } from '../../../../workbench/contrib/chat/common/automations/automationTriggers.js';
import { getShowSharedAutomationsByOthers, setShowSharedAutomationsByOthers } from '../../../../workbench/contrib/chat/common/automations/automationViewState.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING, ChatAutomationsEnabledContext } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { INewSessionInAgentsWindowOptions } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { INewSessionComposerService } from '../../../../workbench/contrib/sessions/browser/newSessionComposerService.js';
import { ISessionDraftsService } from '../../../../workbench/contrib/sessions/browser/sessionDraftsService.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { NEW_SESSION_ACTION_ID } from '../../../../workbench/contrib/sessions/common/chatConstants.js';
import { readNewChatDraftState } from '../../../../workbench/contrib/sessions/common/newChatDraftState.js';
import { ShowSharedAutomationsByOthersContext } from '../../../common/agentsWindowContextKeys.js';
import { withAutomationDialogPersistenceTelemetry } from './automationTelemetry.js';
import { AUTOMATIONS_TOUR_ID } from '../../onboardingTours/browser/tours/automationsTour.js';

export const AutomationCommands = {
	showSharedByOthers: {
		id: 'sessions.automations.toggleShowSharedByOthers',
		title: localize2('showOtherSharedAutomations', "Show automations created by others"),
		precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext),
		toggled: ShowSharedAutomationsByOthersContext,
	},
	refresh: {
		id: 'sessions.automations.refresh',
		title: localize2('refreshAutomations', "Refresh cloud automations"),
		icon: Codicon.refresh,
		precondition: ChatAutomationsEnabledContext,
	},
	createManually: {
		id: 'sessionsView.newAutomation',
		title: localize2('createManually', "Create Manually"),
		precondition: ChatAutomationsEnabledContext,
	},
	createWithAgent: {
		id: 'sessions.automations.createWithAgent',
		title: localize2('createWithAgent', "Create with Agent"),
		precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext),
	},
	edit: {
		id: 'sessions.automations.edit',
		title: localize2('editAutomation', "Edit..."),
		precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext),
	},
	run: {
		id: 'sessions.automations.run',
		title: localize2('runAutomationNow', "Run"),
		icon: Codicon.play,
		precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext),
	},
	import: {
		id: 'sessions.automations.import',
		title: localize2('importAutomation', "Import Automation"),
		precondition: ChatAutomationsEnabledContext,
	},
	duplicate: {
		id: 'sessions.automations.duplicate',
		title: localize2('duplicateAutomation', "Duplicate..."),
		precondition: ChatAutomationsEnabledContext,
	},
	export: {
		id: 'sessions.automations.export',
		title: localize2('exportAutomation', "Export..."),
		precondition: ChatAutomationsEnabledContext,
	},
	openOnGitHub: {
		id: 'sessions.automations.openOnGitHub',
		title: localize2('openAutomationOnGitHub', "Open on GitHub"),
		icon: Codicon.linkExternal,
		precondition: ChatAutomationsEnabledContext,
	},
	delete: {
		id: 'sessions.automations.delete',
		title: localize2('deleteAutomationContextMenu', "Delete..."),
		precondition: ChatAutomationsEnabledContext,
	},
	disable: {
		id: 'sessions.automations.disable',
		title: localize2('disableAutomationContextMenu', "Disable"),
		precondition: ChatAutomationsEnabledContext,
	},
	removeEndDate: {
		id: 'sessions.automations.removeLimits',
		title: localize2('removeAutomationEndDate', "Remove end date"),
		precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext),
	},
	enable: {
		id: 'sessions.automations.enable',
		title: localize2('enableAutomationContextMenu', "Enable"),
		precondition: ChatAutomationsEnabledContext,
	},
} satisfies Record<string, ICommandAction>;

export async function showAutomationEditDialog(
	automation: IAutomationDescriptor,
	automationDialogService: IAutomationDialogService,
	automationService: IAutomationService,
	configurationService: IConfigurationService,
	telemetryService: ITelemetryService,
): Promise<IAutomationDialogResult | undefined> {
	const throwIfDisabled = () => {
		if (configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) !== true) {
			throw new Error(localize('automationsDisabledBeforeSave', "Automations were disabled before the change could be saved."));
		}
	};
	return automationDialogService.showAutomationDialog({
		existing: automation,
		commit: async result => {
			if (result.kind !== 'update') {
				return;
			}
			throwIfDisabled();
			const updateResult = await withAutomationDialogPersistenceTelemetry(telemetryService, 'update', () =>
				automationService.updateAutomationIfUnchanged(result.id, result.value, automation, throwIfDisabled));
			if (updateResult.kind === 'conflict') {
				throw new Error(updateResult.current
					? localize('automationChangedDuringEdit', "This automation changed while the dialog was open. Reopen it to review the latest values.")
					: localize('automationDeletedDuringEdit', "This automation was deleted while the dialog was open."));
			}
		},
	});
}

registerAction2(class EditAutomationAction extends Action2 {
	constructor() {
		super(AutomationCommands.edit);
	}

	override async run(accessor: ServicesAccessor, automation: IAutomationDescriptor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const dialogService = accessor.get(IDialogService);
		if (configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) !== true) {
			await showAutomationsDisabled(dialogService);
			return;
		}
		const automationService = accessor.get(IAutomationService);
		const logService = accessor.get(ILogService);
		try {
			const current = automationService.getAutomation(automation.id);
			if (!current || !automationService.canUpdateAutomation(automation.id)) {
				throw new Error(current?.readOnlyReason ?? localize('automationEditUnavailable', "This automation is no longer available for editing."));
			}
			const result = await showAutomationEditDialog(current, accessor.get(IAutomationDialogService), automationService, configurationService, accessor.get(ITelemetryService));
			if (result?.kind === 'update') {
				status(localize('automationUpdatedStatus', "Updated automation {0}", current.name));
			}
		} catch (error) {
			logService.error('[Automations] Failed to update automation', error);
			await dialogService.error(localize('automationUpdateFailed', "Failed to update automation."), getErrorMessage(error));
		}
	}
});

registerAction2(class RunAutomationNowAction extends Action2 {
	private readonly pending = new Set<string>();
	constructor() {
		super(AutomationCommands.run);
	}

	override async run(accessor: ServicesAccessor, automation: IAutomationDescriptor): Promise<IAutomationRunDispatch | undefined> {
		const configurationService = accessor.get(IConfigurationService);
		const dialogService = accessor.get(IDialogService);
		if (configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) !== true) {
			await showAutomationsDisabled(dialogService);
			return undefined;
		}
		if (configurationService.getValue<boolean>(ChatAIDisabledSettingId)) {
			await dialogService.info(localize('automationRunAiDisabled', "Enable AI features to run automations."));
			return undefined;
		}
		const automationService = accessor.get(IAutomationService);
		const logService = accessor.get(ILogService);
		if (this.pending.has(automation.id)) {
			status(localize('automationDispatchPending', "A run request for {0} is already pending.", automation.name));
			return undefined;
		}
		this.pending.add(automation.id);
		try {
			const current = automationService.getAutomation(automation.id);
			if (!current || !automationService.canRunAutomation(automation.id)) {
				throw new Error(localize('automationRunUnavailable', "This automation is no longer available to run."));
			}
			const dispatch = await accessor.get(IAutomationRunner).runOnce(current).whenDispatched;
			switch (dispatch.kind) {
				case 'accepted':
					status(localize('automationAcceptedStatus', "Run requested for {0}. Its history will update when available.", current.name));
					break;
				case 'started':
					status(localize('automationStartedStatus', "Started automation {0}", current.name));
					break;
				case 'queued':
					status(localize('automationQueuedStatus', "Queued automation {0}", current.name));
					break;
				case 'alreadyRunning':
					status(localize('automationAlreadyRunningStatus', "Automation {0} is already running", current.name));
					break;
				case 'notStarted':
					status(localize('automationNotStartedStatus', "Automation {0} did not start", current.name));
					break;
				case 'uncertain':
					status(dispatch.message);
					break;
			}
			return dispatch;
		} catch (error) {
			logService.error('[Automations] Failed to run automation', error);
			await dialogService.error(localize('automationRunActionFailed', "Failed to run automation."), getErrorMessage(error));
			return undefined;
		} finally {
			this.pending.delete(automation.id);
		}
	}
});

export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function getAutomationBlueprintErrorMessage(error: unknown): string {
	if (!(error instanceof AutomationBlueprintParseError)) {
		return getErrorMessage(error);
	}
	switch (error.code) {
		case 'invalidFrontmatter':
			return localize('automationBlueprint.invalidFrontmatter', "The file must start with valid YAML frontmatter.");
		case 'unknownProperty':
			return localize('automationBlueprint.unknownProperty', "The property '{0}' is not supported.", error.property ?? '');
		case 'invalidField':
			return localize('automationBlueprint.invalidField', "The property '{0}' is missing or invalid.", error.property ?? '');
		case 'unsupportedVersion':
			return localize('automationBlueprint.unsupportedVersion', "Automation blueprint version {0} is not supported.", error.property ?? '');
		case 'invalidId':
			return localize('automationBlueprint.invalidId', "The blueprint id '{0}' is invalid.", error.property ?? '');
		case 'unsupportedSchedule':
			return localize('automationBlueprint.unsupportedSchedule', "The cron expression '{0}' cannot be represented by the current Automation editor.", error.property ?? '');
		case 'unsupportedTimeZone':
			return localize('automationBlueprint.unsupportedTimeZone', "The time zone '{0}' is not supported. Use 'local' so the schedule follows the importing user's time zone.", error.property ?? '');
		case 'missingPrompt':
			return localize('automationBlueprint.missingPrompt', "The Automation prompt must follow the frontmatter.");
	}
}

function normalizeAutomationBlueprintResource(resource: URI): URI {
	let name = basename(resource);
	while (name.toLowerCase().endsWith(AUTOMATION_BLUEPRINT_FILE_SUFFIX)) {
		name = name.slice(0, -AUTOMATION_BLUEPRINT_FILE_SUFFIX.length);
	}
	if (name.toLowerCase().endsWith('.md')) {
		name = name.slice(0, -'.md'.length);
	}
	return joinPath(dirname(resource), `${name || 'automation'}${AUTOMATION_BLUEPRINT_FILE_SUFFIX}`);
}

export function isAutomationBlueprintResource(resource: URI): boolean {
	return resource.path.toLowerCase().endsWith(AUTOMATION_BLUEPRINT_FILE_SUFFIX);
}

export async function importAutomationBlueprint(
	readContent: () => Promise<string>,
	automationDialogService: IAutomationDialogService,
	automationService: IAutomationService,
	configurationService: IConfigurationService,
	dialogService: IDialogService,
	logService: ILogService,
	telemetryService: ITelemetryService,
): Promise<void> {
	const isEnabled = () => configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
	if (!isEnabled()) {
		await showAutomationsDisabled(dialogService);
		return;
	}

	let blueprint;
	try {
		blueprint = parseAutomationBlueprint(await readContent());
	} catch (error) {
		logService.error('[Automations] Failed to read Automation blueprint', error);
		await dialogService.error(
			localize('automationImportReadFailed', "Failed to import automation."),
			getAutomationBlueprintErrorMessage(error),
		);
		return;
	}

	let automation: IAutomationDescriptor | undefined;
	const result = await automationDialogService.showAutomationDialog({
		initialValues: {
			name: blueprint.name,
			prompt: blueprint.prompt,
			schedule: blueprint.schedule,
			...(blueprint.disableConditions !== undefined ? { disableConditions: blueprint.disableConditions } : {}),
			enabled: false,
		},
		commit: async result => {
			if (result.kind === 'create') {
				automation = await withAutomationDialogPersistenceTelemetry(telemetryService, 'create', () =>
					automationService.createAutomation(result.value, () => {
						if (!isEnabled()) {
							throw new Error(localize('automationsDisabledBeforeImport', "Automations were disabled before the imported automation could be saved."));
						}
					}));
			}
		},
	});
	if (!result || !automation) {
		return;
	}
	status(localize('automationImportedStatus', "Imported automation {0}", automation.name));
}

export async function showAutomationsDisabled(dialogService: IDialogService): Promise<void> {
	await dialogService.info(
		localize('automationsDisabledTitle', "Automations are disabled."),
		localize('automationsDisabledDetail', "Enable \u201C{0}\u201D to make changes.", CHAT_AUTOMATIONS_ENABLED_SETTING),
	);
}

function getSharedAutomationWarning(action: 'disable' | 'delete'): string {
	return action === 'disable'
		? localize('disableSharedAutomationWarning', "WARNING: This is a shared automation, this will disable it for everyone in this repository.")
		: localize('deleteSharedAutomationWarning', "WARNING: This is a shared automation, this will delete it for everyone in this repository.");
}

function withSharedAutomationWarning(action: 'disable' | 'delete', detail: string): string {
	return localize('sharedAutomationWarningDetail', "{0}\n\n{1}", getSharedAutomationWarning(action), detail);
}

async function confirmAndDeleteAutomation(
	automation: IAutomationDescriptor,
	automationService: IAutomationService,
	configurationService: IConfigurationService,
	dialogService: IDialogService,
	logService: ILogService,
): Promise<void> {
	if (!automationService.canDeleteAutomation(automation.id)) {
		return;
	}
	const isEnabled = () => configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
	if (!isEnabled()) {
		await showAutomationsDisabled(dialogService);
		return;
	}
	const deleteDetail = localize('confirmDeleteDetail', "This will permanently delete the automation, its run history, and the associated sessions. This cannot be undone.");
	const shared = automation.ownership === 'repository';
	const confirmed = await dialogService.confirm({
		type: 'warning',
		message: localize('confirmDeleteAutomation', "Delete automation \"{0}\"?", automation.name),
		detail: shared ? withSharedAutomationWarning('delete', deleteDetail) : deleteDetail,
		primaryButton: localize('delete', "Delete"),
	});
	if (!confirmed.confirmed) {
		return;
	}
	if (!isEnabled()) {
		await showAutomationsDisabled(dialogService);
		return;
	}
	try {
		await automationService.deleteAutomation(automation.id, () => {
			if (!isEnabled()) {
				throw new Error(localize('automationsDisabledBeforeDelete', "Automations were disabled before the automation could be deleted."));
			}
		}, automationService.supportsDeleteHistoryChoice?.(automation.id) === true ? { deleteHistory: true } : undefined);
		status(localize('automationDeletedStatus', "Deleted automation {0}", automation.name));
	} catch (error) {
		logService.error('[AutomationsCards] Failed to delete automation', error);
		await dialogService.error(
			localize('automationDeleteFailed', "Failed to delete automation."),
			getErrorMessage(error),
		);
	}
}

export async function refreshAutomations(automationService: IAutomationService, logService: ILogService, notificationService?: INotificationService, options?: IAutomationRefreshOptions): Promise<boolean> {
	try {
		await automationService.refresh?.(options);
		return true;
	} catch (error) {
		if (!isCancellationError(error)) {
			logService.error('[Automations] Failed to refresh', error);
			notificationService?.error(localize('automationsRefreshFailed', "Could not refresh automations: {0}", getErrorMessage(error)));
		}
		return false;
	}
}

async function setAutomationEnabled(accessor: ServicesAccessor, automation: IAutomationDescriptor, enabled: boolean): Promise<void> {
	const automationService = accessor.get(IAutomationService);
	if (automation.enabled === enabled || !automationService.canUpdateAutomation(automation.id)) {
		return;
	}
	const configurationService = accessor.get(IConfigurationService);
	const dialogService = accessor.get(IDialogService);
	const logService = accessor.get(ILogService);
	const automationsEnabled = () => configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
	if (!automationsEnabled()) {
		await showAutomationsDisabled(dialogService);
		return;
	}
	if (!enabled && automation.ownership === 'repository') {
		const confirmed = await dialogService.confirm({
			type: 'warning',
			message: localize('confirmDisableSharedAutomation', "Disable automation \"{0}\"?", automation.name),
			detail: getSharedAutomationWarning('disable'),
			primaryButton: localize('disable', "Disable"),
		});
		if (!confirmed.confirmed) {
			return;
		}
		if (!automationsEnabled()) {
			await showAutomationsDisabled(dialogService);
			return;
		}
	}
	try {
		let patch: IUpdateAutomationOptions = { enabled };
		if (enabled && isAutomationAfterDateExpired(automation.disableConditions)) {
			const confirmation = await dialogService.confirm({
				type: 'warning',
				message: localize('automationExpired', "This automation has expired"),
				detail: localize('automationExpiredDetail', "The expiration date has passed for this automation. Ask in chat to change the date, or remove it to reenable it."),
				primaryButton: localize('automationRemoveExpirationAndEnable', "Remove expiration and enable"),
			});
			if (!confirmation.confirmed) {
				return;
			}
			patch = {
				enabled,
				disableConditions: automation.disableConditions?.filter(condition => condition.kind !== AutomationDisableConditionKind.AfterDate) ?? [],
			};
		}
		const result = await automationService.updateAutomationIfUnchanged(automation.id, patch, automation, () => {
			if (!automationsEnabled()) {
				throw new Error(enabled
					? localize('automationsDisabledBeforeEnable', "Automations were disabled before the automation could be enabled.")
					: localize('automationsDisabledBeforeDisable', "Automations were disabled before the automation could be updated."));
			}
		});
		if (result.kind === 'conflict') {
			throw new Error(result.current
				? (enabled
					? localize('automationChangedDuringEnable', "This automation changed before it could be enabled. Try again.")
					: localize('automationChangedDuringDisable', "This automation changed before it could be disabled. Try again."))
				: (enabled
					? localize('automationDeletedDuringEnable', "This automation was deleted before it could be enabled.")
					: localize('automationDeletedDuringDisable', "This automation was deleted before it could be disabled.")));
		}
		status(enabled && !result.automation.enabled
			? localize('automationRemainsDisabledStatus', "Automation {0} remains disabled.", automation.name)
			: result.automation.enabled
				? localize('automationEnabledStatus', "Enabled automation {0}", automation.name)
				: localize('automationDisabledStatus', "Disabled automation {0}", automation.name));
	} catch (error) {
		logService.error(enabled ? '[Automations] Failed to enable automation' : '[Automations] Failed to disable automation', error);
		await dialogService.error(
			enabled
				? localize('automationEnableFailed', "Failed to enable automation.")
				: localize('automationDisableFailed', "Failed to disable automation."),
			getErrorMessage(error),
		);
	}
}

function getDuplicateAutomationName(name: string, automations: readonly IAutomationDescriptor[]): string {
	const existingNames = new Set(automations.map(automation => automation.name));
	const copyName = localize('automationCopyName', "{0} Copy", name);
	if (!existingNames.has(copyName)) {
		return copyName;
	}
	for (let index = 2; ; index++) {
		const indexedCopyName = localize('automationIndexedCopyName', "{0} Copy {1}", name, index);
		if (!existingNames.has(indexedCopyName)) {
			return indexedCopyName;
		}
	}
}

registerAction2(class ToggleOtherSharedAutomationsAction extends Action2 {
	constructor() {
		super(AutomationCommands.showSharedByOthers);
	}

	override run(accessor: ServicesAccessor): void {
		const storageService = accessor.get(IStorageService);
		setShowSharedAutomationsByOthers(storageService, !getShowSharedAutomationsByOthers(storageService));
	}
});

registerAction2(class RefreshAutomationsAction extends Action2 {
	constructor() {
		super(AutomationCommands.refresh);
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const automationService = accessor.get(IAutomationService);
		const logService = accessor.get(ILogService);
		const notificationService = accessor.get(INotificationService);
		const title = localize('refreshingCloudAutomations', "Refreshing cloud automations...");
		status(title);
		const refreshed = await accessor.get(IProgressService).withProgress({
			location: ProgressLocation.Notification,
			title,
			delay: 500,
		}, () => refreshAutomations(automationService, logService, notificationService));
		if (refreshed) {
			status(localize('cloudAutomationsRefreshed', "Cloud automations refreshed."));
		}
	}
});

registerAction2(class NewAutomationAction extends Action2 {
	constructor() {
		super(AutomationCommands.createManually);
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const automationDialogService = accessor.get(IAutomationDialogService);
		const automationService = accessor.get(IAutomationService);
		const configurationService = accessor.get(IConfigurationService);
		const dialogService = accessor.get(IDialogService);
		const telemetryService = accessor.get(ITelemetryService);
		const isEnabled = () => configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
		if (!isEnabled()) {
			await showAutomationsDisabled(dialogService);
			return;
		}
		await automationDialogService.showAutomationDialog({
			commit: async result => {
				if (result.kind === 'create') {
					await withAutomationDialogPersistenceTelemetry(telemetryService, 'create', () =>
						automationService.createAutomation(result.value, () => {
							if (!isEnabled()) {
								throw new Error(localize('automationsDisabledBeforeSave', "Automations were disabled before the change could be saved."));
							}
						}));
				}
			},
		});
	}
});

registerAction2(class CreateAutomationWithAgentAction extends Action2 {
	private showingIntroduction = false;
	constructor() { super(AutomationCommands.createWithAgent); }
	override async run(accessor: ServicesAccessor, creationOptions?: { readonly skipIntroduction?: boolean }): Promise<void> {
		if (this.showingIntroduction) {
			return;
		}
		const onboardingService = accessor.get(IOnboardingScenarioService);
		const commandService = accessor.get(ICommandService);
		const dialogService = accessor.get(IDialogService);
		const sessionsService = accessor.get(ISessionsService);
		const composerService = accessor.get(INewSessionComposerService);
		const storageService = accessor.get(IStorageService);
		const sessionDraftsService = accessor.get(ISessionDraftsService);
		if (!creationOptions?.skipIntroduction && onboardingScenarioRegistry.getScenario(AUTOMATIONS_TOUR_ID) && onboardingService.shouldShowNudge(AUTOMATIONS_TOUR_ID)) {
			this.showingIntroduction = true;
			try {
				const outcome = await onboardingService.runScenario(AUTOMATIONS_TOUR_ID);
				if (outcome === OnboardingOutcome.Aborted) {
					onboardingService.reset(AUTOMATIONS_TOUR_ID);
					return;
				}
				if (outcome === OnboardingOutcome.Skipped || outcome === OnboardingOutcome.Dismissed) {
					return;
				}
			} finally {
				this.showingIntroduction = false;
			}
		}
		const mountedDraftHasInput = composerService.hasDraftInput;
		const savedDraft = mountedDraftHasInput === undefined ? readNewChatDraftState(storageService) : undefined;
		const hasDraftInput = mountedDraftHasInput ?? (!!savedDraft?.inputText || !!savedDraft?.attachments.length);
		if (hasDraftInput && !sessionDraftsService.enabled.get()) {
			const { result } = await dialogService.prompt<boolean>({
				type: 'warning',
				message: localize('replaceAutomationDraft', "Replace your existing draft?"),
				detail: localize('replaceAutomationDraftDetail', "This action will overwrite the existing new session draft, it will not be recoverable."),
				buttons: [
					{ label: localize('replaceAutomationDraftButton', "Replace Draft"), run: () => true },
					{ label: localize('viewAutomationDraftButton', "View Draft"), run: () => false },
				],
				cancelButton: true,
			});
			if (result !== true) {
				if (result === false) {
					await sessionsService.openNewSession();
				}
				return;
			}
		}
		const options: INewSessionInAgentsWindowOptions = {
			prompt: '/automate ',
			prefillPrompt: true,
		};
		await commandService.executeCommand(NEW_SESSION_ACTION_ID, options);
	}
});

registerAction2(class ImportAutomationAction extends Action2 {
	constructor() {
		super(AutomationCommands.import);
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const dialogService = accessor.get(IDialogService);
		const fileDialogService = accessor.get(IFileDialogService);
		const fileService = accessor.get(IFileService);
		const logService = accessor.get(ILogService);
		const automationDialogService = accessor.get(IAutomationDialogService);
		const automationService = accessor.get(IAutomationService);
		const telemetryService = accessor.get(ITelemetryService);
		const isEnabled = () => configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
		if (!isEnabled()) {
			await showAutomationsDisabled(dialogService);
			return;
		}

		const resources = await fileDialogService.showOpenDialog({
			title: localize('importAutomationDialogTitle', "Import Automation"),
			openLabel: localize('importAutomationDialogOpen', "Import"),
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: [{ name: localize('automationBlueprintFileFilter', "Automation Blueprint"), extensions: ['automation.md'] }],
		});
		const resource = resources?.[0];
		if (!resource) {
			return;
		}
		if (!isAutomationBlueprintResource(resource)) {
			await dialogService.error(
				localize('automationDropFailed', "Unable to import automation."),
				localize('automationDropUnsupported', "Only .automation.md files can be imported."),
			);
			return;
		}

		await importAutomationBlueprint(
			async () => (await fileService.readFile(resource)).value.toString(),
			automationDialogService,
			automationService,
			configurationService,
			dialogService,
			logService,
			telemetryService,
		);
	}
});

registerAction2(class DuplicateAutomationAction extends Action2 {
	constructor() {
		super(AutomationCommands.duplicate);
	}

	override async run(accessor: ServicesAccessor, automation: IAutomationDescriptor): Promise<void> {
		const automationDialogService = accessor.get(IAutomationDialogService);
		const automationService = accessor.get(IAutomationService);
		const configurationService = accessor.get(IConfigurationService);
		const dialogService = accessor.get(IDialogService);
		const logService = accessor.get(ILogService);
		const telemetryService = accessor.get(ITelemetryService);
		const isEnabled = () => configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
		if (!isEnabled()) {
			await showAutomationsDisabled(dialogService);
			return;
		}

		try {
			const name = getDuplicateAutomationName(automation.name, automationService.automations.get());
			if (hasAutomationEventTrigger(automation.cloudTrigger?.triggers ?? {})) {
				throw new Error(localize('automation.duplicateEvents', "Duplicate event-triggered automations on GitHub to preserve their complete configuration."));
			}
			let duplicate: IAutomationDescriptor | undefined;
			const result = await automationDialogService.showAutomationDialog({
				initialValues: {
					name,
					...(automation.ownership ? { ownership: automation.ownership } : {}),
					prompt: automation.prompt,
					schedule: automation.schedule,
					...(automation.disableConditions !== undefined ? { disableConditions: automation.disableConditions } : {}),
					target: automation.target,
					...(automation.sessionTemplate
						? { sessionTemplate: automation.sessionTemplate }
						: {
							modelId: automation.modelId,
							mode: automation.mode,
							permissionLevel: automation.permissionLevel,
						}),
					enabled: automation.enabled,
				},
				commit: async result => {
					if (result.kind === 'create') {
						duplicate = await withAutomationDialogPersistenceTelemetry(telemetryService, 'create', () =>
							automationService.createAutomation(result.value, () => {
								if (!isEnabled()) {
									throw new Error(localize('automationsDisabledBeforeDuplicate', "Automations were disabled before the duplicate could be saved."));
								}
							}));
					}
				},
			});
			if (!result || !duplicate) {
				return;
			}
			status(localize('automationDuplicatedStatus', "Created duplicate automation {0}", duplicate.name));
		} catch (error) {
			logService.error('[Automations] Failed to duplicate automation', error);
			await dialogService.error(
				localize('automationDuplicateFailed', "Failed to duplicate automation."),
				getErrorMessage(error),
			);
		}
	}
});

registerAction2(class ExportAutomationAction extends Action2 {
	constructor() {
		super(AutomationCommands.export);
	}

	override async run(accessor: ServicesAccessor, automation: IAutomationDescriptor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const dialogService = accessor.get(IDialogService);
		const fileDialogService = accessor.get(IFileDialogService);
		const fileService = accessor.get(IFileService);
		const logService = accessor.get(ILogService);
		if (configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) !== true) {
			await showAutomationsDisabled(dialogService);
			return;
		}

		let defaultUri = joinPath(await fileDialogService.defaultFilePath(), createAutomationBlueprintFileName(automation.name));
		let resource: URI;
		while (true) {
			const selectedResource = await fileDialogService.showSaveDialog({
				title: localize('exportAutomationDialogTitle', "Export Automation"),
				saveLabel: localize('exportAutomationDialogSave', "Export"),
				defaultUri,
				filters: [{ name: localize('automationBlueprintFileFilter', "Automation Blueprint"), extensions: ['md'] }],
			});
			if (!selectedResource) {
				return;
			}
			const normalizedResource = normalizeAutomationBlueprintResource(selectedResource);
			if (isEqual(selectedResource, normalizedResource)) {
				resource = selectedResource;
				break;
			}
			await dialogService.error(
				localize('automationExportInvalidFileNameTitle', "Unable to export automation."),
				localize('automationExportInvalidFileName', "Use a file name ending in exactly one .automation.md suffix."),
			);
			defaultUri = normalizedResource;
		}

		try {
			const content = serializeAutomationBlueprint(automationToBlueprint(automation));
			await fileService.writeFile(resource, VSBuffer.fromString(content));
			status(localize('automationExportedStatus', "Exported automation {0}", automation.name));
		} catch (error) {
			logService.error('[Automations] Failed to export Automation blueprint', error);
			await dialogService.error(
				localize('automationExportFailed', "Failed to export automation."),
				getErrorMessage(error),
			);
		}
	}
});

registerAction2(class OpenAutomationOnGitHubAction extends Action2 {
	constructor() {
		super(AutomationCommands.openOnGitHub);
	}

	override async run(accessor: ServicesAccessor, automation: IAutomationDescriptor): Promise<void> {
		const automationService = accessor.get(IAutomationService);
		const openerService = accessor.get(IOpenerService);
		const logService = accessor.get(ILogService);
		const dialogService = accessor.get(IDialogService);
		try {
			const resource = automationService.getAutomation(automation.id)?.externalResource;
			if (!resource) {
				throw new Error(localize('automationExternalUnavailable', "This automation is no longer available on GitHub."));
			}
			if (!await openerService.open(resource, { openExternal: true, allowCommands: false })) {
				throw new Error(localize('automationExternalOpenRejected', "The link could not be opened."));
			}
		} catch (error) {
			logService.error('[Automations] Failed to open automation on GitHub', error);
			await dialogService.error(localize('automationExternalOpenFailed', "Failed to open the automation on GitHub."), getErrorMessage(error));
		}
	}
});

registerAction2(class DeleteAutomationAction extends Action2 {
	constructor() {
		super(AutomationCommands.delete);
	}

	override async run(accessor: ServicesAccessor, automation: IAutomationDescriptor): Promise<void> {
		await confirmAndDeleteAutomation(
			automation,
			accessor.get(IAutomationService),
			accessor.get(IConfigurationService),
			accessor.get(IDialogService),
			accessor.get(ILogService),
		);
	}
});

registerAction2(class DisableAutomationAction extends Action2 {
	constructor() {
		super(AutomationCommands.disable);
	}

	override async run(accessor: ServicesAccessor, automation: IAutomationDescriptor): Promise<void> {
		await setAutomationEnabled(accessor, automation, false);
	}
});

registerAction2(class RemoveAutomationEndDateAction extends Action2 {
	constructor() {
		super(AutomationCommands.removeEndDate);
	}

	override async run(accessor: ServicesAccessor, automation: IAutomationDescriptor): Promise<void> {
		const automationService = accessor.get(IAutomationService);
		if (getAutomationAfterDate(automation.disableConditions) === undefined || !automationService.canUpdateAutomation(automation.id)) {
			return;
		}
		const configurationService = accessor.get(IConfigurationService);
		const dialogService = accessor.get(IDialogService);
		const logService = accessor.get(ILogService);
		const automationsEnabled = () => configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
		if (!automationsEnabled()) {
			await showAutomationsDisabled(dialogService);
			return;
		}
		try {
			const disableConditions = automation.disableConditions?.filter(condition => condition.kind !== AutomationDisableConditionKind.AfterDate) ?? [];
			const result = await automationService.updateAutomationIfUnchanged(automation.id, { disableConditions }, automation, () => {
				if (!automationsEnabled()) {
					throw new Error(localize('automationsDisabledBeforeRemoveEndDate', "Automations were disabled before the end date could be removed."));
				}
			});
			if (result.kind === 'conflict') {
				throw new Error(result.current
					? localize('automationChangedBeforeRemoveEndDate', "This automation changed before its end date could be removed. Try again.")
					: localize('automationDeletedBeforeRemoveEndDate', "This automation was deleted before its end date could be removed."));
			}
			status(localize('automationEndDateRemoved', "Removed end date from automation {0}", automation.name));
		} catch (error) {
			logService.error('[Automations] Failed to remove automation end date', error);
			await dialogService.error(localize('automationRemoveEndDateFailed', "Failed to remove automation end date."), getErrorMessage(error));
		}
	}
});

registerAction2(class EnableAutomationAction extends Action2 {
	constructor() {
		super(AutomationCommands.enable);
	}

	override async run(accessor: ServicesAccessor, automation: IAutomationDescriptor): Promise<void> {
		await setAutomationEnabled(accessor, automation, true);
	}
});
