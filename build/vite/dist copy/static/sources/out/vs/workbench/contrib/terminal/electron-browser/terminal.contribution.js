/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-browser/services.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ILocalPtyService, TerminalIpcChannels } from '../../../../platform/terminal/common/terminal.js';
import { Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ITerminalProfileResolverService } from '../common/terminal.js';
import { TerminalNativeContribution } from './terminalNativeContribution.js';
import { ElectronTerminalProfileResolverService } from './terminalProfileResolverService.js';
import { LocalTerminalBackendContribution } from './localTerminalBackend.js';
// Register services
registerMainProcessRemoteService(ILocalPtyService, TerminalIpcChannels.LocalPty);
registerSingleton(ITerminalProfileResolverService, ElectronTerminalProfileResolverService, 1 /* InstantiationType.Delayed */);
// Register workbench contributions
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
// This contribution needs to be active during the Startup phase to be available when a remote resolver tries to open a local
// terminal while connecting to the remote.
registerWorkbenchContribution2(LocalTerminalBackendContribution.ID, LocalTerminalBackendContribution, 1 /* WorkbenchPhase.BlockStartup */);
workbenchRegistry.registerWorkbenchContribution(TerminalNativeContribution, 3 /* LifecyclePhase.Restored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvZWxlY3Ryb24tYnJvd3Nlci90ZXJtaW5hbC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN6RyxPQUFPLEVBQW1ELFVBQVUsSUFBSSxtQkFBbUIsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3RLLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ3hFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxzQ0FBc0MsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTdGLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRTdFLG9CQUFvQjtBQUNwQixnQ0FBZ0MsQ0FBQyxnQkFBZ0IsRUFBRSxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUNqRixpQkFBaUIsQ0FBQywrQkFBK0IsRUFBRSxzQ0FBc0Msb0NBQTRCLENBQUM7QUFFdEgsbUNBQW1DO0FBQ25DLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBa0MsbUJBQW1CLENBQUMsU0FBUyxDQUFDLENBQUM7QUFFdEcsNkhBQTZIO0FBQzdILDJDQUEyQztBQUMzQyw4QkFBOEIsQ0FBQyxnQ0FBZ0MsQ0FBQyxFQUFFLEVBQUUsZ0NBQWdDLHNDQUE4QixDQUFDO0FBQ25JLGlCQUFpQixDQUFDLDZCQUE2QixDQUFDLDBCQUEwQixrQ0FBMEIsQ0FBQyJ9