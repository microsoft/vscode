/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, IPromptChoice, NeverShowAgainScope, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { PROFILES_CATEGORY } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IDebugService } from '../../debug/common/debug.js';
import {
	IWorkModePreset,
	IWorkModeService,
	IWorkModeSuggestion,
	WORK_MODE_ACTIVITY_DEBUG_DISMISSED_KEY,
	WORK_MODE_ACTIVITY_DOCS_DISMISSED_KEY,
	WORK_MODE_ACTIVITY_SUGGESTIONS_CONFIG_KEY,
	WORK_MODE_ENABLED_CONFIG_KEY,
	WORK_MODE_EXTENSIONS_CONFIG_KEY,
	WORK_MODE_LAYOUT_CONFIG_KEY,
	WORK_MODE_SUGGESTIONS_CONFIG_KEY,
	WorkModeId,
} from '../common/workMode.js';
import './workModeService.js';

//#region Configuration

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'workbench',
	order: 7,
	title: localize('workbenchConfigurationTitle', "Workbench"),
	type: 'object',
	properties: {
		[WORK_MODE_ENABLED_CONFIG_KEY]: {
			type: 'boolean',
			default: true,
			description: localize('workModes.enabled', "Enable Work Modes — smart profile presets for different coding contexts (frontend, backend, debugging, docs, teaching, demos, and more)."),
		},
		[WORK_MODE_SUGGESTIONS_CONFIG_KEY]: {
			type: 'boolean',
			default: true,
			description: localize('workModes.suggestions', "When opening a project, suggest a Work Mode based on detected project type."),
		},
		[WORK_MODE_ACTIVITY_SUGGESTIONS_CONFIG_KEY]: {
			type: 'boolean',
			default: true,
			description: localize('workModes.activitySuggestions', "Suggest switching Work Modes based on activity (e.g. starting a debug session, or editing Markdown/docs)."),
		},
		[WORK_MODE_EXTENSIONS_CONFIG_KEY]: {
			type: 'boolean',
			default: true,
			description: localize('workModes.recommendExtensions', "After switching to a Work Mode, offer to install its recommended extensions."),
		},
		[WORK_MODE_LAYOUT_CONFIG_KEY]: {
			type: 'boolean',
			default: true,
			description: localize('workModes.applyLayout', "Apply each Work Mode's layout preset (side bar, panel, zen mode, debug view) when switching modes."),
		},
	}
});

//#endregion

//#region Contribution

