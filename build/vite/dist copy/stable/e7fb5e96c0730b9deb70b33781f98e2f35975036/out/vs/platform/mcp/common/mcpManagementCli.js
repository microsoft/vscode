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
import { IMcpManagementService } from './mcpManagement.js';
let McpManagementCli = class McpManagementCli {
    constructor(_logger, _mcpManagementService) {
        this._logger = _logger;
        this._mcpManagementService = _mcpManagementService;
    }
    async addMcpDefinitions(definitions) {
        const configs = definitions.map((config) => this.validateConfiguration(config));
        await this.updateMcpInResource(configs);
        this._logger.info(`Added MCP servers: ${configs.map(c => c.name).join(', ')}`);
    }
    async updateMcpInResource(configs) {
        await Promise.all(configs.map(({ name, config, inputs }) => this._mcpManagementService.install({ name, config, inputs })));
    }
    validateConfiguration(config) {
        let parsed;
        try {
            parsed = JSON.parse(config);
        }
        catch (e) {
            throw new InvalidMcpOperationError(`Invalid JSON '${config}': ${e}`);
        }
        if (!parsed.name) {
            throw new InvalidMcpOperationError(`Missing name property in ${config}`);
        }
        if (!('command' in parsed) && !('url' in parsed)) {
            throw new InvalidMcpOperationError(`Missing command or URL property in ${config}`);
        }
        const { name, inputs, ...rest } = parsed;
        return { name, inputs, config: rest };
    }
};
McpManagementCli = __decorate([
    __param(1, IMcpManagementService)
], McpManagementCli);
export { McpManagementCli };
class InvalidMcpOperationError extends Error {
    constructor(message) {
        super(message);
        this.stack = message;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwTWFuYWdlbWVudENsaS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudENsaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUloRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUlwRCxJQUFNLGdCQUFnQixHQUF0QixNQUFNLGdCQUFnQjtJQUM1QixZQUNrQixPQUFnQixFQUNPLHFCQUE0QztRQURuRSxZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ08sMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtJQUNqRixDQUFDO0lBRUwsS0FBSyxDQUFDLGlCQUFpQixDQUN0QixXQUFxQjtRQUVyQixNQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNoRixNQUFNLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ2hGLENBQUM7SUFFTyxLQUFLLENBQUMsbUJBQW1CLENBQUMsT0FBMEI7UUFDM0QsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzVILENBQUM7SUFFTyxxQkFBcUIsQ0FBQyxNQUFjO1FBQzNDLElBQUksTUFBaUYsQ0FBQztRQUN0RixJQUFJLENBQUM7WUFDSixNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM3QixDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNaLE1BQU0sSUFBSSx3QkFBd0IsQ0FBQyxpQkFBaUIsTUFBTSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdEUsQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDbEIsTUFBTSxJQUFJLHdCQUF3QixDQUFDLDRCQUE0QixNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzFFLENBQUM7UUFFRCxJQUFJLENBQUMsQ0FBQyxTQUFTLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssSUFBSSxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ2xELE1BQU0sSUFBSSx3QkFBd0IsQ0FBQyxzQ0FBc0MsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUNwRixDQUFDO1FBRUQsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxJQUFJLEVBQUUsR0FBRyxNQUFNLENBQUM7UUFDekMsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQStCLEVBQUUsQ0FBQztJQUNsRSxDQUFDO0NBQ0QsQ0FBQTtBQXJDWSxnQkFBZ0I7SUFHMUIsV0FBQSxxQkFBcUIsQ0FBQTtHQUhYLGdCQUFnQixDQXFDNUI7O0FBRUQsTUFBTSx3QkFBeUIsU0FBUSxLQUFLO0lBQzNDLFlBQVksT0FBZTtRQUMxQixLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQztJQUN0QixDQUFDO0NBQ0QifQ==