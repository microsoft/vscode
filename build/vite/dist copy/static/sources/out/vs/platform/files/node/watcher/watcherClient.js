/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FileAccess } from '../../../../base/common/network.js';
import { getNextTickChannel, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Client } from '../../../../base/parts/ipc/node/ipc.cp.js';
import { AbstractUniversalWatcherClient } from '../../common/watcher.js';
export class UniversalWatcherClient extends AbstractUniversalWatcherClient {
    constructor(onFileChanges, onLogMessage, verboseLogging) {
        super(onFileChanges, onLogMessage, verboseLogging);
        this.init();
    }
    createWatcher(disposables) {
        // Fork the universal file watcher and build a client around
        // its server for passing over requests and receiving events.
        const client = disposables.add(new Client(FileAccess.asFileUri('bootstrap-fork').fsPath, {
            serverName: 'File Watcher',
            args: ['--type=fileWatcher'],
            env: {
                VSCODE_ESM_ENTRYPOINT: 'vs/platform/files/node/watcher/watcherMain',
                VSCODE_PIPE_LOGGING: 'true',
                VSCODE_VERBOSE_LOGGING: 'true' // transmit console logs from server to client
            }
        }));
        // React on unexpected termination of the watcher process
        disposables.add(client.onDidProcessExit(({ code, signal }) => this.onError(`terminated by itself with code ${code}, signal: ${signal} (ETERM)`)));
        return ProxyChannel.toService(getNextTickChannel(client.getChannel('watcher')));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2hlckNsaWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2ZpbGVzL25vZGUvd2F0Y2hlci93YXRjaGVyQ2xpZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDNUYsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRW5FLE9BQU8sRUFBRSw4QkFBOEIsRUFBa0MsTUFBTSx5QkFBeUIsQ0FBQztBQUV6RyxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsOEJBQThCO0lBRXpFLFlBQ0MsYUFBK0MsRUFDL0MsWUFBd0MsRUFDeEMsY0FBdUI7UUFFdkIsS0FBSyxDQUFDLGFBQWEsRUFBRSxZQUFZLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFFbkQsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2IsQ0FBQztJQUVrQixhQUFhLENBQUMsV0FBNEI7UUFFNUQsNERBQTREO1FBQzVELDZEQUE2RDtRQUM3RCxNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksTUFBTSxDQUN4QyxVQUFVLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLENBQUMsTUFBTSxFQUM3QztZQUNDLFVBQVUsRUFBRSxjQUFjO1lBQzFCLElBQUksRUFBRSxDQUFDLG9CQUFvQixDQUFDO1lBQzVCLEdBQUcsRUFBRTtnQkFDSixxQkFBcUIsRUFBRSw0Q0FBNEM7Z0JBQ25FLG1CQUFtQixFQUFFLE1BQU07Z0JBQzNCLHNCQUFzQixFQUFFLE1BQU0sQ0FBQyw4Q0FBOEM7YUFDN0U7U0FDRCxDQUNELENBQUMsQ0FBQztRQUVILHlEQUF5RDtRQUN6RCxXQUFXLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGtDQUFrQyxJQUFJLGFBQWEsTUFBTSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFbEosT0FBTyxZQUFZLENBQUMsU0FBUyxDQUFvQixrQkFBa0IsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNwRyxDQUFDO0NBQ0QifQ==