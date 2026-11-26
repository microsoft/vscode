/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { INotification, INotificationHandle, INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import { IProgress, IProgressService, IProgressStep, ProgressLocation } from '../../../../../../platform/progress/common/progress.js';
import { IInputBox, IQuickInputHideEvent, IQuickInputService, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IExtensionsWorkbenchService } from '../../../../extensions/common/extensions.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AddPluginMarketplaceAction, InstallFromSourceAction, ManagePluginMarketplacesAction, ManagePluginsAction } from '../../../browser/actions/chatPluginActions.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService, ICustomizationMarketplaceInfo, ICustomizationMarketplaceManagementProvider, ICustomizationPluginInstallProvider, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { IAgentPluginRepositoryService } from '../../../common/plugins/agentPluginRepositoryService.js';
import { IInstallPluginFromSourceResult, IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';
import { IPluginMarketplaceService, parseMarketplaceReference } from '../../../common/plugins/pluginMarketplaceService.js';
import { isMarketplaceReferenceAllowed, StrictKnownMarketplaces } from '../../../common/plugins/strictKnownMarketplaces.js';

suite('InstallFromSourceAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture(
		pluginInstallProvider?: ICustomizationPluginInstallProvider,
		localInstallResult: IInstallPluginFromSourceResult = { success: true },
		options: { skipReveal?: boolean; revealError?: Error } = {},
	) {
		const instantiationService = workbenchInstantiationService({}, store);
		const acceptEmitter = store.add(new Emitter<void>());
		const hideEmitter = store.add(new Emitter<IQuickInputHideEvent>());
		const showEmitter = store.add(new Emitter<void>());
		const inputBox = new class extends mock<IInputBox>() {
			override value = '';
			override title: string | undefined;
			override validationMessage: string | undefined;
			override busy = false;
			override enabled = true;
			override severity = Severity.Ignore;
			override readonly onDidAccept = acceptEmitter.event;
			override readonly onDidHide = hideEmitter.event;
			override readonly onDidChangeValue = Event.None;
			override readonly onDidTriggerButton = Event.None;
			override show() { showEmitter.fire(); }
			override hide() { hideEmitter.fire({ reason: QuickInputHideReason.Other }); }
			override dispose() { }
		}();
		const session = URI.parse('agent-host-copilotcli:/session');
		const activeSessionResource = observableValue('activeSession', session);
		const harnesses = new Map<string, IHarnessDescriptor>([
			[session.scheme, { id: 'test', label: 'Test', icon: { id: 'vm' }, pluginInstallProvider }],
		]);
		const localInstalls: string[] = [];
		const validations: string[] = [];
		const notifications: Parameters<INotificationService['error']>[0][] = [];
		const progress: { options: Parameters<IProgressService['withProgress']>[0]; active: boolean }[] = [];
		const commands: { id: string; args: unknown[] }[] = [];
		instantiationService.stub(IProgressService, new class extends mock<IProgressService>() {
			override async withProgress<R>(options: Parameters<IProgressService['withProgress']>[0], task: (progress: IProgress<IProgressStep>) => Promise<R>): Promise<R> {
				const entry = { options, active: true };
				progress.push(entry);
				try {
					return await task({ report() { } });
				} finally {
					entry.active = false;
				}
			}
		}());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
				commands.push({ id, args });
				if (options.revealError) {
					throw options.revealError;
				}
				return undefined;
			}
		}());
		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
			override createInputBox() { return inputBox; }
		}());
		instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
			override readonly activeSessionResource = activeSessionResource;
			override getDescriptorForSession(sessionResource: URI) {
				return harnesses.get(sessionResource.scheme);
			}
		}());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(error: Parameters<INotificationService['error']>[0]): void {
				notifications.push(error);
			}
		}());
		instantiationService.stub(IPluginInstallService, new class extends mock<IPluginInstallService>() {
			override validatePluginSource(source: string) {
				validations.push(source);
				return undefined;
			}
			override async installPluginFromSource(source: string) {
				localInstalls.push(source);
				return localInstallResult;
			}
		}());
		instantiationService.stub(IConfigurationService, new class extends mock<IConfigurationService>() {
			override async updateValue() {
				assert.fail('Source installation must not update VS Code configuration');
			}
		}());
		const result = instantiationService.invokeFunction(accessor => new InstallFromSourceAction().run(accessor, { skipReveal: options.skipReveal ?? true }));
		return { inputBox, acceptEmitter, showEmitter, result, localInstalls, validations, notifications, progress, commands, session, activeSessionResource, harnesses };
	}

	test('shows progress throughout a provider-owned source installation before revealing the plugin', async () => {
		const installation = new DeferredPromise<void>();
		const fixture = createFixture({ installFromSource: () => installation.p }, undefined, { skipReveal: false });
		fixture.inputBox.value = 'owner/repo';
		fixture.acceptEmitter.fire();

		assert.deepStrictEqual({ progress: fixture.progress, commands: fixture.commands }, {
			progress: [{
				options: { location: ProgressLocation.Notification, title: 'Installing plugin from source...', cancellable: false },
				active: true,
			}],
			commands: [],
		});

		await installation.complete();
		assert.deepStrictEqual({ installed: await fixture.result, active: fixture.progress.map(entry => entry.active), commands: fixture.commands.map(command => command.id) }, {
			installed: true,
			active: [false],
			commands: [AICustomizationManagementCommands.OpenEditor],
		});
	});

	test('closes provider installation progress on failure and allows retrying', async () => {
		const installation = new DeferredPromise<void>();
		let attempts = 0;
		const fixture = createFixture({
			installFromSource: async () => {
				if (++attempts === 1) {
					await installation.p;
				}
			},
		});
		const shown = Event.toPromise(fixture.showEmitter.event);
		fixture.inputBox.value = 'owner/repo';
		fixture.acceptEmitter.fire();
		await installation.error(new Error('Cannot install plugin'));
		await shown;
		const failureState = {
			active: fixture.progress.map(entry => entry.active),
			notifications: [...fixture.notifications],
			enabled: fixture.inputBox.enabled,
			busy: fixture.inputBox.busy,
		};
		fixture.acceptEmitter.fire();

		assert.deepStrictEqual({ failureState, installed: await fixture.result, attempts, active: fixture.progress.map(entry => entry.active) }, {
			failureState: {
				active: [false],
				notifications: ['Failed to install plugin: Cannot install plugin'],
				enabled: true,
				busy: false,
			},
			installed: true,
			attempts: 2,
			active: [false, false],
		});
	});

	test('reveals the installed plugin in Chat Customizations for the installing session', async () => {
		const installedUri = URI.file('/plugins/example');
		const fixture = createFixture(undefined, { success: true, installedUri }, { skipReveal: false });
		fixture.inputBox.value = 'owner/repo';
		fixture.acceptEmitter.fire();
		fixture.activeSessionResource.set(URI.parse('other:/session'), undefined);

		assert.deepStrictEqual({ installed: await fixture.result, commands: fixture.commands }, {
			installed: true,
			commands: [{
				id: AICustomizationManagementCommands.OpenEditor,
				args: [{ section: AICustomizationManagementSection.Plugins, sessionResource: fixture.session, revealUri: installedUri }],
			}],
		});
	});

	test('opens the installing harness Plugins section after a provider-owned installation', async () => {
		const fixture = createFixture({ installFromSource: async () => { } }, undefined, { skipReveal: false });
		fixture.inputBox.value = 'owner/repo';
		fixture.acceptEmitter.fire();

		assert.deepStrictEqual({ installed: await fixture.result, commands: fixture.commands, localInstalls: fixture.localInstalls }, {
			installed: true,
			commands: [{
				id: AICustomizationManagementCommands.OpenEditor,
				args: [{ section: AICustomizationManagementSection.Plugins, sessionResource: fixture.session, revealUri: undefined }],
			}],
			localInstalls: [],
		});
	});

	test('does not navigate when skipReveal is true', async () => {
		const fixture = createFixture(undefined, { success: true, installedUri: URI.file('/plugins/example') }, { skipReveal: true });
		fixture.inputBox.value = 'owner/repo';
		fixture.acceptEmitter.fire();

		assert.deepStrictEqual({ installed: await fixture.result, commands: fixture.commands }, { installed: true, commands: [] });
	});

	test('reports reveal errors without reopening the input or failing a successful installation', async () => {
		const revealError = new Error('Cannot open Chat Customizations');
		const fixture = createFixture(undefined, { success: true, installedUri: URI.file('/plugins/example') }, { skipReveal: false, revealError });
		store.add(fixture.showEmitter.event(() => assert.fail('A navigation error must not restart installation')));
		fixture.inputBox.value = 'owner/repo';
		fixture.acceptEmitter.fire();

		assert.deepStrictEqual({ installed: await fixture.result, notifications: fixture.notifications }, { installed: true, notifications: [revealError] });
	});

	test('uses the harness installer for repository, folder, and marketplace sources without changing VS Code plugin locations', async () => {
		const sources = ['owner/repo', 'https://github.com/owner/repo.git', '/plugins/example', '~/plugins/example', 'file:///plugins/example', 'plugin@marketplace'];
		const results = [];
		for (const source of sources) {
			const installs: { session: URI; source: string }[] = [];
			const fixture = createFixture({
				installFromSource: async (session, source) => { installs.push({ session, source }); },
			});
			fixture.inputBox.value = ` ${source} `;
			fixture.acceptEmitter.fire();

			results.push({
				installed: await fixture.result,
				installs,
				localInstalls: fixture.localInstalls,
				validations: fixture.validations,
			});
		}
		assert.deepStrictEqual(results, sources.map(source => ({
			installed: true,
			installs: [{ session: URI.parse('agent-host-copilotcli:/session'), source }],
			localInstalls: [],
			validations: [],
		})));
	});

	test('uses the selected harness at submission and updates the title when switching harnesses', async () => {
		const installs: { harness: string; session: URI; source: string }[] = [];
		const fixture = createFixture({
			installFromSource: async (session, source) => { installs.push({ harness: 'original', session, source }); },
		});
		const initialTitle = fixture.inputBox.title;
		fixture.harnesses.set('other', {
			id: 'other', label: 'Other', icon: { id: 'vm' },
			pluginInstallProvider: {
				installFromSource: async (session, source) => { installs.push({ harness: 'other', session, source }); },
			},
		});
		const session = URI.parse('other:/session');
		fixture.activeSessionResource.set(session, undefined);
		fixture.inputBox.value = 'owner/repo';
		fixture.acceptEmitter.fire();

		assert.deepStrictEqual({
			installed: await fixture.result,
			initialTitle,
			title: fixture.inputBox.title,
			installs,
			localInstalls: fixture.localInstalls,
		}, {
			installed: true,
			initialTitle: 'Install Plugin from Source (Test)',
			title: 'Install Plugin from Source (Other)',
			installs: [{ harness: 'other', session, source: 'owner/repo' }],
			localInstalls: [],
		});
	});

	test('switches to the existing installer when the selected harness has no native installer', async () => {
		const fixture = createFixture({
			installFromSource: async () => { assert.fail('The original harness must not install the plugin'); },
		});
		fixture.harnesses.set('local', { id: 'local', label: 'Local', icon: { id: 'vm' } });
		fixture.activeSessionResource.set(URI.parse('local:/session'), undefined);
		fixture.inputBox.value = 'owner/repo';
		fixture.acceptEmitter.fire();

		assert.deepStrictEqual({
			installed: await fixture.result,
			title: fixture.inputBox.title,
			localInstalls: fixture.localInstalls,
			validations: fixture.validations,
		}, {
			installed: true,
			title: 'Install Plugin from Source (Local)',
			localInstalls: ['owner/repo'],
			validations: ['owner/repo'],
		});
	});

	test('preserves the existing installer for harnesses without a source installer', async () => {
		const fixture = createFixture();
		fixture.inputBox.value = 'owner/repo';
		fixture.acceptEmitter.fire();

		assert.deepStrictEqual({
			installed: await fixture.result,
			localInstalls: fixture.localInstalls,
			validations: fixture.validations,
		}, {
			installed: true,
			localInstalls: ['owner/repo'],
			validations: ['owner/repo'],
		});
	});

	test('keeps cancelled local installation silent', async () => {
		const fixture = createFixture(undefined, { success: false });
		const shown = Event.toPromise(fixture.showEmitter.event);
		fixture.inputBox.value = 'owner/repo';
		fixture.acceptEmitter.fire();
		await shown;
		const state = {
			validationMessage: fixture.inputBox.validationMessage,
			notifications: fixture.notifications,
			busy: fixture.inputBox.busy,
			enabled: fixture.inputBox.enabled,
			localInstalls: fixture.localInstalls,
		};
		fixture.inputBox.hide();

		assert.deepStrictEqual({ ...state, installed: await fixture.result }, {
			validationMessage: undefined,
			notifications: [],
			busy: false,
			enabled: true,
			localInstalls: ['owner/repo'],
			installed: false,
		});
	});

	test('shows harness installation errors as notifications without falling back to VS Code installation', async () => {
		const fixture = createFixture({
			installFromSource: async () => { throw new Error('The plugin is invalid'); },
		});
		const shown = Event.toPromise(fixture.showEmitter.event);
		fixture.inputBox.value = 'owner/repo';
		fixture.acceptEmitter.fire();
		await shown;
		const state = {
			validationMessage: fixture.inputBox.validationMessage,
			notifications: fixture.notifications,
			busy: fixture.inputBox.busy,
			enabled: fixture.inputBox.enabled,
			localInstalls: fixture.localInstalls,
		};
		fixture.inputBox.hide();

		assert.deepStrictEqual({ ...state, installed: await fixture.result }, {
			validationMessage: undefined,
			notifications: ['Failed to install plugin: The plugin is invalid'],
			busy: false,
			enabled: true,
			localInstalls: [],
			installed: false,
		});
	});
});

