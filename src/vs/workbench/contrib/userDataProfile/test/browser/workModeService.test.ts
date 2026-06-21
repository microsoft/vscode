/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUserDataProfile, IUserDataProfilesService, toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { Parts, Position } from '../../../../services/layout/browser/layoutService.js';
import { IUserDataProfileManagementService, IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { TestContextService, TestFileService, TestStorageService, TestWorkspaceTrustManagementService } from '../../../../test/common/workbenchTestServices.js';
import { TestLayoutService } from '../../../../test/browser/workbenchTestServices.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { IWorkspaceTagsService, Tags } from '../../../tags/common/workspaceTags.js';
import { WorkModeService } from '../../browser/workModeService.js';
import {
	getWorkModePreset,
	WORK_MODE_LAYOUT_CONFIG_KEY,
	WORK_MODE_SUGGESTION_STORAGE_KEY,
	WORK_MODE_USAGE_STATS_KEY,
	WorkModeId,
} from '../../common/workMode.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { TestWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';

//#region Test doubles

class MutableWorkspaceTagsService implements IWorkspaceTagsService {
	declare readonly _serviceBrand: undefined;
	tags: Tags = {};
	getTags(): Promise<Tags> { return Promise.resolve(this.tags); }
	async getTelemetryWorkspaceId(): Promise<string | undefined> { return undefined; }
	getHashedRemotesFromUri(): Promise<string[]> { return Promise.resolve([]); }
}

class MutableEnvironmentService {
	declare readonly _serviceBrand: undefined;
	remoteAuthority: string | undefined;
}

class TrackingLayoutService extends TestLayoutService {
	hiddenParts: Parts[] = [];
	panelPositionSet: Position | undefined;
	override isVisible(_part: Parts): boolean { return !this.hiddenParts.includes(_part); }
	override async setPartHidden(hidden: boolean, part: Parts): Promise<void> {
		if (hidden) {
			if (!this.hiddenParts.includes(part)) {
				this.hiddenParts.push(part);
			}
		} else {
			this.hiddenParts = this.hiddenParts.filter(p => p !== part);
		}
	}
	override async setPanelPosition(position: Position): Promise<void> {
		this.panelPositionSet = position;
	}
}

class FakeExtensionsWorkbenchService {
	declare readonly _serviceBrand: undefined;
	whenInitialized = Promise.resolve();
	local: IExtension[] = [];
	installedCalls: string[] = [];
	installShouldFail = false;
	async install(id: string): Promise<IExtension> {
		this.installedCalls.push(id);
		if (this.installShouldFail) {
			throw new Error('install failed');
		}
		// eslint-disable-next-line local/code-no-any-casts
		const ext = { identifier: { id }, state: ExtensionState.Installed } as any as IExtension;
		this.local.push(ext);
		return ext;
	}
}

class FakeCommandService implements ICommandService {
	declare readonly _serviceBrand: undefined;
	onWillExecuteCommand = Event.None;
	onDidExecuteCommand = Event.None;
	executed: string[] = [];
	async executeCommand<T = unknown>(commandId: string): Promise<T> {
		this.executed.push(commandId);
		return undefined as T;
	}
}

class FakeProfilesService implements IUserDataProfilesService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeProfiles = new Emitter<any>();
	readonly onDidChangeProfiles = this._onDidChangeProfiles.event;
	readonly onDidResetWorkspaces = Event.None;
	profilesHome = URI.file('/profiles');
	defaultProfile: IUserDataProfile;
	profiles: IUserDataProfile[];
	constructor() {
		const loc = URI.file('/profiles/default');
		this.defaultProfile = toUserDataProfile('__default__profile__', 'Default', loc, URI.file('/cache'));
		this.profiles = [this.defaultProfile];
	}
	async createNamedProfile(name: string): Promise<IUserDataProfile> {
		const p = toUserDataProfile(name.toLowerCase().replace(/\s+/g, '-'), name, URI.file(`/profiles/${name}`), URI.file('/cache'));
		this.profiles.push(p);
		this._onDidChangeProfiles.fire({ added: [p], removed: [], updated: [], all: this.profiles });
		return p;
	}
	async createTransientProfile(): Promise<IUserDataProfile> { throw new Error('not implemented'); }
	async createProfile(id: string, name: string): Promise<IUserDataProfile> {
		const p = toUserDataProfile(id, name, URI.file(`/profiles/${id}`), URI.file('/cache'));
		this.profiles.push(p);
		return p;
	}
	async updateProfile(profile: IUserDataProfile): Promise<IUserDataProfile> { return profile; }
	async removeProfile(): Promise<void> { }
	async setProfileForWorkspace(): Promise<void> { }
	async resetWorkspaces(): Promise<void> { }
	async cleanUp(): Promise<void> { }
	async cleanUpTransientProfiles(): Promise<void> { }
}

