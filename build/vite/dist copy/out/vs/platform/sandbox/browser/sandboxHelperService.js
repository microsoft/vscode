/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerSingleton } from '../../instantiation/common/extensions.js';
import { ISandboxHelperService } from '../common/sandboxHelperService.js';
class NullSandboxHelperService {
    async checkSandboxDependencies() {
        // Web targets cannot inspect host sandbox dependencies directly.
        // Treat them as satisfied so browser workbench targets do not fail DI
        // or block sandbox flows on an unavailable host-side capability.
        return {
            bubblewrapInstalled: true,
            socatInstalled: true,
        };
    }
}
registerSingleton(ISandboxHelperService, NullSandboxHelperService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2FuZGJveEhlbHBlclNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9zYW5kYm94L2Jyb3dzZXIvc2FuZGJveEhlbHBlclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hHLE9BQU8sRUFBNEIscUJBQXFCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVwRyxNQUFNLHdCQUF3QjtJQUc3QixLQUFLLENBQUMsd0JBQXdCO1FBQzdCLGlFQUFpRTtRQUNqRSxzRUFBc0U7UUFDdEUsaUVBQWlFO1FBQ2pFLE9BQU87WUFDTixtQkFBbUIsRUFBRSxJQUFJO1lBQ3pCLGNBQWMsRUFBRSxJQUFJO1NBQ3BCLENBQUM7SUFDSCxDQUFDO0NBQ0Q7QUFFRCxpQkFBaUIsQ0FBQyxxQkFBcUIsRUFBRSx3QkFBd0Isb0NBQTRCLENBQUMifQ==