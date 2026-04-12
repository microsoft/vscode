/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getErrorMessage } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { DiskFileSystemProviderClient } from '../../../../platform/files/common/diskFileSystemProviderClient.js';
export const REMOTE_FILE_SYSTEM_CHANNEL_NAME = 'remoteFilesystem';
export class RemoteFileSystemProviderClient extends DiskFileSystemProviderClient {
    static register(remoteAgentService, fileService, logService) {
        const connection = remoteAgentService.getConnection();
        if (!connection) {
            return Disposable.None;
        }
        const disposables = new DisposableStore();
        const environmentPromise = (async () => {
            try {
                const environment = await remoteAgentService.getRawEnvironment();
                if (environment) {
                    // Register remote fsp even before it is asked to activate
                    // because, some features (configuration) wait for its
                    // registration before making fs calls.
                    fileService.registerProvider(Schemas.vscodeRemote, disposables.add(new RemoteFileSystemProviderClient(environment, connection)));
                }
                else {
                    logService.error('Cannot register remote filesystem provider. Remote environment doesnot exist.');
                }
            }
            catch (error) {
                logService.error('Cannot register remote filesystem provider. Error while fetching remote environment.', getErrorMessage(error));
            }
        })();
        disposables.add(fileService.onWillActivateFileSystemProvider(e => {
            if (e.scheme === Schemas.vscodeRemote) {
                e.join(environmentPromise);
            }
        }));
        return disposables;
    }
    constructor(remoteAgentEnvironment, connection) {
        super(connection.getChannel(REMOTE_FILE_SYSTEM_CHANNEL_NAME), { pathCaseSensitive: remoteAgentEnvironment.os === 3 /* OperatingSystem.Linux */ });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlRmlsZVN5c3RlbVByb3ZpZGVyQ2xpZW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlRmlsZVN5c3RlbVByb3ZpZGVyQ2xpZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUc3RCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUtqSCxNQUFNLENBQUMsTUFBTSwrQkFBK0IsR0FBRyxrQkFBa0IsQ0FBQztBQUVsRSxNQUFNLE9BQU8sOEJBQStCLFNBQVEsNEJBQTRCO0lBRS9FLE1BQU0sQ0FBQyxRQUFRLENBQUMsa0JBQXVDLEVBQUUsV0FBeUIsRUFBRSxVQUF1QjtRQUMxRyxNQUFNLFVBQVUsR0FBRyxrQkFBa0IsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUN0RCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDakIsT0FBTyxVQUFVLENBQUMsSUFBSSxDQUFDO1FBQ3hCLENBQUM7UUFFRCxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBRTFDLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxLQUFLLElBQUksRUFBRTtZQUN0QyxJQUFJLENBQUM7Z0JBQ0osTUFBTSxXQUFXLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO2dCQUNqRSxJQUFJLFdBQVcsRUFBRSxDQUFDO29CQUNqQiwwREFBMEQ7b0JBQzFELHNEQUFzRDtvQkFDdEQsdUNBQXVDO29CQUN2QyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsV0FBVyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDbEksQ0FBQztxQkFBTSxDQUFDO29CQUNQLFVBQVUsQ0FBQyxLQUFLLENBQUMsK0VBQStFLENBQUMsQ0FBQztnQkFDbkcsQ0FBQztZQUNGLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNoQixVQUFVLENBQUMsS0FBSyxDQUFDLHNGQUFzRixFQUFFLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2xJLENBQUM7UUFDRixDQUFDLENBQUMsRUFBRSxDQUFDO1FBRUwsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsZ0NBQWdDLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDaEUsSUFBSSxDQUFDLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDdkMsQ0FBQyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQzVCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosT0FBTyxXQUFXLENBQUM7SUFDcEIsQ0FBQztJQUVELFlBQW9CLHNCQUErQyxFQUFFLFVBQWtDO1FBQ3RHLEtBQUssQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLCtCQUErQixDQUFDLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxzQkFBc0IsQ0FBQyxFQUFFLGtDQUEwQixFQUFFLENBQUMsQ0FBQztJQUMzSSxDQUFDO0NBQ0QifQ==