export class WorkModeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.workModes';

	private _debugActivityPromptedThisSession = false;
	private _docsActivityPromptedThisSession = false;
	private _markdownOpenCount = 0;

	constructor(
		@IWorkModeService private readonly workModeService: IWorkModeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IDebugService private readonly debugService: IDebugService,
		@IEditorService private readonly editorService: IEditorService,
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this.registerActions();
		this.registerActivityListeners();
		this.lifecycleService.when(LifecyclePhase.Eventually).then(() => this.maybeSuggestWorkMode());
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(WORK_MODE_ENABLED_CONFIG_KEY) !== false;
	}

	private suggestionsEnabled(): boolean {
		return this.isEnabled() && this.configurationService.getValue<boolean>(WORK_MODE_SUGGESTIONS_CONFIG_KEY) !== false;
	}

	private activitySuggestionsEnabled(): boolean {
		return this.isEnabled() && this.configurationService.getValue<boolean>(WORK_MODE_ACTIVITY_SUGGESTIONS_CONFIG_KEY) !== false;
	}

	private extensionsEnabled(): boolean {
		return this.configurationService.getValue<boolean>(WORK_MODE_EXTENSIONS_CONFIG_KEY) !== false;
	}

	//#region Activity-based switching

	private registerActivityListeners(): void {
		// Debug session started → offer Debugging mode
		this._register(this.debugService.onDidNewSession(() => {
			this.maybeOfferActivityMode(WorkModeId.Debugging, 'debug', WORK_MODE_ACTIVITY_DEBUG_DISMISSED_KEY, () => this._debugActivityPromptedThisSession, v => this._debugActivityPromptedThisSession = v);
		}));

		// Markdown / notebook editing → offer Documentation or Data Science mode
		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.onActiveEditorChanged();
		}));
	}

	private onActiveEditorChanged(): void {
		if (!this.activitySuggestionsEnabled()) {
			return;
		}

		const editor = this.editorService.activeEditor;
		if (!editor) {
			return;
		}

		const resource = editor.resource;
		if (!resource || (resource.scheme !== Schemas.file && resource.scheme !== Schemas.vscodeRemote)) {
			return;
		}

		const name = basename(resource).toLowerCase();
		const isMarkdown = name.endsWith('.md') || name.endsWith('.mdx') || name.endsWith('.markdown');
		const isNotebook = name.endsWith('.ipynb');

		if (isNotebook) {
			this.maybeOfferActivityMode(WorkModeId.DataScience, 'notebook', WORK_MODE_ACTIVITY_DOCS_DISMISSED_KEY, () => this._docsActivityPromptedThisSession, v => this._docsActivityPromptedThisSession = v);
			return;
		}

		if (isMarkdown) {
			this._markdownOpenCount++;
			// Require a couple of markdown opens in this session to avoid noise on single README peeks
			if (this._markdownOpenCount >= 2) {
				this.maybeOfferActivityMode(WorkModeId.Documentation, 'markdown', WORK_MODE_ACTIVITY_DOCS_DISMISSED_KEY, () => this._docsActivityPromptedThisSession, v => this._docsActivityPromptedThisSession = v);
			}
		}
	}

	private maybeOfferActivityMode(
		modeId: WorkModeId,
		activityKind: string,
		dismissStorageKey: string,
		getPrompted: () => boolean,
		setPrompted: (v: boolean) => void,
	): void {
		if (!this.activitySuggestionsEnabled() || getPrompted()) {
			return;
		}

		const current = this.workModeService.getCurrentMode();
		if (current?.id === modeId) {
			return;
		}

		if (this.storageService.getBoolean(dismissStorageKey, StorageScope.WORKSPACE, false)) {
			return;
		}

		setPrompted(true);
		this.workModeService.recordUsage('activity', modeId, activityKind);
		this.reportActivityTelemetry(modeId, activityKind);

		const preset = this.workModeService.getPresets().find(p => p.id === modeId);
		if (!preset) {
			return;
		}

		const message = activityKind === 'debug'
			? localize('workMode.activity.debug', "You started debugging. Switch to the {0} work mode for breakpoints, watch, and debug console?", preset.name)
			: activityKind === 'notebook'
				? localize('workMode.activity.notebook', "You're working in a notebook. Switch to the {0} work mode for a notebook-friendly setup?", preset.name)
				: localize('workMode.activity.docs', "You're editing documentation. Switch to the {0} work mode for writing-focused settings?", preset.name);

		this.notificationService.prompt(
			Severity.Info,
			message,
			[
				{
					label: localize('workMode.activity.switch', "Switch to {0}", preset.name),
					run: async () => {
						await this.performModeSwitch(modeId, 'activity');
						this.reportActionTelemetry('activity-accept', modeId);
					}
				},
				{
					label: localize('workMode.activity.dismissWorkspace', "Don't Ask Again in This Workspace"),
					run: () => {
						this.storageService.store(dismissStorageKey, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
						this.reportActionTelemetry('activity-dismiss', modeId);
					}
				},
			],
			{
				priority: NotificationPriority.OPTIONAL,
				sticky: false,
				neverShowAgain: { id: `workbench.workModes.activity.${activityKind}`, scope: NeverShowAgainScope.APPLICATION, isSecondary: true },
			}
		);
	}

	//#endregion

	//#region Startup suggestion

	private async maybeSuggestWorkMode(): Promise<void> {
		if (!this.suggestionsEnabled()) {
			return;
		}

		try {
			if (!(await this.workModeService.shouldSuggestWorkMode())) {
				return;
			}

			const detection = await this.workModeService.detectWorkModes();
			const primary = detection.primary;
			if (!primary) {
				return;
			}

			this.workModeService.recordUsage('suggested', primary.mode.id);
			this.reportSuggestionTelemetry(primary.mode.id, primary.score, detection.detectedProjectKinds, detection.environment.isRemote, detection.environment.isTrusted);

			const envHint = detection.environment.isRemote
				? localize('workMode.suggestion.remoteHint', " (remote: {0})", detection.environment.remoteName ?? 'remote')
				: '';

			const message = localize(
				'workMode.suggestion.message',
				"This looks like a {0} project{1}. Switch to the {2} work mode for a tailored setup?",
				detection.detectedProjectKinds.filter(k => !['remote', 'container', 'wsl'].includes(k))[0] ?? primary.mode.name.toLowerCase(),
				envHint,
				primary.mode.name
			);

			const choices: IPromptChoice[] = [
				{
					label: localize('workMode.suggestion.switch', "Switch to {0}", primary.mode.name),
					run: async () => {
						this.workModeService.recordUsage('accepted', primary.mode.id);
						await this.performModeSwitch(primary.mode.id, 'suggestion');
						this.reportActionTelemetry('switch', primary.mode.id);
					}
				},
				{
					label: localize('workMode.suggestion.browse', "Browse Work Modes..."),
					run: () => {
						// Do not dismiss permanently — user wants to pick another mode via the picker.
						this.reportActionTelemetry('browse', primary.mode.id);
						this.commandService.executeCommand('workbench.profiles.actions.switchWorkMode');
					}
				},
				{
					label: localize('workMode.suggestion.dismissWorkspace', "Don't Ask Again in This Workspace"),
					run: () => {
						this.workModeService.dismissSuggestion();
						this.reportActionTelemetry('dismiss', primary.mode.id);
					}
				},
			];

			this.notificationService.prompt(
				Severity.Info,
				message,
				choices,
				{
					priority: NotificationPriority.OPTIONAL,
					sticky: false,
					neverShowAgain: { id: 'workbench.workModes.neverSuggest', scope: NeverShowAgainScope.APPLICATION, isSecondary: true },
				}
			);
		} catch {
			// Suggestions are best-effort; never block the workbench
		}
	}

	//#endregion

	//#region Switch + extension install

	private async performModeSwitch(modeId: WorkModeId, source: string): Promise<void> {
		const preset = this.workModeService.getPresets().find(p => p.id === modeId);
		await this.workModeService.switchToMode(modeId, { source, applyLayout: true });

		if (preset) {
			const tip = preset.tips[0];
			if (tip) {
				this.notificationService.info(
					localize('workMode.switchedWithTip', "Switched to {0} mode — {1}", preset.name, tip)
				);
			} else {
				this.notificationService.info(
					localize('workMode.switched', "Switched to {0} mode", preset.name)
				);
			}
		}

		if (this.extensionsEnabled()) {
			await this.maybeOfferExtensions(modeId);
		}
	}

	private async maybeOfferExtensions(modeId: WorkModeId): Promise<void> {
		const missing = await this.workModeService.getMissingRecommendedExtensions(modeId);
		if (!missing.length) {
			return;
		}

		const preset = this.workModeService.getPresets().find(p => p.id === modeId);
		const count = missing.length;
		const preview = missing.slice(0, 3).join(', ') + (count > 3 ? localize('workMode.ext.more', " (+{0} more)", count - 3) : '');

		this.notificationService.prompt(
			Severity.Info,
			localize(
				'workMode.ext.offer',
				"{0} mode recommends {1} extension(s): {2}. Install them now?",
				preset?.name ?? modeId,
				count,
				preview
			),
			[
				{
					label: localize('workMode.ext.install', "Install Recommended"),
					run: async () => {
						const result = await this.workModeService.installRecommendedExtensions(modeId);
						if (result.installed.length) {
							this.notificationService.info(localize(
								'workMode.ext.installed',
								"Installed {0} extension(s) for {1} mode.",
								result.installed.length,
								preset?.name ?? modeId
							));
						}
						if (result.failed.length) {
							this.notificationService.warn(localize(
								'workMode.ext.failed',
								"Could not install: {0}",
								result.failed.join(', ')
							));
						}
						this.reportActionTelemetry('extensions-install', modeId);
					}
				},
				{
					label: localize('workMode.ext.skip', "Skip"),
					run: () => this.reportActionTelemetry('extensions-skip', modeId),
				},
			],
			{ priority: NotificationPriority.OPTIONAL }
		);
	}

	//#endregion

	//#region Telemetry helpers

	private reportSuggestionTelemetry(modeId: string, score: number, projectKinds: readonly string[], isRemote: boolean, isTrusted: boolean): void {
		type WorkModeSuggestionEvent = { modeId: string; score: number; projectKinds: string; isRemote: boolean; isTrusted: boolean };
		type WorkModeSuggestionClassification = {
			owner: 'vscode';
			comment: 'Fired when a work mode is suggested based on project detection';
			modeId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The suggested work mode id' };
			score: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Detection confidence score' };
			projectKinds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Detected project kinds, comma-separated' };
			isRemote: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Remote window' };
			isTrusted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Trusted workspace' };
		};
		this.telemetryService.publicLog2<WorkModeSuggestionEvent, WorkModeSuggestionClassification>('workMode.suggested', {
			modeId,
			score,
			projectKinds: projectKinds.join(','),
			isRemote,
			isTrusted,
		});
	}

	private reportActivityTelemetry(modeId: string, activityKind: string): void {
		type WorkModeActivityEvent = { modeId: string; activityKind: string };
		type WorkModeActivityClassification = {
			owner: 'vscode';
			comment: 'Fired when activity triggers a work mode suggestion';
			modeId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Suggested mode' };
			activityKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Activity type: debug, markdown, notebook' };
		};
		this.telemetryService.publicLog2<WorkModeActivityEvent, WorkModeActivityClassification>('workMode.activity', {
			modeId,
			activityKind,
		});
	}

	private reportActionTelemetry(action: string, modeId: string): void {
		type WorkModeActionEvent = { action: string; modeId: string };
		type WorkModeActionClassification = {
			owner: 'vscode';
			comment: 'Fired when the user acts on a work mode suggestion or picker';
			action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The action taken' };
			modeId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The work mode id involved' };
		};
		this.telemetryService.publicLog2<WorkModeActionEvent, WorkModeActionClassification>('workMode.action', { action, modeId });
	}

	//#endregion

	//#region Actions

	private registerActions(): void {
		const that = this;

		// Switch Work Mode — primary entry point
		this._register(registerAction2(class SwitchWorkModeAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.profiles.actions.switchWorkMode',
					title: localize2('switchWorkMode', "Switch Work Mode..."),
					category: PROFILES_CATEGORY,
					f1: true,
					menu: [
						{
							id: MenuId.GlobalActivity,
							group: '2_configuration',
							order: 2,
							when: ContextKeyExpr.equals(`config.${WORK_MODE_ENABLED_CONFIG_KEY}`, true),
						},
					],
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const workModeService = accessor.get(IWorkModeService);
				const quickInputService = accessor.get(IQuickInputService);
				const notificationService = accessor.get(INotificationService);

				const detection = await workModeService.detectWorkModes();
				const currentMode = workModeService.getCurrentMode();
				const allPresets = workModeService.getPresets();
				const env = detection.environment;

				const suggestedIds = new Set(detection.suggestions.filter(s => s.score >= 2).map(s => s.mode.id));

				type ModePick = IQuickPickItem & { modeId?: WorkModeId };
				const items: (ModePick | IQuickPickSeparator)[] = [];

				const suggested = detection.suggestions.filter(s => s.score >= 2);
				if (suggested.length) {
					items.push({ type: 'separator', label: localize('workMode.section.suggested', "Suggested for this project") });
					for (const s of suggested) {
						items.push(that.toQuickPickItem(s.mode, s, currentMode?.id === s.mode.id));
					}
				}

				items.push({ type: 'separator', label: localize('workMode.section.all', "All work modes") });
				for (const preset of allPresets) {
					if (suggestedIds.has(preset.id) && suggested.length) {
						continue;
					}
					items.push(that.toQuickPickItem(preset, undefined, currentMode?.id === preset.id));
				}

				const envParts: string[] = [];
				if (detection.detectedProjectKinds.length) {
					envParts.push(localize('workMode.picker.detected', "Detected: {0}", detection.detectedProjectKinds.join(', ')));
				}
				if (env.isRemote) {
					envParts.push(localize('workMode.picker.remote', "Remote: {0}", env.remoteName ?? 'yes'));
				}
				if (!env.isTrusted) {
					envParts.push(localize('workMode.picker.untrusted', "Untrusted workspace"));
				}

				const pick = await quickInputService.pick(items, {
					title: localize('workMode.picker.title', "Switch Work Mode"),
					placeHolder: envParts.join(' · ') || localize('workMode.picker.hintGeneric', "Choose a work mode for your current context"),
					matchOnDescription: true,
					matchOnDetail: true,
				});

				if (!pick?.modeId) {
					return;
				}

				try {
					await that.performModeSwitch(pick.modeId, 'picker');
					that.reportActionTelemetry('pick', pick.modeId);
				} catch (error) {
					notificationService.error(localize('workMode.switchFailed', "Failed to switch work mode: {0}", String(error)));
				}
			}
		}));

		// Install recommended extensions for current mode
		this._register(registerAction2(class InstallWorkModeExtensionsAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.profiles.actions.installWorkModeExtensions',
					title: localize2('installWorkModeExtensions', "Install Work Mode Recommended Extensions"),
					category: PROFILES_CATEGORY,
					f1: true,
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const workModeService = accessor.get(IWorkModeService);
				const notificationService = accessor.get(INotificationService);
				const mode = workModeService.getCurrentMode();
				if (!mode) {
					notificationService.info(localize('workMode.noCurrentMode', "You are on the default profile. Run \"Switch Work Mode...\" to pick a mode."));
					return;
				}
				const missing = await workModeService.getMissingRecommendedExtensions(mode.id);
				if (!missing.length) {
					notificationService.info(localize('workMode.ext.allInstalled', "All recommended extensions for {0} mode are already installed.", mode.name));
					return;
				}
				const result = await workModeService.installRecommendedExtensions(mode.id);
				notificationService.info(localize(
					'workMode.ext.cmdResult',
					"Installed {0}, failed {1} for {2} mode.",
					result.installed.length,
					result.failed.length,
					mode.name
				));
			}
		}));

		// Apply layout for current mode
		this._register(registerAction2(class ApplyWorkModeLayoutAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.profiles.actions.applyWorkModeLayout',
					title: localize2('applyWorkModeLayout', "Apply Work Mode Layout"),
					category: PROFILES_CATEGORY,
					f1: true,
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const workModeService = accessor.get(IWorkModeService);
				const notificationService = accessor.get(INotificationService);
				const mode = workModeService.getCurrentMode();
				if (!mode) {
					notificationService.info(localize('workMode.noCurrentMode', "You are on the default profile. Run \"Switch Work Mode...\" to pick a mode."));
					return;
				}
				workModeService.applyModeLayout(mode.id);
				notificationService.info(localize('workMode.layoutApplied', "Applied {0} mode layout.", mode.name));
			}
		}));

		// Show current work mode tip
		this._register(registerAction2(class ShowWorkModeTipsAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.profiles.actions.showWorkModeTips',
					title: localize2('showWorkModeTips', "Show Work Mode Tips"),
					category: PROFILES_CATEGORY,
					f1: true,
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const workModeService = accessor.get(IWorkModeService);
				const notificationService = accessor.get(INotificationService);
				const mode = workModeService.getCurrentMode();
				if (!mode) {
					notificationService.info(localize('workMode.noCurrentMode', "You are on the default profile. Run \"Switch Work Mode...\" to pick a mode."));
					return;
				}
				const tips = mode.tips.map((t, i) => `${i + 1}. ${t}`).join('\n');
				notificationService.info(localize('workMode.tips.title', "{0} mode tips:\n{1}", mode.name, tips));
			}
		}));

		// Detect and explain
		this._register(registerAction2(class DetectWorkModeAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.profiles.actions.detectWorkMode',
					title: localize2('detectWorkMode', "Detect Work Mode for Current Project"),
					category: PROFILES_CATEGORY,
					f1: true,
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const workModeService = accessor.get(IWorkModeService);
				const notificationService = accessor.get(INotificationService);
				const detection = await workModeService.detectWorkModes();
				const env = detection.environment;

				const envLine = that.formatEnvironmentSummary(env);

				if (!detection.primary) {
					notificationService.info(localize(
						'workMode.detect.none',
						"No strong project signal detected. Kinds: {0}. Environment: {1}. Run \"Switch Work Mode...\" to pick manually.",
						detection.detectedProjectKinds.join(', ') || localize('workMode.detect.unknownKinds', "unknown"),
						envLine
					));
					return;
				}

				const s = detection.primary;
				notificationService.prompt(
					Severity.Info,
					localize(
						'workMode.detect.result',
						"Best match: {0} (score {1}). {2}\nEnvironment: {3}",
						s.mode.name,
						s.score,
						s.reasons.join('; ') || s.mode.summary,
						envLine
					),
					[{
						label: localize('workMode.detect.switch', "Switch to {0}", s.mode.name),
						run: () => that.performModeSwitch(s.mode.id, 'detect'),
					}],
				);
			}
		}));

		// Usage stats / lightweight telemetry dashboard
		this._register(registerAction2(class ShowWorkModeStatsAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.profiles.actions.showWorkModeStats',
					title: localize2('showWorkModeStats', "Show Work Mode Usage Stats"),
					category: PROFILES_CATEGORY,
					f1: true,
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const workModeService = accessor.get(IWorkModeService);
				const notificationService = accessor.get(INotificationService);
				const stats = workModeService.getUsageStats();
				const current = workModeService.getCurrentMode();
				const env = workModeService.getEnvironmentContext();

				const switchLines = Object.entries(stats.switchesByMode)
					.sort((a, b) => b[1] - a[1])
					.map(([id, count]) => `  ${id}: ${count}`)
					.join('\n') || localize('workMode.stats.noneYet', "  (none yet)");

				const summary = [
					localize('workMode.stats.header', "Work Mode usage (local)"),
					localize('workMode.stats.current', "Current mode: {0}", current?.name ?? localize('workMode.stats.defaultProfile', "Default")),
					localize('workMode.stats.env', "Environment: {0}", that.formatEnvironmentSummary(env)),
					localize('workMode.stats.suggestions', "Suggestions shown: {0}, accepted: {1}, dismissed: {2}", stats.suggestionsShown, stats.suggestionsAccepted, stats.suggestionsDismissed),
					localize('workMode.stats.activity', "Activity triggers: {0}", stats.activityTriggers),
					localize('workMode.stats.extensions', "Extension install batches: {0}", stats.extensionsInstalled),
					localize('workMode.stats.switches', "Switches by mode:\n{0}", switchLines),
					stats.lastSwitchAt
						? localize('workMode.stats.last', "Last switch: {0} via {1}", stats.lastModeId ?? localize('workMode.stats.unknown', "?"), stats.lastSwitchSource ?? localize('workMode.stats.unknown', "?"))
						: '',
				].filter(Boolean).join('\n');

				notificationService.info(summary);
			}
		}));
	}

	//#endregion

	private formatEnvironmentSummary(env: { isRemote: boolean; remoteName?: string; isTrusted: boolean; isWeb?: boolean }): string {
		const parts: string[] = [];
		if (env.isRemote) {
			parts.push(localize('workMode.env.remote', "Remote: {0}", env.remoteName ?? localize('workMode.env.remoteGeneric', "remote")));
		} else {
			parts.push(localize('workMode.env.local', "Local"));
		}
		parts.push(env.isTrusted
			? localize('workMode.env.trusted', "Trusted")
			: localize('workMode.env.untrusted', "Untrusted"));
		if (typeof env.isWeb === 'boolean') {
			parts.push(env.isWeb
				? localize('workMode.env.web', "Web")
				: localize('workMode.env.desktop', "Desktop"));
		}
		return parts.join(', ');
	}

	private toQuickPickItem(mode: IWorkModePreset, suggestion?: IWorkModeSuggestion, isCurrent?: boolean): IQuickPickItem & { modeId: WorkModeId } {
		const icon = ThemeIcon.isThemeIcon(mode.icon) ? `$(${mode.icon.id}) ` : '';
		const description = isCurrent
			? localize('workMode.current', "Current")
			: suggestion && suggestion.score >= 2
				? localize('workMode.confidence', "Suggested")
				: mode.summary;

		const detailParts: string[] = [];
		if (suggestion?.reasons.length) {
			detailParts.push(suggestion.reasons[0]);
		} else {
			detailParts.push(mode.description);
		}
		if (suggestion?.existingProfile) {
			detailParts.push(localize('workMode.hasProfile', "Profile exists"));
		}
		if (mode.recommendedExtensions.length) {
			detailParts.push(localize('workMode.extCount', "{0} recommended extensions", mode.recommendedExtensions.length));
		}

		return {
			modeId: mode.id,
			label: `${icon}${mode.name}`,
			description,
			detail: detailParts.join(' · '),
		};
	}
}

registerWorkbenchContribution2(WorkModeContribution.ID, WorkModeContribution, WorkbenchPhase.AfterRestored);

//#endregion
