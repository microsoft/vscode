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
import { relativePath } from '../../../../base/common/resources.js';
import { linesDiffComputers } from '../../../../editor/common/diff/linesDiffComputers.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { FileOperationError } from '../../../../platform/files/common/files.js';
import { detectEncodingFromBuffer } from '../../../services/textfile/common/encoding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ISCMService } from '../../scm/common/scm.js';
import { IChatService } from '../common/chatService/chatService.js';
import { ChatConfiguration } from '../common/constants.js';
import * as nls from '../../../../nls.js';
const MAX_CHANGES = 100;
const MAX_DIFFS_SIZE_BYTES = 900 * 1024;
const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB per file
/**
 * Regex to match `url = <remote-url>` lines in git config.
 */
const RemoteMatcher = /^\s*url\s*=\s*(.+\S)\s*$/mg;
/**
 * Extracts raw remote URLs from git config content.
 */
function getRawRemotes(text) {
    const remotes = [];
    let match;
    while (match = RemoteMatcher.exec(text)) {
        remotes.push(match[1]);
    }
    return remotes;
}
/**
 * Extracts a hostname from a git remote URL.
 *
 * Supports:
 * - URL-like remotes: https://github.com/..., ssh://git@github.com/..., git://github.com/...
 * - SCP-like remotes: git@github.com:owner/repo.git
 */
function getRemoteHost(remoteUrl) {
    try {
        // Try standard URL parsing first (works for https://, ssh://, git://)
        const url = new URL(remoteUrl);
        return url.hostname.toLowerCase();
    }
    catch {
        // Fallback for SCP-like syntax: [user@]host:path
        const atIndex = remoteUrl.lastIndexOf('@');
        const hostAndPath = atIndex !== -1 ? remoteUrl.slice(atIndex + 1) : remoteUrl;
        const colonIndex = hostAndPath.indexOf(':');
        if (colonIndex !== -1) {
            const host = hostAndPath.slice(0, colonIndex);
            return host ? host.toLowerCase() : undefined;
        }
        // Fallback for hostname/path format without scheme (e.g., devdiv.visualstudio.com/...)
        const slashIndex = hostAndPath.indexOf('/');
        if (slashIndex !== -1) {
            const host = hostAndPath.slice(0, slashIndex);
            return host ? host.toLowerCase() : undefined;
        }
        return undefined;
    }
}
/**
 * Determines the change type based on SCM resource properties.
 */
function determineChangeType(resource, groupId) {
    const contextValue = resource.contextValue?.toLowerCase() ?? '';
    const groupIdLower = groupId.toLowerCase();
    if (contextValue.includes('untracked') || contextValue.includes('add')) {
        return 'added';
    }
    if (contextValue.includes('delete')) {
        return 'deleted';
    }
    if (contextValue.includes('rename')) {
        return 'renamed';
    }
    if (groupIdLower.includes('untracked')) {
        return 'added';
    }
    if (resource.decorations.strikeThrough) {
        return 'deleted';
    }
    if (!resource.multiDiffEditorOriginalUri) {
        return 'added';
    }
    return 'modified';
}
/**
 * Generates a unified diff string compatible with `git apply`.
 *
 * Note: This implementation has a known limitation - if the only change between
 * files is the presence/absence of a trailing newline (content otherwise identical),
 * no diff will be generated because VS Code's diff algorithm treats the lines as equal.
 */
