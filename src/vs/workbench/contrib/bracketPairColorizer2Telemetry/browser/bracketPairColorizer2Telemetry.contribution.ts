/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { EnablementState } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class BracketPairColorizer2TelemetryContribution {
	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		this.init().catch(onUnexpectedError);
	}

	private async init(): Promise<void> {
		const bracketPairColorizerId = 'coenraads.bracket-pair-colorizer-2';

		await this.extensionsWorkbenchService.queryLocal();
		const extension = this.extensionsWorkbenchService.installed.find(e => e.identifier.id === bracketPairColorizerId);
		if (
			!extension ||
			((extension.enablementState !== EnablementState.EnabledGlobally) &&
				(extension.enablementState !== EnablementState.EnabledWorkspace))
		) {
			return;
		}

		const nativeBracketPairColorizationEnabledKey = 'editor.bracketPairColorization.enabled';
		const nativeColorizationEnabled = !!this.configurationService.getValue(nativeBracketPairColorizationEnabledKey);

		type BracketPairColorizer2InstalledClassification = {
			owner: 'hediet';
			nativeColorizationEnabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether or not built-in bracket pair colorization is being used' };
			comment: 'We use this to understand how many users have the bracket pair colorizer extension installed (and how many of them have native bracket pair colorization enabled), as the extension does not do anything if native bracket pair colorization is enabled.';
		};
		type BracketPairColorizer2Event = {
			nativeColorizationEnabled: boolean;
		};
		this.telemetryService.publicLog2<BracketPairColorizer2Event, BracketPairColorizer2InstalledClassification>('bracketPairColorizerTwoUsage', {
			nativeColorizationEnabled
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BracketPairColorizer2TelemetryContribution, LifecyclePhase.Restored);

