/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../../base/browser/dom.js';
import { Action } from '../../../../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue } from '../../../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ExtensionIdentifier } from '../../../../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { IManagedSettingsService } from '../../../../../../../../platform/policy/common/copilotManagedSettings.js';
import { IProductService } from '../../../../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../../platform/telemetry/common/telemetry.js';
import { IUpdateService } from '../../../../../../../../platform/update/common/update.js';
import { IUriIdentityService } from '../../../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../../../services/environment/common/environmentService.js';
import { IChatPhoneInputPresenter, MobileChatInputCombinedPickerActionItem } from '../../../../../browser/widget/input/chatPhoneInputPresenter.js';
import { IModePickerDelegate } from '../../../../../browser/widget/input/modePickerActionItem.js';
import { IModelPickerDelegate } from '../../../../../browser/widget/input/modelPicker/modelPickerActionItem.js';
import { ModelPickerWidget } from '../../../../../browser/widget/input/modelPicker/modelPickerWidget.js';
import { IChatMode } from '../../../../../common/chatModes.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../common/languageModels.js';

function autoModel(fusion = false): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: 'agent-host-copilotcli:auto',
		metadata: {
			extension: new ExtensionIdentifier('test.extension'),
			id: 'auto',
			name: fusion ? 'Copilot Fusion' : 'Auto',
			vendor: 'agent-host-copilotcli',
			modelGroup: { id: 'copilotcli' },
			version: '1',
			family: 'auto',
			maxInputTokens: 0,
			maxOutputTokens: 0,
			isDefaultForLocation: {},
			autoModelFusion: fusion,
			configurationSchema: {
				properties: {
					tier: {
						type: 'string',
						group: 'navigation',
						title: fusion ? 'Effort Level' : 'Optimize for',
						enum: fusion ? ['balance', 'hydrafusion'] : ['efficiency', 'balance'],
						enumItemLabels: fusion ? ['Standard', 'High'] : ['Efficiency', 'Balance'],
						default: fusion ? 'balance' : 'efficiency',
					},
				},
			},
		},
	};
}