class FakeProfileManagementService implements IUserDataProfileManagementService {
	declare readonly _serviceBrand: undefined;
	constructor(
		private readonly profilesService: FakeProfilesService,
		private readonly profileService: MutableProfileService,
	) { }
	async createProfile(name: string): Promise<IUserDataProfile> {
		return this.profilesService.createNamedProfile(name);
	}
	async createAndEnterProfile(name: string): Promise<IUserDataProfile> {
		const p = await this.createProfile(name);
		await this.profileService.updateCurrentProfile(p);
		return p;
	}
	async createAndEnterTransientProfile(): Promise<IUserDataProfile> { throw new Error('not implemented'); }
	async removeProfile(): Promise<void> { }
	async updateProfile(profile: IUserDataProfile): Promise<IUserDataProfile> { return profile; }
	async switchProfile(profile: IUserDataProfile): Promise<void> {
		await this.profileService.updateCurrentProfile(profile);
	}
	async getBuiltinProfileTemplates(): Promise<any[]> { return []; }
	getDefaultProfileToUse(): IUserDataProfile { return this.profilesService.defaultProfile; }
}

class MutableProfileService implements IUserDataProfileService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeCurrentProfile = new Emitter<any>();
	readonly onDidChangeCurrentProfile = this._onDidChangeCurrentProfile.event;
	currentProfile: IUserDataProfile;
	constructor(profile: IUserDataProfile) {
		this.currentProfile = profile;
	}
	async updateCurrentProfile(profile: IUserDataProfile): Promise<void> {
		const previous = this.currentProfile;
		this.currentProfile = profile;
		this._onDidChangeCurrentProfile.fire({ previous, profile, join() { } });
	}
}

class TrackingFileService extends TestFileService {
	existing = new Set<string>();
	written: { resource: URI; content: string }[] = [];
	override async exists(resource: URI): Promise<boolean> {
		const path = resource.path.replace(/\\/g, '/');
		for (const key of this.existing) {
			if (path.endsWith('/' + key) || path.endsWith(key)) {
				return true;
			}
		}
		return false;
	}
	override async writeFile(resource: URI, bufferOrReadable: any): Promise<any> {
		const content = typeof bufferOrReadable === 'object' && bufferOrReadable?.buffer
			? bufferOrReadable.toString()
			: String(bufferOrReadable);
		this.written.push({ resource, content });
		// eslint-disable-next-line local/code-no-any-casts
		return { resource } as any;
	}
}

//#endregion

