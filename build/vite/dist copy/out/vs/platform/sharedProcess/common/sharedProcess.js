/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export const SharedProcessLifecycle = {
    exit: 'vscode:electron-main->shared-process=exit',
    ipcReady: 'vscode:shared-process->electron-main=ipc-ready',
    initDone: 'vscode:shared-process->electron-main=init-done'
};
export const SharedProcessChannelConnection = {
    request: 'vscode:createSharedProcessChannelConnection',
    response: 'vscode:createSharedProcessChannelConnectionResult'
};
export const SharedProcessRawConnection = {
    request: 'vscode:createSharedProcessRawConnection',
    response: 'vscode:createSharedProcessRawConnectionResult'
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hhcmVkUHJvY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3NoYXJlZFByb2Nlc3MvY29tbW9uL3NoYXJlZFByb2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQUc7SUFDckMsSUFBSSxFQUFFLDJDQUEyQztJQUNqRCxRQUFRLEVBQUUsZ0RBQWdEO0lBQzFELFFBQVEsRUFBRSxnREFBZ0Q7Q0FDMUQsQ0FBQztBQUVGLE1BQU0sQ0FBQyxNQUFNLDhCQUE4QixHQUFHO0lBQzdDLE9BQU8sRUFBRSw2Q0FBNkM7SUFDdEQsUUFBUSxFQUFFLG1EQUFtRDtDQUM3RCxDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0sMEJBQTBCLEdBQUc7SUFDekMsT0FBTyxFQUFFLHlDQUF5QztJQUNsRCxRQUFRLEVBQUUsK0NBQStDO0NBQ3pELENBQUMifQ==