/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../base/common/errors.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { EnablementState } from '../../../services/extensionManagement/common/extensionManagement.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';

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

