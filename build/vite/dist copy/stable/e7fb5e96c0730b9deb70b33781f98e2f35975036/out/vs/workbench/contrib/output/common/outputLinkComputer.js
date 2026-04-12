/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';
import * as extpath from '../../../../base/common/extpath.js';
import * as resources from '../../../../base/common/resources.js';
import * as strings from '../../../../base/common/strings.js';
import { Range } from '../../../../editor/common/core/range.js';
import { isWindows } from '../../../../base/common/platform.js';
import { Schemas } from '../../../../base/common/network.js';
import { WorkerTextModelSyncServer } from '../../../../editor/common/services/textModelSync/textModelSync.impl.js';
export class OutputLinkComputer {
    constructor(workerServer) {
        this._requestHandlerBrand = undefined;
        this.workerTextModelSyncServer = new WorkerTextModelSyncServer();
        this.patterns = new Map();
        this.workerTextModelSyncServer.bindToServer(workerServer);
    }
    $setWorkspaceFolders(workspaceFolders) {
        this.computePatterns(workspaceFolders);
    }
    computePatterns(_workspaceFolders) {
        // Produce patterns for each workspace root we are configured with
        // This means that we will be able to detect links for paths that
        // contain any of the workspace roots as segments.
        const workspaceFolders = _workspaceFolders
            .sort((resourceStrA, resourceStrB) => resourceStrB.length - resourceStrA.length) // longest paths first (for https://github.com/microsoft/vscode/issues/88121)
            .map(resourceStr => URI.parse(resourceStr));
        for (const workspaceFolder of workspaceFolders) {
            const patterns = OutputLinkComputer.createPatterns(workspaceFolder);
            this.patterns.set(workspaceFolder, patterns);
        }
    }
    getModel(uri) {
        return this.workerTextModelSyncServer.getModel(uri);
    }
    $computeLinks(uri) {
        const model = this.getModel(uri);
        if (!model) {
            return [];
        }
        const links = [];
        const lines = strings.splitLines(model.getValue());
        // For each workspace root patterns
        for (const [folderUri, folderPatterns] of this.patterns) {
            const resourceCreator = {
                toResource: (folderRelativePath) => {
                    if (typeof folderRelativePath === 'string') {
                        return resources.joinPath(folderUri, folderRelativePath);
                    }
                    return null;
                }
            };
            for (let i = 0, len = lines.length; i < len; i++) {
                links.push(...OutputLinkComputer.detectLinks(lines[i], i + 1, folderPatterns, resourceCreator));
            }
        }
        return links;
    }
    static createPatterns(workspaceFolder) {
        const patterns = [];
        const workspaceFolderPath = workspaceFolder.scheme === Schemas.file ? workspaceFolder.fsPath : workspaceFolder.path;
        const workspaceFolderVariants = [workspaceFolderPath];
        if (isWindows && workspaceFolder.scheme === Schemas.file) {
            workspaceFolderVariants.push(extpath.toSlashes(workspaceFolderPath));
        }
        for (const workspaceFolderVariant of workspaceFolderVariants) {
            const validPathCharacterPattern = '[^\\s\\(\\):<>\'"]';
            const validPathCharacterOrSpacePattern = `(?:${validPathCharacterPattern}| ${validPathCharacterPattern})`;
            const pathPattern = `${validPathCharacterOrSpacePattern}+\\.${validPathCharacterPattern}+`;
            const strictPathPattern = `${validPathCharacterPattern}+`;
            // Example: /workspaces/express/server.js on line 8, column 13
            patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceFolderVariant) + `(${pathPattern}) on line ((\\d+)(, column (\\d+))?)`, 'gi'));
            // Example: /workspaces/express/server.js:line 8, column 13
            patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceFolderVariant) + `(${pathPattern}):line ((\\d+)(, column (\\d+))?)`, 'gi'));
            // Example: /workspaces/mankala/Features.ts(45): error
            // Example: /workspaces/mankala/Features.ts (45): error
            // Example: /workspaces/mankala/Features.ts(45,18): error
            // Example: /workspaces/mankala/Features.ts (45,18): error
            // Example: /workspaces/mankala/Features Special.ts (45,18): error
            patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceFolderVariant) + `(${pathPattern})(\\s?\\((\\d+)(,(\\d+))?)\\)`, 'gi'));
            // Example: at /workspaces/mankala/Game.ts
            // Example: at /workspaces/mankala/Game.ts:336
            // Example: at /workspaces/mankala/Game.ts:336:9
            patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceFolderVariant) + `(${strictPathPattern})(:(\\d+))?(:(\\d+))?`, 'gi'));
        }
        return patterns;
    }
    /**
     * Detect links. Made static to allow for tests.
     */
    static detectLinks(line, lineIndex, patterns, resourceCreator) {
        const links = [];
        patterns.forEach(pattern => {
            pattern.lastIndex = 0; // the holy grail of software development
            let match;
            let offset = 0;
            while ((match = pattern.exec(line)) !== null) {
                // Convert the relative path information to a resource that we can use in links
                const folderRelativePath = strings.rtrim(match[1], '.').replace(/\\/g, '/'); // remove trailing "." that likely indicate end of sentence
                let resourceString;
                try {
                    const resource = resourceCreator.toResource(folderRelativePath);
                    if (resource) {
                        resourceString = resource.toString();
                    }
                }
                catch (error) {
                    continue; // we might find an invalid URI and then we dont want to loose all other links
                }
                // Append line/col information to URI if matching
                if (match[3]) {
                    const lineNumber = match[3];
                    if (match[5]) {
                        const columnNumber = match[5];
                        resourceString = strings.format('{0}#{1},{2}', resourceString, lineNumber, columnNumber);
                    }
                    else {
                        resourceString = strings.format('{0}#{1}', resourceString, lineNumber);
                    }
                }
                const fullMatch = strings.rtrim(match[0], '.'); // remove trailing "." that likely indicate end of sentence
                const index = line.indexOf(fullMatch, offset);
                offset = index + fullMatch.length;
                const linkRange = {
                    startColumn: index + 1,
                    startLineNumber: lineIndex,
                    endColumn: index + 1 + fullMatch.length,
                    endLineNumber: lineIndex
                };
                if (links.some(link => Range.areIntersectingOrTouching(link.range, linkRange))) {
                    return; // Do not detect duplicate links
                }
                links.push({
                    range: linkRange,
                    url: resourceString
                });
            }
        });
        return links;
    }
}
export function create(workerServer) {
    return new OutputLinkComputer(workerServer);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0TGlua0NvbXB1dGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvb3V0cHV0L2NvbW1vbi9vdXRwdXRMaW5rQ29tcHV0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sS0FBSyxPQUFPLE1BQU0sb0NBQW9DLENBQUM7QUFDOUQsT0FBTyxLQUFLLFNBQVMsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEtBQUssT0FBTyxNQUFNLG9DQUFvQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTdELE9BQU8sRUFBRSx5QkFBeUIsRUFBZ0IsTUFBTSx3RUFBd0UsQ0FBQztBQU1qSSxNQUFNLE9BQU8sa0JBQWtCO0lBTTlCLFlBQVksWUFBOEI7UUFMMUMseUJBQW9CLEdBQVMsU0FBUyxDQUFDO1FBRXRCLDhCQUF5QixHQUFHLElBQUkseUJBQXlCLEVBQUUsQ0FBQztRQUNyRSxhQUFRLEdBQUcsSUFBSSxHQUFHLEVBQWtDLENBQUM7UUFHNUQsSUFBSSxDQUFDLHlCQUF5QixDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBRUQsb0JBQW9CLENBQUMsZ0JBQTBCO1FBQzlDLElBQUksQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRU8sZUFBZSxDQUFDLGlCQUEyQjtRQUVsRCxrRUFBa0U7UUFDbEUsaUVBQWlFO1FBQ2pFLGtEQUFrRDtRQUNsRCxNQUFNLGdC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