/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { PromptFileVariableKind, toPromptFileVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import type { IAutomationDescriptor, IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationDialogService, IShowAutomationDialogOptions } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import type { IInlineAutomationDialogOptions } from '../../../automations/browser/automationDialogService.js';
import { IAutomationRunner } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { PromptsType } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IAgentSkill, IPromptsService, PromptsStorage } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { INewSessionRequestDraft } from '../../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { withAutomationDialogPersistenceTelemetry } from '../../../automations/browser/automationTelemetry.js';
import type { IAutomationTemplate } from './automationTemplates.js';

export const AUTOMATE_COMMAND_PREFIX = '/automate ';

const DEFAULT_MANUAL_SCHEDULE: IAutomationSchedule = { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 };

/** The create, edit and run actions of the experimental Automations layouts. */
export class AutomationsLayoutActions {

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@IAutomationRunner private readonly automationRunner: IAutomationRunner,
		@IAutomationDialogService private readonly automationDialogService: IAutomationDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
	) { }

	/** Use the upstream action so its draft-replacement confirmation also applies here. */
	async startAutomationChat(): Promise<void> {
		await this.commandService.executeCommand('sessions.automations.createWithAgent');
	}

	/**
	 * Turns what the composer of the `chatInput` layout sends into `/automate <description>`, with the built-in skill
	 * attached as the Start Chat form does. A description that already starts with `/automate` is sent as typed.
	 */
	async prepareAutomationRequest(request: INewSessionRequestDraft): Promise<INewSessionRequestDraft> {
		const query = request.query.trimStart();
		const prefixed = /^\/automate(\s|$)/.test(query) ? query : `${AUTOMATE_COMMAND_PREFIX}${query}`;
		// Inline references keep pointing at the text they stand for.
		const offset = prefixed.length - request.query.length;
		const attachedContext = offset ? request.attachedContext.map(entry => entry.range ? { ...entry, range: { start: entry.range.start + offset, endExclusive: entry.range.endExclusive + offset } } : entry) : request.attachedContext;
		const skill = await this.findAutomateSkill();
		if (!skill || attachedContext.some(entry => URI.isUri(entry.value) && isEqual(entry.value, skill.uri))) {
			return { query: prefixed, attachedContext };
		}
		return { query: prefixed, attachedContext: [...attachedContext, toPromptFileVariableEntry(skill.uri, PromptFileVariableKind.PromptFile)] };
	}

	/** The built-in /automate skill, unless the user disabled it. */
	private async findAutomateSkill(): Promise<IAgentSkill | undefined> {
		try {
			// The same file as `BUILTIN_SKILLS_URI` in sessions/contrib/chat/browser/promptsService.ts. That module
			// resolves its URI on import, which fails in hosts without module URIs such as the Component Explorer,
			// and this module is imported there.
			const skillUri = FileAccess.asFileUri('vs/sessions/skills/automate/SKILL.md');
			const skill = (await this.promptsService.findAgentSkills(CancellationToken.None))?.find(candidate =>
				candidate.name === 'automate' && candidate.storage === PromptsStorage.builtIn && isEqual(candidate.uri, skillUri));
			return skill && !this.promptsService.getDisabledPromptFiles(PromptsType.skill).has(skill.uri) ? skill : undefined;
		} catch (error) {
			this.logService.warn('[AutomationsLayout] Could not look up the /automate skill; sending without it.', error);
			return undefined;
		}
	}

	/** Create manually: today's automation dialog in its manual form, with `prompt` filled in, or the same form inline in `inline`'s container. */
	async createManually(prompt: string, inline?: IInlineAutomationDialogOptions['inline']): Promise<void> {
		await this.create({ name: '', prompt, schedule: DEFAULT_MANUAL_SCHEDULE }, inline);
	}

	async createFromTemplate(template: IAutomationTemplate): Promise<void> {
		await this.create({
			name: template.name,
			prompt: template.prompt,
			schedule: template.schedule,
			...(template.enabled !== undefined ? { enabled: template.enabled } : {}),
		});
	}

	private async create(initialValues: { readonly name: string; readonly prompt: string; readonly schedule: IAutomationSchedule; readonly enabled?: boolean }, inline?: IInlineAutomationDialogOptions['inline']): Promise<void> {
		if (!await this.ensureEnabled()) {
			return;
		}
		try {
			let created: IAutomationDescriptor | undefined;
			const options: IShowAutomationDialogOptions & IInlineAutomationDialogOptions = {
				initialValues,
				inline,
				commit: async dialogResult => {
					if (dialogResult.kind === 'create') {
						this.throwIfDisabled();
						created = await withAutomationDialogPersistenceTelemetry(this.telemetryService, 'create', () =>
							this.automationService.createAutomation(dialogResult.value, () => this.throwIfDisabled()));
					}
				},
			};
			const result = await this.automationDialogService.showAutomationDialog(options);
			if (result && created) {
				status(localize('automationsLayout.createdStatus', "Created automation {0}", created.name));
			}
		} catch (error) {
			this.logService.error('[AutomationsLayout] Failed to create automation', error);
			await this.dialogService.error(localize('automationsLayout.createFailed', "Failed to create automation."), getErrorMessage(error));
		}
	}

	async edit(automation: IAutomationDescriptor): Promise<void> {
		if (!this.automationService.canUpdateAutomation(automation.id) || !await this.ensureEnabled()) {
			return;
		}
		try {
			const result = await this.automationDialogService.showAutomationDialog({
				existing: automation,
				commit: async dialogResult => {
					if (dialogResult.kind !== 'update') {
						return;
					}
					this.throwIfDisabled();
					const update = await withAutomationDialogPersistenceTelemetry(this.telemetryService, 'update', () =>
						this.automationService.updateAutomationIfUnchanged(dialogResult.id, dialogResult.value, automation, () => this.throwIfDisabled()));
					if (update.kind === 'conflict') {
						throw new Error(update.current
							? localize('automationsLayout.changedDuringEdit', "This automation changed while the dialog was open. Reopen it to review the latest values.")
							: localize('automationsLayout.deletedDuringEdit', "This automation was deleted while the dialog was open."));
					}
				},
			});
			if (result?.kind === 'update') {
				status(localize('automationsLayout.updatedStatus', "Updated automation {0}", automation.name));
			}
		} catch (error) {
			this.logService.error('[AutomationsLayout] Failed to update automation', error);
			await this.dialogService.error(localize('automationsLayout.updateFailed', "Failed to update automation."), getErrorMessage(error));
		}
	}

	async runNow(automation: IAutomationDescriptor): Promise<void> {
		if (!this.automationService.canRunAutomation(automation.id) || !await this.ensureEnabled()) {
			return;
		}
		try {
			status(localize('automationsLayout.startingStatus', "Starting automation {0}", automation.name));
			const dispatch = await this.automationRunner.runOnce(automation, CancellationToken.None).whenDispatched;
			switch (dispatch.kind) {
				case 'accepted':
					status(localize('automationsLayout.acceptedStatus', "Run requested for {0}. Its history will update when available.", automation.name));
					break;
				case 'started':
					status(localize('automationsLayout.startedStatus', "Started automation {0}", automation.name));
					break;
				case 'alreadyRunning':
					status(localize('automationsLayout.alreadyRunningStatus', "Automation {0} is already running", automation.name));
					break;
				case 'notStarted':
					status(localize('automationsLayout.notStartedStatus', "Automation {0} did not start", automation.name));
					break;
			}
		} catch (error) {
			this.logService.error('[AutomationsLayout] Failed to run automation', error);
			await this.dialogService.error(localize('automationsLayout.runFailed', "Failed to run automation."), getErrorMessage(error));
		}
	}

	async setEnabled(automation: IAutomationDescriptor, enabled: boolean): Promise<void> {
		await this.commandService.executeCommand(enabled ? 'sessions.automations.enable' : 'sessions.automations.disable', automation);
	}

	async openRun(sessionResource: URI | undefined, externalResource: URI | undefined): Promise<void> {
		try {
			if (sessionResource) {
				await this.sessionsService.openSession(sessionResource, { preserveFocus: false, source: 'automation' });
			} else if (externalResource) {
				await this.openerService.open(externalResource, { openExternal: true, allowCommands: false });
			}
		} catch (error) {
			this.logService.error('[AutomationsLayout] Failed to open automation run', error);
			this.notificationService.error(localize('automationsLayout.openRunFailed', "Failed to open the automation run: {0}", getErrorMessage(error)));
		}
	}

	async markAllRunsRead(): Promise<void> {
		await this.commandService.executeCommand('sessions.automations.markAllRead');
	}

	showSampleNotice(): void {
		this.notificationService.info(localize('automationsLayout.sampleNotice', "This is sample data."));
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
	}

	private async ensureEnabled(): Promise<boolean> {
		if (this.isEnabled()) {
			return true;
		}
		await this.dialogService.info(
			localize('automationsLayout.disabledTitle', "Automations are disabled."),
			localize('automationsLayout.disabledDetail', "Enable \u201C{0}\u201D to make changes.", CHAT_AUTOMATIONS_ENABLED_SETTING),
		);
		return false;
	}

	private throwIfDisabled(): void {
		if (!this.isEnabled()) {
			throw new Error(localize('automationsLayout.disabledBeforeSave', "Automations were disabled before the change could be saved."));
		}
	}
}
