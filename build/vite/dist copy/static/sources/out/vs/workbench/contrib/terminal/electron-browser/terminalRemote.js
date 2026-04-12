/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../../../../base/common/network.js';
import { localize2 } from '../../../../nls.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { registerTerminalAction } from '../browser/terminalActions.js';
import { IHistoryService } from '../../../services/history/common/history.js';
export function registerRemoteContributions() {
    registerTerminalAction({
        id: "workbench.action.terminal.newLocal" /* TerminalCommandId.NewLocal */,
        title: localize2('workbench.action.terminal.newLocal', 'Create New Integrated Terminal (Local)'),
        run: async (c, accessor) => {
            const historyService = accessor.get(IHistoryService);
            const remoteAuthorityResolverService = accessor.get(IRemoteAuthorityResolverService);
            const nativeEnvironmentService = accessor.get(INativeEnvironmentService);
            let cwd;
            try {
                const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot(Schemas.vscodeRemote);
                if (activeWorkspaceRootUri) {
                    const canonicalUri = await remoteAuthorityResolverService.getCanonicalURI(activeWorkspaceRootUri);
                    if (canonicalUri.scheme === Schemas.file) {
                        cwd = canonicalUri;
                    }
                }
            }
            catch { }
            if (!cwd) {
                cwd = nativeEnvironmentService.userHome;
            }
            const instance = await c.service.createTerminal({ cwd });
            if (!instance) {
                return Promise.resolve(undefined);
            }
            c.service.setActiveInstance(instance);
            return c.groupService.showPanel(true);
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxSZW1vdGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9lbGVjdHJvbi1icm93c2VyL3Rlcm1pbmFsUmVtb3RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU3RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDL0MsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDbkcsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDaEgsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFdkUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTlFLE1BQU0sVUFBVSwyQkFBMkI7SUFDMUMsc0JBQXNCLENBQUM7UUFDdEIsRUFBRSx1RUFBNEI7UUFDOUIsS0FBSyxFQUFFLFNBQVMsQ0FBQyxvQ0FBb0MsRUFBRSx3Q0FBd0MsQ0FBQztRQUNoRyxHQUFHLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRTtZQUMxQixNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ3JELE1BQU0sOEJBQThCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1lBQ3JGLE1BQU0sd0JBQXdCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1lBQ3pFLElBQUksR0FBb0IsQ0FBQztZQUN6QixJQUFJLENBQUM7Z0JBQ0osTUFBTSxzQkFBc0IsR0FBRyxjQUFjLENBQUMsMEJBQTBCLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUMvRixJQUFJLHNCQUFzQixFQUFFLENBQUM7b0JBQzVCLE1BQU0sWUFBWSxHQUFHLE1BQU0sOEJBQThCLENBQUMsZUFBZSxDQUFDLHNCQUFzQixDQUFDLENBQUM7b0JBQ2xHLElBQUksWUFBWSxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7d0JBQzFDLEdBQUcsR0FBRyxZQUFZLENBQUM7b0JBQ3BCLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7WUFBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ1gsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUNWLEdBQUcsR0FBRyx3QkFBd0IsQ0FBQyxRQUFRLENBQUM7WUFDekMsQ0FBQztZQUNELE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBQ3pELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDZixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDbkMsQ0FBQztZQUVELENBQUMsQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDdEMsT0FBTyxDQUFDLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QyxDQUFDO0tBQ0QsQ0FBQyxDQUFDO0FBQ0osQ0FBQyJ9