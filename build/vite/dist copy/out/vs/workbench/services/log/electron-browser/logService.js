/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ConsoleLogger } from '../../../../platform/log/common/log.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { windowLogGroup, windowLogId } from '../common/logConstants.js';
import { LogService } from '../../../../platform/log/common/logService.js';
export class NativeLogService extends LogService {
    constructor(loggerService, environmentService) {
        const disposables = new DisposableStore();
        const fileLogger = disposables.add(loggerService.createLogger(environmentService.logFile, { id: windowLogId, name: windowLogGroup.name, group: windowLogGroup }));
        let consoleLogger;
        if (environmentService.isExtensionDevelopment && !!environmentService.extensionTestsLocationURI) {
            // Extension development test CLI: forward everything to main side
            consoleLogger = loggerService.createConsoleMainLogger();
        }
        else {
            // Normal mode: Log to console
            consoleLogger = new ConsoleLogger(fileLogger.getLevel());
        }
        super(fileLogger, [consoleLogger]);
        this._register(disposables);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9sb2cvZWxlY3Ryb24tYnJvd3Nlci9sb2dTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxhQUFhLEVBQVcsTUFBTSx3Q0FBd0MsQ0FBQztBQUdoRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN4RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFM0UsTUFBTSxPQUFPLGdCQUFpQixTQUFRLFVBQVU7SUFFL0MsWUFBWSxhQUFrQyxFQUFFLGtCQUFzRDtRQUVyRyxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBRTFDLE1BQU0sVUFBVSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFbEssSUFBSSxhQUFzQixDQUFDO1FBQzNCLElBQUksa0JBQWtCLENBQUMsc0JBQXNCLElBQUksQ0FBQyxDQUFDLGtCQUFrQixDQUFDLHlCQUF5QixFQUFFLENBQUM7WUFDakcsa0VBQWtFO1lBQ2xFLGFBQWEsR0FBRyxhQUFhLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztRQUN6RCxDQUFDO2FBQU0sQ0FBQztZQUNQLDhCQUE4QjtZQUM5QixhQUFhLEdBQUcsSUFBSSxhQUFhLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDMUQsQ0FBQztRQUVELEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1FBRW5DLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDN0IsQ0FBQztDQUNEIn0=