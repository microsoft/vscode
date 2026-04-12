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
var McpRegistryInputStorage_1;
import { Sequencer } from '../../../../base/common/async.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEmptyObject } from '../../../../base/common/types.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
const MCP_ENCRYPTION_KEY_NAME = 'mcpEncryptionKey';
const MCP_ENCRYPTION_KEY_ALGORITHM = 'AES-GCM';
const MCP_ENCRYPTION_KEY_LEN = 256;
const MCP_ENCRYPTION_IV_LENGTH = 12; // 96 bits
const MCP_DATA_STORED_VERSION = 1;
const MCP_DATA_STORED_KEY = 'mcpInputs';
let McpRegistryInputStorage = class McpRegistryInputStorage extends Disposable {
    static { McpRegistryInputStorage_1 = this; }
    static { this.secretSequencer = new Sequencer(); }
    constructor(_scope, _target, _storageService, _secretStorageService, _logService) {
        super();
        this._scope = _scope;
        this._storageService = _storageService;
        this._secretStorageService = _secretStorageService;
        this._logService = _logService;
        this._secretsSealerSequencer = new Sequencer();
        this._getEncryptionKey = new Lazy(() => {
            return McpRegistryInputStorage_1.secretSequencer.queue(async () => {
                const existing = await this._secretStorageService.get(MCP_ENCRYPTION_KEY_NAME);
                if (existing) {
                    try {
                        const parsed = JSON.parse(existing);
                        return await crypto.subtle.importKey('jwk', parsed, MCP_ENCRYPTION_KEY_ALGORITHM, false, ['encrypt', 'decrypt']);
                    }
                    catch {
                        // fall through
                    }
                }
                const key = await crypto.subtle.generateKey({ name: MCP_ENCRYPTION_KEY_ALGORITHM, length: MCP_ENCRYPTION_KEY_LEN }, true, ['encrypt', 'decrypt']);
                const exported = await crypto.subtle.exportKey('jwk', key);
                await this._secretStorageService.set(MCP_ENCRYPTION_KEY_NAME, JSON.stringify(exported));
                return key;
            });
        });
        this._didChange = false;
        this._record = new Lazy(() => {
            const stored = this._storageService.getObject(MCP_DATA_STORED_KEY, this._scope);
            return stored?.version === MCP_DATA_STORED_VERSION ? { ...stored } : { version: MCP_DATA_STORED_VERSION, values: {} };
        });
        this._register(_storageService.onWillSaveState(() => {
            if (this._didChange) {
                this._storageService.store(MCP_DATA_STORED_KEY, {
                    version: MCP_DATA_STORED_VERSION,
                    values: this._record.value.values,
                    secrets: this._record.value.secrets,
                }, this._scope, _target);
                this._didChange = false;
            }
        }));
    }
    /** Deletes all collection data from storage. */
    clearAll() {
        this._record.value.values = {};
        this._record.value.secrets = undefined;
        this._record.value.unsealedSecrets = undefined;
        this._didChange = true;
    }
    /** Delete a single collection data from the storage. */
    async clear(inputKey) {
        const secrets = await this._unsealSecrets();
        delete this._record.value.values[inputKey];
        this._didChange = true;
        if (secrets.hasOwnProperty(inputKey)) {
            delete secrets[inputKey];
            await this._sealSecrets();
        }
    }
    /** Gets a mapping of saved input data. */
    async getMap() {
        const secrets = await this._unsealSecrets();
        return { ...this._record.value.values, ...secrets };
    }
    /** Updates the input data mapping. */
    async setPlainText(values) {
        Object.assign(this._record.value.values, values);
        this._didChange = true;
    }
    /** Updates the input secrets mapping. */
    async setSecrets(values) {
        const unsealed = await this._unsealSecrets();
        Object.assign(unsealed, values);
        await this._sealSecrets();
    }
    async _sealSecrets() {
        const key = await this._getEncryptionKey.value;
        return this._secretsSealerSequencer.queue(async () => {
            if (!this._record.value.unsealedSecrets || isEmptyObject(this._record.value.unsealedSecrets)) {
                this._record.value.secrets = undefined;
                return;
            }
            const toSeal = JSON.stringify(this._record.value.unsealedSecrets);
            const iv = crypto.getRandomValues(new Uint8Array(MCP_ENCRYPTION_IV_LENGTH));
            const encrypted = await crypto.subtle.encrypt({ name: MCP_ENCRYPTION_KEY_ALGORITHM, iv: iv.buffer }, key, new TextEncoder().encode(toSeal).buffer);
            const enc = encodeBase64(VSBuffer.wrap(new Uint8Array(encrypted)));
            this._record.value.secrets = { iv: encodeBase64(VSBuffer.wrap(iv)), value: enc };
            this._didChange = true;
        });
    }
    async _unsealSecrets() {
        if (!this._record.value.secrets) {
            return this._record.value.unsealedSecrets ??= {};
        }
        if (this._record.value.unsealedSecrets) {
            return this._record.value.unsealedSecrets;
        }
        try {
            const key = await this._getEncryptionKey.value;
            const iv = decodeBase64(this._record.value.secrets.iv);
            const encrypted = decodeBase64(this._record.value.secrets.value);
            const decrypted = await crypto.subtle.decrypt({ name: MCP_ENCRYPTION_KEY_ALGORITHM, iv: iv.buffer }, key, encrypted.buffer);
            const unsealedSecrets = JSON.parse(new TextDecoder().decode(decrypted));
            this._record.value.unsealedSecrets = unsealedSecrets;
            return unsealedSecrets;
        }
        catch (e) {
            this._logService.warn('Error unsealing MCP secrets', e);
            this._record.value.secrets = undefined;
        }
        return {};
    }
};
McpRegistryInputStorage = McpRegistryInputStorage_1 = __decorate([
    __param(2, IStorageService),
    __param(3, ISecretStorageService),
    __param(4, ILogService)
], McpRegistryInputStorage);
export { McpRegistryInputStorage };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwUmVnaXN0cnlJbnB1dFN0b3JhZ2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvY29tbW9uL21jcFJlZ2lzdHJ5SW5wdXRTdG9yYWdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDN0QsT0FBTyxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDekYsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDakUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFHOUcsTUFBTSx1QkFBdUIsR0FBRyxrQkFBa0IsQ0FBQztBQUNuRCxNQUFNLDRCQUE0QixHQUFHLFNBQVMsQ0FBQztBQUMvQyxNQUFNLHNCQUFzQixHQUFHLEdBQUcsQ0FBQztBQUNuQyxNQUFNLHdCQUF3QixHQUFHLEVBQUUsQ0FBQyxDQUFDLFVBQVU7QUFDL0MsTUFBTSx1QkFBdUIsR0FBRyxDQUFDLENBQUM7QUFDbEMsTUFBTSxtQkFBbUIsR0FBRyxXQUFXLENBQUM7QUFZakMsSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBd0IsU0FBUSxVQUFVOzthQUN2QyxvQkFBZSxHQUFHLElBQUksU0FBUyxFQUFFLEFBQWxCLENBQW1CO0lBbUNqRCxZ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