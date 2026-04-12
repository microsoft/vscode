/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { parse as jsonParse, getNodeType } from '../../../../base/common/json.js';
import { localize } from '../../../../nls.js';
import { extname, basename } from '../../../../base/common/path.js';
import { SnippetParser, Variable, Placeholder, Text } from '../../../../editor/contrib/snippet/browser/snippetParser.js';
import { KnownSnippetVariableNames } from '../../../../editor/contrib/snippet/browser/snippetVariables.js';
import { relativePath } from '../../../../base/common/resources.js';
import { isObject } from '../../../../base/common/types.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { WindowIdleValue, getActiveWindow } from '../../../../base/browser/dom.js';
import { match as matchGlob } from '../../../../base/common/glob.js';
import { Schemas } from '../../../../base/common/network.js';
class SnippetBodyInsights {
    constructor(body) {
        // init with defaults
        this.isBogous = false;
        this.isTrivial = false;
        this.usesClipboardVariable = false;
        this.usesSelectionVariable = false;
        this.codeSnippet = body;
        // check snippet...
        const textmateSnippet = new SnippetParser().parse(body, false);
        const placeholders = new Map();
        let placeholderMax = 0;
        for (const placeholder of textmateSnippet.placeholders) {
            placeholderMax = Math.max(placeholderMax, placeholder.index);
        }
        // mark snippet as trivial when there is no placeholders or when the only
        // placeholder is the final tabstop and it is at the very end.
        if (textmateSnippet.placeholders.length === 0) {
            this.isTrivial = true;
        }
        else if (placeholderMax === 0) {
            const last = textmateSnippet.children.at(-1);
            this.isTrivial = last instanceof Placeholder && last.isFinalTabstop;
        }
        const stack = [...textmateSnippet.children];
        while (stack.length > 0) {
            const marker = stack.shift();
            if (marker instanceof Variable) {
                if (marker.children.length === 0 && !KnownSnippetVariableNames[marker.name]) {
                    // a 'variable' without a default value and not being one of our supported
                    // variables is automatically turned into a placeholder. This is to restore
                    // a bug we had before. So `${foo}` becomes `${N:foo}`
                    const index = placeholders.has(marker.name) ? placeholders.get(marker.name) : ++placeholderMax;
                    placeholders.set(marker.name, index);
                    const synthetic = new Placeholder(index).appendChild(new Text(marker.name));
                    textmateSnippet.replace(marker, [synthetic]);
                    this.isBogous = true;
                }
                switch (marker.name) {
                    case 'CLIPBOARD':
                        this.usesClipboardVariable = true;
                        break;
                    case 'SELECTION':
                    case 'TM_SELECTED_TEXT':
                        this.usesSelectionVariable = true;
                        break;
                }
            }
            else {
                // recurse
                stack.push(...marker.children);
            }
        }
        if (this.isBogous) {
            this.codeSnippet = textmateSnippet.toTextmateString();
        }
    }
}
export class Snippet {
    constructor(isFileTemplate, scopes, name, prefix, description, body, source, snippetSource, snippetIdentifier, include, exclude, extensionId) {
        this.isFileTemplate = isFileTemplate;
        this.scopes = scopes;
        this.name = name;
        this.prefix = prefix;
        this.description = description;
        this.body = body;
        this.source = source;
        this.snippetSource = snippetSource;
        this.snippetIdentifier = snippetIdentifier;
        this.include = include;
        this.exclude = exclude;
        this.extensionId = extensionId;
        this.prefixLow = prefix.toLowerCase();
        this._bodyInsights = new WindowIdleValue(getActiveWindow(), () => new SnippetBodyInsights(this.body));
    }
    get codeSnippet() {
        return this._bodyInsights.value.codeSnippet;
    }
    get isBogous() {
        return this._bodyInsights.value.isBogous;
    }
    get isTrivial() {
        return this._bodyInsights.value.isTrivial;
    }
    get needsClipboard() {
        return this._bodyInsights.value.usesClipboardVariable;
    }
    get usesSelection() {
        return this._bodyInsights.value.usesSelectionVariable;
    }
    isFileIncluded(resourceUri) {
        const uriPath = resourceUri.scheme === Schemas.file ? resourceUri.fsPath : resourceUri.path;
        const fileName = basename(uriPath);
        const getMatchTarget = (pattern) => {
            return pattern.includes('/') ? uriPath : fileName;
        };
        if (this.exclude) {
            for (const pattern of this.exclude.filter(Boolean)) {
                if (matchGlob(pattern, getMatchTarget(pattern), { ignoreCase: true })) {
                    return false;
                }
            }
        }
        if (this.include) {
            for (const pattern of this.include.filter(Boolean)) {
                if (matchGlob(pattern, getMatchTarget(pattern), { ignoreCase: true })) {
                    return true;
                }
            }
            return false;
        }
        return true;
    }
}
function isJsonSerializedSnippet(thing) {
    return isObject(thing) && Boolean(thing.body);
}
export var SnippetSource;
(function (SnippetSource) {
    SnippetSource[SnippetSource["User"] = 1] = "User";
    SnippetSource[SnippetSource["Workspace"] = 2] = "Workspace";
    SnippetSource[SnippetSource["Extension"] = 3] = "Extension";
})(SnippetSource || (SnippetSource = {}));
export class SnippetFile {
    constructor(source, location, defaultScopes, _extension, _fileService, _extensionResourceLoaderService) {
        this.source = source;
        this.location = location;
        this.defaultScopes = defaultScopes;
        this._extension = _extension;
        this._fileService = _fileService;
        this._extensionResourceLoaderService = _extensionResourceLoaderService;
        this.data = [];
        this.isGlobalSnippets = extname(location.path) === '.code-snippets';
        this.isUserSnippets = !this._extension;
    }
    select(selector, bucket) {
        if (this.isGlobalSnippets || !this.isUserSnippets) {
            this._scopeSelect(selector, bucket);
        }
        else {
            this._filepathSelect(selector, bucket);
        }
    }
    _filepathSelect(selector, bucket) {
        // for `fooLang.json` files apply inclusion/exclusion rules only
        if (selector + '.json' === basename(this.location.path)) {
            bucket.push(...this.data);
        }
    }
    _scopeSelect(selector, bucket) {
        // for `my.code-snippets` files we need to look at each snippet
        for (const snippet of this.data) {
            const len = snippet.scopes.length;
            if (len === 0) {
                // always accept
                bucket.push(snippet);
            }
            else {
                for (let i = 0; i < len; i++) {
                    // match
                    if (snippet.scopes[i] === selector) {
                        bucket.push(snippet);
                        break; // match only once!
                    }
                }
            }
        }
        const idx = selector.lastIndexOf('.');
        if (idx >= 0) {
            this._scopeSelect(selector.substring(0, idx), bucket);
        }
    }
    async _load() {
        if (this._extension) {
            return this._extensionResourceLoaderService.readExtensionResource(this.location);
        }
        else {
            const content = await this._fileService.readFile(this.location);
            return content.value.toString();
        }
    }
    load() {
        if (!this._loadPromise) {
            this._loadPromise = Promise.resolve(this._load()).then(content => {
                const data = jsonParse(content);
                if (getNodeType(data) === 'object') {
                    for (const [name, scopeOrTemplate] of Object.entries(data)) {
                        if (isJsonSerializedSnippet(scopeOrTemplate)) {
                            this._parseSnippet(name, scopeOrTemplate, this.data);
                        }
                        else {
                            for (const [name, template] of Object.entries(scopeOrTemplate)) {
                                this._parseSnippet(name, template, this.data);
                            }
                        }
                    }
                }
                return this;
            });
        }
        return this._loadPromise;
    }
    reset() {
        this._loadPromise = undefined;
        this.data.length = 0;
    }
    _parseSnippet(name, snippet, bucket) {
        let { isFileTemplate, prefix, body, description } = snippet;
        if (!prefix) {
            prefix = '';
        }
        if (Array.isArray(body)) {
            body = body.join('\n');
        }
        if (typeof body !== 'string') {
            return;
        }
        if (Array.isArray(description)) {
            description = description.join('\n');
        }
        let scopes;
        if (this.defaultScopes) {
            scopes = this.defaultScopes;
        }
        else if (typeof snippet.scope === 'string') {
            scopes = snippet.scope.split(',').map(s => s.trim()).filter(Boolean);
        }
        else {
            scopes = [];
        }
        let include;
        if (snippet.include) {
            if (Array.isArray(snippet.include)) {
                include = snippet.include;
            }
            else if (typeof snippet.include === 'string') {
                include = [snippet.include];
            }
        }
        let exclude;
        if (snippet.exclude) {
            if (Array.isArray(snippet.exclude)) {
                exclude = snippet.exclude;
            }
            else if (typeof snippet.exclude === 'string') {
                exclude = [snippet.exclude];
            }
        }
        let source;
        if (this._extension) {
            // extension snippet -> show the name of the extension
            source = this._extension.displayName || this._extension.name;
        }
        else if (this.source === 2 /* SnippetSource.Workspace */) {
            // workspace -> only *.code-snippets files
            source = localize('source.workspaceSnippetGlobal', "Workspace Snippet");
        }
        else {
            // user -> global (*.code-snippets) and language snippets
            if (this.isGlobalSnippets) {
                source = localize('source.userSnippetGlobal', "Global User Snippet");
            }
            else {
                source = localize('source.userSnippet', "User Snippet");
            }
        }
        for (const _prefix of Iterable.wrap(prefix)) {
            bucket.push(new Snippet(Boolean(isFileTemplate), scopes, name, _prefix, description, body, source, this.source, this._extension ? `${relativePath(this._extension.extensionLocation, this.location)}/${name}` : `${basename(this.location.path)}/${name}`, include, exclude, this._extension?.identifier));
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHNGaWxlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc25pcHBldHMvYnJvd3Nlci9zbmlwcGV0c0ZpbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssSUFBSSxTQUFTLEVBQUUsV0FBVyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3pILE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBSzNHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsZUFBZSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDbkYsT0FBTyxFQUFFLEtBQUssSUFBSSxTQUFTLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFN0QsTUFBTSxtQkFBbUI7SUFheEIsWUFBWSxJQUFZO1FBRXZCLHFCQUFxQjtRQUNyQixJQUFJLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUN0QixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztRQUN2QixJQUFJLENBQUMscUJBQXFCLEdBQUcs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