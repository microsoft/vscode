/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AbstractNonRecursiveWatcherClient } from '../../../common/watcher.js';
import { NodeJSWatcher } from './nodejsWatcher.js';
export class NodeJSWatcherClient extends AbstractNonRecursiveWatcherClient {
    constructor(onFileChanges, onLogMessage, verboseLogging) {
        super(onFileChanges, onLogMessage, verboseLogging);
        this.init();
    }
    createWatcher(disposables) {
        return disposables.add(new NodeJSWatcher(undefined /* no recursive watching support here */));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZWpzQ2xpZW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZmlsZXMvbm9kZS93YXRjaGVyL25vZGVqcy9ub2RlanNDbGllbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFlLGlDQUFpQyxFQUF3QixNQUFNLDRCQUE0QixDQUFDO0FBQ2xILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUVuRCxNQUFNLE9BQU8sbUJBQW9CLFNBQVEsaUNBQWlDO0lBRXpFLFlBQ0MsYUFBK0MsRUFDL0MsWUFBd0MsRUFDeEMsY0FBdUI7UUFFdkIsS0FBSyxDQUFDLGFBQWEsRUFBRSxZQUFZLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFFbkQsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2IsQ0FBQztJQUVrQixhQUFhLENBQUMsV0FBNEI7UUFDNUQsT0FBTyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksYUFBYSxDQUFDLFNBQVMsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFnQyxDQUFDO0lBQzlILENBQUM7Q0FDRCJ9