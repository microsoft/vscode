/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { homedir, tmpdir } from 'os';
import { AbstractNativeEnvironmentService, parseDebugParams } from '../common/environmentService.js';
import { getUserDataPath } from './userDataPath.js';
export class NativeEnvironmentService extends AbstractNativeEnvironmentService {
    constructor(args, productService) {
        super(args, {
            homeDir: homedir(),
            tmpDir: tmpdir(),
            userDataDir: getUserDataPath(args, productService.nameShort)
        }, productService);
    }
}
export function parsePtyHostDebugPort(args, isBuilt) {
    return parseDebugParams(args['inspect-ptyhost'], args['inspect-brk-ptyhost'], 5877, isBuilt, args.extensionEnvironment);
}
export function parseAgentHostDebugPort(args, isBuilt) {
    return parseDebugParams(args['inspect-agenthost'], args['inspect-brk-agenthost'], 5878, isBuilt, args.extensionEnvironment);
}
export function parseSharedProcessDebugPort(args, isBuilt) {
    return parseDebugParams(args['inspect-sharedprocess'], args['inspect-brk-sharedprocess'], 5879, isBuilt, args.extensionEnvironment);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZW52aXJvbm1lbnQvbm9kZS9lbnZpcm9ubWVudFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFHckMsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDckcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBR3BELE1BQU0sT0FBTyx3QkFBeUIsU0FBUSxnQ0FBZ0M7SUFFN0UsWUFBWSxJQUFzQixFQUFFLGNBQStCO1FBQ2xFLEtBQUssQ0FBQyxJQUFJLEVBQUU7WUFDWCxPQUFPLEVBQUUsT0FBTyxFQUFFO1lBQ2xCLE1BQU0sRUFBRSxNQUFNLEVBQUU7WUFDaEIsV0FBVyxFQUFFLGVBQWUsQ0FBQyxJQUFJLEVBQUUsY0FBYyxDQUFDLFNBQVMsQ0FBQztTQUM1RCxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQ3BCLENBQUM7Q0FDRDtBQUVELE1BQU0sVUFBVSxxQkFBcUIsQ0FBQyxJQUFzQixFQUFFLE9BQWdCO0lBQzdFLE9BQU8sZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUN6SCxDQUFDO0FBRUQsTUFBTSxVQUFVLHVCQUF1QixDQUFDLElBQXNCLEVBQUUsT0FBZ0I7SUFDL0UsT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsRUFBRSxJQUFJLENBQUMsdUJBQXVCLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBQzdILENBQUM7QUFFRCxNQUFNLFVBQVUsMkJBQTJCLENBQUMsSUFBc0IsRUFBRSxPQUFnQjtJQUNuRixPQUFPLGdCQUFnQixDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7QUFDckksQ0FBQyJ9