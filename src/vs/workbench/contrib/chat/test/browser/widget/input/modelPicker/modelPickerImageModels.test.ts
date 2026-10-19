/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { CopilotImageGenerationModelSettingId } from '../../../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { ICommandService } from '../../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUpdateService, StateType } from '../../../../../../../../platform/update/common/update.js';
import { IUriIdentityService } from '../../../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../../services/chat/common/chatEntitlementService.js';
import { TestChatEntitlementService, TestWorkspaceTrustManagementService } from '../../../../../../../test/common/workbenchTestServices.js';
import { ConfigurationModelPickerImageModels, ModelPickerImageModelsSettingId } from '../../../../../browser/widget/input/modelPicker/modelPickerImageModels.js';
import { ITabbedModelPickerContext, ITabbedModelPickerHideEvent, TabbedModelPicker } from '../../../../../browser/widget/input/modelPicker/modelPickerTabbedWidget.js';
import { ModelPickerWidget } from '../../../../../browser/widget/input/modelPicker/modelPickerWidget.js';
import { SessionType } from '../../../../../common/chatSessionsService.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../common/languageModels.js';
import { NullLanguageModelsService } from '../../../../common/languageModels.js';

suite('ModelPickerImageModels', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** A configuration service whose writes are recorded and then read back, as the real one does once saved. */
	function createConfigurationService(values: Record<string, unknown>) {
		const writes: [string, unknown][] = [];
		const configurationService = new class extends TestConfigurationService {
			override updateValue(key: string, value: unknown): Promise<void> {
				writes.push([key, value]);
				return this.setUserConfiguration(key, value);
			}
		}(values);
		return { configurationService, writes };
	}

	test('lists every image model choice and reads and writes the image model setting', () => {
		const { configurationService, writes } = createConfigurationService({ [CopilotImageGenerationModelSettingId]: 'off' });
		const imageModels = new ConfigurationModelPickerImageModels(configurationService);
		const before = imageModels.selectedModelId.get();
		imageModels.select('gpt-image-2.5-flare');

		assert.deepStrictEqual({
			models: imageModels.models.map(model => [model.id, model.label]),
			before,
			writes,
			after: imageModels.selectedModelId.get(),
		}, {
			models: [['off', 'Off'], ['gpt-image-2.5-flare', 'GPT Image 2.5 Flare']],
			before: 'off',
			writes: [[CopilotImageGenerationModelSettingId, 'gpt-image-2.5-flare']],
			after: 'gpt-image-2.5-flare',
		});
	});

	test('the picker offers image models only while the setting is on for a local Copilot Agent Host chat', () => {
		const model: ILanguageModelChatMetadataAndIdentifier = {
			identifier: 'copilot/first',
			metadata: upcastPartial<ILanguageModelChatMetadata>({ id: 'first', name: 'First', vendor: 'copilot', family: 'first', version: '1', isDefaultForLocation: {} }),
		};
		const offered = (settingEnabled: boolean | undefined, sessionType: string): boolean => {
			let shown: ITabbedModelPickerContext | undefined;
			const instantiationService = store.add(new TestInstantiationService());
			// The widget only opens the tabbed picker; record the context it is given.
			const onDidHide = store.add(new Emitter<ITabbedModelPickerHideEvent>());
			instantiationService.stubInstance(TabbedModelPicker, {
				onDidHide: onDidHide.event,
				get isVisible() { return !!shown; },
				show: (_anchor: HTMLElement, context: ITabbedModelPickerContext) => { shown = context; },
				hide: () => { shown = undefined; },
				setSelectedModel: () => { },
				setLocalModels: () => { },
				dispose: () => { },
			});
			instantiationService.stub(ICommandService, {});
			instantiationService.stub(IOpenerService, {});
			instantiationService.stub(ITelemetryService, NullTelemetryService);
			instantiationService.stub(ILanguageModelsService, new class extends NullLanguageModelsService {
				override getLanguageModelIds() { return [model.identifier]; }
			}());
			instantiationService.stub(IProductService, { version: '1.100.0' });
			const entitlementService = new TestChatEntitlementService();
			entitlementService.entitlement = ChatEntitlement.Pro;
			instantiationService.stub(IChatEntitlementService, entitlementService);
			instantiationService.stub(IUpdateService, { state: { type: StateType.Uninitialized } });
			instantiationService.stub(IUriIdentityService, {});
			instantiationService.stub(IDefaultAccountService, { resolveGitHubUrl: () => undefined });
			instantiationService.stub(IWorkspaceTrustManagementService, store.add(new TestWorkspaceTrustManagementService()));
			instantiationService.stub(IWorkspaceTrustRequestService, {});
			instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
			instantiationService.stub(IConfigurationService, createConfigurationService({ [ModelPickerImageModelsSettingId]: settingEnabled }).configurationService);
			instantiationService.stub(IContextKeyService, new class extends MockContextKeyService { override contextMatchesRules() { return true; } }());
			const picker = store.add(instantiationService.createInstance(ModelPickerWidget, {
				currentModel: constObservable(model),
				setModel: () => { },
				getModels: () => [model],
				getSessionType: () => sessionType,
				getPresentationOptions: () => ({ showManageModelsAction: false, showUnavailableFeatured: false, showAutoModel: true, showModelIcon: false }),
			}));
			picker.show(upcastPartial<HTMLElement>({ closest: () => null }));
			return !!shown?.imageModels;
		};

		assert.deepStrictEqual({
			copilotAgentHost: offered(true, SessionType.AgentHostCopilot),
			settingOff: offered(false, SessionType.AgentHostCopilot),
			settingUnset: offered(undefined, SessionType.AgentHostCopilot),
			localHarness: offered(true, SessionType.Local),
			claudeAgentHost: offered(true, SessionType.AgentHostClaude),
		}, {
			copilotAgentHost: true,
			settingOff: false,
			settingUnset: false,
			localHarness: false,
			claudeAgentHost: false,
		});
	});
});
