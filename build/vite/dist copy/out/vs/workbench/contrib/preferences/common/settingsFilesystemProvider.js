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
var SettingsFileSystemProvider_1;
import { NotSupportedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { FilePermission, FileSystemProviderErrorCode, FileType } from '../../../../platform/files/common/files.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import * as JSONContributionRegistry from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ILogService, LogLevel } from '../../../../platform/log/common/log.js';
import { isEqual } from '../../../../base/common/resources.js';
const schemaRegistry = Registry.as(JSONContributionRegistry.Extensions.JSONContribution);
let SettingsFileSystemProvider = class SettingsFileSystemProvider extends Disposable {
    static { SettingsFileSystemProvider_1 = this; }
    static { this.SCHEMA = Schemas.vscode; }
    static { this.SCHEMA_ASSOCIATIONS = URI.parse(`${Schemas.vscode}://schemas-associations/schemas-associations.json`); }
    constructor(preferencesService, logService) {
        super();
        this.preferencesService = preferencesService;
        this.logService = logService;
        this._onDidChangeFile = this._register(new Emitter());
        this.onDidChangeFile = this._onDidChangeFile.event;
        this.capabilities = 2048 /* FileSystemProviderCapabilities.Readonly */ + 2 /* FileSystemProviderCapabilities.FileReadWrite */;
        this.onDidChangeCapabilities = Event.None;
        this._register(schemaRegistry.onDidChangeSchema(schemaUri => {
            this._onDidChangeFile.fire([{ resource: URI.parse(schemaUri), type: 0 /* FileChangeType.UPDATED */ }]);
        }));
        this._register(schemaRegistry.onDidChangeSchemaAssociations(() => {
            this._onDidChangeFile.fire([{ resource: SettingsFileSystemProvider_1.SCHEMA_ASSOCIATIONS, type: 0 /* FileChangeType.UPDATED */ }]);
        }));
        this._register(preferencesService.onDidDefaultSettingsContentChanged(uri => {
            this._onDidChangeFile.fire([{ resource: uri, type: 0 /* FileChangeType.UPDATED */ }]);
        }));
    }
    async readFile(uri) {
        if (uri.scheme !== SettingsFileSystemProvider_1.SCHEMA) {
            throw new NotSupportedError();
        }
        let content;
        if (uri.authority === 'schemas') {
            content = this.getSchemaContent(uri);
        }
        else if (uri.authority === SettingsFileSystemProvider_1.SCHEMA_ASSOCIATIONS.authority) {
            content = JSON.stringify(schemaRegistry.getSchemaAssociations());
        }
        else if (uri.authority === 'defaultsettings') {
            content = this.preferencesService.getDefaultSettingsContent(uri);
        }
        if (content) {
            return VSBuffer.fromString(content).buffer;
        }
        throw FileSystemProviderErrorCode.FileNotFound;
    }
    async stat(uri) {
        if (schemaRegistry.hasSchemaContent(uri.toString()) || this.preferencesService.hasDefaultSettingsContent(uri)) {
            const currentTime = Date.now();
            return {
                type: FileType.File,
                permissions: FilePermission.Readonly,
                mtime: currentTime,
                ctime: currentTime,
                size: 0
            };
        }
        if (isEqual(uri, SettingsFileSystemProvider_1.SCHEMA_ASSOCIATIONS)) {
            const currentTime = Date.now();
            return {
                type: FileType.File,
                permissions: FilePermission.Readonly,
                mtime: currentTime,
                ctime: currentTime,
                size: 0
            };
        }
        throw FileSystemProviderErrorCode.FileNotFound;
    }
    watch(resource, opts) { return Disposable.None; }
    async mkdir(resource) { }
    async readdir(resource) { return []; }
    async rename(from, to, opts) { }
    async delete(resource, opts) { }
    async writeFile() {
        throw new NotSupportedError();
    }
    getSchemaContent(uri) {
        const startTime = Date.now();
        const content = schemaRegistry.getSchemaContent(uri.toString()) ?? '{}' /* Use empty schema if not yet registered */;
        const logLevel = this.logService.getLevel();
        if (logLevel === LogLevel.Debug || logLevel === LogLevel.Trace) {
            const endTime = Date.now();
            const uncompressed = JSON.stringify(schemaRegistry.getSchemaContributions().schemas[uri.toString()]);
            this.logService.debug(`${uri.toString()}: ${uncompressed.length} -> ${content.length} (${Math.round((uncompressed.length - content.length) / uncompressed.length * 100)}%) Took ${endTime - startTime}ms`);
        }
        return content;
    }
};
SettingsFileSystemProvider = SettingsFileSystemProvider_1 = __decorate([
    __param(0, IPreferencesService),
    __param(1, ILogService)
], SettingsFileSystemProvider);
export { SettingsFileSystemProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NGaWxlc3lzdGVtUHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wcmVmZXJlbmNlcy9jb21tb24vc2V0dGluZ3NGaWxlc3lzdGVtUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBZSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBa0IsY0FBYyxFQUFrQywyQkFBMkIsRUFBRSxRQUFRLEVBQWdJLE1BQU0sNENBQTRDLENBQUM7QUFDalMsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDMUYsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxLQUFLLHdCQUF3QixNQUFNLHFFQUFxRSxDQUFDO0FBQ2hILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUvRCxNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFxRCx3QkFBd0IsQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUd0SSxJQUFNLDBCQUEwQixH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