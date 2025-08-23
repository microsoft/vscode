// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { IServiceManager } from '../ioc/types';
import { ExtensionActivationManager } from './activationManager';
import { ExtensionSurveyPrompt } from './extensionSurvey';
import { LanguageServerOutputChannel } from './common/outputChannel';
import {
    IExtensionActivationManager,
    IExtensionActivationService,
    IExtensionSingleActivationService,
    ILanguageServerOutputChannel,
} from './types';
import { LoadLanguageServerExtension } from './common/loadLanguageServerExtension';
import { PartialModeStatusItem } from './partialModeStatus';
import { ILanguageServerWatcher } from '../languageServer/types';
import { LanguageServerWatcher } from '../languageServer/watcher';
import { RequirementsTxtLinkActivator } from './requirementsTxtLinkActivator';

export function registerTypes(serviceManager: IServiceManager): void {
    serviceManager.addSingleton<IExtensionActivationService>(IExtensionActivationService, PartialModeStatusItem);
    serviceManager.add<IExtensionActivationManager>(IExtensionActivationManager, ExtensionActivationManager);
    serviceManager.addSingleton<ILanguageServerOutputChannel>(
        ILanguageServerOutputChannel,
        LanguageServerOutputChannel,
    );
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        ExtensionSurveyPrompt,
    );
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        LoadLanguageServerExtension,
    );

    serviceManager.addSingleton<ILanguageServerWatcher>(ILanguageServerWatcher, LanguageServerWatcher);
    serviceManager.addBinding(ILanguageServerWatcher, IExtensionActivationService);

    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        RequirementsTxtLinkActivator,
    );
}