suite('ManagePluginsAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens the Plugins page of Chat Customizations', async () => {
		const calls: unknown[][] = [];
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
				calls.push([id, ...args]);
				return undefined;
			}
		});
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override openSearch(searchValue: string): Promise<void> {
				calls.push(['extensions.openSearch', searchValue]);
				return Promise.resolve();
			}
		});

		await instantiationService.invokeFunction(accessor => new ManagePluginsAction().run(accessor));

		assert.deepStrictEqual(calls, [[AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Plugins]]);
	});
});

suite('ManagePluginMarketplacesAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class UpdatingConfigurationService extends TestConfigurationService {
		readonly updates: { key: string; value: unknown }[] = [];

		override async updateValue(key: string, value: unknown): Promise<void> {
			this.updates.push({ key, value });
			await this.setUserConfiguration(key, value);
		}
	}

	class TestQuickInputService extends mock<IQuickInputService>() {
		readonly inputBoxSnapshots: { title: string | undefined; placeholder: string | undefined; prompt: string | undefined }[] = [];
		readonly inputValidationSnapshots: { phase: 'change' | 'accept'; value: string; message: string | undefined; severity: Severity }[] = [];
		inputValue: string | undefined;
		readonly inputChangeValues: string[] = [];
		inputValueChangeBeforeAccept = true;
		hideAfterAccept = false;
		manualInput = false;
		readonly acceptEmitter = store.add(new Emitter<void>());
		readonly changeEmitter = store.add(new Emitter<string>());
		readonly hideEmitter = store.add(new Emitter<IQuickInputHideEvent>());
		readonly showEmitter = store.add(new Emitter<void>());
		readonly validationEmitter = store.add(new Emitter<void>());
		readonly inputBox = this.createTestInputBox();

		private createTestInputBox() {
			const quickInputService = this;
			return new class extends mock<IInputBox>() {
				override value = '';
				override severity = Severity.Ignore;
				override busy = false;
				override enabled = true;
				visible = false;
				disposed = false;
				private message: string | undefined;
				override get validationMessage() { return this.message; }
				override set validationMessage(value: string | undefined) {
					this.message = value;
					if (value) {
						quickInputService.validationEmitter.fire();
					}
				}
				override readonly onDidAccept = quickInputService.acceptEmitter.event;
				override readonly onDidChangeValue = quickInputService.changeEmitter.event;
				override readonly onDidHide = quickInputService.hideEmitter.event;
				override show() {
					this.visible = true;
					quickInputService.showEmitter.fire();
				}
				override hide() {
					this.visible = false;
					quickInputService.hideEmitter.fire({ reason: QuickInputHideReason.Other });
				}
				override dispose() { this.disposed = true; }
			}();
		}

		override createInputBox(): IInputBox {
			if (this.manualInput) {
				return this.inputBox;
			}
			const disposables = new DisposableStore();
			const acceptEmitter = disposables.add(new Emitter<void>());
			const changeValueEmitter = disposables.add(new Emitter<string>());
			const hideEmitter = disposables.add(new Emitter<IQuickInputHideEvent>());
			const service = this;
			return new class extends mock<IInputBox>() {
				override title: string | undefined;
				override placeholder: string | undefined;
				override prompt: string | undefined;
				override value = '';
				override busy = false;
				override enabled = true;
				override validationMessage: string | undefined;
				override severity = Severity.Ignore;
				override readonly onDidAccept = acceptEmitter.event;
				override readonly onDidChangeValue = changeValueEmitter.event;
				override readonly onDidHide = hideEmitter.event;

				override show(): void {
					service.inputBoxSnapshots.push({
						title: this.title,
						placeholder: this.placeholder,
						prompt: this.prompt,
					});
					for (const value of service.inputChangeValues.splice(0)) {
						this.value = value;
						changeValueEmitter.fire(this.value);
						service.inputValidationSnapshots.push({
							phase: 'change',
							value: this.value,
							message: this.validationMessage,
							severity: this.severity,
						});
					}
					if (service.inputValue !== undefined) {
						this.value = service.inputValue;
						if (service.inputValueChangeBeforeAccept) {
							changeValueEmitter.fire(this.value);
						}
						acceptEmitter.fire();
						service.inputValidationSnapshots.push({
							phase: 'accept',
							value: this.value,
							message: this.validationMessage,
							severity: this.severity,
						});
						if (service.hideAfterAccept) {
							this.hide();
						}
					} else {
						this.hide();
					}
				}

				override hide(): void {
					hideEmitter.fire({ reason: QuickInputHideReason.Other });
				}

				override dispose(): void {
					disposables.dispose();
				}
			}();
		}
	}

	function createFixture(configurationValues: Record<string, unknown>, githubFeedAvailable = false, marketplaceManagementProvider?: ICustomizationMarketplaceManagementProvider) {
		const instantiationService = workbenchInstantiationService({}, store);
		const configurationService = new UpdatingConfigurationService(configurationValues);
		const marketplacePolicy: { allowlist?: StrictKnownMarketplaces } = {};
		instantiationService.stub(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
			override isStrictMarketplacePolicyActive() { return marketplacePolicy.allowlist !== undefined; }
			override isMarketplaceTrusted(reference: Parameters<IPluginMarketplaceService['isMarketplaceTrusted']>[0]) {
				return isMarketplaceReferenceAllowed(marketplacePolicy.allowlist, reference);
			}
		}());
		const quickInputService = new TestQuickInputService();
		const notifications: INotification[] = [];
		const commands: { id: string; args: unknown[] }[] = [];
		const harness = {
			id: 'local',
			label: 'Local',
			icon: { id: 'vm' },
			marketplaceSearchProvider: githubFeedAvailable ? { query: async () => ({ items: [], total: 0 }) } : undefined,
			marketplaceManagementProvider,
		} satisfies IHarnessDescriptor;
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IQuickInputService, quickInputService);
		instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
			override readonly activeSessionResource = observableValue<URI>(this, URI.parse('local:/session'));
			override getDescriptorForSession() { return harness; }
			override getActiveDescriptor() { return harness; }
		}());
		instantiationService.stub(IAgentPluginRepositoryService, new class extends mock<IAgentPluginRepositoryService>() {
			override getRepositoryUri(): URI { return URI.file('/marketplace'); }
		}());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
				commands.push({ id: commandId, args });
				return undefined;
			}
		}());
		instantiationService.stub(IFileService, new class extends mock<IFileService>() {
			override async exists(): Promise<boolean> { return false; }
		}());
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm() {
				return { confirmed: true };
			}
		}());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override notify(notification: INotification): INotificationHandle {
				notifications.push(notification);
				return new class extends mock<INotificationHandle>() { };
			}
		}());
		return { instantiationService, configurationService, quickInputService, notifications, commands, marketplacePolicy };
	}

	test('opens the Plugins marketplace subpage without a quick pick or provider request', async () => {
		const fixture = createFixture({}, false, new class extends mock<ICustomizationMarketplaceManagementProvider>() {
			override async list(): Promise<readonly ICustomizationMarketplaceInfo[]> {
				assert.fail('Inventory is loaded by the marketplace page, not the command');
			}
		}());
		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));
		assert.deepStrictEqual({ commands: fixture.commands, inputs: fixture.quickInputService.inputBoxSnapshots }, {
			commands: [{
				id: AICustomizationManagementCommands.OpenEditor,
				args: [{ section: AICustomizationManagementSection.Plugins, sessionResource: URI.parse('local:/session'), showPluginMarketplaces: true }],
			}],
			inputs: [],
		});
	});

	test('stores Git and directory marketplaces in the local harness configuration', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.quickInputService.inputValue = 'https://example.com/team/plugins.git#stable';

		await fixture.instantiationService.invokeFunction(accessor => new AddPluginMarketplaceAction().run(accessor));
		fixture.quickInputService.inputValue = 'file:///marketplaces/local-marketplace';
		await fixture.instantiationService.invokeFunction(accessor => new AddPluginMarketplaceAction().run(accessor));

		assert.deepStrictEqual(fixture.configurationService.updates, [{
			key: ChatConfiguration.PluginMarketplaces,
			value: ['https://example.com/team/plugins.git#stable'],
		}, {
			key: ChatConfiguration.PluginMarketplaces,
			value: ['https://example.com/team/plugins.git#stable', 'file:///marketplaces/local-marketplace'],
		}]);
	});

	test('styles marketplace validation errors and clears the styling for valid input', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: ['github/awesome-copilot#marketplace'],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.quickInputService.inputChangeValues.push('invalid', 'microsoft/vscode-marketplace');
		fixture.quickInputService.inputValue = 'github/awesome-copilot#marketplace';
		fixture.quickInputService.inputValueChangeBeforeAccept = false;
		fixture.quickInputService.hideAfterAccept = true;

		await fixture.instantiationService.invokeFunction(accessor => new AddPluginMarketplaceAction().run(accessor));

		assert.deepStrictEqual({
			validation: fixture.quickInputService.inputValidationSnapshots,
			configurationUpdates: fixture.configurationService.updates,
		}, {
			validation: [{
				phase: 'change',
				value: 'invalid',
				message: 'Enter a valid GitHub repository, Git repository URL, or local repository URI.',
				severity: Severity.Error,
			}, {
				phase: 'change',
				value: 'microsoft/vscode-marketplace',
				message: undefined,
				severity: Severity.Ignore,
			}, {
				phase: 'accept',
				value: 'github/awesome-copilot#marketplace',
				message: 'This marketplace is already configured.',
				severity: Severity.Error,
			}],
			configurationUpdates: [],
		});
	});

	test('adds a local marketplace directly from F1 and then opens marketplace management', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.quickInputService.inputValue = 'owner/marketplace';
		await fixture.instantiationService.invokeFunction(accessor => new AddPluginMarketplaceAction().run(accessor));

		assert.deepStrictEqual({
			title: fixture.quickInputService.inputBoxSnapshots[0]?.title,
			updates: fixture.configurationService.updates,
			commands: fixture.commands,
		}, {
			title: 'Add Plugin Marketplace',
			updates: [{ key: ChatConfiguration.PluginMarketplaces, value: ['owner/marketplace'] }],
			commands: [{ id: ManagePluginMarketplacesAction.ID, args: [] }],
		});
	});

	test('cancelling the direct local marketplace input does not open management', async () => {
		const fixture = createFixture({});
		await fixture.instantiationService.invokeFunction(accessor => new AddPluginMarketplaceAction().run(accessor));
		assert.deepStrictEqual({ updates: fixture.configurationService.updates, commands: fixture.commands }, { updates: [], commands: [] });
	});

	test('cancelling the direct provider marketplace input does not open management', async () => {
		const provider: ICustomizationMarketplaceManagementProvider = {
			onDidChange: Event.None,
			onDidChangeMarketplaces: Event.None,
			list: async () => [],
			add: async () => { throw new Error('Cancelled input must not add a marketplace'); },
			queryMarketplace: async () => ({ items: [], total: 0 }),
			remove: async () => ({ removed: true }),
			refresh: async () => [],
		};
		const fixture = createFixture({}, false, provider);
		const shown = Event.toPromise(fixture.quickInputService.showEmitter.event);
		fixture.quickInputService.manualInput = true;
		const result = fixture.instantiationService.invokeFunction(accessor => new AddPluginMarketplaceAction().run(accessor));
		await shown;
		fixture.quickInputService.inputBox.hide();
		await result;
		assert.deepStrictEqual(fixture.commands, []);
	});

	test('keeps the provider input busy and shows errors inline for correction and retry', async () => {
		const pending = new DeferredPromise<void>();
		const addCalls: { session: URI | undefined; source: string }[] = [];
		const provider: ICustomizationMarketplaceManagementProvider = {
			onDidChange: Event.None,
			onDidChangeMarketplaces: Event.None,
			list: async () => [],
			add: async (session, source) => {
				addCalls.push({ session, source });
				if (addCalls.length === 1) {
					await pending.p;
					throw new Error('Repository not found');
				}
				return { name: 'marketplace', source, isDefault: false, managed: false, available: true };
			},
			queryMarketplace: async () => ({ items: [], total: 0 }),
			remove: async () => ({ removed: true }),
			refresh: async () => [],
		};
		const fixture = createFixture({}, false, provider);
		const quickInput = fixture.quickInputService;
		quickInput.manualInput = true;
		const shown = Event.toPromise(quickInput.showEmitter.event);
		const result = fixture.instantiationService.invokeFunction(accessor => new AddPluginMarketplaceAction().run(accessor));
		await shown;

		quickInput.inputBox.value = 'owner/missing';
		quickInput.acceptEmitter.fire();
		quickInput.acceptEmitter.fire();
		const busyState = {
			visible: quickInput.inputBox.visible,
			busy: quickInput.inputBox.busy,
			enabled: quickInput.inputBox.enabled,
			calls: addCalls.length,
		};
		const failed = Event.toPromise(quickInput.validationEmitter.event);
		await pending.complete();
		await failed;
		const errorState = {
			visible: quickInput.inputBox.visible,
			busy: quickInput.inputBox.busy,
			enabled: quickInput.inputBox.enabled,
			value: quickInput.inputBox.value,
			message: quickInput.inputBox.validationMessage,
			severity: quickInput.inputBox.severity,
		};
		quickInput.inputBox.value = 'owner/corrected';
		quickInput.changeEmitter.fire(quickInput.inputBox.value);
		const clearedMessage = quickInput.inputBox.validationMessage;
		const clearedSeverity = quickInput.inputBox.severity;
		quickInput.acceptEmitter.fire();
		await result;

		assert.deepStrictEqual({
			busyState, errorState, clearedMessage, clearedSeverity, addCalls,
			disposed: quickInput.inputBox.disposed,
			visible: quickInput.inputBox.visible,
			updates: fixture.configurationService.updates,
			notifications: fixture.notifications,
		}, {
			busyState: { visible: true, busy: true, enabled: false, calls: 1 },
			errorState: {
				visible: true, busy: false, enabled: true, value: 'owner/missing',
				message: 'Failed to add marketplace: Repository not found',
				severity: Severity.Error,
			},
			clearedMessage: undefined,
			clearedSeverity: Severity.Ignore,
			addCalls: [
				{ session: URI.parse('local:/session'), source: 'owner/missing' },
				{ session: URI.parse('local:/session'), source: 'owner/corrected' },
			],
			disposed: true,
			visible: false,
			updates: [],
			notifications: [],
		});
	});

	test('validates provider marketplace input while typing and before adding', async () => {
		const provider: ICustomizationMarketplaceManagementProvider = {
			onDidChange: Event.None,
			onDidChangeMarketplaces: Event.None,
			list: async () => [{
				name: 'existing', source: 'owner/existing', isDefault: false, managed: false, available: true,
			}],
			add: async () => { throw new Error('Invalid input must not reach the provider'); },
			queryMarketplace: async () => ({ items: [], total: 0 }),
			remove: async () => ({ removed: true }),
			refresh: async () => [],
		};
		const fixture = createFixture({}, false, provider);
		const quickInput = fixture.quickInputService;
		quickInput.manualInput = true;
		const shown = Event.toPromise(quickInput.showEmitter.event);
		const result = fixture.instantiationService.invokeFunction(accessor => new AddPluginMarketplaceAction().run(accessor));
		await shown;
		const messages = [];
		const severities = [];
		for (const source of ['', 'invalid', 'owner/existing', ' owner/corrected ']) {
			quickInput.inputBox.value = source;
			quickInput.changeEmitter.fire(source);
			messages.push(quickInput.inputBox.validationMessage);
			severities.push(quickInput.inputBox.severity);
		}
		quickInput.inputBox.value = 'invalid';
		quickInput.acceptEmitter.fire();
		messages.push(quickInput.inputBox.validationMessage);
		severities.push(quickInput.inputBox.severity);
		quickInput.inputBox.hide();
		await result;

		assert.deepStrictEqual({ messages, severities }, {
			messages: [
				'Enter a valid GitHub repository, Git repository URL, or local repository URI.',
				'Enter a valid GitHub repository, Git repository URL, or local repository URI.',
				'This marketplace is already configured.',
				undefined,
				'Enter a valid GitHub repository, Git repository URL, or local repository URI.',
			], severities: [Severity.Error, Severity.Error, Severity.Error, Severity.Ignore, Severity.Error]
		});
	});

	for (const fails of [false, true]) {
		test(`dismisses the provider input during an add without reopening it after ${fails ? 'failure' : 'success'}`, async () => {
			const pending = new DeferredPromise<void>();
			const finished = new DeferredPromise<void>();
			const provider: ICustomizationMarketplaceManagementProvider = {
				onDidChange: Event.None,
				onDidChangeMarketplaces: Event.None,
				list: async () => [],
				add: async (_session, source) => {
					try {
						await pending.p;
						if (fails) {
							throw new Error('Repository not found');
						}
						return { name: 'marketplace', source, isDefault: false, managed: false, available: true };
					} finally {
						await finished.complete();
					}
				},
				queryMarketplace: async () => ({ items: [], total: 0 }),
				remove: async () => ({ removed: true }),
				refresh: async () => [],
			};
			const fixture = createFixture({}, false, provider);
			const quickInput = fixture.quickInputService;
			quickInput.manualInput = true;
			const shown = Event.toPromise(quickInput.showEmitter.event);
			const result = fixture.instantiationService.invokeFunction(accessor => new AddPluginMarketplaceAction().run(accessor));
			await shown;
			quickInput.inputBox.value = 'owner/marketplace';
			quickInput.acceptEmitter.fire();
			quickInput.inputBox.hide();
			await result;
			await pending.complete();
			await finished.p;

			assert.deepStrictEqual({
				disposed: quickInput.inputBox.disposed,
				visible: quickInput.inputBox.visible,
				message: quickInput.inputBox.validationMessage,
			}, { disposed: true, visible: false, message: undefined });
		});
	}

	test('keeps the hidden default marketplace in add validation', async () => {
		const marketplace = parseMarketplaceReference('github/awesome-copilot#marketplace')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [marketplace.rawValue],
			[ChatConfiguration.ExtraMarketplaces]: {},
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
		}, true);
		fixture.quickInputService.inputValue = marketplace.rawValue;
		fixture.quickInputService.hideAfterAccept = true;

		await fixture.instantiationService.invokeFunction(accessor => new AddPluginMarketplaceAction().run(accessor));

		assert.deepStrictEqual({
			validation: fixture.quickInputService.inputValidationSnapshots,
			configurationUpdates: fixture.configurationService.updates,
		}, {
			validation: [{
				phase: 'accept',
				value: marketplace.rawValue,
				message: 'This marketplace is already configured.',
				severity: Severity.Error,
			}],
			configurationUpdates: [],
		});
	});

	test('stores local marketplaces outside strict policy without treating them as runtime managed', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.marketplacePolicy.allowlist = [{ source: 'github', repo: 'approved/catalog' }];
		fixture.quickInputService.inputValue = 'blocked/catalog';

		await fixture.instantiationService.invokeFunction(accessor => new AddPluginMarketplaceAction().run(accessor));

		assert.deepStrictEqual({
			updates: fixture.configurationService.updates,
			notifications: fixture.notifications.map(notification => notification.message),
		}, {
			updates: [{
				key: ChatConfiguration.PluginMarketplaces,
				value: ['blocked/catalog'],
			}],
			notifications: [],
		});
	});
});