export async function generateUnifiedDiff(fileService, relPath, originalUri, modifiedUri, changeType) {
    try {
        let originalContent = '';
        let modifiedContent = '';
        if (originalUri && changeType !== 'added') {
            try {
                const originalFile = await fileService.readFile(originalUri, { limits: { size: MAX_FILE_SIZE_BYTES } });
                const detected = detectEncodingFromBuffer({ buffer: originalFile.value, bytesRead: originalFile.value.byteLength });
                if (detected.seemsBinary) {
                    return undefined; // skip binary files
                }
                originalContent = originalFile.value.toString();
            }
            catch (e) {
                if (e instanceof FileOperationError && e.fileOperationResult === 7 /* FileOperationResult.FILE_TOO_LARGE */) {
                    return undefined; // skip files exceeding size limit
                }
                if (changeType === 'modified') {
                    return undefined;
                }
            }
        }
        if (changeType !== 'deleted') {
            try {
                const modifiedFile = await fileService.readFile(modifiedUri, { limits: { size: MAX_FILE_SIZE_BYTES } });
                const detected = detectEncodingFromBuffer({ buffer: modifiedFile.value, bytesRead: modifiedFile.value.byteLength });
                if (detected.seemsBinary) {
                    return undefined; // skip binary files
                }
                modifiedContent = modifiedFile.value.toString();
            }
            catch (e) {
                if (e instanceof FileOperationError && e.fileOperationResult === 7 /* FileOperationResult.FILE_TOO_LARGE */) {
                    return undefined; // skip files exceeding size limit
                }
                return undefined;
            }
        }
        const originalLines = originalContent.split('\n');
        const modifiedLines = modifiedContent.split('\n');
        // Track whether files end with newline for git apply compatibility
        // split('\n') on "line1\nline2\n" gives ["line1", "line2", ""]
        // split('\n') on "line1\nline2" gives ["line1", "line2"]
        const originalEndsWithNewline = originalContent.length > 0 && originalContent.endsWith('\n');
        const modifiedEndsWithNewline = modifiedContent.length > 0 && modifiedContent.endsWith('\n');
        // Remove trailing empty element if file ends with newline
        if (originalEndsWithNewline && originalLines.length > 0 && originalLines[originalLines.length - 1] === '') {
            originalLines.pop();
        }
        if (modifiedEndsWithNewline && modifiedLines.length > 0 && modifiedLines[modifiedLines.length - 1] === '') {
            modifiedLines.pop();
        }
        const diffLines = [];
        const aPath = changeType === 'added' ? '/dev/null' : `a/${relPath}`;
        const bPath = changeType === 'deleted' ? '/dev/null' : `b/${relPath}`;
        diffLines.push(`--- ${aPath}`);
        diffLines.push(`+++ ${bPath}`);
        if (changeType === 'added') {
            if (modifiedLines.length > 0) {
                diffLines.push(`@@ -0,0 +1,${modifiedLines.length} @@`);
                for (const line of modifiedLines) {
                    diffLines.push(`+${line}`);
                }
                if (!modifiedEndsWithNewline) {
                    diffLines.push('\\ No newline at end of file');
                }
            }
        }
        else if (changeType === 'deleted') {
            if (originalLines.length > 0) {
                diffLines.push(`@@ -1,${originalLines.length} +0,0 @@`);
                for (const line of originalLines) {
                    diffLines.push(`-${line}`);
                }
                if (!originalEndsWithNewline) {
                    diffLines.push('\\ No newline at end of file');
                }
            }
        }
        else {
            const hunks = computeDiffHunks(originalLines, modifiedLines, originalEndsWithNewline, modifiedEndsWithNewline);
            for (const hunk of hunks) {
                diffLines.push(hunk);
            }
        }
        return diffLines.join('\n');
    }
    catch {
        return undefined;
    }
}
/**
 * Computes unified diff hunks using VS Code's diff algorithm.
 * Merges adjacent/overlapping hunks to produce a valid patch.
 */
