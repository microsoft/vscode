/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as glob from '../../../../base/common/glob.js';
import { basename } from '../../../../base/common/path.js';
import { isDocumentExcludePattern } from './notebookCommon.js';
export class NotebookProviderInfo {
    get selectors() {
        return this._selectors;
    }
    get options() {
        return this._options;
    }
    constructor(descriptor) {
        this.extension = descriptor.extension;
        this.id = descriptor.id;
        this.displayName = descriptor.displayName;
        this._selectors = descriptor.selectors?.map(selector => ({
            include: selector.filenamePattern,
            exclude: selector.excludeFileNamePattern || ''
        }))
            || descriptor._selectors
            || [];
        this.priority = descriptor.priority;
        this.providerDisplayName = descriptor.providerDisplayName;
        this._options = {
            transientCellMetadata: {},
            transientDocumentMetadata: {},
            transientOutputs: false,
            cellContentMetadata: {}
        };
    }
    update(args) {
        if (args.selectors) {
            this._selectors = args.selectors;
        }
        if (args.options) {
            this._options = args.options;
        }
    }
    matches(resource) {
        return this.selectors?.some(selector => NotebookProviderInfo.selectorMatches(selector, resource));
    }
    static selectorMatches(selector, resource) {
        if (typeof selector === 'string' || glob.isRelativePattern(selector)) {
            if (glob.match(selector, basename(resource.fsPath), { ignoreCase: true })) {
                return true;
            }
        }
        if (!isDocumentExcludePattern(selector)) {
            return false;
        }
        const filenamePattern = selector.include;
        const excludeFilenamePattern = selector.exclude;
        if (glob.match(filenamePattern, basename(resource.fsPath), { ignoreCase: true })) {
            if (excludeFilenamePattern) {
                if (glob.match(excludeFilenamePattern, basename(resource.fsPath), { ignoreCase: true })) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }
    static possibleFileEnding(selectors) {
        for (const selector of selectors) {
            const ending = NotebookProviderInfo._possibleFileEnding(selector);
            if (ending) {
                return ending;
            }
        }
        return undefined;
    }
    static _possibleFileEnding(selector) {
        const pattern = /^.*(\.[a-zA-Z0-9_-]+)$/;
        let candidate;
        if (typeof selector === 'string') {
            candidate = selector;
        }
        else if (glob.isRelativePattern(selector)) {
            candidate = selector.pattern;
        }
        else if (selector.include) {
            return NotebookProviderInfo._possibleFileEnding(selector.include);
        }
        if (candidate) {
            const match = pattern.exec(candidate);
            if (match) {
                return match[1];
            }
        }
        return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tQcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1Byb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxJQUFJLE1BQU0saUNBQWlDLENBQUM7QUFFeEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzNELE9BQU8sRUFBb0Msd0JBQXdCLEVBQW9CLE1BQU0scUJBQXFCLENBQUM7QUFtQm5ILE1BQU0sT0FBTyxvQkFBb0I7SUFTaEMsSUFBSSxTQUFTO1FBQ1osT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDO0lBQ3hCLENBQUM7SUFFRCxJQUFJLE9BQU87UUFDVixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDdEIsQ0FBQztJQUVELFlBQVksVUFBb0M7UUFDL0MsSUFBSSxDQUFDLFNBQVMsR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxFQUFFLEdBQUcsVUFBVSxDQUFDLEVBQUUsQ0FBQztRQUN4QixJQUFJLENBQUMsV0FBVyxHQUFHLFVBQVUsQ0FBQyxXQUFXLENBQUM7UUFDMUMsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDeEQsT0FBTyxFQUFFLFFBQVEsQ0FBQyxlQUFlO1lBQ2pDLE9BQU8sRUFBRSxRQUFRLENBQUMsc0JBQXNCLElBQUksRUFBRTtTQUM5QyxDQUFDLENBQUM7ZUFDRSxVQUFzRCxDQUFDLFVBQVU7ZUFDbEUsRUFBRSxDQUFDO1FBQ1AsSUFBSSxDQUFDLFFBQVEsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDO1FBQ3BDLElBQUksQ0FBQyxtQkFBbUIs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