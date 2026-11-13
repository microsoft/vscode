/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { StartupProfiler } from './startupProfiler.js';
import { NativeStartupTimings } from './startupTimings.js';
import { RendererProfiling } from './rendererAutoProfiler.js';
import { IConfigurationRegistry, Extensions as ConfigExt } from '../../../../platform/configuration/common/configurationRegistry.js';
import { localize } from '../../../../nls.js';
import { applicationConfigurationNodeBase } from '../../../common/configuration.js';

// -- auto profiler

registerWorkbenchContribution2(RendererProfiling.ID, RendererProfiling, WorkbenchPhase.Eventually);

// -- startup profiler

registerWorkbenchContribution2(StartupProfiler.ID, StartupProfiler, WorkbenchPhase.AfterRestored);

// -- startup timings

registerWorkbenchContribution2(NativeStartupTimings.ID, NativeStartupTimings, WorkbenchPhase.Eventually);

Registry.as<IConfigurationRegistry>(ConfigExt.Configuration).registerConfiguration({
	...applicationConfigurationNodeBase,
	'properties': {
		'application.experimental.rendererProfiling': {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			markdownDescription: localize('experimental.rendererProfiling', "When enabled, slow renderers are automatically profiled."),
			experiment: {
				mode: 'startup'
			}
		}
	}
});