function computeDiffHunks(originalLines, modifiedLines, originalEndsWithNewline, modifiedEndsWithNewline) {
    const contextSize = 3;
    const result = [];
    const diffComputer = linesDiffComputers.getDefault();
    const diffResult = diffComputer.computeDiff(originalLines, modifiedLines, {
        ignoreTrimWhitespace: false,
        maxComputationTimeMs: 1000,
        computeMoves: false
    });
    if (diffResult.changes.length === 0) {
        return result;
    }
    const hunkGroups = [];
    let currentGroup = [];
    for (const change of diffResult.changes) {
        if (currentGroup.length === 0) {
            currentGroup.push(change);
        }
        else {
            const lastChange = currentGroup[currentGroup.length - 1];
            const lastContextEnd = lastChange.original.endLineNumberExclusive - 1 + contextSize;
            const currentContextStart = change.original.startLineNumber - contextSize;
            // Merge if context regions overlap or are adjacent
            if (currentContextStart <= lastContextEnd + 1) {
                currentGroup.push(change);
            }
            else {
                hunkGroups.push(currentGroup);
                currentGroup = [change];
            }
        }
    }
    if (currentGroup.length > 0) {
        hunkGroups.push(currentGroup);
    }
    // Generate a single hunk for each group
    for (const group of hunkGroups) {
        const firstChange = group[0];
        const lastChange = group[group.length - 1];
        const hunkOrigStart = Math.max(1, firstChange.original.startLineNumber - contextSize);
        const hunkOrigEnd = Math.min(originalLines.length, lastChange.original.endLineNumberExclusive - 1 + contextSize);
        const hunkModStart = Math.max(1, firstChange.modified.startLineNumber - contextSize);
        const hunkLines = [];
        // Track which line in hunkLines corresponds to the last line of each file
        let lastOriginalLineIndex = -1;
        let lastModifiedLineIndex = -1;
        let origLineNum = hunkOrigStart;
        let origCount = 0;
        let modCount = 0;
        // Process each change in the group, emitting context lines between them
        for (const change of group) {
            const origStart = change.original.startLineNumber;
            const origEnd = change.original.endLineNumberExclusive;
            const modStart = change.modified.startLineNumber;
            const modEnd = change.modified.endLineNumberExclusive;
            // Emit context lines before this change
            while (origLineNum < origStart) {
                const idx = hunkLines.length;
                hunkLines.push(` ${originalLines[origLineNum - 1]}`);
                // Context lines are in both files
                if (origLineNum === originalLines.length) {
                    lastOriginalLineIndex = idx;
                }
                const modLineNum = hunkModStart + modCount;
                if (modLineNum === modifiedLines.length) {
                    lastModifiedLineIndex = idx;
                }
                origLineNum++;
                origCount++;
                modCount++;
            }
            // Emit deleted lines
            for (let i = origStart; i < origEnd; i++) {
                const idx = hunkLines.length;
                hunkLines.push(`-${originalLines[i - 1]}`);
                if (i === originalLines.length) {
                    lastOriginalLineIndex = idx;
                }
                origLineNum++;
                origCount++;
            }
            // Emit added lines
            for (let i = modStart; i < modEnd; i++) {
                const idx = hunkLines.length;
                hunkLines.push(`+${modifiedLines[i - 1]}`);
                if (i === modifiedLines.length) {
                    lastModifiedLineIndex = idx;
                }
                modCount++;
            }
        }
        // Emit trailing context lines
        while (origLineNum <= hunkOrigEnd) {
            const idx = hunkLines.length;
            hunkLines.push(` ${originalLines[origLineNum - 1]}`);
            // Context lines are in both files
            if (origLineNum === originalLines.length) {
                lastOriginalLineIndex = idx;
            }
            const modLineNum = hunkModStart + modCount;
            if (modLineNum === modifiedLines.length) {
                lastModifiedLineIndex = idx;
            }
            origLineNum++;
            origCount++;
            modCount++;
        }
        result.push(`@@ -${hunkOrigStart},${origCount} +${hunkModStart},${modCount} @@`);
        // Add "No newline at end of file" markers for git apply compatibility
        // The marker must appear immediately after the line that lacks a newline
        for (let i = 0; i < hunkLines.length; i++) {
            result.push(hunkLines[i]);
            const isLastOriginal = i === lastOriginalLineIndex;
            const isLastModified = i === lastModifiedLineIndex;
            if (isLastOriginal && isLastModified) {
                // Context line is the last line of both files
                // If either lacks newline, we need a marker (but only one)
                if (!originalEndsWithNewline || !modifiedEndsWithNewline) {
                    result.push('\\ No newline at end of file');
                }
            }
            else if (isLastOriginal && !originalEndsWithNewline) {
                // Deletion or context line that's only the last of original
                result.push('\\ No newline at end of file');
            }
            else if (isLastModified && !modifiedEndsWithNewline) {
                // Addition or context line that's only the last of modified
                result.push('\\ No newline at end of file');
            }
        }
    }
    return result;
}
/**
 * Captures lightweight repository metadata (branch, commit, remote) from SCM providers.
 * No file I/O or diff computation - reads only from already-loaded SCM observables.
 * Used on chat message submission to record the point-in-time commit state.
 */
