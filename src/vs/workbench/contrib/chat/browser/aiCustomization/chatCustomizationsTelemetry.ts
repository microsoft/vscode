/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ChatCustomizationsLocation } from '../../common/customizationsLocation.js';

type CustomizationsLocation = ChatCustomizationsLocation | 'unknown';
type CustomizationsInteraction = 'buttonClicked' | 'hoverShown' | 'hoverInteracted';
export type CustomizationsHoverTarget = 'plugins' | 'mcpServers' | 'skills' | 'instructions' | 'hooks' | 'migrations' | 'mcpAuthentication' | 'browseAdditional' | 'locationSetting';

type CustomizationsInteractionEvent = {
	action: CustomizationsInteraction;
	location: Exclude<ChatCustomizationsLocation, 'auto'>;
	configuredLocation: CustomizationsLocation;
	windowKind: 'agents' | 'editor';
	target: CustomizationsHoverTarget | 'none';
};

type CustomizationsInteractionClassification = {
	owner: 'aeschli';
	comment: 'Tracks Customizations entry-point activations, visible hovers, and hover link activations without collecting link arguments or customization content.';
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the entry point was activated, its hover shown, or a hover link activated.' };
	location: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The code-defined placement of the invoking entry point.' };
	configuredLocation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded effective value of the Customizations location setting, including auto or unknown.' };
	windowKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the entry point belongs to the Agents window or editor window.' };
	target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The code-defined hover action category, or none for button activation and hover display.' };
};

type CustomizationsLocationChangedEvent = {
	previousLocation: CustomizationsLocation;
	location: CustomizationsLocation;
	windowKind: 'agents' | 'editor';
};

type CustomizationsLocationChangedClassification = {
	owner: 'aeschli';
	comment: 'Tracks changes to the Customizations location setting in user or application configuration, excluding default and experiment assignment changes.';
	previousLocation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous bounded value of the Customizations location setting.' };
	location: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new bounded value of the Customizations location setting.' };
	windowKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the change was observed in the Agents window or editor window.' };
};

export class ChatCustomizationsTelemetry {
	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
	) { }

	logInteraction(action: CustomizationsInteraction, location: Exclude<ChatCustomizationsLocation, 'auto'>, target: CustomizationsHoverTarget | 'none' = 'none'): void {
		this.telemetryService.publicLog2<CustomizationsInteractionEvent, CustomizationsInteractionClassification>('chatCustomizationEntryPoint.interaction', {
			action,
			location,
			configuredLocation: this.getConfiguredLocation(),
			windowKind: this.workspaceService.isSessionsWindow ? 'agents' : 'editor',
			target,
		});
	}

	observeLocationChanges(): IDisposable {
		let previousLocation = this.getConfiguredLocation();
		return this.configurationService.onDidChangeConfiguration(event => {
			if (!event.affectsConfiguration(ChatConfiguration.ChatCustomizationsLocation)) {
				return;
			}
			const location = this.getConfiguredLocation();
			const previous = previousLocation;
			previousLocation = location;
			if (previous === location || ![
				ConfigurationTarget.APPLICATION, ConfigurationTarget.USER, ConfigurationTarget.USER_LOCAL, ConfigurationTarget.USER_REMOTE,
			].includes(event.source)) {
				return;
			}
			this.telemetryService.publicLog2<CustomizationsLocationChangedEvent, CustomizationsLocationChangedClassification>('chatCustomizationEntryPoint.locationChanged', {
				previousLocation: previous,
				location,
				windowKind: this.workspaceService.isSessionsWindow ? 'agents' : 'editor',
			});
		});
	}

	private getConfiguredLocation(): CustomizationsLocation {
		const location = this.configurationService.getValue<string>(ChatConfiguration.ChatCustomizationsLocation);
		switch (location) {
			case 'auto':
			case 'sidebar':
			case 'sessionsHeader':
			case 'chatToolbar':
			case 'chatInput':
				return location;
			default:
				return 'unknown';
		}
	}
}
