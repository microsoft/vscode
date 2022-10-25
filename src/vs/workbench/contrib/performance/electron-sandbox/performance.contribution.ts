/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { StartupProfiler } from './startupProfiler';
import { StartupTimings } from './startupTimings';
import { RendererProfiling } from 'vs/workbench/contrib/performance/electron-sandbox/rendererAutoProfiler';
import { IConfigurationRegistry, Extensions as ConfigExt } from 'vs/platform/configuration/common/configurationRegistry';
import { localize } from 'vs/nls';


Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	RendererProfiling,
	LifecyclePhase.Eventually
);

// -- startup profiler

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	StartupProfiler,
	LifecyclePhase.Restored
);

// -- startup timings

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	StartupTimings,
	LifecyclePhase.Eventually
);

Registry.as<IConfigurationRegistry>(ConfigExt.Configuration).registerConfiguration({
	id: 'application',
	order: 100,
	type: 'object',
	'properties': {
		'application.experimental.rendererProfiling': {
			type: 'boolean',
			default: false,
			markdownDescription: localize('experimental.rendererProfiling', "When enabled slow renderers are automatically profiled")
		}
	}
});
