/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
export function parseTerminalUri(resource) {
    const [, workspaceId, instanceId] = resource.path.split('/');
    if (!workspaceId || !Number.parseInt(instanceId)) {
        throw new Error(`Could not parse terminal uri for resource ${resource}`);
    }
    return { workspaceId, instanceId: Number.parseInt(instanceId) };
}
export function getTerminalUri(workspaceId, instanceId, title, commandId) {
    const params = new URLSearchParams();
    if (commandId) {
        params.set('command', commandId);
    }
    return URI.from({
        scheme: Schemas.vscodeTerminal,
        path: `/${workspaceId}/${instanceId}`,
        fragment: title || undefined,
        query: commandId ? params.toString() : undefined
    });
}
export function getTerminalResourcesFromDragEvent(event) {
    const resources = event.dataTransfer?.getData("Terminals" /* TerminalDataTransfers.Terminals */);
    if (resources) {
        const json = JSON.parse(resources);
        const result = [];
        for (const entry of json) {
            result.push(URI.parse(entry));
        }
        return result.length === 0 ? undefined : result;
    }
    return undefined;
}
export function getInstanceFromResource(instances, resource) {
    if (resource) {
        for (const instance of instances) {
            // Note that the URI's workspace and instance id might not originally be from this window
            // Don't bother checking the scheme and assume instances only contains terminals
            if (instance.resource.path === resource.path) {
                return instance;
            }
        }
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxVcmkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsVXJpLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFTckQsTUFBTSxVQUFVLGdCQUFnQixDQUFDLFFBQWE7SUFDN0MsTUFBTSxDQUFDLEVBQUUsV0FBVyxFQUFFLFVBQVUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzdELElBQUksQ0FBQyxXQUFXLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFDbEQsTUFBTSxJQUFJLEtBQUssQ0FBQyw2Q0FBNkMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUMxRSxDQUFDO0lBQ0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO0FBQ2pFLENBQUM7QUFFRCxNQUFNLFVBQVUsY0FBYyxDQUFDLFdBQW1CLEVBQUUsVUFBa0IsRUFBRSxLQUFjLEVBQUUsU0FBa0I7SUFDekcsTUFBTSxNQUFNLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUNyQyxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQ2YsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUNELE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQztRQUNmLE1BQU0sRUFBRSxPQUFPLENBQUMsY0FBYztRQUM5QixJQUFJLEVBQUUsSUFBSSxXQUFXLElBQUksVUFBVSxFQUFFO1FBQ3JDLFFBQVEsRUFBRSxLQUFLLElBQUksU0FBUztRQUM1QixLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVM7S0FDaEQsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQVlELE1BQU0sVUFBVSxpQ0FBaUMsQ0FBQyxLQUF3QjtJQUN6RSxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsWUFBWSxFQUFFLE9BQU8sbURBQWlDLENBQUM7SUFDL0UsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUNmLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbkMsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBQ2xCLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxFQUFFLENBQUM7WUFDMUIsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDL0IsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO0lBQ2pELENBQUM7SUFDRCxPQUFPLFNBQVMsQ0FBQztBQUNsQixDQUFDO0FBRUQsTUFBTSxVQUFVLHVCQUF1QixDQUFnRCxTQUFjLEVBQUUsUUFBeUI7SUFDL0gsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUNkLEtBQUssTUFBTSxRQUFRLElBQUksU0FBUyxFQUFFLENBQUM7WUFDbEMseUZBQXlGO1lBQ3pGLGdGQUFnRjtZQUNoRixJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxLQUFLLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDOUMsT0FBTyxRQUFRLENBQUM7WUFDakIsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBQ0QsT0FBTyxTQUFTLENBQUM7QUFDbEIsQ0FBQyJ9