suite('Model picker startup rendering', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createPickers(initial?: ILanguageModelChatMetadataAndIdentifier, live = false) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const changes = disposables.add(new Emitter<string>());
		const registered = new Map<string, ILanguageModelChatMetadataAndIdentifier['metadata']>();
		if (initial && live) {
			registered.set(initial.identifier, initial.metadata);
		}
		let models = initial ? [initial] : [];
		const selected = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('selected', initial);
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(IOpenerService, {});
		instantiationService.stub(ITelemetryService, {});
		instantiationService.stub(ILanguageModelsService, {
			onDidChangeLanguageModels: changes.event,
			getLanguageModelIds: () => [...registered.keys()],
			lookupLanguageModel: identifier => registered.get(identifier),
			getVendors: () => [],
			getModelsControlManifest: () => ({ free: {}, paid: {} }),
			getModelConfiguration: () => undefined,
		});
		instantiationService.stub(IProductService, { version: '1.147.0' });
		instantiationService.stub(IChatEntitlementService, {
			entitlement: ChatEntitlement.Pro,
			anonymous: false,
			hasByokModels: false,
			onDidChangeUsageBasedBilling: Event.None,
			onDidChangeEntitlement: Event.None,
			onDidChangeSentiment: Event.None,
			onDidChangeAnonymous: Event.None,
		});
		instantiationService.stub(IUpdateService, {});
		instantiationService.stub(IUriIdentityService, {});
		instantiationService.stub(IDefaultAccountService, {});
		instantiationService.stub(IWorkspaceTrustManagementService, {
			workspaceTrustInitialized: Promise.resolve(),
			isWorkspaceTrusted: () => true,
			onDidChangeTrust: Event.None,
		});
		instantiationService.stub(IWorkspaceTrustRequestService, {});
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IInstantiationService, instantiationService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IWorkbenchEnvironmentService, {});
		instantiationService.stub(IManagedSettingsService, { onDidChangeManagedSettings: Event.None });
		instantiationService.stub(IChatPhoneInputPresenter, {});

		const delegate: IModelPickerDelegate = {
			currentModel: selected,
			getModels: () => models,
			setModel: value => selected.set(value, undefined),
			getPresentationOptions: () => ({ showAutoModel: true, showManageModelsAction: false, showUnavailableFeatured: false, showModelIcon: false }),
		};
		const container = dom.append(document.body, dom.$('div'));
		disposables.add(toDisposable(() => container.remove()));
		const desktop = disposables.add(instantiationService.createInstance(ModelPickerWidget, delegate));
		disposables.add(autorun(reader => desktop.setSelectedModel(selected.read(reader))));
		desktop.render(dom.append(container, dom.$('div')));
		const mode = upcastPartial<IChatMode>({ label: constObservable('Agent'), icon: constObservable(undefined) });
		const modeDelegate = upcastPartial<IModePickerDelegate>({ currentMode: constObservable(mode) });
		const action = disposables.add(new Action('test.models', 'Models'));
		const phone = disposables.add(instantiationService.createInstance(MobileChatInputCombinedPickerActionItem, action, modeDelegate, delegate));
		const phoneContainer = dom.append(container, dom.$('div'));
		phone.render(phoneContainer);

		return {
			publish(model: ILanguageModelChatMetadataAndIdentifier) {
				models = [model];
				registered.set(model.identifier, model.metadata);
				selected.set(model, undefined);
				changes.fire(model.metadata.vendor);
			},
			read() {
				const configuration = desktop.domNode?.querySelector<HTMLElement>('.model-picker-config');
				const phoneTrigger = phoneContainer.querySelector<HTMLElement>('.chat-phone-input-chip');
				return {
					desktop: desktop.nameButton?.textContent,
					desktopAria: desktop.nameButton?.ariaLabel,
					configuration: configuration?.style.display === 'none' ? undefined : configuration?.textContent,
					phone: phoneTrigger?.querySelector('.chat-input-picker-label')?.textContent,
					phoneAria: phoneTrigger?.ariaLabel,
				};
			},
		};
	}

	const pending = {
		desktop: 'Copilot Fusion',
		desktopAria: 'Models, Copilot Fusion',
		configuration: undefined,
		phone: 'Copilot Fusion',
		phoneAria: 'Pick Mode and Model, Agent, Copilot Fusion',
	};

	test('empty startup names Copilot Fusion without an effort readout', () => {
		assert.deepStrictEqual(createPickers().read(), pending);
	});

	test('cached legacy Auto hides Efficiency until live Fusion metadata arrives', () => {
		const pickers = createPickers(autoModel());
		const beforeDiscovery = pickers.read();
		pickers.publish(autoModel(true));
		assert.deepStrictEqual({ beforeDiscovery, afterDiscovery: pickers.read() }, {
			beforeDiscovery: pending,
			afterDiscovery: { ...pending, configuration: 'Standard' },
		});
	});

	test('live legacy Auto keeps its provider name and configuration', () => {
		assert.deepStrictEqual(createPickers(autoModel(), true).read(), {
			desktop: 'Auto',
			desktopAria: 'Models, Auto',
			configuration: 'Efficiency',
			phone: 'Auto',
			phoneAria: 'Pick Mode and Model, Agent, Auto',
		});
	});

	test('a cached user-provided model named auto is not presented as Fusion', () => {
		const auto = autoModel();
		const custom = {
			...auto,
			identifier: 'custom/auto',
			metadata: { ...auto.metadata, vendor: 'custom', modelGroup: { id: 'custom' }, name: 'My Auto' },
		};
		assert.deepStrictEqual(createPickers(custom).read(), {
			desktop: 'My Auto',
			desktopAria: 'Models, My Auto',
			configuration: 'Efficiency',
			phone: 'My Auto',
			phoneAria: 'Pick Mode and Model, Agent, My Auto',
		});
	});
});