export function captureRepoMetadata(scmService) {
    const repositories = [...scmService.repositories];
    if (repositories.length === 0) {
        return undefined;
    }
    const repository = repositories[0];
    const rootUri = repository.provider.rootUri;
    if (!rootUri) {
        return undefined;
    }
    let localBranch;
    let localHeadCommit;
    let remoteTrackingBranch;
    let remoteHeadCommit;
    let remoteBaseBranch;
    const historyProvider = repository.provider.historyProvider?.get();
    if (historyProvider) {
        const historyItemRef = historyProvider.historyItemRef.get();
        localBranch = historyItemRef?.name;
        localHeadCommit = historyItemRef?.revision;
        const historyItemRemoteRef = historyProvider.historyItemRemoteRef.get();
        if (historyItemRemoteRef) {
            remoteTrackingBranch = historyItemRemoteRef.name;
            remoteHeadCommit = historyItemRemoteRef.revision;
        }
        const historyItemBaseRef = historyProvider.historyItemBaseRef.get();
        if (historyItemBaseRef) {
            remoteBaseBranch = historyItemBaseRef.name;
        }
    }
    // Determine workspace type and sync status without file I/O.
    // Cannot determine remoteUrl/remoteVendor or detect plain-folder here (requires reading .git/config).
    // The full captureRepoInfo at export time will produce accurate classification.
    let workspaceType;
    let syncStatus;
    if (remoteTrackingBranch || remoteHeadCommit || remoteBaseBranch) {
        workspaceType = 'remote-git';
        if (!remoteTrackingBranch) {
            syncStatus = 'unpublished';
        }
        else if (localHeadCommit && remoteHeadCommit && localHeadCommit === remoteHeadCommit) {
            syncStatus = 'synced';
        }
        else {
            syncStatus = 'unpushed';
        }
    }
    else {
        // No remote refs available; conservatively classify as local-git
        workspaceType = 'local-git';
        syncStatus = 'local-only';
    }
    return {
        workspaceType,
        syncStatus,
        localBranch,
        remoteTrackingBranch,
        remoteBaseBranch,
        localHeadCommit,
        remoteHeadCommit,
        diffsStatus: 'notCaptured',
    };
}
/**
 * Captures full repository state including working tree diffs.
 * Performs file I/O and diff computation - should only be called on explicit user action (e.g., export).
 */
