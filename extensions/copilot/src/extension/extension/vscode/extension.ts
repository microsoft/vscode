/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { commands, env, ExtensionContext, ExtensionMode, l10n as vscodeL10n } from 'vscode';
import { isScenarioAutomation } from '../../../platform/env/common/envService';
import { isProduction } from '../../../platform/env/common/packagejson';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ChatExtGlobalPerfMark, markChatExtGlobal } from '../../../util/common/performance';
import { IInstantiationServiceBuilder, InstantiationServiceBuilder } from '../../../util/common/services';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotExtensionApi } from '../../api/vscode/extensionApi';
import { ContributionCollection, IExtensionContributionFactory } from '../../common/contributions';

// ##################################################################################
// ###                                                                            ###
// ###  Shared extension activation code for both web and node.js extension host. ###
// ###                                                                            ###
// ###    !!! Prefer to add code in HERE to support all extension runtimes !!!    ###
// ###                                                                            ###
// ##################################################################################

export interface IExtensionActivationConfiguration {
	context: ExtensionContext;
	contributions: IExtensionContributionFactory[];
	registerServices: (builder: IInstantiationServiceBuilder, extensionContext: ExtensionContext) => void;
	configureDevPackages?: Function;
	forceActivation?: boolean;
}

export async function baseActivate(configuration: IExtensionActivationConfiguration) {
	markChatExtGlobal(ChatExtGlobalPerfMark.WillActivate);
	const context = configuration.context;
	if (context.extensionMode === ExtensionMode.Test && !configuration.forceActivation && !isScenarioAutomation) {
		// FIXME Running in tests, don't activate the extension
		// Avoid bundling the extension code in the test bundle
		return context;
	}

	// Check if the extension is running in a pre-release version of VS Code
	const isStableVsCode = !(env.appName.includes('Insiders') || env.appName.includes('Exploration') || env.appName.includes('OSS'));
	const showSwitchToReleaseViewCtxKey = 'github.copilot.interactiveSession.switchToReleaseChannel';
	if (context.extension.packageJSON.isPreRelease && isStableVsCode) {
		// Prevent activation of the extension if the user is using a pre-release version in stable VS Code
		commands.executeCommand('setContext', showSwitchToReleaseViewCtxKey, true);
		return context;
	} else {
		commands.executeCommand('setContext', showSwitchToReleaseViewCtxKey, undefined);
	}

	if (vscodeL10n.bundle) {
		l10n.config({ contents: vscodeL10n.bundle });
	}

	if (!isProduction) {
		// Must do this before creating all the services which may rely on keys from .env
		configuration.configureDevPackages?.();
	}

	const instantiationService = createInstantiationService(configuration);

	await instantiationService.invokeFunction(async accessor => {
		const expService = accessor.get(IExperimentationService);

		// Await intialization of exp service. This ensure cache is fresh.
		// It will then auto refresh every 30 minutes after that.
		await expService.hasTreatments();

		// THIS is awaited because some contributions can block activation
		// via `IExtensionContribution#activationBlocker`
		const contributions = instantiationService.createInstance(ContributionCollection, configuration.contributions);
		context.subscriptions.push(contributions);
		await contributions.waitForActivationBlockers();
	});

	if (ExtensionMode.Test === context.extensionMode && !isScenarioAutomation) {
		return instantiationService; // The returned accessor is used in tests
	}

	const result = {
		getAPI(version: number) {
			if (version > CopilotExtensionApi.version) {
				throw new Error('Invalid Copilot Chat extension API version. Please upgrade Copilot Chat.');
			}

			return instantiationService.createInstance(CopilotExtensionApi);
		}
	};
	markChatExtGlobal(ChatExtGlobalPerfMark.DidActivate);
	return result;
}

export function createInstantiationService(configuration: IExtensionActivationConfiguration): IInstantiationService {
	const accessor = new InstantiationServiceBuilder();

	configuration.registerServices(accessor, configuration.context);

	const instantiationService = accessor.seal();
	configuration.context.subscriptions.push(instantiationService);

	instantiationService.invokeFunction(accessor => {

		// Does the initial read of ignore files, but don't block
		accessor.get(IIgnoreService).init();
	});

	return instantiationService;
}
