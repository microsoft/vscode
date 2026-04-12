/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions } from '../../../common/contributions.js';
import { StartupProfiler } from './startupProfiler.js';
import { NativeStartupTimings } from './startupTimings.js';
import { RendererProfiling } from './rendererAutoProfiler.js';
import { Extensions as ConfigExt } from '../../../../platform/configuration/common/configurationRegistry.js';
import { localize } from '../../../../nls.js';
import { applicationConfigurationNodeBase } from '../../../common/configuration.js';
// -- auto profiler
Registry.as(Extensions.Workbench).registerWorkbenchContribution(RendererProfiling, 4 /* LifecyclePhase.Eventually */);
// -- startup profiler
Registry.as(Extensions.Workbench).registerWorkbenchContribution(StartupProfiler, 3 /* LifecyclePhase.Restored */);
// -- startup timings
Registry.as(Extensions.Workbench).registerWorkbenchContribution(NativeStartupTimings, 4 /* LifecyclePhase.Eventually */);
Registry.as(ConfigExt.Configuration).registerConfiguration({
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyZm9ybWFuY2UuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvcGVyZm9ybWFuY2UvZWxlY3Ryb24tYnJvd3Nlci9wZXJmb3JtYW5jZS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxVQUFVLEVBQW1DLE1BQU0sa0NBQWtDLENBQUM7QUFDL0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzNELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQzlELE9BQU8sRUFBMEIsVUFBVSxJQUFJLFNBQVMsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQ3JJLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUVwRixtQkFBbUI7QUFFbkIsUUFBUSxDQUFDLEVBQUUsQ0FBa0MsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLDZCQUE2QixDQUMvRixpQkFBaUIsb0NBRWpCLENBQUM7QUFFRixzQkFBc0I7QUFFdEIsUUFBUSxDQUFDLEVBQUUsQ0FBa0MsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLDZCQUE2QixDQUMvRixlQUFlLGtDQUVmLENBQUM7QUFFRixxQkFBcUI7QUFFckIsUUFBUSxDQUFDLEVBQUUsQ0FBa0MsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLDZCQUE2QixDQUMvRixvQkFBb0Isb0NBRXBCLENBQUM7QUFFRixRQUFRLENBQUMsRUFBRSxDQUF5QixTQUFTLENBQUMsYUFBYSxDQUFDLENBQUMscUJBQXFCLENBQUM7SUFDbEYsR0FBRyxnQ0FBZ0M7SUFDbkMsWUFBWSxFQUFFO1FBQ2IsNENBQTRDLEVBQUU7WUFDN0MsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsS0FBSztZQUNkLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQztZQUN0QixtQkFBbUIsRUFBRSxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsMERBQTBELENBQUM7WUFDM0gsVUFBVSxFQUFFO2dCQUNYLElBQUksRUFBRSxTQUFTO2FBQ2Y7U0FDRDtLQUNEO0NBQ0QsQ0FBQyxDQUFDIn0=