/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { process } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
export const IShellEnvironmentService = createDecorator('shellEnvironmentService');
export class ShellEnvironmentService {
    getShellEnv() {
        return process.shellEnv();
    }
}
registerSingleton(IShellEnvironmentService, ShellEnvironmentService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hlbGxFbnZpcm9ubWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZW52aXJvbm1lbnQvZWxlY3Ryb24tYnJvd3Nlci9zaGVsbEVudmlyb25tZW50U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFN0YsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3JGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUUvRyxNQUFNLENBQUMsTUFBTSx3QkFBd0IsR0FBRyxlQUFlLENBQTJCLHlCQUF5QixDQUFDLENBQUM7QUFTN0csTUFBTSxPQUFPLHVCQUF1QjtJQUluQyxXQUFXO1FBQ1YsT0FBTyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDM0IsQ0FBQztDQUNEO0FBRUQsaUJBQWlCLENBQUMsd0JBQXdCLEVBQUUsdUJBQXVCLG9DQUE0QixDQUFDIn0=