suite('Work Modes — WorkModeService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let tagsService: MutableWorkspaceTagsService;
	let trustService: TestWorkspaceTrustManagementService;
	let environmentService: MutableEnvironmentService;
	let fileService: TrackingFileService;
	let profilesService: FakeProfilesService;
	let profileService: MutableProfileService;
	let profileManagement: FakeProfileManagementService;
	let layoutService: TrackingLayoutService;
	let extensionsService: FakeExtensionsWorkbenchService;
	let commandService: FakeCommandService;
	let configurationService: TestConfigurationService;
	let storageService: TestStorageService;
	let workspaceService: TestContextService;
	let service: WorkModeService;

	function createService(): WorkModeService {
		return disposables.add(new WorkModeService(
			workspaceService,
			tagsService,
			trustService,
			// eslint-disable-next-line local/code-no-any-casts
			environmentService as any as IWorkbenchEnvironmentService,
			fileService,
			profilesService,
			profileService,
			profileManagement,
			layoutService,
			// eslint-disable-next-line local/code-no-any-casts
			extensionsService as any as IExtensionsWorkbenchService,
			commandService,
			configurationService,
			storageService,
			NullTelemetryService,
			new NullLogService(),
		));
	}

	setup(() => {
		tagsService = new MutableWorkspaceTagsService();
		trustService = disposables.add(new TestWorkspaceTrustManagementService(true));
		environmentService = new MutableEnvironmentService();
		fileService = disposables.add(new TrackingFileService());
		profilesService = new FakeProfilesService();
		profileService = new MutableProfileService(profilesService.defaultProfile);
		profileManagement = new FakeProfileManagementService(profilesService, profileService);
		layoutService = new TrackingLayoutService();
		extensionsService = new FakeExtensionsWorkbenchService();
		commandService = new FakeCommandService();
		configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(WORK_MODE_LAYOUT_CONFIG_KEY, true);
		storageService = disposables.add(new TestStorageService());
		workspaceService = new TestContextService(TestWorkspace);
		service = createService();
	});

	//#region Environment

	test('getEnvironmentContext reflects trusted local by default', () => {
		const env = service.getEnvironmentContext();
		assert.strictEqual(env.isRemote, false);
		assert.strictEqual(env.isWsl, false);
		assert.strictEqual(env.isContainer, false);
		assert.strictEqual(env.isSsh, false);
		assert.strictEqual(env.isTrusted, true);
	});

	test('getEnvironmentContext detects WSL remote', () => {
		environmentService.remoteAuthority = 'wsl+Ubuntu';
		const env = service.getEnvironmentContext();
		assert.strictEqual(env.isRemote, true);
		assert.strictEqual(env.isWsl, true);
		assert.strictEqual(env.remoteName, 'wsl');
	});

	test('getEnvironmentContext detects container remote', () => {
		environmentService.remoteAuthority = 'dev-container+abc';
		const env = service.getEnvironmentContext();
		assert.strictEqual(env.isContainer, true);
		assert.strictEqual(env.remoteName, 'dev-container');
	});

	test('getEnvironmentContext detects SSH remote', () => {
		environmentService.remoteAuthority = 'ssh-remote+myserver';
		const env = service.getEnvironmentContext();
		assert.strictEqual(env.isSsh, true);
	});

	//#endregion

	//#region Detection

	test('detectWorkModes always includes mood modes', async () => {
		const result = await service.detectWorkModes();
		const ids = result.suggestions.map(s => s.mode.id);
		assert.ok(ids.includes(WorkModeId.Debugging));
		assert.ok(ids.includes(WorkModeId.Documentation));
		assert.ok(ids.includes(WorkModeId.Teaching));
		assert.ok(ids.includes(WorkModeId.Demo));
		assert.ok(ids.includes(WorkModeId.Troubleshooting));
		assert.ok(result.environment);
	});

	test('detectWorkModes scores frontend from react tag', async () => {
		tagsService.tags = { 'workspace.npm.react': true };
		// new service to avoid cache from prior tests in same setup is fine; invalidate via new instance
		service.dispose();
		service = createService();
		const result = await service.detectWorkModes();
		const frontend = result.suggestions.find(s => s.mode.id === WorkModeId.Frontend);
		assert.ok(frontend);
		assert.ok(frontend!.score >= 3);
		assert.ok(result.detectedProjectKinds.includes('frontend'));
	});

	test('detectWorkModes scores backend from file signals', async () => {
		fileService.existing.add('go.mod');
		fileService.existing.add('Dockerfile');
		service.dispose();
		service = createService();
		const result = await service.detectWorkModes();
		const backend = result.suggestions.find(s => s.mode.id === WorkModeId.Backend);
		assert.ok(backend);
		assert.ok(backend!.score >= 2);
		assert.ok(result.detectedProjectKinds.includes('backend'));
	});

	test('detectWorkModes boosts fullstack when both frontend and backend present', async () => {
		tagsService.tags = { 'workspace.npm.react': true, 'workspace.npm.express': true };
		service.dispose();
		service = createService();
		const result = await service.detectWorkModes();
		const fullstack = result.suggestions.find(s => s.mode.id === WorkModeId.Fullstack);
		assert.ok(fullstack);
		assert.ok(fullstack!.score >= 5);
	});

	test('detectWorkModes caches results until workspace invalidation', async () => {
		tagsService.tags = { 'workspace.npm.react': true };
		service.dispose();
		service = createService();
		const first = await service.detectWorkModes();
		tagsService.tags = { 'workspace.go.mod': true }; // mutate but cache should hold
		const second = await service.detectWorkModes();
		assert.strictEqual(first, second);
	});

	test('detectWorkModes includes remote in project kinds when remote', async () => {
		environmentService.remoteAuthority = 'wsl+Ubuntu';
		service.dispose();
		service = createService();
		const result = await service.detectWorkModes();
		assert.ok(result.detectedProjectKinds.includes('remote'));
		assert.ok(result.detectedProjectKinds.includes('wsl'));
	});

	//#endregion

	//#region Suggestions gating

	test('shouldSuggestWorkMode is false when untrusted', async () => {
		await trustService.setWorkspaceTrust(false);
		tagsService.tags = { 'workspace.npm.react': true };
		service.dispose();
		service = createService();
		assert.strictEqual(await service.shouldSuggestWorkMode(), false);
	});

	test('shouldSuggestWorkMode is false when already on non-default profile', async () => {
		const extra = await profilesService.createNamedProfile('Custom');
		await profileService.updateCurrentProfile(extra);
		tagsService.tags = { 'workspace.npm.react': true };
		service.dispose();
		service = createService();
		assert.strictEqual(await service.shouldSuggestWorkMode(), false);
	});

	test('shouldSuggestWorkMode is false when user already has profiles', async () => {
		await profilesService.createNamedProfile('Existing');
		tagsService.tags = { 'workspace.npm.react': true };
		service.dispose();
		service = createService();
		assert.strictEqual(await service.shouldSuggestWorkMode(), false);
	});

	test('shouldSuggestWorkMode is false after dismissSuggestion', async () => {
		tagsService.tags = {
			'workspace.npm.react': true,
			'workspace.npm.vue': true,
			'workspace.npm.next': true,
		};
		service.dispose();
		service = createService();
		service.dismissSuggestion();
		assert.strictEqual(storageService.getBoolean(WORK_MODE_SUGGESTION_STORAGE_KEY, StorageScope.WORKSPACE), true);
		assert.strictEqual(await service.shouldSuggestWorkMode(), false);
	});

	//#endregion

	//#region Profiles / switch / layout

	test('getModeForProfile matches by profile name', () => {
		const frontendPreset = getWorkModePreset(WorkModeId.Frontend)!;
		const profile = toUserDataProfile('x', frontendPreset.name, URI.file('/p'), URI.file('/c'));
		assert.strictEqual(service.getModeForProfile(profile)?.id, WorkModeId.Frontend);
		assert.strictEqual(service.getModeForProfile(profilesService.defaultProfile), undefined);
	});

	test('getCurrentMode reflects current profile', async () => {
		assert.strictEqual(service.getCurrentMode(), undefined);
		const profile = await service.ensureModeProfile(WorkModeId.Frontend);
		await profileService.updateCurrentProfile(profile);
		assert.strictEqual(service.getCurrentMode()?.id, WorkModeId.Frontend);
	});

	test('ensureModeProfile creates profile once and reuses it', async () => {
		const first = await service.ensureModeProfile(WorkModeId.Backend);
		const second = await service.ensureModeProfile(WorkModeId.Backend);
		assert.strictEqual(first.id, second.id);
		assert.strictEqual(profilesService.profiles.filter(p => p.name === 'Backend').length, 1);
		assert.ok(fileService.written.some(w => w.resource.toString().includes('settings') || w.content.includes('editor')));
	});

	test('ensureModeProfile throws for unknown mode id', async () => {
		await assert.rejects(() => service.ensureModeProfile('nope' as WorkModeId));
	});

	test('switchToMode switches profile and records usage', async () => {
		const profile = await service.switchToMode(WorkModeId.Teaching, { source: 'test' });
		assert.strictEqual(profile.name, 'Teaching');
		assert.strictEqual(profileService.currentProfile.name, 'Teaching');
		const stats = service.getUsageStats();
		assert.ok((stats.switchesByMode[WorkModeId.Teaching] ?? 0) >= 1);
		assert.strictEqual(stats.lastModeId, WorkModeId.Teaching);
		assert.strictEqual(stats.lastSwitchSource, 'test');
	});

	test('applyModeLayout hides parts for demo mode and enters zen', () => {
		service.applyModeLayout(WorkModeId.Demo);
		assert.ok(layoutService.hiddenParts.includes(Parts.SIDEBAR_PART));
		assert.ok(layoutService.hiddenParts.includes(Parts.PANEL_PART));
		assert.ok(commandService.executed.includes('workbench.action.toggleZenMode'));
	});

	test('applyModeLayout opens debug view for debugging mode', () => {
		service.applyModeLayout(WorkModeId.Debugging);
		assert.ok(commandService.executed.includes('workbench.view.debug'));
	});

	test('applyModeLayout sets panel position when specified', () => {
		service.applyModeLayout(WorkModeId.Backend);
		assert.strictEqual(layoutService.panelPositionSet, Position.BOTTOM);
	});

	test('switchToMode skips layout when applyLayout option is false', async () => {
		layoutService.hiddenParts = [];
		await service.switchToMode(WorkModeId.Demo, { applyLayout: false, source: 'test' });
		assert.strictEqual(layoutService.hiddenParts.length, 0);
	});

	//#endregion

	//#region Extensions

	test('getMissingRecommendedExtensions returns all when none installed', async () => {
		const missing = await service.getMissingRecommendedExtensions(WorkModeId.Frontend);
		const preset = getWorkModePreset(WorkModeId.Frontend)!;
		assert.strictEqual(missing.length, preset.recommendedExtensions.length);
	});

	test('getMissingRecommendedExtensions filters installed extensions case-insensitively', async () => {
		const preset = getWorkModePreset(WorkModeId.Frontend)!;
		const first = preset.recommendedExtensions[0];
		// eslint-disable-next-line local/code-no-any-casts
		extensionsService.local.push({ identifier: { id: first.toUpperCase() }, state: ExtensionState.Installed } as any);
		const missing = await service.getMissingRecommendedExtensions(WorkModeId.Frontend);
		assert.ok(!missing.map(m => m.toLowerCase()).includes(first.toLowerCase()));
		assert.strictEqual(missing.length, preset.recommendedExtensions.length - 1);
	});

	test('getMissingRecommendedExtensions returns empty when untrusted', async () => {
		await trustService.setWorkspaceTrust(false);
		const missing = await service.getMissingRecommendedExtensions(WorkModeId.Frontend);
		assert.deepStrictEqual(missing, []);
	});

	test('getMissingRecommendedExtensions returns empty for modes without recommendations', async () => {
		const missing = await service.getMissingRecommendedExtensions(WorkModeId.Debugging);
		assert.deepStrictEqual(missing, []);
	});

	test('installRecommendedExtensions installs missing and reports counts', async () => {
		const result = await service.installRecommendedExtensions(WorkModeId.Documentation);
		assert.ok(result.installed.length >= 1);
		assert.strictEqual(result.failed.length, 0);
		assert.ok(extensionsService.installedCalls.length >= 1);
		assert.ok(service.getUsageStats().extensionsInstalled >= 1);
	});

	test('installRecommendedExtensions records failures', async () => {
		extensionsService.installShouldFail = true;
		const result = await service.installRecommendedExtensions(WorkModeId.Frontend);
		assert.strictEqual(result.installed.length, 0);
		assert.ok(result.failed.length >= 1);
	});

	test('installRecommendedExtensions skips when untrusted', async () => {
		await trustService.setWorkspaceTrust(false);
		const result = await service.installRecommendedExtensions(WorkModeId.Frontend);
		assert.strictEqual(result.installed.length, 0);
		assert.ok(result.skipped.length >= 1);
	});

	//#endregion

	//#region Usage stats

	test('recordUsage accumulates counters and persists', () => {
		service.recordUsage('suggested', WorkModeId.Frontend);
		service.recordUsage('accepted', WorkModeId.Frontend);
		service.recordUsage('dismissed');
		service.recordUsage('activity', WorkModeId.Debugging, 'debug');
		service.recordUsage('switch', WorkModeId.Frontend, 'picker');
		service.recordUsage('extensions', WorkModeId.Frontend);

		const stats = service.getUsageStats();
		assert.strictEqual(stats.suggestionsShown, 1);
		assert.strictEqual(stats.suggestionsAccepted, 1);
		assert.strictEqual(stats.suggestionsDismissed, 1);
		assert.strictEqual(stats.activityTriggers, 1);
		assert.strictEqual(stats.extensionsInstalled, 1);
		assert.strictEqual(stats.switchesByMode[WorkModeId.Frontend], 1);
		assert.strictEqual(stats.lastModeId, WorkModeId.Frontend);
		assert.strictEqual(stats.lastSwitchSource, 'picker');
		assert.ok(stats.lastSwitchAt);

		// Corrupt storage should not throw
		storageService.store(WORK_MODE_USAGE_STATS_KEY, '{not-json', StorageScope.APPLICATION, undefined!);
		// TestStorageService may not take target; just verify getUsageStats recovers
	});

	test('getUsageStats recovers from corrupt storage', () => {
		storageService.store(WORK_MODE_USAGE_STATS_KEY, '%%%', StorageScope.APPLICATION, 1 /* StorageTarget.MACHINE */);
		const stats = service.getUsageStats();
		assert.strictEqual(stats.suggestionsShown, 0);
	});

	test('getPresets returns same catalog as module helpers', () => {
		assert.strictEqual(service.getPresets().length, 10);
		assert.ok(service.getPresets().every(p => getWorkModePreset(p.id)));
	});

	//#endregion

	//#region Backward compatibility — profiles remain first-class

	test('BACK-COMPAT: work modes use standard profiles service (createNamedProfile)', async () => {
		const before = profilesService.profiles.length;
		await service.ensureModeProfile(WorkModeId.Mobile);
		assert.strictEqual(profilesService.profiles.length, before + 1);
		const mobile = profilesService.profiles.find(p => p.name === 'Mobile');
		assert.ok(mobile);
		assert.strictEqual(mobile!.isDefault, false);
		// Profile is a normal IUserDataProfile — existing Profiles editor/actions can manage it
		assert.ok(mobile!.settingsResource);
		assert.ok(mobile!.extensionsResource);
	});

	test('BACK-COMPAT: default profile is unchanged by work mode catalog', () => {
		assert.strictEqual(profilesService.defaultProfile.isDefault, true);
		assert.strictEqual(profilesService.defaultProfile.name, 'Default');
		assert.strictEqual(service.getModeForProfile(profilesService.defaultProfile), undefined);
	});

	test('BACK-COMPAT: custom profiles are not treated as modes', async () => {
		const custom = await profilesService.createNamedProfile('My Day Job');
		assert.strictEqual(service.getModeForProfile(custom), undefined);
	});

	test('BACK-COMPAT: switchToMode does not remove other profiles', async () => {
		await profilesService.createNamedProfile('Keep Me');
		await service.switchToMode(WorkModeId.Frontend, { applyLayout: false });
		assert.ok(profilesService.profiles.some(p => p.name === 'Keep Me'));
		assert.ok(profilesService.profiles.some(p => p.isDefault));
	});

	//#endregion
});
