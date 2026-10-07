/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { type CustomizationMarketplaceInstallation } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';

export type CustomizationMarketplaceInstallSurface = 'marketplace' | 'available';
export type CustomizationMarketplaceInstallType = 'skill' | 'mcpServer' | 'plugin' | 'connector' | 'unknown';
export type CustomizationMarketplaceInstallKind = CustomizationMarketplaceInstallation['kind'] | 'unknown';

export interface ICustomizationMarketplaceInstallTelemetryContext {
	readonly surface: CustomizationMarketplaceInstallSurface;
	readonly customizationType: CustomizationMarketplaceInstallType;
	readonly installKind: CustomizationMarketplaceInstallKind;
}

export type AvailableCustomizationMarketplaceInstallType = 'mcpServer' | 'plugin';

type CustomizationMarketplaceInstallEvent = ICustomizationMarketplaceInstallTelemetryContext & {
	outcome: 'success' | 'error' | 'cancelled';
	durationMs: number;
};

type CustomizationMarketplaceInstallClassification = {
	owner: 'pwang347';
	comment: 'Tracks customization installation outcomes across the unified marketplace and legacy Available sections without collecting customization identifiers or content.';
	surface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether installation started from the unified customization marketplace or a legacy Available section.' };
	customizationType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded customization category: skill, MCP server, plugin, connector, or unknown.' };
	installKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded installation mechanism supplied by the validated marketplace resource, or unknown.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether installation succeeded, failed, or was cancelled.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Installation duration in milliseconds.' };
};

/** Maps validated marketplace installation provenance to bounded telemetry categories. */
export function getCustomizationMarketplaceInstallTelemetryContext(
	surface: CustomizationMarketplaceInstallSurface,
	installation: CustomizationMarketplaceInstallation | undefined,
): ICustomizationMarketplaceInstallTelemetryContext {
	if (!installation) {
		return { surface, customizationType: 'unknown', installKind: 'unknown' };
	}
	switch (installation.kind) {
		case 'skill':
			return { surface, customizationType: 'skill', installKind: installation.kind };
		case 'mcp':
		case 'mcpGallery':
			return { surface, customizationType: 'mcpServer', installKind: installation.kind };
		case 'plugin':
		case 'configuredPlugin':
			return { surface, customizationType: 'plugin', installKind: installation.kind };
		case 'copilotConnector':
			return { surface, customizationType: 'connector', installKind: installation.kind };
	}
}

/** Returns the categories corresponding to the legacy MCP and plugin Available sections. */
export function getAvailableCustomizationMarketplaceInstallTelemetryContext(
	customizationType: AvailableCustomizationMarketplaceInstallType,
): ICustomizationMarketplaceInstallTelemetryContext {
	return customizationType === 'mcpServer'
		? { surface: 'available', customizationType, installKind: 'mcpGallery' }
		: { surface: 'available', customizationType, installKind: 'configuredPlugin' };
}

/** Runs an installation and emits one outcome event without including error or resource content. */
export async function runCustomizationMarketplaceInstallWithTelemetry(
	telemetryService: ITelemetryService,
	context: ICustomizationMarketplaceInstallTelemetryContext,
	operation: () => Promise<void>,
	token: CancellationToken = CancellationToken.None,
): Promise<void> {
	const stopWatch = StopWatch.create(true);
	try {
		await operation();
		telemetryService.publicLog2<CustomizationMarketplaceInstallEvent, CustomizationMarketplaceInstallClassification>('chatCustomizationMarketplace.install', {
			...context,
			outcome: 'success',
			durationMs: stopWatch.elapsed(),
		});
	} catch (error) {
		telemetryService.publicLog2<CustomizationMarketplaceInstallEvent, CustomizationMarketplaceInstallClassification>('chatCustomizationMarketplace.install', {
			...context,
			outcome: token.isCancellationRequested || isCancellationError(error) ? 'cancelled' : 'error',
			durationMs: stopWatch.elapsed(),
		});
		throw error;
	}
}
