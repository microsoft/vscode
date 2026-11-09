/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService, IManagedSettingsCompatibilityError } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { DisablementReason, IUpdateService, State, UpdateType } from '../../../../../platform/update/common/update.js';
import { IBannerItem, IBannerService } from '../../../banner/browser/bannerService.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { ManagedSettingsUpdateContribution } from '../../browser/managedSettingsUpdate.contribution.js';
import { ManagedSettingsUpdateService } from '../../browser/managedSettingsUpdateService.js';
import { getManagedSettingsUpdateInfo, IManagedSettingsUpdateInfo, IManagedSettingsUpdateService, ManagedSettingsUpdateRequiredContext } from '../../common/managedSettingsUpdate.js';

suite('Managed settings update presentation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const editorEnvironment = new class extends mock<IWorkbenchEnvironmentService>() {
		override readonly isSessionsWindow = false;
	}();
	const product = new class extends mock<IProductService>() {
		override readonly nameShort = 'Code - Insiders';
		override readonly version = '1.140.0';
	}();
	const error: IManagedSettingsCompatibilityError = { errorCode: 'client_update_required', clientVersion: '1.139.0', minimumClientVersion: '1.141.0' };
	const idle = State.Idle(UpdateType.Archive);
	const update = { version: '1.141.0', productVersion: '1.141.0' };
	const disabledReasons = [
		DisablementReason.NotBuilt,
		DisablementReason.DisabledByEnvironment,
		DisablementReason.ManuallyDisabled,
		DisablementReason.Policy,
		DisablementReason.MissingConfiguration,
		DisablementReason.InvalidConfiguration,
		DisablementReason.RunningAsAdmin,
	];

	function createService(initialError: IManagedSettingsCompatibilityError | null = null) {
		const errorEmitter = store.add(new Emitter<IManagedSettingsCompatibilityError | null>());
		const updateEmitter = store.add(new Emitter<State>());
		const account = new class extends mock<IDefaultAccountService>() {
			override managedSettingsCompatibilityError = initialError;
			override readonly onDidChangeManagedSettingsCompatibilityError = errorEmitter.event;
		}();
		const updater = new class extends mock<IUpdateService>() {
			override state: State = idle;
			override readonly onStateChange = updateEmitter.event;
		}();
		const service = store.add(new ManagedSettingsUpdateService(account, product, updater));
		return {
			service,
			setError: (value: IManagedSettingsCompatibilityError | null) => {
				account.managedSettingsCompatibilityError = value;
				errorEmitter.fire(value);
			},
			setUpdate: (value: State) => {
				updater.state = value;
				updateEmitter.fire(value);
			},
		};
	}

	test('identifies the requesting product and handles missing version metadata', () => {
		const noVersionProduct = new class extends mock<IProductService>() { override readonly nameShort = 'Code'; }();
		assert.deepStrictEqual({
			known: getManagedSettingsUpdateInfo(error, product, idle),
			fallback: getManagedSettingsUpdateInfo({ errorCode: 'client_update_required' }, product, idle).message,
			requiredOnly: getManagedSettingsUpdateInfo({ errorCode: 'client_update_required', minimumClientVersion: '1.141.0' }, noVersionProduct, idle).message,
			unavailable: getManagedSettingsUpdateInfo({ errorCode: 'client_update_required' }, noVersionProduct, idle).detail,
		}, {
			known: {
				title: 'Update required by your organization',
				message: 'Your organization requires Code - Insiders 1.141.0 or later to use AI features.',
				detail: 'Installed: 1.139.0',
				action: { label: 'Check for Updates', href: 'command:update.checkForUpdate' },
				updateStatus: undefined,
			},
			fallback: 'Your organization requires an update to Code - Insiders to use AI features.',
			requiredOnly: 'Your organization requires Code 1.141.0 or later to use AI features.',
			unavailable: undefined,
		});
	});

	test('uses actionable update states without pretending disabled or busy updates can run', () => {
		const states = [idle, State.AvailableForDownload(update), State.Downloaded(update, true, false), State.Ready(update, true, false), State.Disabled(DisablementReason.Policy), State.Disabled(DisablementReason.NotBuilt), State.Downloading(update, true, false)];
		assert.deepStrictEqual(states.map(state => {
			const info = getManagedSettingsUpdateInfo(error, product, state);
			return { action: info.action, status: info.updateStatus };
		}), [
			{ action: { label: 'Check for Updates', href: 'command:update.checkForUpdate' }, status: undefined },
			{ action: { label: 'Download Update', href: 'command:update.downloadUpdate' }, status: undefined },
			{ action: { label: 'Install Update', href: 'command:update.installUpdate' }, status: undefined },
			{ action: { label: 'Restart to Update', href: 'command:update.restartToUpdate' }, status: undefined },
			{ action: undefined, status: 'Built-in updates are disabled by your organization. Contact your administrator for an approved update.' },
			{ action: undefined, status: undefined },
			{ action: undefined, status: 'An update operation is in progress.' },
		]);
	});

	test('all disabled updater reasons omit fallback actions and only policy attributes management to the organization', () => {
		assert.deepStrictEqual(disabledReasons.map(reason => {
			const info = getManagedSettingsUpdateInfo(error, product, State.Disabled(reason));
			return { reason, action: info.action, status: info.updateStatus };
		}), disabledReasons.map(reason => ({
			reason,
			action: undefined,
			status: reason === DisablementReason.Policy ? 'Built-in updates are disabled by your organization. Contact your administrator for an approved update.' : undefined,
		})));
	});

	test('reads initially blocked state and recomputes late changes, removal and reapplication without duplicates', () => {
		const { service, setError, setUpdate } = createService(error);
		const seen: (string | undefined)[] = [];
		store.add(autorun(reader => {
			const info = service.updateInfo.read(reader);
			seen.push(info ? `${info.message} ${info.detail} ${info.action?.label}` : undefined);
		}));
		setError({ ...error });
		setUpdate(State.Ready(update, true, false));
		setError(null);
		setUpdate(idle);
		setError({ ...error, minimumClientVersion: '1.142.0' });
		setError(null);
		assert.deepStrictEqual(seen, [
			'Your organization requires Code - Insiders 1.141.0 or later to use AI features. Installed: 1.139.0 Check for Updates',
			'Your organization requires Code - Insiders 1.141.0 or later to use AI features. Installed: 1.139.0 Restart to Update',
			undefined,
			'Your organization requires Code - Insiders 1.142.0 or later to use AI features. Installed: 1.139.0 Check for Updates',
			undefined,
		]);
	});

	test('does not infer minVersion from other restrictions or update availability', () => {
		const { service, setUpdate } = createService();
		const seen: (IManagedSettingsUpdateInfo | undefined)[] = [];
		store.add(autorun(reader => seen.push(service.updateInfo.read(reader))));
		setUpdate(State.Ready(update, true, false));
		assert.deepStrictEqual(seen, [undefined]);
	});

	test('banner and read-only view context follow late compatibility and honor personal AI hiding', async () => {
		const { service, setError, setUpdate } = createService();
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const contexts = new MockContextKeyService();
		const shown: IBannerItem[] = [];
		let active: IBannerItem | undefined;
		const banners = new class extends mock<IBannerService>() {
			override show(item: IBannerItem): void { shown.push(item); active = item; }
			override hide(id: string): void { if (active?.id === id) { active = undefined; } }
		}();
		const contribution = store.add(new ManagedSettingsUpdateContribution(service, configuration, contexts, banners, editorEnvironment));
		const states: { visible: boolean | undefined; banner: boolean }[] = [];
		const capture = () => states.push({ visible: ManagedSettingsUpdateRequiredContext.getValue(contexts), banner: !!active });
		capture();
		setError(error);
		capture();
		setError({ ...error });
		active?.onClose?.();
		active = undefined;
		setUpdate(State.Ready(update, true, false));
		capture();
		setError(null);
		capture();
		setError(error);
		capture();
		await configuration.setUserConfiguration(ChatAIDisabledSettingId, true);
		configuration.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, affectedKeys: new Set([ChatAIDisabledSettingId]), source: 1, change: { keys: [ChatAIDisabledSettingId], overrides: [] } });
		capture();
		contribution.dispose();
		capture();
		assert.deepStrictEqual({
			states,
			shown: shown.map(item => ({ neutral: item.neutral, message: item.message, action: item.actions?.[0]?.label })),
		}, {
			states: [
				{ visible: false, banner: false },
				{ visible: true, banner: true },
				{ visible: true, banner: false },
				{ visible: false, banner: false },
				{ visible: true, banner: true },
				{ visible: false, banner: false },
				{ visible: false, banner: false },
			],
			shown: [
				{ neutral: true, message: getManagedSettingsUpdateInfo(error, product, idle).message, action: 'Check for Updates' },
				{ neutral: true, message: getManagedSettingsUpdateInfo(error, product, idle).message, action: 'Restart to Update' },
			],
		});
	});

	test('initially blocked editor publishes the banner without opening a Chat view', () => {
		const { service } = createService(error);
		const context = new MockContextKeyService();
		const shown: IBannerItem[] = [];
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		store.add(new ManagedSettingsUpdateContribution(service, configuration, context, new class extends mock<IBannerService>() {
			override show(item: IBannerItem) { shown.push(item); }
			override hide() { }
		}(), editorEnvironment));
		assert.deepStrictEqual({ count: shown.length, visible: ManagedSettingsUpdateRequiredContext.getValue(context) }, { count: 1, visible: true });
	});

	test('banner explicitly identifies organization-managed updates but does not attribute dev builds to an administrator', () => {
		const { service, setUpdate } = createService(error);
		const shown: string[] = [];
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		store.add(new ManagedSettingsUpdateContribution(service, configuration, new MockContextKeyService(), new class extends mock<IBannerService>() {
			override show(item: IBannerItem) { shown.push(String(item.message)); }
			override hide() { }
		}(), editorEnvironment));
		setUpdate(State.Disabled(DisablementReason.Policy));
		setUpdate(State.Disabled(DisablementReason.NotBuilt));
		assert.deepStrictEqual(shown, [
			'Your organization requires Code - Insiders 1.141.0 or later to use AI features.',
			'Your organization requires Code - Insiders 1.141.0 or later to use AI features. Built-in updates are disabled by your organization. Contact your administrator for an approved update.',
			'Your organization requires Code - Insiders 1.141.0 or later to use AI features.',
		]);
	});

	test('banner remains informative without a fallback link for every disabled updater reason', () => {
		const { service, setUpdate } = createService(error);
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		let active: IBannerItem | undefined;
		store.add(new ManagedSettingsUpdateContribution(service, configuration, new MockContextKeyService(), new class extends mock<IBannerService>() {
			override show(item: IBannerItem) { active = item; }
			override hide() { active = undefined; }
		}(), editorEnvironment));
		const states = disabledReasons.map(reason => {
			setUpdate(State.Disabled(reason));
			return { shown: !!active, actions: active?.actions, instructions: String(active?.message).includes('Update Instructions') };
		});
		assert.deepStrictEqual(states, disabledReasons.map(() => ({ shown: true, actions: [], instructions: false })));
	});

	test('Agents keeps its update context without touching banners on startup, late changes or recovery', () => {
		const { service, setError, setUpdate } = createService(error);
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const contexts = new MockContextKeyService();
		const bannerCalls: string[] = [];
		const contribution = store.add(new ManagedSettingsUpdateContribution(service, configuration, contexts, new class extends mock<IBannerService>() {
			override show() { bannerCalls.push('show'); }
			override hide() { bannerCalls.push('hide'); }
		}(), new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly isSessionsWindow = true;
		}()));
		const visible = () => ManagedSettingsUpdateRequiredContext.getValue(contexts);
		const states = [visible()];
		setUpdate(State.Disabled(DisablementReason.Policy));
		states.push(visible());
		setError(null);
		states.push(visible());
		setError(error);
		states.push(visible());
		contribution.dispose();
		states.push(visible());
		assert.deepStrictEqual({ bannerCalls, states }, { bannerCalls: [], states: [true, true, false, true, false] });
	});

	test('accessibility help uses the concise requirement and restores focus without claiming a usable composer', () => {
		const { service, setError } = createService(error);
		const services = store.add(new TestInstantiationService());
		services.stub(IManagedSettingsUpdateService, service);
		services.stub(IWorkbenchEnvironmentService, editorEnvironment);
		const target = append(mainWindow.document.body, $('button', undefined, 'Update'));
		store.add(toDisposable(() => target.remove()));
		target.focus();
		const help = AccessibleViewRegistry.getImplementations().find(implementation => implementation.name === 'managedSettingsUpdate')!;
		const provider = store.add(services.invokeFunction(accessor => help.getProvider(accessor))!);
		const text = provider.provideContent();
		target.blur();
		provider.onClose();
		setError(null);
		assert.deepStrictEqual({
			title: text.includes('Update required by your organization'),
			requirement: text.includes('Your organization requires Code - Insiders 1.141.0 or later to use AI features.'),
			installed: text.includes('Installed: 1.139.0'),
			keyboard: text.includes('Use Tab or Shift+Tab'),
			readOnly: text.includes('Chat is read-only'),
			bannerHelp: text.includes('Focus Banner'),
			focused: mainWindow.document.activeElement === target,
			cleared: services.invokeFunction(accessor => help.getProvider(accessor)),
		}, { title: true, requirement: true, installed: true, keyboard: true, readOnly: true, bannerHelp: true, focused: true, cleared: undefined });
	});

	test('Agents accessibility help describes recovery without suggesting a nonexistent banner', () => {
		const { service } = createService(error);
		const services = store.add(new TestInstantiationService());
		services.stub(IManagedSettingsUpdateService, service);
		services.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly isSessionsWindow = true;
		}());
		const help = AccessibleViewRegistry.getImplementations().find(implementation => implementation.name === 'managedSettingsUpdate')!;
		const provider = store.add(services.invokeFunction(accessor => help.getProvider(accessor))!);
		const text = provider.provideContent();
		assert.deepStrictEqual({
			requirement: text.includes('Your organization requires Code - Insiders 1.141.0 or later to use AI features.'),
			keyboard: text.includes('Use Tab or Shift+Tab'),
			bannerHelp: text.includes('banner'),
			blockedOverlay: text.includes('The Agents window is blocked') && text.includes('The overlay explains'),
			readOnlyChat: text.includes('Chat is read-only'),
		}, { requirement: true, keyboard: true, bannerHelp: false, blockedOverlay: true, readOnlyChat: false });
	});

	for (const isSessionsWindow of [false, true]) {
		test(`accessibility help omits nonexistent update actions in ${isSessionsWindow ? 'Agents' : 'editor'} when updates are disabled`, () => {
			const { service, setUpdate } = createService(error);
			setUpdate(State.Disabled(DisablementReason.Policy));
			const services = store.add(new TestInstantiationService());
			services.stub(IManagedSettingsUpdateService, service);
			services.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
				override readonly isSessionsWindow = isSessionsWindow;
			}());
			const help = AccessibleViewRegistry.getImplementations().find(implementation => implementation.name === 'managedSettingsUpdate')!;
			const provider = store.add(services.invokeFunction(accessor => help.getProvider(accessor))!);
			const text = provider.provideContent();
			assert.deepStrictEqual({
				updateAction: text.includes('The available update action is'),
				editorWindowAction: text.includes('reach Open Editor Window'),
				administrator: text.includes('Contact your administrator for an approved update.'),
			}, { updateAction: false, editorWindowAction: isSessionsWindow, administrator: true });
		});
	}

	for (const isSessionsWindow of [false, true]) {
		test(`help describes the ${isSessionsWindow ? 'Agents overlay' : 'Chat notice'} and only currently available actions`, () => {
			const { service, setUpdate } = createService(error);
			const services = store.add(new TestInstantiationService());
			services.stub(IManagedSettingsUpdateService, service);
			services.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
				override readonly isSessionsWindow = isSessionsWindow;
			}());
			const help = AccessibleViewRegistry.getImplementations().find(implementation => implementation.name === 'managedSettingsUpdate')!;
			const states = [idle, State.Downloading(update, true, false), State.Uninitialized, State.Disabled(DisablementReason.Policy)];
			assert.deepStrictEqual(states.map(state => {
				setUpdate(state);
				const provider = store.add(services.invokeFunction(accessor => help.getProvider(accessor))!);
				const text = provider.provideContent();
				return {
					overlay: text.includes('The Agents window is blocked'),
					readOnlyChat: text.includes('Chat is read-only'),
					availableActions: text.includes('move between available actions'),
					updateAction: text.includes('The available update action is Check for Updates.'),
					editorWindow: text.includes('reach Open Editor Window'),
					banner: text.includes('Focus Banner'),
				};
			}), states.map((_, index) => ({
				overlay: isSessionsWindow,
				readOnlyChat: !isSessionsWindow,
				availableActions: true,
				updateAction: index === 0,
				editorWindow: isSessionsWindow,
				banner: !isSessionsWindow,
			})));
		});
	}
});
