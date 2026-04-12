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
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { RequestChannelClient } from '../../../../platform/request/common/requestIpc.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { AbstractRequestService } from '../../../../platform/request/common/request.js';
import { request } from '../../../../base/parts/request/common/requestImpl.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { localize } from '../../../../nls.js';
import { LogService } from '../../../../platform/log/common/logService.js';
import { windowLogGroup } from '../../log/common/logConstants.js';
let BrowserRequestService = class BrowserRequestService extends AbstractRequestService {
    constructor(remoteAgentService, configurationService, loggerService) {
        const logger = loggerService.createLogger(`network`, { name: localize('network', "Network"), group: windowLogGroup });
        const logService = new LogService(logger);
        super(logService);
        this.remoteAgentService = remoteAgentService;
        this.configurationService = configurationService;
        this._register(logger);
        this._register(logService);
    }
    async request(options, token) {
        try {
            if (!options.proxyAuthorization) {
                options.proxyAuthorization = this.configurationService.inspect('http.proxyAuthorization').userLocalValue;
            }
            const context = await this.logAndRequest(options, () => request(options, token, () => navigator.onLine));
            const connection = this.remoteAgentService.getConnection();
            if (connection && context.res.statusCode === 405) {
                return this._makeRemoteRequest(connection, options, token);
            }
            return context;
        }
        catch (error) {
            const connection = this.remoteAgentService.getConnection();
            if (connection) {
                return this._makeRemoteRequest(connection, options, token);
            }
            throw error;
        }
    }
    async resolveProxy(url) {
        return undefined; // not implemented in the web
    }
    async lookupAuthorization(authInfo) {
        return undefined; // not implemented in the web
    }
    async lookupKerberosAuthorization(url) {
        return undefined; // not implemented in the web
    }
    async loadCertificates() {
        return []; // not implemented in the web
    }
    _makeRemoteRequest(connection, options, token) {
        return connection.withChannel('request', channel => new RequestChannelClient(channel).request(options, token));
    }
};
BrowserRequestService = __decorate([
    __param(0, IRemoteAgentService),
    __param(1, IConfigurationService),
    __param(2, ILoggerService)
], BrowserRequestService);
export { BrowserRequestService };
// --- Internal commands to help authentication for extensions
CommandsRegistry.registerCommand('_workbench.fetchJSON', async function (accessor, url, method) {
    const result = await fetch(url, { method, headers: { Accept: 'application/json' } });
    if (result.ok) {
        return result.json();
    }
    else {
        throw new Error(result.statusText);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVxdWVzdFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvcmVxdWVzdC9icm93c2VyL3JlcXVlc3RTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBSWhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxtQkFBbUIsRUFBMEIsTUFBTSwyQ0FBMkMsQ0FBQztBQUV4RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsc0JBQXNCLEVBQTBDLE1BQU0sZ0RBQWdELENBQUM7QUFDaEksT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUUzRCxJQUFNLHFCQUFxQixHQUEzQixNQUFNLHFCQUFzQixTQUFRLHNCQUFzQjtJQUloRSxZQUN1QyxrQkFBdUMsRUFDckMsb0JBQTJDLEVBQ25FLGFBQTZCO1FBRTdDLE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDdEgsTUFBTSxVQUFVLEdBQUcsSUFB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