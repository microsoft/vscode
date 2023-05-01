/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { StartupProfiler } from './startupProfiler';
import { NativeStartupTimings } from './startupTimings';
import { RendererProfiling } from 'vs/workbench/contrib/performance/electron-sandbox/rendererAutoProfiler';
import { IConfigurationRegistry, Extensions as ConfigExt } from 'vs/platform/configuration/common/configurationRegistry';
import { localize } from 'vs/nls';
import { applicationConfigurationNodeBase } from 'vs/workbench/common/configuration';

// -- auto profiler

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
	NativeStartupTimings,
	LifecyclePhase.Eventually
);

Registry.as<IConfigurationRegistry>(ConfigExt.Configuration).registerConfiguration({
	...applicationConfigurationNodeBase,
	'properties': {
		'application.experimental.rendererProfiling': {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			markdownDescription: localize('experimental.rendererProfiling', "When enabled slow renderers are automatically profiled")
		}
	}
});