export async function captureRepoInfo(scmService, fileService) {
    const repositories = [...scmService.repositories];
    if (repositories.length === 0) {
        return undefined;
    }
    const repository = repositories[0];
    const rootUri = repository.provider.rootUri;
    if (!rootUri) {
        return undefined;
    }
    let hasGit = false;
    try {
        const gitDirUri = rootUri.with({ path: `${rootUri.path}/.git` });
        hasGit = await fileService.exists(gitDirUri);
    }
    catch {
        // ignore
    }
    if (!hasGit) {
        return {
            workspaceType: 'plain-folder',
            syncStatus: 'no-git',
            diffs: undefined
        };
    }
    let remoteUrl;
    try {
        // TODO: Handle git worktrees where .git is a file pointing to the actual git directory
        const gitConfigUri = rootUri.with({ path: `${rootUri.path}/.git/config` });
        const exists = await fileService.exists(gitConfigUri);
        if (exists) {
            const content = await fileService.readFile(gitConfigUri);
            const remotes = getRawRemotes(content.value.toString());
            remoteUrl = remotes[0];
        }
    }
    catch {
        // ignore
    }
    let localBranch;
    let localHeadCommit;
    let remoteTrackingBranch;
    let remoteHeadCommit;
    let remoteBaseBranch;
    const historyProvider = repository.provider.historyProvider?.get();
    if (historyProvider) {
        const historyItemRef = historyProvider.historyItemRef.get();
        localBranch = historyItemRef?.name;
        localHeadCommit = historyItemRef?.revision;
        const historyItemRemoteRef = historyProvider.historyItemRemoteRef.get();
        if (historyItemRemoteRef) {
            remoteTrackingBranch = historyItemRemoteRef.name;
            remoteHeadCommit = historyItemRemoteRef.revision;
        }
        const historyItemBaseRef = historyProvider.historyItemBaseRef.get();
        if (historyItemBaseRef) {
            remoteBaseBranch = historyItemBaseRef.name;
        }
    }
    let workspaceType;
    let syncStatus;
    if (!remoteUrl) {
        workspaceType = 'local-git';
        syncStatus = 'local-only';
    }
    else {
        workspaceType = 'remote-git';
        if (!remoteTrackingBranch) {
            syncStatus = 'unpublished';
        }
        else if (localHeadCommit === remoteHeadCommit) {
            syncStatus = 'synced';
        }
        else {
            syncStatus = 'unpushed';
        }
    }
    let remoteVendor;
    if (remoteUrl) {
        const host = getRemoteHost(remoteUrl);
        if (host === 'github.com') {
            remoteVendor = 'github';
        }
        else if (host === 'dev.azure.com' || (host && host.endsWith('.visualstudio.com'))) {
            remoteVendor = 'ado';
        }
        else {
            remoteVendor = 'other';
        }
    }
    let totalChangeCount = 0;
    for (const group of repository.provider.groups) {
        totalChangeCount += group.resources.length;
    }
    const baseRepoData = {
        workspaceType,
        syncStatus,
        remoteUrl,
        remoteVendor,
        localBranch,
        remoteTrackingBranch,
        remoteBaseBranch,
        localHeadCommit,
        remoteHeadCommit,
    };
    if (totalChangeCount === 0) {
        return {
            ...baseRepoData,
            diffs: undefined,
            diffsStatus: 'noChanges',
            changedFileCount: 0
        };
    }
    if (totalChangeCount > MAX_CHANGES) {
        return {
            ...baseRepoData,
            diffs: undefined,
            diffsStatus: 'tooManyChanges',
            changedFileCount: totalChangeCount
        };
    }
    const diffs = [];
    const diffPromises = [];
    for (const group of repository.provider.groups) {
        for (const resource of group.resources) {
            const relPath = relativePath(rootUri, resource.sourceUri) ?? resource.sourceUri.path;
            const changeType = determineChangeType(resource, group.id);
            const diffPromise = (async () => {
                const unifiedDiff = await generateUnifiedDiff(fileService, relPath, resource.multiDiffEditorOriginalUri, resource.sourceUri, changeType);
                return {
                    relativePath: relPath,
                    changeType,
                    status: group.label || group.id,
                    unifiedDiff
                };
            })();
            diffPromises.push(diffPromise);
        }
    }
    const generatedDiffs = await Promise.all(diffPromises);
    for (const diff of generatedDiffs) {
        if (diff) {
            diffs.push(diff);
        }
    }
    const diffsJson = JSON.stringify(diffs);
    const diffsSizeBytes = new TextEncoder().encode(diffsJson).length;
    if (diffsSizeBytes > MAX_DIFFS_SIZE_BYTES) {
        return {
            ...baseRepoData,
            diffs: undefined,
            diffsStatus: 'tooLarge',
            changedFileCount: totalChangeCount
        };
    }
    return {
        ...baseRepoData,
        diffs,
        diffsStatus: 'included',
        changedFileCount: totalChangeCount
    };
}
/**
 * Captures lightweight repository metadata for chat sessions on first message.
 * Only reads from already-loaded SCM provider observables, no file I/O.
 * Full diff capture is deferred to export time (see chatExportZip.ts).
 */
