/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import type { IAgentHostCanvasPackage, IAgentHostCanvasPackagesService, ICanvasPackageSnapshot } from '../../common/agentHostCanvasPackages.js';
import { isCustomizationEnabled } from '../../common/customizationEnablement.js';
import { PluginFormat } from '../../../agentPlugins/common/pluginParsers.js';
import { CustomizationLoadStatus, CustomizationType, type PluginCustomization } from '../../common/state/sessionState.js';
import type { IAgentHostCustomizationEnablementService } from '../agentHostCustomizationEnablementService.js';
import { isCustomizationSdkEligible, resolveCustomizationEnablement } from '../shared/customizationEnablementGate.js';
import type { ICopilotPluginInfo } from './copilotAgent.js';

export function canvasPackageCustomization(item: IAgentHostCanvasPackage): PluginCustomization {
	return {
		type: CustomizationType.Plugin,
		id: `canvas-package:${item.id}`,
		uri: item.source,
		name: item.name,
		load: { kind: CustomizationLoadStatus.Loaded },
		children: [],
	};
}

/** Revalidates installed code and resolves scoped customization decisions without recopying code. */
export async function resolveCanvasPackagePlugins(
	packages: IAgentHostCanvasPackagesService,
	enablement: IAgentHostCustomizationEnablementService,
	session: URI,
	workspace: URI,
): Promise<readonly ICopilotPluginInfo[]> {
	await enablement.initializeSession(session.toString());
	const snapshots = await packages.getApprovedSnapshots(workspace);
	const installed = new Map(packages.list().map(item => [item.id, item]));
	const result: ICopilotPluginInfo[] = [];
	for (const snapshot of snapshots) {
		const item = installed.get(snapshot.packageId);
		if (!item || !isCanvasPackageEnabled(item, snapshot, packages, enablement, session, workspace)) {
			continue;
		}
		result.push({
			format: PluginFormat.Copilot,
			pluginDir: snapshot.pluginDirectory,
			sourceUri: URI.parse(item.source),
			hooks: [],
			mcpServers: [],
			skills: [],
			agents: [],
			instructions: [],
		});
	}
	return result;
}

export function isCanvasPackageEnabled(
	item: IAgentHostCanvasPackage,
	snapshot: ICanvasPackageSnapshot,
	packages: IAgentHostCanvasPackagesService,
	enablement: IAgentHostCustomizationEnablementService,
	session: URI,
	workspace: URI,
): boolean {
	if (!packages.isApproved(item.id, snapshot.revision, snapshot.workspace)) {
		return false;
	}
	const resolved = resolveCustomizationEnablement(enablement, session, [canvasPackageCustomization(item)], undefined, undefined, undefined, workspace);
	const customization = resolved.customizations[0];
	return customization.type === CustomizationType.Plugin && isCustomizationSdkEligible(resolved, customization) && isCustomizationEnabled(customization);
}
