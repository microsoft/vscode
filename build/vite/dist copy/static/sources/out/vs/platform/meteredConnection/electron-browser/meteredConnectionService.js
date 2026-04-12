/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { toDisposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { registerSingleton } from '../../instantiation/common/extensions.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { AbstractMeteredConnectionService, getIsBrowserConnectionMetered, IMeteredConnectionService } from '../common/meteredConnection.js';
import { METERED_CONNECTION_CHANNEL, MeteredConnectionCommand } from '../common/meteredConnectionIpc.js';
/**
 * Electron-browser implementation of the metered connection service.
 * This implementation monitors navigator.connection and reports changes to the main process via IPC channel.
 */
let NativeMeteredConnectionService = class NativeMeteredConnectionService extends AbstractMeteredConnectionService {
    constructor(configurationService, mainProcessService) {
        super(configurationService, getIsBrowserConnectionMetered());
        this._channel = mainProcessService.getChannel(METERED_CONNECTION_CHANNEL);
        const connection = navigator.connection;
        if (connection) {
            const onChange = () => this.setIsBrowserConnectionMetered(getIsBrowserConnectionMetered());
            connection.addEventListener('change', onChange);
            this._register(toDisposable(() => connection.removeEventListener('change', onChange)));
        }
    }
    /**
     * Notify the main process about changes to the navigator connection state.
     */
    onChangeBrowserConnection() {
        super.onChangeBrowserConnection();
        this._channel.call(MeteredConnectionCommand.SetIsBrowserConnectionMetered, this.isBrowserConnectionMetered);
    }
};
NativeMeteredConnectionService = __decorate([
    __param(0, IConfigurationService),
    __param(1, IMainProcessService)
], NativeMeteredConnectionService);
export { NativeMeteredConnectionService };
registerSingleton(IMeteredConnectionService, NativeMeteredConnectionService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vbWV0ZXJlZENvbm5lY3Rpb24vZWxlY3Ryb24tYnJvd3Nlci9tZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsNkJBQTZCLEVBQUUseUJBQXlCLEVBQTJCLE1BQU0sZ0NBQWdDLENBQUM7QUFDckssT0FBTyxFQUFFLDBCQUEwQixFQUFFLHdCQUF3QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFekc7OztHQUdHO0FBQ0ksSUFBTSw4QkFBOEIsR0FBcEMsTUFBTSw4QkFBK0IsU0FBUSxnQ0FBZ0M7SUFHbkYsWUFDd0Isb0JBQTJDLEVBQzdDLGtCQUF1QztRQUU1RCxLQUFLLENBQUMsb0JBQW9CLEVBQUUsNkJBQTZCLEVBQUUsQ0FBQyxDQUFDO1FBQzdELElBQUksQ0FBQyxRQUFRLEdBQUcsa0JBQWtCLENBQUMsVUFBVSxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFFMUUsTUFBTSxVQUFVLEdBQUksU0FBcUMsQ0FBQyxVQUFVLENBQUM7UUFDckUsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNoQixNQUFNLFFBQVEsR0FBRyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsNkJBQTZCLEVBQUUsQ0FBQyxDQUFDO1lBQzNGLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDaEQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEYsQ0FBQztJQUNGLENBQUM7SUFFRDs7T0FFRztJQUNnQix5QkFBeUI7UUFDM0MsS0FBSyxDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDbEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsNkJBQTZCLEVBQUUsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7SUFDN0csQ0FBQztDQUNELENBQUE7QUF6QlksOEJBQThCO0lBSXhDLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxtQkFBbUIsQ0FBQTtHQUxULDhCQUE4QixDQXlCMUM7O0FBRUQsaUJBQWlCLENBQUMseUJBQXlCLEVBQUUsOEJBQThCLG9DQUE0QixDQUFDIn0=