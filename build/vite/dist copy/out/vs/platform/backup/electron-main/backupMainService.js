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
var BackupMainService_1;
import { createHash } from 'crypto';
import { isEqual } from '../../../base/common/extpath.js';
import { Schemas } from '../../../base/common/network.js';
import { join } from '../../../base/common/path.js';
import { isLinux } from '../../../base/common/platform.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { Promises, RimRafMode } from '../../../base/node/pfs.js';
import { isEmptyWindowBackupInfo, deserializeWorkspaceInfos, deserializeFolderInfos } from '../node/backup.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { IStateService } from '../../state/node/state.js';
import { HotExitConfiguration } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { isFolderBackupInfo } from '../common/backup.js';
import { isWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { createEmptyWorkspaceIdentifier } from '../../workspaces/node/workspaces.js';
let BackupMainService = class BackupMainService {
    static { BackupMainService_1 = this; }
    static { this.backupWorkspacesMetadataStorageKey = 'backupWorkspaces'; }
    constructor(environmentMainService, configurationService, logService, stateService) {
        this.configurationService = configurationService;
        this.logService = logService;
        this.stateService = stateService;
        this.workspaces = [];
        this.folders = [];
        this.emptyWindows = [];
        // Comparers for paths and resources that will
        // - ignore path casing on Windows/macOS
        // - respect path casing on Linux
        this.backupUriComparer = extUriBiasedIgnorePathCase;
        this.backupPathComparer = { isEqual: (pathA, pathB) => isEqual(pathA, pathB, !isLinux) };
        this.backupHome = environmentMainService.backupHome;
    }
    async initialize() {
        // read backup workspaces
        const serializedBackupWorkspaces = this.stateService.getItem(BackupMainService_1.backupWorkspacesMetadataStorageKey) ?? { workspaces: [], folders: [], emptyWindows: [] };
        // validate empty workspaces backups first
        this.emptyWindows = await this.validateEmptyWorkspaces(serializedBackupWorkspaces.emptyWindows);
        // validate workspace backups
        this.workspaces = await this.validateWorkspaces(deserializeWorkspaceInfos(serializedBackupWorkspaces));
        // validate folder backups
        this.folders = await this.validateFolders(deserializeFolderInfos(serializedBackupWorkspaces));
        // store metadata in case some workspaces or folders have been removed
        this.storeWorkspacesMetadata();
    }
    getWorkspaceBackups() {
        if (this.isHotExitOnExitAndWindowClose()) {
            // Only non-folder windows are restored on main process launch when
            // hot exit is configured as onExitAndWindowClose.
            return [];
        }
        return this.workspaces.slice(0); // return a copy
    }
    getFolderBackups() {
        if (this.isHotExitOnExitAndWindowClose()) {
            // Only non-folder windows are restored on main process launch when
            // hot exit is configured as onExitAndWindowClose.
            return [];
        }
        return this.folders.slice(0); // return a copy
    }
    isHotExitEnabled() {
        return this.getHotExitConfig() !== HotExitConfiguration.OFF;
    }
    isHotExitOnExitAndWindowClose() {
        return this.getHotExitConfig() === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE;
    }
    getHotExitConfig() {
        const config = this.configurationService.getValue();
        return config?.files?.hotExit || HotExitConfiguration.ON_EXIT;
    }
    getEmptyWindowBackups() {
        return this.emptyWindows.slice(0); // return a copy
    }
    registerWorkspaceBackup(workspaceInfo, migrateFrom) {
        if (!this.workspaces.some(workspace => workspaceInfo.workspace.id === workspace.workspace.id)) {
            this.workspaces.push(workspaceInfo);
            this.storeWorkspacesMetadata();
        }
        const backupPath = join(this.backupHome, workspaceInfo.workspace.id);
        if (migrateFrom) {
            return this.moveBackupFolder(backupPath, migrateFrom).then(() => backupPath);
        }
        return backupPath;
    }
    async moveBackupFolder(backupPath, moveFromPath) {
        // Target exists: make sure to convert existing backups to empty window backups
        if (await Promises.exists(backupPath)) {
            await this.convertToEmptyWindowBackup(backupPath);
        }
        // When we have data to migrate from, move it over to the target location
        if (await Promises.exists(moveFromPath)) {
            try {
                await Promises.rename(moveFromPath, backupPath, false /* no retry */);
            }
            catch (error) {
                this.logService.error(`Backup: Could not move backup folder to new location: ${error.toString()}`);
            }
        }
    }
    registerFolderBackup(folderInfo) {
        if (!this.folders.some(folder => this.backupUriComparer.isEqual(folderInfo.folderUri, folder.folderUri))) {
            this.folders.push(folderInfo);
            this.storeWorkspacesMetadata();
        }
        return join(this.backupHome, this.getFolderHash(folderInfo));
    }
    registerEmptyWindowBackup(emptyWindowInfo) {
        if (!this.emptyWindows.some(emptyWindow => !!emptyWindow.backupFolder && this.backupPathComparer.isEqual(emptyWindow.backupFolder, emptyWindowInfo.backupFolder))) {
            this.emptyWindows.push(emptyWindowInfo);
            this.storeWorkspacesMetadata();
        }
        return join(this.backupHome, emptyWindowInfo.backupFolder);
    }
    async validateWorkspaces(rootWorkspaces) {
        if (!Array.isArray(rootWorkspaces)) {
            return [];
        }
        const seenIds = new Set();
        const result = [];
        // Validate Workspaces
        for (const workspaceInfo of rootWorkspaces) {
            const workspace = workspaceInfo.workspace;
            if (!isWorkspaceIdentifier(workspace)) {
                return []; // wrong format, skip all entries
            }
            if (!seenIds.has(workspace.id)) {
                seenIds.add(workspace.id);
                const backupPath = join(this.backupHome, workspace.id);
                const hasBackups = await this.doHasBackups(backupPath);
                // If the workspace has no backups, ignore it
                if (hasBackups) {
                    if (workspace.configPath.scheme !== Schemas.file || await Promises.exists(workspace.configPath.fsPath)) {
                        result.push(workspaceInfo);
                    }
                    else {
                        // If the workspace has backups, but the target workspace is missing, convert backups to empty ones
                        await this.convertToEmptyWindowBackup(backupPath);
                    }
                }
                else {
                    await this.deleteStaleBackup(backupPath);
                }
            }
        }
        return result;
    }
    async validateFolders(folderWorkspaces) {
        if (!Array.isArray(folderWorkspaces)) {
            return [];
        }
        const result = [];
        const seenIds = new Set();
        for (const folderInfo of folderWorkspaces) {
            const folderURI = folderInfo.folderUri;
            const key = this.backupUriComparer.getComparisonKey(folderURI);
            if (!seenIds.has(key)) {
                seenIds.add(key);
                const backupPath = join(this.backupHome, this.getFolderHash(folderInfo));
                const hasBackups = await this.doHasBackups(backupPath);
                // If the folder has no backups, ignore it
                if (hasBackups) {
                    if (folderURI.scheme !== Schemas.file || await Promises.exists(folderURI.fsPath)) {
                        result.push(folderInfo);
                    }
                    else {
                        // If the folder has backups, but the target workspace is missing, convert backups to empty ones
                        await this.convertToEmptyWindowBackup(backupPath);
                    }
                }
                else {
                    await this.deleteStaleBackup(backupPath);
                }
            }
        }
        return result;
    }
    async validateEmptyWorkspaces(emptyWorkspaces) {
        if (!Array.isArray(emptyWorkspaces)) {
            return [];
        }
        const result = [];
        const seenIds = new Set();
        // Validate Empty Windows
        for (const backupInfo of emptyWorkspaces) {
            const backupFolder = backupInfo.backupFolder;
            if (typeof backupFolder !== 'string') {
                return [];
            }
            if (!seenIds.has(backupFolder)) {
                seenIds.add(backupFolder);
                const backupPath = join(this.backupHome, backupFolder);
                if (await this.doHasBackups(backupPath)) {
                    result.push(backupInfo);
                }
                else {
                    await this.deleteStaleBackup(backupPath);
                }
            }
        }
        return result;
    }
    async deleteStaleBackup(backupPath) {
        try {
            await Promises.rm(backupPath, RimRafMode.MOVE);
        }
        catch (error) {
            this.logService.error(`Backup: Could not delete stale backup: ${error.toString()}`);
        }
    }
    prepareNewEmptyWindowBackup() {
        // We are asked to prepare a new empty window backup folder.
        // Empty windows backup folders are derived from a workspace
        // identifier, so we generate a new empty workspace identifier
        // until we found a unique one.
        let emptyWorkspaceIdentifier = createEmptyWorkspaceIdentifier();
        while (this.emptyWindows.some(emptyWindow => !!emptyWindow.backupFolder && this.backupPathComparer.isEqual(emptyWindow.backupFolder, emptyWorkspaceIdentifier.id))) {
            emptyWorkspaceIdentifier = createEmptyWorkspaceIdentifier();
        }
        return { backupFolder: emptyWorkspaceIdentifier.id };
    }
    async convertToEmptyWindowBackup(backupPath) {
        const newEmptyWindowBackupInfo = this.prepareNewEmptyWindowBackup();
        // Rename backupPath to new empty window backup path
        const newEmptyWindowBackupPath = join(this.backupHome, newEmptyWindowBackupInfo.backupFolder);
        try {
            await Promises.rename(backupPath, newEmptyWindowBackupPath, false /* no retry */);
        }
        catch (error) {
            this.logService.error(`Backup: Could not rename backup folder: ${error.toString()}`);
            return false;
        }
        this.emptyWindows.push(newEmptyWindowBackupInfo);
        return true;
    }
    async getDirtyWorkspaces() {
        const dirtyWorkspaces = [];
        // Workspaces with backups
        for (const workspace of this.workspaces) {
            if ((await this.hasBackups(workspace))) {
                dirtyWorkspaces.push(workspace);
            }
        }
        // Folders with backups
        for (const folder of this.folders) {
            if ((await this.hasBackups(folder))) {
                dirtyWorkspaces.push(folder);
            }
        }
        return dirtyWorkspaces;
    }
    hasBackups(backupLocation) {
        let backupPath;
        // Empty
        if (isEmptyWindowBackupInfo(backupLocation)) {
            backupPath = join(this.backupHome, backupLocation.backupFolder);
        }
        // Folder
        else if (isFolderBackupInfo(backupLocation)) {
            backupPath = join(this.backupHome, this.getFolderHash(backupLocation));
        }
        // Workspace
        else {
            backupPath = join(this.backupHome, backupLocation.workspace.id);
        }
        return this.doHasBackups(backupPath);
    }
    async doHasBackups(backupPath) {
        try {
            const backupSchemas = await Promises.readdir(backupPath);
            for (const backupSchema of backupSchemas) {
                try {
                    const backupSchemaChildren = await Promises.readdir(join(backupPath, backupSchema));
                    if (backupSchemaChildren.length > 0) {
                        return true;
                    }
                }
                catch {
                    // invalid folder
                }
            }
        }
        catch {
            // backup path does not exist
        }
        return false;
    }
    storeWorkspacesMetadata() {
        const serializedBackupWorkspaces = {
            workspaces: this.workspaces.map(({ workspace, remoteAuthority }) => {
                const serializedWorkspaceBackupInfo = {
                    id: workspace.id,
                    configURIPath: workspace.configPath.toString()
                };
                if (remoteAuthority) {
                    serializedWorkspaceBackupInfo.remoteAuthority = remoteAuthority;
                }
                return serializedWorkspaceBackupInfo;
            }),
            folders: this.folders.map(({ folderUri, remoteAuthority }) => {
                const serializedFolderBackupInfo = {
                    folderUri: folderUri.toString()
                };
                if (remoteAuthority) {
                    serializedFolderBackupInfo.remoteAuthority = remoteAuthority;
                }
                return serializedFolderBackupInfo;
            }),
            emptyWindows: this.emptyWindows.map(({ backupFolder, remoteAuthority }) => {
                const serializedEmptyWindowBackupInfo = {
                    backupFolder
                };
                if (remoteAuthority) {
                    serializedEmptyWindowBackupInfo.remoteAuthority = remoteAuthority;
                }
                return serializedEmptyWindowBackupInfo;
            })
        };
        this.stateService.setItem(BackupMainService_1.backupWorkspacesMetadataStorageKey, serializedBackupWorkspaces);
    }
    getFolderHash(folder) {
        const folderUri = folder.folderUri;
        let key;
        if (folderUri.scheme === Schemas.file) {
            key = isLinux ? folderUri.fsPath : folderUri.fsPath.toLowerCase(); // for backward compatibility, use the fspath as key
        }
        else {
            key = folderUri.toString().toLowerCase();
        }
        return createHash('md5').update(key).digest('hex'); // CodeQL [SM04514] Using MD5 to convert a file path to a fixed length
    }
};
BackupMainService = BackupMainService_1 = __decorate([
    __param(0, IEnvironmentMainService),
    __param(1, IConfigurationService),
    __param(2, ILogService),
    __param(3, IStateService)
], BackupMainService);
export { BackupMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja3VwTWFpblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9iYWNrdXAvZWxlY3Ryb24tbWFpbi9iYWNrdXBNYWluU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUNwQyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUVqRSxPQUFPLEVBQXVELHVCQUF1QixFQUFFLHlCQUF5QixFQUFFLHNCQUFzQixFQUFpRyxNQUFNLG1CQUFtQixDQUFDO0FBQ25RLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsb0JBQW9CLEVBQXVCLE1BQU0sNkJBQTZCLENBQUM7QUFDeEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3RELE9BQU8sRUFBcUIsa0JBQWtCLEVBQXdCLE1BQU0scUJBQXFCLENBQUM7QUFDbEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUNB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