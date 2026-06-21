/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { joinPath } from '../../../../base/common/resources.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { getRemoteName } from '../../../../platform/remote/common/remoteHosts.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService, Parts, Position } from '../../../services/layout/browser/layoutService.js';
import { IUserDataProfileManagementService, IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { ExtensionState, IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { IWorkspaceTagsService, Tags } from '../../tags/common/workspaceTags.js';
import {
	createEmptyUsageStats,
	getWorkModePreset,
	getWorkModePresets,
	getWorkModeProfileName,
	IWorkModeDetectionResult,
	IWorkModeEnvironmentContext,
	IWorkModeExtensionInstallResult,
	IWorkModePreset,
	IWorkModeService,
	IWorkModeSuggestion,
	IWorkModeSwitchOptions,
	IWorkModeUsageStats,
	WORK_MODE_LAST_SUGGESTED_KEY,
	WORK_MODE_LAYOUT_CONFIG_KEY,
	WORK_MODE_SUGGESTION_STORAGE_KEY,
	WORK_MODE_USAGE_STATS_KEY,
	WorkModeId,
} from '../common/workMode.js';

/** Minimum score for a mode to appear in suggestions. */
const SUGGESTION_SCORE_THRESHOLD = 2;
/** Minimum score for the primary (auto-suggest) mode. */
const PRIMARY_SCORE_THRESHOLD = 4;

export class WorkModeService extends Disposable implements IWorkModeService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeWorkModes = this._register(new Emitter<void>());
	readonly onDidChangeWorkModes: Event<void> = this._onDidChangeWorkModes.event;

	private _cachedDetection: IWorkModeDetectionResult | undefined;
	private _cachedTags: Tags | undefined;

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTagsService private readonly workspaceTagsService: IWorkspaceTagsService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustService: IWorkspaceTrustManagementService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.invalidateCache()));
		this._register(this.workspaceContextService.onDidChangeWorkbenchState(() => this.invalidateCache()));
		this._register(this.workspaceTrustService.onDidChangeTrust(() => this.invalidateCache()));
		this._register(this.userDataProfilesService.onDidChangeProfiles(() => this._onDidChangeWorkModes.fire()));
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => this._onDidChangeWorkModes.fire()));
	}

	getPresets(): readonly IWorkModePreset[] {
		return getWorkModePresets();
	}

	getCurrentMode(): IWorkModePreset | undefined {
		return this.getModeForProfile(this.userDataProfileService.currentProfile);
	}

	getModeForProfile(profile: IUserDataProfile): IWorkModePreset | undefined {
		return getWorkModePresets().find(p => p.name === profile.name);
	}

	getEnvironmentContext(): IWorkModeEnvironmentContext {
		const remoteAuthority = this.environmentService.remoteAuthority;
		const remoteName = remoteAuthority ? getRemoteName(remoteAuthority) : undefined;
		const isRemote = !!remoteAuthority;
		const isWsl = remoteName === 'wsl';
		const isContainer = remoteName === 'dev-container' || remoteName === 'attached-container' || remoteName === 'codespaces';
		const isSsh = remoteName === 'ssh-remote';
		const isTrusted = this.workspaceTrustService.isWorkspaceTrusted();

		return {
			isRemote,
			remoteName,
			isWsl,
			isContainer,
			isSsh,
			isTrusted,
			isWeb: isWeb,
		};
	}

	async detectWorkModes(): Promise<IWorkModeDetectionResult> {
		if (this._cachedDetection) {
			return this._cachedDetection;
		}

		const environment = this.getEnvironmentContext();
		const tags = await this.getWorkspaceTags();
		const presentFiles = await this.detectPresentFiles();
		const detectedProjectKinds = this.inferProjectKinds(tags, presentFiles, environment);

		const suggestions: IWorkModeSuggestion[] = [];

		for (const mode of getWorkModePresets()) {
			const { score, reasons } = this.scoreMode(mode, tags, presentFiles, detectedProjectKinds, environment);
			if (score < SUGGESTION_SCORE_THRESHOLD && mode.workspaceTagSignals.length === 0 && mode.fileSignals.length === 0) {
				continue;
			}
			if (score < SUGGESTION_SCORE_THRESHOLD) {
				continue;
			}

			const existingProfile = this.userDataProfilesService.profiles.find(p => p.name === getWorkModeProfileName(mode) && !p.isInternal);
			suggestions.push({ mode, score, reasons, existingProfile });
		}

		// Always include mood-based modes at low priority so users discover them
		for (const moodId of [WorkModeId.Debugging, WorkModeId.Documentation, WorkModeId.Teaching, WorkModeId.Demo, WorkModeId.Troubleshooting]) {
			if (!suggestions.some(s => s.mode.id === moodId)) {
				const mode = getWorkModePreset(moodId)!;
				const existingProfile = this.userDataProfilesService.profiles.find(p => p.name === getWorkModeProfileName(mode) && !p.isInternal);
				suggestions.push({
					mode,
					score: 1,
					reasons: [localize('workMode.moodReason', "Available as a work mode you can switch to anytime")],
					existingProfile,
				});
			}
		}

		suggestions.sort((a, b) => b.score - a.score || a.mode.name.localeCompare(b.mode.name));

		const primary = suggestions.find(s => s.score >= PRIMARY_SCORE_THRESHOLD);
		this._cachedDetection = { suggestions, primary, detectedProjectKinds, environment };
		return this._cachedDetection;
	}

	async ensureModeProfile(modeId: WorkModeId): Promise<IUserDataProfile> {
		const preset = getWorkModePreset(modeId);
		if (!preset) {
			throw new Error(`Unknown work mode: ${modeId}`);
		}

		const profileName = getWorkModeProfileName(preset);
		const existing = this.userDataProfilesService.profiles.find(p => p.name === profileName && !p.isInternal);
		if (existing) {
			return existing;
		}

		const profile = await this.userDataProfileManagementService.createProfile(profileName, {
			icon: preset.icon.id,
		});

		try {
			await this.applyPresetSettings(profile, preset);
		} catch (error) {
			this.logService.warn('Failed to apply work mode settings', error);
		}

		this._onDidChangeWorkModes.fire();
		return profile;
	}

	async switchToMode(modeId: WorkModeId, options?: IWorkModeSwitchOptions): Promise<IUserDataProfile> {
		const profile = await this.ensureModeProfile(modeId);
		await this.userDataProfileManagementService.switchProfile(profile);

		const applyLayout = options?.applyLayout !== false
			&& this.configurationService.getValue<boolean>(WORK_MODE_LAYOUT_CONFIG_KEY) !== false;
		if (applyLayout) {
			try {
				this.applyModeLayout(modeId);
			} catch (error) {
				this.logService.warn('Failed to apply work mode layout', error);
			}
		}

		// Extension install is prompted by the contribution layer (needs user consent via notification).
		this.recordUsage('switch', modeId, options?.source);
		this.reportSwitchTelemetry(modeId, options?.source ?? 'unknown');
		this._onDidChangeWorkModes.fire();
		return profile;
	}

	applyModeLayout(modeId: WorkModeId): void {
		const preset = getWorkModePreset(modeId);
		if (!preset?.layout) {
			return;
		}

		const layout = preset.layout;

		if (typeof layout.sideBarVisible === 'boolean') {
			const currentlyVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
			if (currentlyVisible !== layout.sideBarVisible) {
				this.layoutService.setPartHidden(!layout.sideBarVisible, Parts.SIDEBAR_PART);
			}
		}

		if (typeof layout.panelVisible === 'boolean') {
			const currentlyVisible = this.layoutService.isVisible(Parts.PANEL_PART);
			if (currentlyVisible !== layout.panelVisible) {
				this.layoutService.setPartHidden(!layout.panelVisible, Parts.PANEL_PART);
			}
		}

		if (typeof layout.auxiliaryBarVisible === 'boolean') {
			const currentlyVisible = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
			if (currentlyVisible !== layout.auxiliaryBarVisible) {
				this.layoutService.setPartHidden(!layout.auxiliaryBarVisible, Parts.AUXILIARYBAR_PART);
			}
		}

		if (layout.panelPosition) {
			const position = layout.panelPosition === 'right' ? Position.RIGHT
				: layout.panelPosition === 'left' ? Position.LEFT
					: Position.BOTTOM;
			try {
				this.layoutService.setPanelPosition(position);
			} catch {
				// Panel position changes can fail if layout not fully ready
			}
		}

		if (layout.zenMode) {
			// toggleZenMode only enters if not already in zen; avoid toggling off
			// We use the command which is more resilient than direct service access in edge cases
			this.commandService.executeCommand('workbench.action.toggleZenMode').then(undefined, () => { /* ignore */ });
		}

		if (layout.focusDebugView) {
			this.commandService.executeCommand('workbench.view.debug').then(undefined, () => { /* ignore */ });
		}
	}

	async getMissingRecommendedExtensions(modeId: WorkModeId): Promise<readonly string[]> {
		const preset = getWorkModePreset(modeId);
		if (!preset || !preset.recommendedExtensions.length) {
			return [];
		}

		// Untrusted workspaces: do not probe extension installs
		if (!this.workspaceTrustService.isWorkspaceTrusted()) {
			return [];
		}

		await this.extensionsWorkbenchService.whenInitialized;
		const installedIds = new Set(
			this.extensionsWorkbenchService.local
				.filter(e => e.state === ExtensionState.Installed || e.state === ExtensionState.Installing)
				.map(e => e.identifier.id.toLowerCase())
		);

		return preset.recommendedExtensions.filter(id => !installedIds.has(id.toLowerCase()));
	}

	async installRecommendedExtensions(modeId: WorkModeId): Promise<IWorkModeExtensionInstallResult> {
		const missing = await this.getMissingRecommendedExtensions(modeId);
		const installed: string[] = [];
		const skipped: string[] = [];
		const failed: string[] = [];

		if (!missing.length) {
			return { installed, skipped, failed };
		}

		if (!this.workspaceTrustService.isWorkspaceTrusted()) {
			return { installed, skipped: [...missing], failed };
		}

		for (const extensionId of missing) {
			try {
				await this.extensionsWorkbenchService.install(extensionId, {
					justification: localize('workMode.extensionJustification', "Recommended for the {0} work mode", getWorkModePreset(modeId)?.name ?? modeId),
					enable: true,
				});
				installed.push(extensionId);
			} catch (error) {
				this.logService.warn(`Failed to install recommended extension ${extensionId}`, error);
				failed.push(extensionId);
			}
		}

		if (installed.length) {
			this.recordUsage('extensions', modeId);
			this.reportExtensionsTelemetry(modeId, installed.length, failed.length);
		}

		return { installed, skipped, failed };
	}

	async shouldSuggestWorkMode(): Promise<boolean> {
		if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return false;
		}

		// Untrusted: skip auto-prompt (detection is limited; avoid noisy/unhelpful suggestions)
		if (!this.workspaceTrustService.isWorkspaceTrusted()) {
			return false;
		}

		// Already on a non-default profile — user has engaged with profiles
		if (!this.userDataProfileService.currentProfile.isDefault) {
			return false;
		}

		// User has multiple profiles already — they know the feature
		const userProfiles = this.userDataProfilesService.profiles.filter(p => !p.isDefault && !p.isInternal);
		if (userProfiles.length > 0) {
			return false;
		}

		if (this.storageService.getBoolean(WORK_MODE_SUGGESTION_STORAGE_KEY, StorageScope.WORKSPACE, false)) {
			return false;
		}

		const detection = await this.detectWorkModes();
		if (!detection.primary || detection.primary.score < PRIMARY_SCORE_THRESHOLD) {
			return false;
		}

		// Avoid re-prompting the same primary mode the user already saw suggested in this workspace
		const lastSuggested = this.storageService.get(WORK_MODE_LAST_SUGGESTED_KEY, StorageScope.WORKSPACE);
		if (lastSuggested === detection.primary.mode.id) {
			return false;
		}

		return true;
	}

	dismissSuggestion(): void {
		this.storageService.store(WORK_MODE_SUGGESTION_STORAGE_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this.recordUsage('dismissed');
	}

	recordUsage(event: 'suggested' | 'accepted' | 'dismissed' | 'activity' | 'switch' | 'extensions', modeId?: WorkModeId, source?: string): void {
		const stats = this.getUsageStats();
		switch (event) {
			case 'suggested':
				stats.suggestionsShown++;
				if (modeId) {
					this.storageService.store(WORK_MODE_LAST_SUGGESTED_KEY, modeId, StorageScope.WORKSPACE, StorageTarget.MACHINE);
				}
				break;
			case 'accepted':
				stats.suggestionsAccepted++;
				break;
			case 'dismissed':
				stats.suggestionsDismissed++;
				break;
			case 'activity':
				stats.activityTriggers++;
				break;
			case 'switch':
				if (modeId) {
					stats.switchesByMode[modeId] = (stats.switchesByMode[modeId] ?? 0) + 1;
					stats.lastModeId = modeId;
					stats.lastSwitchSource = source;
					stats.lastSwitchAt = Date.now();
				}
				break;
			case 'extensions':
				stats.extensionsInstalled++;
				break;
		}
		this.storageService.store(WORK_MODE_USAGE_STATS_KEY, JSON.stringify(stats), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	getUsageStats(): IWorkModeUsageStats {
		const raw = this.storageService.get(WORK_MODE_USAGE_STATS_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return createEmptyUsageStats();
		}
		try {
			return { ...createEmptyUsageStats(), ...JSON.parse(raw) };
		} catch {
			return createEmptyUsageStats();
		}
	}

	private invalidateCache(): void {
		this._cachedDetection = undefined;
		this._cachedTags = undefined;
	}

	private async getWorkspaceTags(): Promise<Tags> {
		if (!this._cachedTags) {
			try {
				this._cachedTags = await this.workspaceTagsService.getTags();
			} catch {
				this._cachedTags = {};
			}
		}
		return this._cachedTags;
	}

	private async detectPresentFiles(): Promise<Set<string>> {
		const present = new Set<string>();
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (!folders.length) {
			return present;
		}

		const signals = new Set<string>();
		for (const preset of getWorkModePresets()) {
			for (const signal of preset.fileSignals) {
				signals.add(signal);
			}
		}

		const checks: Promise<void>[] = [];
		for (const folder of folders.slice(0, 3)) {
			for (const signal of signals) {
				if (signal.includes('*')) {
					continue;
				}
				const resource = joinPath(folder.uri, signal);
				checks.push(
					this.fileService.exists(resource).then(exists => {
						if (exists) {
							present.add(signal);
						}
					}).catch(() => { /* ignore */ })
				);
			}
		}

		await Promise.all(checks);
		return present;
	}

	private scoreMode(
		mode: IWorkModePreset,
		tags: Tags,
		presentFiles: Set<string>,
		projectKinds: readonly string[],
		environment: IWorkModeEnvironmentContext,
	): { score: number; reasons: string[] } {
		let score = 0;
		const reasons: string[] = [];

		for (const tagKey of mode.workspaceTagSignals) {
			if (tags[tagKey]) {
				score += 3;
				reasons.push(localize('workMode.reason.tag', "Detected project signal: {0}", tagKey.replace(/^workspace\./, '')));
			}
		}

		for (const file of mode.fileSignals) {
			if (presentFiles.has(file)) {
				score += 2;
				reasons.push(localize('workMode.reason.file', "Found {0}", file));
			}
		}

		if (mode.id === WorkModeId.Fullstack) {
			const hasFrontend = projectKinds.includes('frontend');
			const hasBackend = projectKinds.includes('backend');
			if (hasFrontend && hasBackend) {
				score += 5;
				reasons.push(localize('workMode.reason.fullstack', "Project has both frontend and backend characteristics"));
			}
		}

		if (mode.id === WorkModeId.Documentation && presentFiles.has('README.md') && presentFiles.size <= 3) {
			score += 2;
		}

		// Environment-aware boosts
		if (environment.isContainer || environment.isWsl || environment.isSsh) {
			if (mode.id === WorkModeId.Backend || mode.id === WorkModeId.Fullstack || mode.id === WorkModeId.Troubleshooting) {
				score += 2;
				reasons.push(localize('workMode.reason.remote', "Remote/container environment ({0})", environment.remoteName ?? 'remote'));
			}
		}

		if (environment.isWsl && mode.id === WorkModeId.Backend) {
			score += 1;
		}

		if (!environment.isTrusted && mode.id === WorkModeId.Troubleshooting) {
			score += 1;
			reasons.push(localize('workMode.reason.untrusted', "Workspace is not trusted — troubleshooting tools may help"));
		}

		if (environment.isWeb && (mode.id === WorkModeId.Frontend || mode.id === WorkModeId.Documentation)) {
			score += 1;
		}

		const uniqueReasons = [...new Set(reasons)].slice(0, 4);
		return { score, reasons: uniqueReasons };
	}

	private inferProjectKinds(tags: Tags, presentFiles: Set<string>, environment: IWorkModeEnvironmentContext): string[] {
		const kinds: string[] = [];
		const frontendTags = ['workspace.npm.react', 'workspace.npm.vue', 'workspace.npm.@angular/core', 'workspace.npm.next', 'workspace.npm.nuxt'];
		const backendTags = ['workspace.npm.express', 'workspace.npm.koa', 'workspace.npm.@nestjs/core', 'workspace.py.requirements', 'workspace.go.mod'];

		if (frontendTags.some(t => tags[t]) || ['vite.config.ts', 'angular.json', 'next.config.js'].some(f => presentFiles.has(f))) {
			kinds.push('frontend');
		}
		if (backendTags.some(t => tags[t]) || ['go.mod', 'Cargo.toml', 'pom.xml', 'requirements.txt', 'Dockerfile'].some(f => presentFiles.has(f))) {
			kinds.push('backend');
		}
		if (tags['workspace.py.requirements'] || presentFiles.has('requirements.txt') || presentFiles.has('pyproject.toml')) {
			kinds.push('datascience');
		}
		if (presentFiles.has('pubspec.yaml') || presentFiles.has('android') || presentFiles.has('ios')) {
			kinds.push('mobile');
		}
		if (environment.isRemote) {
			kinds.push('remote');
		}
		if (environment.isContainer) {
			kinds.push('container');
		}
		if (environment.isWsl) {
			kinds.push('wsl');
		}
		return kinds;
	}

	private async applyPresetSettings(profile: IUserDataProfile, preset: IWorkModePreset): Promise<void> {
		if (!preset.settings || Object.keys(preset.settings).length === 0) {
			return;
		}
		const settingsJson = JSON.stringify(preset.settings, null, '\t');
		await this.fileService.writeFile(profile.settingsResource, VSBuffer.fromString(settingsJson));
	}

	private reportSwitchTelemetry(modeId: WorkModeId, source: string): void {
		type WorkModeSwitchEvent = { modeId: string; source: string; isRemote: boolean; isTrusted: boolean };
		type WorkModeSwitchClassification = {
			owner: 'vscode';
			comment: 'Fired when the user switches to a work mode';
			modeId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Work mode id' };
			source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the switch was initiated' };
			isRemote: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether window is remote' };
			isTrusted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether workspace is trusted' };
		};
		const env = this.getEnvironmentContext();
		this.telemetryService.publicLog2<WorkModeSwitchEvent, WorkModeSwitchClassification>('workMode.switch', {
			modeId,
			source,
			isRemote: env.isRemote,
			isTrusted: env.isTrusted,
		});
	}

	private reportExtensionsTelemetry(modeId: WorkModeId, installedCount: number, failedCount: number): void {
		type WorkModeExtEvent = { modeId: string; installedCount: number; failedCount: number };
		type WorkModeExtClassification = {
			owner: 'vscode';
			comment: 'Fired when recommended extensions are installed for a work mode';
			modeId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Work mode id' };
			installedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Extensions installed' };
			failedCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Extensions failed' };
		};
		this.telemetryService.publicLog2<WorkModeExtEvent, WorkModeExtClassification>('workMode.extensionsInstalled', {
			modeId,
			installedCount,
			failedCount,
		});
	}
}

registerSingleton(IWorkModeService, WorkModeService, InstantiationType.Delayed);
