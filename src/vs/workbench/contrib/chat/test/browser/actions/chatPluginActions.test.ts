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
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { INotification, INotificationHandle, INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import { IInputBox, IPickOptions, IQuickInputButton, IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, QuickInputHideReason, QuickPickInput } from '../../../../../../platform/quickinput/common/quickInput.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AddPluginMarketplaceAction, InstallFromSourceAction, ManagePluginMarketplacesAction } from '../../../browser/actions/chatPluginActions.js';
import { getPluginCustomizationMarketplaceSourceId } from '../../../browser/aiCustomization/pluginCustomizationMarketplaceProvider.js';
import { getProviderMarketplaceSourceId } from '../../../browser/aiCustomization/customizationMarketplaceWorkbenchService.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService, ICustomizationMarketplaceManagementProvider, ICustomizationPluginInstallProvider, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { IAgentPluginRepositoryService } from '../../../common/plugins/agentPluginRepositoryService.js';
import { IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';
import { IPluginMarketplaceService, parseMarketplaceReference } from '../../../common/plugins/pluginMarketplaceService.js';
import { isMarketplaceReferenceAllowed, StrictKnownMarketplaces } from '../../../common/plugins/strictKnownMarketplaces.js';

suite('InstallFromSourceAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture(pluginInstallProvider?: ICustomizationPluginInstallProvider) {
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
		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
			override createInputBox() { return inputBox; }
		}());
		instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
			override readonly activeSessionResource = activeSessionResource;
			override getDescriptorForSession(sessionResource: URI) {
				return harnesses.get(sessionResource.scheme);
			}
		}());
		instantiationService.stub(IPluginInstallService, new class extends mock<IPluginInstallService>() {
			override validatePluginSource(source: string) {
				validations.push(source);
				return undefined;
			}
			override async installPluginFromSource(source: string) {
				localInstalls.push(source);
				return { success: true };
			}
		}());
		instantiationService.stub(IConfigurationService, new class extends mock<IConfigurationService>() {
			override async updateValue() {
				assert.fail('Source installation must not update VS Code configuration');
			}
		}());
		const result = instantiationService.invokeFunction(accessor => new InstallFromSourceAction().run(accessor, { skipReveal: true }));
		return { inputBox, acceptEmitter, showEmitter, result, localInstalls, validations, session, activeSessionResource, harnesses };
	}

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

	test('shows harness installation errors without falling back to VS Code installation', async () => {
		const fixture = createFixture({
			installFromSource: async () => { throw new Error('SDK rejected source'); },
		});
		const shown = Event.toPromise(fixture.showEmitter.event);
		fixture.inputBox.value = 'owner/repo';
		fixture.acceptEmitter.fire();
		await shown;
		const state = {
			message: fixture.inputBox.validationMessage,
			busy: fixture.inputBox.busy,
			enabled: fixture.inputBox.enabled,
			localInstalls: fixture.localInstalls,
		};
		fixture.inputBox.hide();

		assert.deepStrictEqual({ ...state, installed: await fixture.result }, {
			message: 'Failed to install plugin: SDK rejected source',
			busy: false,
			enabled: true,
			localInstalls: [],
			installed: false,
		});
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
		readonly pickSnapshots: { id: string | undefined; label: string; type: string }[][] = [];
		readonly quickPickSnapshots: { id: string | undefined; label: string; type: string }[][] = [];
		readonly quickPickHasBackButton: boolean[] = [];
		readonly inputBoxSnapshots: { title: string | undefined; placeholder: string | undefined; prompt: string | undefined; hasBackButton: boolean }[] = [];
		readonly inputValidationSnapshots: { phase: 'change' | 'accept'; value: string; message: string | undefined; severity: Severity }[] = [];
		readonly picks: QuickPickInput<IQuickPickItem>[][] = [];
		inputValue: string | undefined;
		readonly inputChangeValues: string[] = [];
		inputValueChangeBeforeAccept = true;
		inputBackAfterAccept = false;
		inputBackCount = 0;
		quickPickEmptyAcceptCount = 0;
		pickIds: (string | undefined)[] = [];
		buttonItemIds: string[] = [];
		readonly removedItemIds: string[] = [];
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
				override readonly onDidTriggerButton = Event.None;
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

		override readonly backButton: IQuickInputButton = { iconClass: 'back', tooltip: 'Back' };

		override async pick<T extends IQuickPickItem>(picks: QuickPickInput<T>[], options?: IPickOptions<T>): Promise<T | undefined> {
			this.picks.push(picks);
			this.pickSnapshots.push(picks.map(pick => ({
				id: pick.id,
				label: pick.label ?? '',
				type: pick.type ?? 'item',
			})));
			const buttonItemId = this.buttonItemIds.shift();
			if (buttonItemId) {
				const item = picks.find((pick): pick is T => pick.type !== 'separator' && pick.id === buttonItemId);
				const button = item?.buttons?.[0];
				if (item && button) {
					await Promise.resolve(options?.onDidTriggerItemButton?.({
						item,
						button,
						removeItem: () => this.removedItemIds.push(buttonItemId),
					}));
				}
				return undefined;
			}
			const id = this.pickIds.shift();
			if (!id) {
				return undefined;
			}
			for (const pick of picks) {
				if (pick.type !== 'separator' && pick.id === id) {
					return pick;
				}
			}
			return undefined;
		}

		override createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
		override createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: false }>;
		override createQuickPick<T extends IQuickPickItem>(_options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: true }> | IQuickPick<T, { useSeparators: false }> {
			const disposables = new DisposableStore();
			const acceptEmitter = disposables.add(new Emitter<IQuickPickDidAcceptEvent>());
			const hideEmitter = disposables.add(new Emitter<IQuickInputHideEvent>());
			const buttonEmitter = disposables.add(new Emitter<IQuickInputButton>());
			const service = this;
			return new class extends mock<IQuickPick<T>>() {
				override title: string | undefined;
				override placeholder: string | undefined;
				override items: readonly T[] = [];
				override buttons: readonly IQuickInputButton[] = [];
				override selectedItems: readonly T[] = [];
				override readonly onDidAccept = acceptEmitter.event;
				override readonly onDidHide = hideEmitter.event;
				override readonly onDidTriggerButton = buttonEmitter.event;

				override show(): void {
					service.quickPickSnapshots.push(this.items.map(item => ({ id: item.id, label: item.label, type: item.type ?? 'item' })));
					service.quickPickHasBackButton.push(this.buttons.includes(service.backButton));
					if (service.quickPickEmptyAcceptCount > 0) {
						service.quickPickEmptyAcceptCount--;
						acceptEmitter.fire({ inBackground: false });
					}
					const id = service.pickIds.shift();
					if (id === 'back') {
						buttonEmitter.fire(service.backButton);
						return;
					}
					const selected = this.items.find(item => item.id === id);
					if (selected) {
						this.selectedItems = [selected];
						acceptEmitter.fire({ inBackground: false });
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

		override createInputBox(): IInputBox {
			if (this.manualInput) {
				return this.inputBox;
			}
			const disposables = new DisposableStore();
			const acceptEmitter = disposables.add(new Emitter<void>());
			const changeValueEmitter = disposables.add(new Emitter<string>());
			const hideEmitter = disposables.add(new Emitter<IQuickInputHideEvent>());
			const buttonEmitter = disposables.add(new Emitter<IQuickInputButton>());
			const service = this;
			return new class extends mock<IInputBox>() {
				override title: string | undefined;
				override placeholder: string | undefined;
				override prompt: string | undefined;
				override buttons: readonly IQuickInputButton[] = [];
				override value = '';
				override busy = false;
				override enabled = true;
				override validationMessage: string | undefined;
				override severity = Severity.Ignore;
				override readonly onDidAccept = acceptEmitter.event;
				override readonly onDidChangeValue = changeValueEmitter.event;
				override readonly onDidHide = hideEmitter.event;
				override readonly onDidTriggerButton = buttonEmitter.event;

				override show(): void {
					service.inputBoxSnapshots.push({
						title: this.title,
						placeholder: this.placeholder,
						prompt: this.prompt,
						hasBackButton: this.buttons.includes(service.backButton),
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
					if (service.inputBackCount > 0) {
						service.inputBackCount--;
						buttonEmitter.fire(service.backButton);
						return;
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
						if (service.inputBackAfterAccept) {
							buttonEmitter.fire(service.backButton);
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

	test('adds a marketplace from the management quick pick', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: ['github/awesome-copilot#marketplace'],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.quickInputService.pickIds.push('addMarketplace');
		fixture.quickInputService.inputValue = 'microsoft/vscode-marketplace';

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			firstPick: fixture.quickInputService.pickSnapshots[0],
			input: fixture.quickInputService.inputBoxSnapshots[0],
			updates: fixture.configurationService.updates,
			notifications: fixture.notifications,
		}, {
			firstPick: [
				{ id: 'addMarketplace', label: '$(add) Add Marketplace...', type: 'item' },
				{ id: 'browseMarketplaces', label: 'Browse All Marketplaces', type: 'item' },
				{ id: undefined, label: 'Configured Marketplaces', type: 'separator' },
				{ id: parseMarketplaceReference('github/awesome-copilot#marketplace')!.canonicalId, label: 'github/awesome-copilot#marketplace', type: 'item' },
			],
			input: {
				title: 'Add Plugin Marketplace',
				placeholder: 'owner/repo, Git URL, or local repository URI',
				prompt: 'Only add marketplaces you trust.',
				hasBackButton: true,
			},
			updates: [{
				key: ChatConfiguration.PluginMarketplaces,
				value: ['github/awesome-copilot#marketplace', 'microsoft/vscode-marketplace'],
			}],
			notifications: [],
		});
	});

	test('stores Git and directory marketplaces in the local harness configuration', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.quickInputService.pickIds.push('addMarketplace');
		fixture.quickInputService.inputValue = 'https://example.com/team/plugins.git#stable';

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		fixture.quickInputService.pickIds.push('addMarketplace');
		fixture.quickInputService.inputValue = 'file:///marketplaces/local-marketplace';
		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual(fixture.configurationService.updates, [{
			key: ChatConfiguration.PluginMarketplaces,
			value: ['https://example.com/team/plugins.git#stable'],
		}, {
			key: ChatConfiguration.PluginMarketplaces,
			value: ['https://example.com/team/plugins.git#stable', 'file:///marketplaces/local-marketplace'],
		}]);
	});

	test('returns to the marketplace list from the add marketplace input', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.quickInputService.pickIds.push('addMarketplace', undefined);
		fixture.quickInputService.inputBackCount = 1;

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			marketplacePickCount: fixture.quickInputService.pickSnapshots.length,
			inputs: fixture.quickInputService.inputBoxSnapshots,
			configurationUpdates: fixture.configurationService.updates,
		}, {
			marketplacePickCount: 2,
			inputs: [{
				title: 'Add Plugin Marketplace',
				placeholder: 'owner/repo, Git URL, or local repository URI',
				prompt: 'Only add marketplaces you trust.',
				hasBackButton: true,
			}],
			configurationUpdates: [],
		});
	});

	test('styles marketplace validation errors and clears the styling for valid input', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: ['github/awesome-copilot#marketplace'],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.quickInputService.pickIds.push('addMarketplace', undefined);
		fixture.quickInputService.inputChangeValues.push('invalid', 'microsoft/vscode-marketplace');
		fixture.quickInputService.inputValue = 'github/awesome-copilot#marketplace';
		fixture.quickInputService.inputValueChangeBeforeAccept = false;
		fixture.quickInputService.inputBackAfterAccept = true;

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

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
			picks: fixture.quickInputService.pickSnapshots,
		}, {
			title: 'Add Plugin Marketplace',
			updates: [{ key: ChatConfiguration.PluginMarketplaces, value: ['owner/marketplace'] }],
			picks: [[
				{ id: 'addMarketplace', label: '$(add) Add Marketplace...', type: 'item' },
				{ id: 'browseMarketplaces', label: 'Browse All Marketplaces', type: 'item' },
				{ id: undefined, label: 'Configured Marketplaces', type: 'separator' },
				{ id: parseMarketplaceReference('owner/marketplace')!.canonicalId, label: 'owner/marketplace', type: 'item' },
			]],
		});
	});

	test('cancelling the direct local marketplace input does not open management', async () => {
		const fixture = createFixture({});
		await fixture.instantiationService.invokeFunction(accessor => new AddPluginMarketplaceAction().run(accessor));
		assert.deepStrictEqual({
			updates: fixture.configurationService.updates,
			picks: fixture.quickInputService.picks,
		}, { updates: [], picks: [] });
	});

	test('uses provider inventory and force-removes dependent plugins', async () => {
		const removeCalls: { name: string; force?: boolean }[] = [];
		const provider: ICustomizationMarketplaceManagementProvider = {
			onDidChange: Event.None,
			onDidChangeMarketplaces: Event.None,
			list: async () => [{
				name: 'VS Code Marketplace',
				source: 'GitHub: microsoft/vscode-marketplace',
				isDefault: false,
				managed: false,
				available: true,
			}],
			add: async () => { throw new Error('Unexpected add'); },
			queryMarketplace: async () => ({ items: [], total: 0 }),
			remove: async (_session, name, force) => {
				removeCalls.push({ name, force });
				return force ? { removed: true } : { removed: false, dependentPlugins: ['sample-plugin'] };
			},
			refresh: async () => [],
		};
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: ['local/ignored-marketplace'],
			[ChatConfiguration.ExtraMarketplaces]: {},
		}, false, provider);
		fixture.quickInputService.pickIds.push('VS Code Marketplace', 'removeMarketplace', undefined);

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			firstPick: fixture.quickInputService.pickSnapshots[0],
			actions: fixture.quickInputService.quickPickSnapshots[0],
			configurationUpdates: fixture.configurationService.updates,
			removeCalls,
		}, {
			firstPick: [
				{ id: 'addMarketplace', label: '$(add) Add Marketplace...', type: 'item' },
				{ id: 'browseMarketplaces', label: 'Browse All Marketplaces', type: 'item' },
				{ id: undefined, label: 'Configured Marketplaces', type: 'separator' },
				{ id: 'VS Code Marketplace', label: 'VS Code Marketplace', type: 'item' },
			],
			actions: [
				{ id: 'browsePlugins', label: 'Browse', type: 'item' },
				{ id: 'refreshMarketplace', label: 'Refresh Marketplace', type: 'item' },
				{ id: 'removeMarketplace', label: 'Remove Marketplace', type: 'item' },
			],
			configurationUpdates: [],
			removeCalls: [
				{ name: 'VS Code Marketplace', force: undefined },
				{ name: 'VS Code Marketplace', force: true },
			],
		});
	});

	test('shows an inline remove action only for removable provider marketplaces', async () => {
		const removeCalls: string[] = [];
		const provider: ICustomizationMarketplaceManagementProvider = {
			onDidChange: Event.None,
			onDidChangeMarketplaces: Event.None,
			list: async () => [{
				name: 'removable-marketplace',
				source: 'GitHub: owner/removable-marketplace',
				isDefault: false,
				managed: false,
				available: true,
			}, {
				name: 'default-marketplace',
				source: 'GitHub: owner/default-marketplace',
				isDefault: true,
				managed: false,
				available: true,
			}, {
				name: 'managed-marketplace',
				source: 'GitHub: owner/managed-marketplace',
				isDefault: false,
				managed: true,
				available: true,
			}],
			add: async () => { throw new Error('Unexpected add'); },
			queryMarketplace: async () => ({ items: [], total: 0 }),
			remove: async (_session, name) => {
				removeCalls.push(name);
				return { removed: true };
			},
			refresh: async () => [],
		};
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
		}, false, provider);
		fixture.quickInputService.buttonItemIds.push('removable-marketplace');

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			buttons: fixture.quickInputService.picks[0]
				.filter((pick): pick is IQuickPickItem => pick.type !== 'separator' && pick.id !== 'addMarketplace' && pick.id !== 'browseMarketplaces')
				.map(pick => [pick.id, pick.buttons?.map(button => button.tooltip)]),
			removeCalls,
			removedItemIds: fixture.quickInputService.removedItemIds,
		}, {
			buttons: [
				['removable-marketplace', ['Remove Marketplace']],
				['default-marketplace', undefined],
				['managed-marketplace', undefined],
			],
			removeCalls: ['removable-marketplace'],
			removedItemIds: ['removable-marketplace'],
		});
	});

	test('returns to the provider marketplace list from the marketplace actions', async () => {
		let listCalls = 0;
		const provider: ICustomizationMarketplaceManagementProvider = {
			onDidChange: Event.None,
			onDidChangeMarketplaces: Event.None,
			list: async () => {
				listCalls++;
				return [{
					name: 'provider-marketplace',
					source: 'GitHub: owner/provider-marketplace',
					isDefault: false,
					managed: false,
					available: true,
				}];
			},
			add: async () => { throw new Error('Unexpected add'); },
			queryMarketplace: async () => ({ items: [], total: 0 }),
			remove: async () => { throw new Error('Unexpected remove'); },
			refresh: async () => { throw new Error('Unexpected refresh'); },
		};
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
		}, false, provider);
		fixture.quickInputService.pickIds.push('provider-marketplace', 'back', undefined);

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			listCalls,
			marketplacePickCount: fixture.quickInputService.pickSnapshots.length,
			actions: fixture.quickInputService.quickPickSnapshots,
			hasBackButton: fixture.quickInputService.quickPickHasBackButton,
		}, {
			listCalls: 2,
			marketplacePickCount: 2,
			actions: [[
				{ id: 'browsePlugins', label: 'Browse', type: 'item' },
				{ id: 'refreshMarketplace', label: 'Refresh Marketplace', type: 'item' },
				{ id: 'removeMarketplace', label: 'Remove Marketplace', type: 'item' },
			]],
			hasBackButton: [true],
		});
	});

	for (const direct of [false, true]) {
		test(`adds marketplaces through the provider ${direct ? 'directly from F1' : 'from management'} without updating local configuration`, async () => {
			const addCalls: string[] = [];
			const provider: ICustomizationMarketplaceManagementProvider = {
				onDidChange: Event.None,
				onDidChangeMarketplaces: Event.None,
				list: async () => [],
				add: async (_session, source) => {
					addCalls.push(source);
					return { name: 'provider-marketplace', source, isDefault: false, managed: false, available: true };
				},
				queryMarketplace: async () => ({ items: [], total: 0 }),
				remove: async () => ({ removed: true }),
				refresh: async () => [],
			};
			const fixture = createFixture({
				[ChatConfiguration.PluginMarketplaces]: ['local/ignored-marketplace'],
				[ChatConfiguration.ExtraMarketplaces]: {},
			}, false, provider);
			if (!direct) {
				fixture.quickInputService.pickIds.push('addMarketplace');
			}
			fixture.quickInputService.manualInput = true;
			const shown = Event.toPromise(fixture.quickInputService.showEmitter.event);
			const result = fixture.instantiationService.invokeFunction(accessor => direct
				? new AddPluginMarketplaceAction().run(accessor)
				: new ManagePluginMarketplacesAction().run(accessor));
			await shown;
			const picksBeforeSubmission = fixture.quickInputService.picks.length;
			fixture.quickInputService.inputBox.value = ' provider/marketplace ';
			fixture.quickInputService.acceptEmitter.fire();
			await result;

			assert.deepStrictEqual({
				addCalls,
				picksBeforeSubmission,
				picksAfterSubmission: fixture.quickInputService.picks.length,
				configurationUpdates: fixture.configurationService.updates,
			}, {
				addCalls: ['provider/marketplace'],
				picksBeforeSubmission: direct ? 0 : 1,
				picksAfterSubmission: direct ? 1 : 2,
				configurationUpdates: [],
			});
		});
	}

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
		assert.deepStrictEqual(fixture.quickInputService.picks, []);
	});

	test('keeps the provider input busy and shows errors inline for correction and retry', async () => {
		const pending = new DeferredPromise<void>();
		const addCalls: { session: URI; source: string }[] = [];
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
		quickInput.pickIds.push('addMarketplace');
		const shown = Event.toPromise(quickInput.showEmitter.event);
		const result = fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));
		await shown;

		quickInput.inputBox.value = 'owner/missing';
		quickInput.acceptEmitter.fire();
		quickInput.acceptEmitter.fire();
		const busyState = {
			visible: quickInput.inputBox.visible,
			busy: quickInput.inputBox.busy,
			enabled: quickInput.inputBox.enabled,
			picks: quickInput.picks.length,
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
			picks: quickInput.picks.length,
			updates: fixture.configurationService.updates,
			notifications: fixture.notifications,
		}, {
			busyState: { visible: true, busy: true, enabled: false, picks: 1, calls: 1 },
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
			picks: 2,
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
		quickInput.pickIds.push('addMarketplace');
		const shown = Event.toPromise(quickInput.showEmitter.event);
		const result = fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));
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
			quickInput.pickIds.push('addMarketplace');
			const shown = Event.toPromise(quickInput.showEmitter.event);
			const result = fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));
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
				picks: quickInput.picks.length,
			}, { disposed: true, visible: false, message: undefined, picks: 2 });
		});
	}

	test('returns to the provider marketplace list from the add marketplace input', async () => {
		const addCalls: string[] = [];
		const provider: ICustomizationMarketplaceManagementProvider = {
			onDidChange: Event.None,
			onDidChangeMarketplaces: Event.None,
			list: async () => [],
			add: async (_session, source) => {
				addCalls.push(source);
				return { name: 'provider-marketplace', source, isDefault: false, managed: false, available: true };
			},
			queryMarketplace: async () => ({ items: [], total: 0 }),
			remove: async () => ({ removed: true }),
			refresh: async () => [],
		};
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
		}, false, provider);
		fixture.quickInputService.pickIds.push('addMarketplace', undefined);
		fixture.quickInputService.inputBackCount = 1;

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			marketplacePickCount: fixture.quickInputService.pickSnapshots.length,
			inputs: fixture.quickInputService.inputBoxSnapshots,
			addCalls,
		}, {
			marketplacePickCount: 2,
			inputs: [{
				title: 'Add Plugin Marketplace',
				placeholder: 'owner/repo, Git URL, or local repository URI',
				prompt: 'Only add marketplaces you trust.',
				hasBackButton: true,
			}],
			addCalls: [],
		});
	});

	test('shows plugins from a configured marketplace in Customizations', async () => {
		const marketplace = parseMarketplaceReference('anthropics/claude-code')!;
		const otherMarketplace = parseMarketplaceReference('microsoft/vscode-marketplace')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [otherMarketplace.rawValue, marketplace.rawValue],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.quickInputService.pickIds.push(marketplace.canonicalId, 'showPlugins');

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			actions: fixture.quickInputService.quickPickSnapshots[0],
			commands: fixture.commands,
		}, {
			actions: [
				{ id: 'showPlugins', label: 'Browse', type: 'item' },
				{ id: 'removeMarketplace', label: 'Remove Marketplace', type: 'item' },
			],
			commands: [{
				id: AICustomizationManagementCommands.OpenMarketplace,
				args: [{
					section: AICustomizationManagementSection.Plugins,
					searchQuery: '',
					sourceId: getPluginCustomizationMarketplaceSourceId(marketplace),
				}],
			}],
		});
	});

	test('returns to the marketplace list from the marketplace actions', async () => {
		const marketplace = parseMarketplaceReference('anthropics/claude-code')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [marketplace.rawValue],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.quickInputService.pickIds.push(marketplace.canonicalId, 'back', undefined);

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			marketplacePickCount: fixture.quickInputService.pickSnapshots.length,
			actions: fixture.quickInputService.quickPickSnapshots,
			hasBackButton: fixture.quickInputService.quickPickHasBackButton,
			configurationUpdates: fixture.configurationService.updates,
			commands: fixture.commands,
		}, {
			marketplacePickCount: 2,
			actions: [[
				{ id: 'showPlugins', label: 'Browse', type: 'item' },
				{ id: 'removeMarketplace', label: 'Remove Marketplace', type: 'item' },
			]],
			hasBackButton: [true],
			configurationUpdates: [],
			commands: [],
		});
	});

	test('keeps marketplace actions open when accepting without a selection', async () => {
		const marketplace = parseMarketplaceReference('anthropics/claude-code')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [marketplace.rawValue],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.quickInputService.pickIds.push(marketplace.canonicalId, 'removeMarketplace', undefined);
		fixture.quickInputService.quickPickEmptyAcceptCount = 1;

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual({
			actions: fixture.quickInputService.quickPickSnapshots,
			configurationUpdates: fixture.configurationService.updates,
		}, {
			actions: [[
				{ id: 'showPlugins', label: 'Browse', type: 'item' },
				{ id: 'removeMarketplace', label: 'Remove Marketplace', type: 'item' },
			]],
			configurationUpdates: [{
				key: ChatConfiguration.PluginMarketplaces,
				value: [],
			}],
		});
	});
	for (const native of [false, true]) {
		for (const browseAll of [false, true]) {
			test(`browses ${browseAll ? 'all marketplaces' : 'a selected marketplace'} from ${native ? 'provider' : 'local'} management`, async () => {
				const marketplace = {
					name: 'team-marketplace', source: 'owner/repo', isDefault: false, managed: false, available: true,
				};
				const provider: ICustomizationMarketplaceManagementProvider = {
					onDidChange: Event.None,
					onDidChangeMarketplaces: Event.None,
					list: async () => [marketplace],
					add: async () => { throw new Error('Browsing must not add a marketplace'); },
					queryMarketplace: async () => ({ items: [], total: 0 }),
					remove: async () => { throw new Error('Browsing must not remove a marketplace'); },
					refresh: async () => { throw new Error('Browsing must not refresh a marketplace'); },
				};
				const reference = parseMarketplaceReference(marketplace.source)!;
				const fixture = createFixture({
					[ChatConfiguration.PluginMarketplaces]: [marketplace.source],
				}, false, native ? provider : undefined);
				fixture.quickInputService.pickIds.push(...(browseAll
					? ['browseMarketplaces']
					: [native ? marketplace.name : reference.canonicalId, native ? 'browsePlugins' : 'showPlugins']));

				await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

				assert.deepStrictEqual({
					commands: fixture.commands,
					updates: fixture.configurationService.updates,
				}, {
					commands: [{
						id: AICustomizationManagementCommands.OpenMarketplace,
						args: [{
							section: AICustomizationManagementSection.Plugins,
							searchQuery: '',
							...(browseAll ? {} : {
								sourceId: native ? getProviderMarketplaceSourceId(marketplace.name) : getPluginCustomizationMarketplaceSourceId(reference),
							}),
						}],
					}],
					updates: [],
				});
			});
		}
	}

	test('shows plugins from the default marketplace using its public feed replacement', async () => {
		const marketplace = parseMarketplaceReference('github/awesome-copilot#marketplace')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [marketplace.rawValue],
			[ChatConfiguration.ExtraMarketplaces]: {},
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
		}, true);
		fixture.quickInputService.pickIds.push(marketplace.canonicalId, 'showPlugins');

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual(fixture.commands, [{
			id: AICustomizationManagementCommands.OpenMarketplace,
			args: [{
				section: AICustomizationManagementSection.Plugins,
				searchQuery: '',
				sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
			}],
		}]);
	});

	test('shows plugins from the default marketplace using its configured source under strict policy', async () => {
		const marketplace = parseMarketplaceReference('github/awesome-copilot#marketplace')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [marketplace.rawValue],
			[ChatConfiguration.ExtraMarketplaces]: {},
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
		}, true);
		fixture.marketplacePolicy.allowlist = [{ source: 'github', repo: 'github/awesome-copilot', ref: 'marketplace' }];
		fixture.quickInputService.pickIds.push(marketplace.canonicalId, 'showPlugins');

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual(fixture.commands, [{
			id: AICustomizationManagementCommands.OpenMarketplace,
			args: [{
				section: AICustomizationManagementSection.Plugins,
				searchQuery: '',
				sourceId: getPluginCustomizationMarketplaceSourceId(marketplace),
			}],
		}]);
	});

	test('shows plugins from the default marketplace using its configured source without a public feed', async () => {
		const marketplace = parseMarketplaceReference('github/awesome-copilot#marketplace')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [marketplace.rawValue],
			[ChatConfiguration.ExtraMarketplaces]: {},
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
		});
		fixture.quickInputService.pickIds.push(marketplace.canonicalId, 'showPlugins');

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual(fixture.commands, [{
			id: AICustomizationManagementCommands.OpenMarketplace,
			args: [{
				section: AICustomizationManagementSection.Plugins,
				searchQuery: '',
				sourceId: getPluginCustomizationMarketplaceSourceId(marketplace),
			}],
		}]);
	});

	test('disables marketplaces outside strict policy and labels organization-managed marketplaces', async () => {
		const defaultMarketplace = parseMarketplaceReference('github/awesome-copilot#marketplace')!;
		const managedMarketplace = parseMarketplaceReference('microsoft/vscode-team-kit')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [defaultMarketplace.rawValue],
			[ChatConfiguration.ExtraMarketplaces]: {
				'vscode-team-kit': managedMarketplace.rawValue,
			},
		});
		fixture.marketplacePolicy.allowlist = [{ source: 'github', repo: managedMarketplace.rawValue }];

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual(
			fixture.quickInputService.picks[0]
				.filter((pick): pick is IQuickPickItem => pick.type !== 'separator' && pick.id !== 'addMarketplace' && pick.id !== 'browseMarketplaces')
				.map(pick => ({
					id: pick.id,
					label: pick.label,
					description: pick.description,
					disabled: pick.disabled,
					pickable: pick.pickable,
				})),
			[
				{
					id: defaultMarketplace.canonicalId,
					label: defaultMarketplace.displayLabel,
					description: 'Disabled by Organization',
					disabled: true,
					pickable: false,
				},
				{
					id: managedMarketplace.canonicalId,
					label: 'vscode-team-kit',
					description: 'Managed by Organization',
					disabled: false,
					pickable: true,
				},
			],
		);
	});

	test('disables organization-managed marketplaces outside strict policy', async () => {
		const managedMarketplace = parseMarketplaceReference('microsoft/vscode-team-kit')!;
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {
				'vscode-team-kit': managedMarketplace.rawValue,
			},
		});
		fixture.marketplacePolicy.allowlist = [{ source: 'github', repo: 'approved/catalog' }];

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

		assert.deepStrictEqual(
			fixture.quickInputService.picks[0]
				.filter((pick): pick is IQuickPickItem => pick.type !== 'separator' && pick.id !== 'addMarketplace' && pick.id !== 'browseMarketplaces')
				.map(pick => ({
					id: pick.id,
					label: pick.label,
					description: pick.description,
					disabled: pick.disabled,
					pickable: pick.pickable,
				})),
			[{
				id: managedMarketplace.canonicalId,
				label: 'vscode-team-kit',
				description: 'Managed by Organization, Disabled by Organization',
				disabled: true,
				pickable: false,
			}],
		);
	});

	for (const managedLockdown of [false, true]) {
		test(`stale user lockdown does not label a marketplace as organization-disabled (managed lockdown: ${managedLockdown})`, async () => {
			const fixture = createFixture({
				[ChatConfiguration.PluginMarketplaces]: [],
				[ChatConfiguration.ExtraMarketplaces]: { enterprise: 'enterprise/catalog' },
				'chat.plugins.strictMarketplaces': [],
			});
			fixture.marketplacePolicy.allowlist = managedLockdown ? [] : undefined;
			await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));
			assert.deepStrictEqual(fixture.quickInputService.picks[0]
				.filter((pick): pick is IQuickPickItem => pick.type !== 'separator' && pick.id !== 'addMarketplace' && pick.id !== 'browseMarketplaces')
				.map(pick => ({ description: pick.description, disabled: pick.disabled, pickable: pick.pickable })), [{
					description: managedLockdown ? 'Managed by Organization, Disabled by Organization' : 'Managed by Organization',
					disabled: managedLockdown,
					pickable: !managedLockdown,
				}]);
		});
	}

	test('stores local marketplaces outside strict policy without treating them as runtime managed', async () => {
		const fixture = createFixture({
			[ChatConfiguration.PluginMarketplaces]: [],
			[ChatConfiguration.ExtraMarketplaces]: {},
		});
		fixture.marketplacePolicy.allowlist = [{ source: 'github', repo: 'approved/catalog' }];
		fixture.quickInputService.pickIds.push('addMarketplace');
		fixture.quickInputService.inputValue = 'blocked/catalog';

		await fixture.instantiationService.invokeFunction(accessor => new ManagePluginMarketplacesAction().run(accessor));

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
