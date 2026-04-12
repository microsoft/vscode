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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { observableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
var Constants;
(function (Constants) {
    Constants[Constants["SamplingRetentionDays"] = 7] = "SamplingRetentionDays";
    Constants[Constants["MsPerDay"] = 86400000] = "MsPerDay";
    Constants[Constants["SamplingRetentionMs"] = 604800000] = "SamplingRetentionMs";
    Constants[Constants["SamplingLastNMessage"] = 30] = "SamplingLastNMessage";
})(Constants || (Constants = {}));
const samplingMemento = observableMemento({
    defaultValue: new Map(),
    key: 'mcp.sampling.logs',
    toStorage: v => JSON.stringify(Array.from(v.entries())),
    fromStorage: v => new Map(JSON.parse(v)),
});
let McpSamplingLog = class McpSamplingLog extends Disposable {
    constructor(_storageService) {
        super();
        this._storageService = _storageService;
        this._logs = {};
    }
    has(server) {
        const storage = this._getLogStorageForServer(server);
        return storage.get().has(server.definition.id);
    }
    get(server) {
        const storage = this._getLogStorageForServer(server);
        return storage.get().get(server.definition.id);
    }
    getAsText(server) {
        const storage = this._getLogStorageForServer(server);
        const record = storage.get().get(server.definition.id);
        if (!record) {
            return '';
        }
        const parts = [];
        const total = record.bins.reduce((sum, value) => sum + value, 0);
        parts.push(localize('mcp.sampling.rpd', '{0} total requests in the last 7 days.', total));
        parts.push(this._formatRecentRequests(record));
        return parts.join('\n');
    }
    _formatRecentRequests(data) {
        if (!data.lastReqs.length) {
            return '\nNo recent requests.';
        }
        const result = [];
        for (let i = 0; i < data.lastReqs.length; i++) {
            const { request, response, at, model } = data.lastReqs[i];
            result.push(`\n[${i + 1}] ${new Date(at).toISOString()} ${model}`);
            result.push('  Request:');
            for (const msg of request) {
                const role = msg.role.padEnd(9);
                let content = '';
                if ('text' in msg.content && msg.content.type === 'text') {
                    content = msg.content.text;
                }
                else if ('data' in msg.content) {
                    content = `[${msg.content.type} data: ${msg.content.mimeType}]`;
                }
                result.push(`    ${role}: ${content}`);
            }
            result.push('  Response:');
            result.push(`    ${response}`);
        }
        return result.join('\n');
    }
    async add(server, request, response, model) {
        const now = Date.now();
        const utcOrdinal = Math.floor(now / 86400000 /* Constants.MsPerDay */);
        const storage = this._getLogStorageForServer(server);
        const next = new Map(storage.get());
        let record = next.get(server.definition.id);
        if (!record) {
            record = {
                head: utcOrdinal,
                bins: Array.from({ length: 7 /* Constants.SamplingRetentionDays */ }, () => 0),
                lastReqs: [],
            };
        }
        else {
            // Shift bins back by daysSinceHead, dropping old days
            for (let i = 0; i < (utcOrdinal - record.head) && i < 7 /* Constants.SamplingRetentionDays */; i++) {
                record.bins.pop();
                record.bins.unshift(0);
            }
            record.head = utcOrdinal;
        }
        // Increment the current day's bin (head)
        record.bins[0]++;
        record.lastReqs.unshift({ request, response, at: now, model });
        while (record.lastReqs.length > 30 /* Constants.SamplingLastNMessage */) {
            record.lastReqs.pop();
        }
        next.set(server.definition.id, record);
        storage.set(next, undefined);
    }
    _getLogStorageForServer(server) {
        const scope = server.readDefinitions().get().collection?.scope ?? 1 /* StorageScope.WORKSPACE */;
        return this._logs[scope] ??= this._register(samplingMemento(scope, 1 /* StorageTarget.MACHINE */, this._storageService));
    }
};
McpSamplingLog = __decorate([
    __param(0, IStorageService)
], McpSamplingLog);
export { McpSamplingLog };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU2FtcGxpbmdMb2cuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvY29tbW9uL21jcFNhbXBsaW5nTG9nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ25ILE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFJOUcsSUFBVyxTQUtWO0FBTEQsV0FBVyxTQUFTO0lBQ25CLDJFQUF5QixDQUFBO0lBQ3pCLHdEQUE4QixDQUFBO0lBQzlCLCtFQUFzRCxDQUFBO0lBQ3RELDBFQUF5QixDQUFBO0FBQzFCLENBQUMsRUFMVSxTQUFTLEtBQVQsU0FBUyxRQUtuQjtBQVdELE1BQU0sZUFBZSxHQUFHLGlCQUFpQixDQUEyQztJQUNuRixZQUFZLEVBQUUsSUFBSSxHQUFHLEVBQUU7SUFDdkIsR0FBRyxFQUFFLG1CQUFtQjtJQUN4QixTQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDdkQsV0FBVyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUN4QyxDQUFDLENBQUM7QUFFSSxJQUFNLGNBQWMsR0FBcEIsTUFBTSxjQUFlLFNBQVEsVUFBVTtJQUc3QyxZQUNrQixlQUFpRDtRQUVsRSxLQUFLLEVBQUUsQ0FBQztRQUYw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