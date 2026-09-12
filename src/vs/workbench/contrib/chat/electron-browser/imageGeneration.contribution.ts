/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { GenerateImageTool, GenerateImageToolData } from '../browser/imageGeneration/generateImageTool.js';
import { ImageGenerationCredentialsService } from '../browser/imageGeneration/imageGenerationCredentials.js';
import { MaiImageGenerationService } from '../browser/imageGeneration/maiImageGenerationService.js';
import { IImageGenerationCredentialsService, IImageGenerationService, imageGenerationConfiguration, ImageGenerationHasStoredData } from '../common/imageGeneration.js';
import { ILanguageModelToolsService } from '../common/tools/languageModelToolsService.js';
import '../browser/imageGeneration/imageGenerationActions.js';

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(imageGenerationConfiguration);

registerSingleton(IImageGenerationCredentialsService, ImageGenerationCredentialsService, InstantiationType.Delayed);
registerSingleton(IImageGenerationService, MaiImageGenerationService, InstantiationType.Delayed);

class ImageGenerationContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.imageGeneration';

	constructor(
		@IImageGenerationCredentialsService credentialsService: IImageGenerationCredentialsService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const tool = instantiationService.createInstance(GenerateImageTool);
		const registration = this._register(new MutableDisposable());
		const hasStoredData = ImageGenerationHasStoredData.bindTo(contextKeyService);
		this._register(toDisposable(() => hasStoredData.reset()));
		const update = () => {
			hasStoredData.set(credentialsService.hasStoredData);
			if (credentialsService.configuration && !chatEntitlementService.sentiment.hidden) {
				if (!registration.value) {
					registration.value = toolsService.registerTool(GenerateImageToolData, tool);
				}
			} else {
				registration.clear();
			}
		};
		this._register(credentialsService.onDidChangeConfiguration(update));
		this._register(chatEntitlementService.onDidChangeSentiment(update));
		update();
	}
}

registerWorkbenchContribution2(ImageGenerationContribution.ID, ImageGenerationContribution, WorkbenchPhase.AfterRestored);