let ChatRepoInfoContribution = class ChatRepoInfoContribution extends Disposable {
    static { this.ID = 'workbench.contrib.chatRepoInfo'; }
    constructor(chatService, chatEntitlementService, scmService, logService, configurationService) {
        super();
        this.chatService = chatService;
        this.chatEntitlementService = chatEntitlementService;
        this.scmService = scmService;
        this.logService = logService;
        this.configurationService = configurationService;
        this._configurationRegistered = false;
        this.registerConfigurationIfInternal();
        this._register(this.chatEntitlementService.onDidChangeEntitlement(() => {
            this.registerConfigurationIfInternal();
        }));
        this._register(this.chatService.onDidSubmitRequest(({ chatSessionResource }) => {
            const model = this.chatService.getSession(chatSessionResource);
            if (!model) {
                return;
            }
            this.captureAndSetRepoMetadata(model);
        }));
    }
    registerConfigurationIfInternal() {
        if (this._configurationRegistered) {
            return;
        }
        if (!this.chatEntitlementService.isInternal) {
            return;
        }
        const registry = Registry.as(ConfigurationExtensions.Configuration);
        registry.registerConfiguration({
            id: 'chatRepoInfo',
            title: nls.localize('chatRepoInfoConfigurationTitle', "Chat Repository Info"),
            type: 'object',
            properties: {
                [ChatConfiguration.RepoInfoEnabled]: {
                    type: 'boolean',
                    description: nls.localize('chat.repoInfo.enabled', "Controls whether lightweight repository metadata (branch, commit, remotes) is captured when a chat request is submitted for internal diagnostics."),
                    default: false,
                }
            }
        });
        this._configurationRegistered = true;
        this.logService.debug('[ChatRepoInfo] Configuration registered for internal user');
    }
    /**
     * Captures lightweight metadata (branch, commit, remote refs) on first message.
     * Synchronous, no file I/O. Reads only from SCM provider observables.
     */
    captureAndSetRepoMetadata(model) {
        if (!this.chatEntitlementService.isInternal) {
            return;
        }
        if (!this.configurationService.getValue(ChatConfiguration.RepoInfoEnabled)) {
            return;
        }
        if (model.repoData) {
            return;
        }
        try {
            const metadata = captureRepoMetadata(this.scmService);
            if (metadata) {
                model.setRepoData(metadata);
                if (!metadata.localHeadCommit) {
                    this.logService.warn('[ChatRepoInfo] Captured repo metadata without commit hash - git history may not be ready');
                }
            }
            else {
                this.logService.debug('[ChatRepoInfo] No SCM repository available for chat session');
            }
        }
        catch (error) {
            this.logService.warn('[ChatRepoInfo] Failed to capture repo metadata:', error);
        }
    }
};
ChatRepoInfoContribution = __decorate([
    __param(0, IChatService),
    __param(1, IChatEntitlementService),
    __param(2, ISCMService),
    __param(3, ILogService),
    __param(4, IConfigurationService)
], ChatRepoInfoContribution);
export { ChatRepoInfoContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFJlcG9JbmZvLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRSZXBvSW5mby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRXBFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxVQUFVLElBQUksdUJBQXVCLEVBQTBCLE1BQU0sb0VBQW9FLENBQUM7QUFDbkosT0FBTyxFQUFnQixrQkFBa0IsRUFBdUIsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuSCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRTVFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxXQUFXLEVBQWdCLE1BQU0seUJBQXlCLENBQUM7QUFDcEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRTNELE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFFMUMsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDO0FBQ3hCLE1BQU0sb0JBQW9CLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FB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