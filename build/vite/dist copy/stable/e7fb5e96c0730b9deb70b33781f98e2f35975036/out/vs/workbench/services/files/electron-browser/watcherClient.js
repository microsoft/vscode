/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getDelayedChannel, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { AbstractUniversalWatcherClient } from '../../../../platform/files/common/watcher.js';
export class UniversalWatcherClient extends AbstractUniversalWatcherClient {
    constructor(onFileChanges, onLogMessage, verboseLogging, utilityProcessWorkerWorkbenchService) {
        super(onFileChanges, onLogMessage, verboseLogging);
        this.utilityProcessWorkerWorkbenchService = utilityProcessWorkerWorkbenchService;
        this.init();
    }
    createWatcher(disposables) {
        const watcher = ProxyChannel.toService(getDelayedChannel((async () => {
            // Acquire universal watcher via utility process worker
            //
            // We explicitly do not add the worker as a disposable
            // because we need to call `stop` on disposal to prevent
            // a crash on shutdown (see below).
            //
            // The utility process worker services ensures to terminate
            // the process automatically when the window closes or reloads.
            const { client, onDidTerminate } = disposables.add(await this.utilityProcessWorkerWorkbenchService.createWorker({
                moduleId: 'vs/platform/files/node/watcher/watcherMain',
                type: 'fileWatcher',
                name: 'file-watcher'
            }));
            // React on unexpected termination of the watcher process
            // by listening to the `onDidTerminate` event. We do not
            // consider an exit code of `0` as abnormal termination.
            onDidTerminate.then(({ reason }) => {
                if (reason?.code === 0) {
                    this.trace(`terminated by itself with code ${reason.code}, signal: ${reason.signal}`);
                }
                else {
                    this.onError(`terminated by itself unexpectedly with code ${reason?.code}, signal: ${reason?.signal} (ETERM)`);
                }
            });
            return client.getChannel('watcher');
        })()));
        return watcher;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2hlckNsaWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9maWxlcy9lbGVjdHJvbi1icm93c2VyL3dhdGNoZXJDbGllbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRTNGLE9BQU8sRUFBRSw4QkFBOEIsRUFBa0MsTUFBTSw4Q0FBOEMsQ0FBQztBQUc5SCxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsOEJBQThCO0lBRXpFLFlBQ0MsYUFBK0MsRUFDL0MsWUFBd0MsRUFDeEMsY0FBdUIsRUFDTixvQ0FBMkU7UUFFNUYsS0FBSyxDQUFDLGFBQWEsRUFBRSxZQUFZLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFGbEMseUNBQW9DLEdBQXBDLG9DQUFvQyxDQUF1QztRQUk1RixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDYixDQUFDO0lBRWtCLGFBQWEsQ0FBQyxXQUE0QjtRQUM1RCxNQUFNLE9BQU8sR0FBRyxZQUFZLENBQUMsU0FBUyxDQUFvQixpQkFBaUIsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFO1lBRXZGLHVEQUF1RDtZQUN2RCxFQUFFO1lBQ0Ysc0RBQXNEO1lBQ3RELHdEQUF3RDtZQUN4RCxtQ0FBbUM7WUFDbkMsRUFBRTtZQUNGLDJEQUEyRDtZQUMzRCwrREFBK0Q7WUFDL0QsTUFBTSxFQUFFLE1BQU0sRUFBRSxjQUFjLEVBQUUsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLG9DQUFvQyxDQUFDLFlBQVksQ0FBQztnQkFDL0csUUFBUSxFQUFFLDRDQUE0QztnQkFDdEQsSUFBSSxFQUFFLGFBQWE7Z0JBQ25CLElBQUksRUFBRSxjQUFjO2FBQ3BCLENBQUMsQ0FBQyxDQUFDO1lBRUoseURBQXlEO1lBQ3pELHdEQUF3RDtZQUN4RCx3REFBd0Q7WUFFeEQsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRTtnQkFDbEMsSUFBSSxNQUFNLEVBQUUsSUFBSSxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUN4QixJQUFJLENBQUMsS0FBSyxDQUFDLGtDQUFrQyxNQUFNLENBQUMsSUFBSSxhQUFhLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO2dCQUN2RixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsSUFBSSxDQUFDLE9BQU8sQ0FBQywrQ0FBK0MsTUFBTSxFQUFFLElBQUksYUFBYSxNQUFNLEVBQUUsTUFBTSxVQUFVLENBQUMsQ0FBQztnQkFDaEgsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1lBRUgsT0FBTyxNQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3JDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRVAsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQztDQUNEIn0=