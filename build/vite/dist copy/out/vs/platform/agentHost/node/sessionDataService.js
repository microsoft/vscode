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
import { ReferenceCollection } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession } from '../common/agentService.js';
import { SessionDatabase } from './sessionDatabase.js';
class SessionDatabaseCollection extends ReferenceCollection {
    constructor(_getDbPath, _logService) {
        super();
        this._getDbPath = _getDbPath;
        this._logService = _logService;
    }
    createReferencedObject(key) {
        const dbPath = this._getDbPath(key);
        this._logService.trace(`[SessionDataService] Opening database: ${dbPath}`);
        return new SessionDatabase(dbPath);
    }
    destroyReferencedObject(_key, object) {
        object.dispose();
    }
}
/**
 * Implementation of {@link ISessionDataService} that stores per-session data
 * under `{userDataPath}/agentSessionData/{sessionId}/`.
 */
let SessionDataService = class SessionDataService {
    constructor(userDataPath, _fileService, _logService) {
        this._fileService = _fileService;
        this._logService = _logService;
        this._basePath = URI.joinPath(userDataPath, 'agentSessionData');
        this._databases = new SessionDatabaseCollection(key => URI.joinPath(this._basePath, key, 'session.db').fsPath, this._logService);
    }
    getSessionDataDir(session) {
        return this.getSessionDataDirById(AgentSession.id(session));
    }
    getSessionDataDirById(sessionId) {
        const sanitized = sessionId.replace(/[^a-zA-Z0-9_.-]/g, '-');
        return URI.joinPath(this._basePath, sanitized);
    }
    _sanitizedSessionKey(session) {
        return AgentSession.id(session).replace(/[^a-zA-Z0-9_.-]/g, '-');
    }
    openDatabase(session) {
        return this._databases.acquire(this._sanitizedSessionKey(session));
    }
    async tryOpenDatabase(session) {
        const key = this._sanitizedSessionKey(session);
        const dbPath = URI.joinPath(this._basePath, key, 'session.db');
        if (!await this._fileService.exists(dbPath)) {
            return undefined;
        }
        return this._databases.acquire(key);
    }
    async deleteSessionData(session) {
        const dir = this.getSessionDataDir(session);
        try {
            if (await this._fileService.exists(dir)) {
                await this._fileService.del(dir, { recursive: true });
                this._logService.trace(`[SessionDataService] Deleted session data: ${dir.toString()}`);
            }
        }
        catch (err) {
            this._logService.warn(`[SessionDataService] Failed to delete session data: ${dir.toString()}`, err);
        }
    }
    async cleanupOrphanedData(knownSessionIds) {
        try {
            const exists = await this._fileService.exists(this._basePath);
            if (!exists) {
                return;
            }
            const stat = await this._fileService.resolve(this._basePath);
            if (!stat.children) {
                return;
            }
            const deletions = [];
            for (const child of stat.children) {
                if (!child.isDirectory) {
                    continue;
                }
                const name = child.name;
                if (!knownSessionIds.has(name)) {
                    this._logService.trace(`[SessionDataService] Cleaning up orphaned session data: ${name}`);
                    deletions.push(this._fileService.del(child.resource, { recursive: true }).catch(err => {
                        this._logService.warn(`[SessionDataService] Failed to clean up orphaned data: ${name}`, err);
                    }));
                }
            }
            await Promise.all(deletions);
        }
        catch (err) {
            this._logService.warn('[SessionDataService] Failed to run orphan cleanup', err);
        }
    }
};
SessionDataService = __decorate([
    __param(1, IFileService),
    __param(2, ILogService)
], SessionDataService);
export { SessionDataService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbkRhdGFTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L25vZGUvc2Vzc2lvbkRhdGFTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBYyxtQkFBbUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDM0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3RELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUV6RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFdkQsTUFBTSx5QkFBMEIsU0FBUSxtQkFBcUM7SUFDNUUsWUFDa0IsVUFBbUMsRUFDbkMsV0FBd0I7UUFFekMsS0FBSyxFQUFFLENBQUM7UUFIUyxlQUFVLEdBQVYsVUFBVSxDQUF5QjtRQUNuQyxnQkFBVyxHQUFYLFdBQVcsQ0FBYTtJQUcxQyxDQUFDO0lBRVMsc0JBQXNCLENBQUMsR0FBVztRQUMzQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3BDLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLDBDQUEwQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLE9BQU8sSUFBSSxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVTLHVCQUF1QixDQUFDLElBQVksRUFBRSxNQUF3QjtRQUN2RSxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbEIsQ0FBQztDQUNEO0FBRUQ7OztHQUdHO0FB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