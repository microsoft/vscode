/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as errors from './errors.js';
import * as platform from './platform.js';
import { equalsIgnoreCase, startsWithIgnoreCase } from './strings.js';
import { URI } from './uri.js';
import * as paths from './path.js';
export var Schemas;
(function (Schemas) {
    /**
     * A schema that is used for models that exist in memory
     * only and that have no correspondence on a server or such.
     */
    Schemas.inMemory = 'inmemory';
    /**
     * A schema that is used for setting files
     */
    Schemas.vscode = 'vscode';
    /**
     * A schema that is used for internal private files
     */
    Schemas.internal = 'private';
    /**
     * A walk-through document.
     */
    Schemas.walkThrough = 'walkThrough';
    /**
     * An embedded code snippet.
     */
    Schemas.walkThroughSnippet = 'walkThroughSnippet';
    Schemas.http = 'http';
    Schemas.https = 'https';
    Schemas.file = 'file';
    Schemas.mailto = 'mailto';
    Schemas.untitled = 'untitled';
    Schemas.data = 'data';
    Schemas.command = 'command';
    Schemas.vscodeRemote = 'vscode-remote';
    Schemas.vscodeRemoteResource = 'vscode-remote-resource';
    Schemas.vscodeManagedRemoteResource = 'vscode-managed-remote-resource';
    Schemas.vscodeUserData = 'vscode-userdata';
    Schemas.vscodeCustomEditor = 'vscode-custom-editor';
    Schemas.vscodeNotebookCell = 'vscode-notebook-cell';
    Schemas.vscodeNotebookCellMetadata = 'vscode-notebook-cell-metadata';
    Schemas.vscodeNotebookCellMetadataDiff = 'vscode-notebook-cell-metadata-diff';
    Schemas.vscodeNotebookCellOutput = 'vscode-notebook-cell-output';
    Schemas.vscodeNotebookCellOutputDiff = 'vscode-notebook-cell-output-diff';
    Schemas.vscodeNotebookMetadata = 'vscode-notebook-metadata';
    Schemas.vscodeInteractiveInput = 'vscode-interactive-input';
    Schemas.vscodeSettings = 'vscode-settings';
    Schemas.vscodeWorkspaceTrust = 'vscode-workspace-trust';
    Schemas.vscodeTerminal = 'vscode-terminal';
    /** Scheme used for the image carousel editor. */
    Schemas.vscodeImageCarousel = 'vscode-image-carousel';
    /** Scheme used for code blocks in chat. */
    Schemas.vscodeChatCodeBlock = 'vscode-chat-code-block';
    /** Scheme used for LHS of code compare (aka diff) blocks in chat. */
    Schemas.vscodeChatCodeCompareBlock = 'vscode-chat-code-compare-block';
    /** Scheme used for the chat input editor. */
    Schemas.vscodeChatEditor = 'vscode-chat-editor';
    /** Scheme used for the chat input part */
    Schemas.vscodeChatInput = 'chatSessionInput';
    /** Scheme used for local chat session content */
    Schemas.vscodeLocalChatSession = 'vscode-chat-session';
    /**
     * Scheme used internally for webviews that aren't linked to a resource (i.e. not custom editors)
     */
    Schemas.webviewPanel = 'webview-panel';
    /**
     * Scheme used for loading the wrapper html and script in webviews.
     */
    Schemas.vscodeWebview = 'vscode-webview';
    /**
     * Scheme used for integrated browser tabs using WebContentsView.
     */
    Schemas.vscodeBrowser = 'vscode-browser';
    /**
     * Scheme used for extension pages
     */
    Schemas.extension = 'extension';
    /**
     * Scheme used as a replacement of `file` scheme to load
     * files with our custom protocol handler (desktop only).
     */
    Schemas.vscodeFileResource = 'vscode-file';
    /**
     * Scheme used for temporary resources
     */
    Schemas.tmp = 'tmp';
    /**
     * Scheme used vs live share
     */
    Schemas.vsls = 'vsls';
    /**
     * Scheme used for the Source Control commit input's text document
     */
    Schemas.vscodeSourceControl = 'vscode-scm';
    /**
     * Scheme used for input box for creating comments.
     */
    Schemas.commentsInput = 'comment';
    /**
     * Scheme used for special rendering of settings in the release notes
     */
    Schemas.codeSetting = 'code-setting';
    /**
     * Scheme used for output panel resources
     */
    Schemas.outputChannel = 'output';
    /**
     * Scheme used for the accessible view
     */
    Schemas.accessibleView = 'accessible-view';
    /**
     * Used for snapshots of chat edits
     */
    Schemas.chatEditingSnapshotScheme = 'chat-editing-snapshot-text-model';
    Schemas.chatEditingModel = 'chat-editing-text-model';
    /**
     * Used for rendering multidiffs in copilot agent sessions
     */
    Schemas.copilotPr = 'copilot-pr';
})(Schemas || (Schemas = {}));
export function matchesScheme(target, scheme) {
    if (URI.isUri(target)) {
        return equalsIgnoreCase(target.scheme, scheme);
    }
    else {
        return startsWithIgnoreCase(target, scheme + ':');
    }
}
export function matchesSomeScheme(target, ...schemes) {
    return schemes.some(scheme => matchesScheme(target, scheme));
}
export const connectionTokenCookieName = 'vscode-tkn';
export const connectionTokenQueryName = 'tkn';
class RemoteAuthoritiesImpl {
    constructor() {
        this._hosts = Object.create(null);
        this._ports = Object.create(null);
        this._connectionTokens = Object.create(null);
        this._preferredWebSchema = 'http';
        this._delegate = null;
        this._serverRootPath = '/';
    }
    setPreferredWebSchema(schema) {
        this._preferredWebSchema = schema;
    }
    setDelegate(delegate) {
        this._delegate = delegate;
    }
    setServerRootPath(product, serverBasePath) {
        this._serverRootPath = paths.posix.join(serverBasePath ?? '/', getServerProductSegment(product));
    }
    getServerRootPath() {
        return this._serverRootPath;
    }
    get _remoteResourcesPath() {
        return paths.posix.join(this._serverRootPath, Schemas.vscodeRemoteResource);
    }
    set(authority, host, port) {
        this._hosts[authority] = host;
        this._ports[authority] = port;
    }
    setConnectionToken(authority, connectionToken) {
        this._connectionTokens[authority] = connectionToken;
    }
    getPreferredWebSchema() {
        return this._preferredWebSchema;
    }
    rewrite(uri) {
        if (this._delegate) {
            try {
                return this._delegate(uri);
            }
            catch (err) {
                errors.onUnexpectedError(err);
                return uri;
            }
        }
        const authority = uri.authority;
        let host = this._hosts[authority];
        if (host && host.indexOf(':') !== -1 && host.indexOf('[') === -1) {
            host = `[${host}]`;
        }
        const port = this._ports[authority];
        const connectionToken = this._connectionTokens[authority];
        let query = `path=${encodeURIComponent(uri.path)}`;
        if (typeof connectionToken === 'string') {
            query += `&${connectionTokenQueryName}=${encodeURIComponent(connectionToken)}`;
        }
        return URI.from({
            scheme: platform.isWeb ? this._preferredWebSchema : Schemas.vscodeRemoteResource,
            authority: `${host}:${port}`,
            path: this._remoteResourcesPath,
            query
        });
    }
}
export const RemoteAuthorities = new RemoteAuthoritiesImpl();
export function getServerProductSegment(product) {
    return `${product.quality ?? 'oss'}-${product.commit ?? 'dev'}`;
}
export const builtinExtensionsPath = 'vs/../../extensions';
export const nodeModulesPath = 'vs/../../node_modules';
export const nodeModulesAsarPath = 'vs/../../node_modules.asar';
export const nodeModulesAsarUnpackedPath = 'vs/../../node_modules.asar.unpacked';
export const VSCODE_AUTHORITY = 'vscode-app';
class FileAccessImpl {
    static { this.FALLBACK_AUTHORITY = VSCODE_AUTHORITY; }
    /**
     * Returns a URI to use in contexts where the browser is responsible
     * for loading (e.g. fetch()) or when used within the DOM.
     *
     * **Note:** use `dom.ts#asCSSUrl` whenever the URL is to be used in CSS context.
     */
    asBrowserUri(resourcePath) {
        const uri = this.toUri(resourcePath);
        return this.uriToBrowserUri(uri);
    }
    /**
     * Returns a URI to use in contexts where the browser is responsible
     * for loading (e.g. fetch()) or when used within the DOM.
     *
     * **Note:** use `dom.ts#asCSSUrl` whenever the URL is to be used in CSS context.
     */
    uriToBrowserUri(uri) {
        // Handle remote URIs via `RemoteAuthorities`
        if (uri.scheme === Schemas.vscodeRemote) {
            return RemoteAuthorities.rewrite(uri);
        }
        // Convert to `vscode-file` resource..
        if (
        // ...only ever for `file` resources
        uri.scheme === Schemas.file &&
            (
            // ...and we run in native environments
            platform.isNative ||
                // ...or web worker extensions on desktop
                (platform.webWorkerOrigin === `${Schemas.vscodeFileResource}://${FileAccessImpl.FALLBACK_AUTHORITY}`))) {
            return uri.with({
                scheme: Schemas.vscodeFileResource,
                // We need to provide an authority here so that it can serve
                // as origin for network and loading matters in chromium.
                // If the URI is not coming with an authority already, we
                // add our own
                authority: uri.authority || FileAccessImpl.FALLBACK_AUTHORITY,
                query: null,
                fragment: null
            });
        }
        return uri;
    }
    /**
     * Returns the `file` URI to use in contexts where node.js
     * is responsible for loading.
     */
    asFileUri(resourcePath) {
        const uri = this.toUri(resourcePath);
        return this.uriToFileUri(uri);
    }
    /**
     * Returns the `file` URI to use in contexts where node.js
     * is responsible for loading.
     */
    uriToFileUri(uri) {
        // Only convert the URI if it is `vscode-file:` scheme
        if (uri.scheme === Schemas.vscodeFileResource) {
            return uri.with({
                scheme: Schemas.file,
                // Only preserve the `authority` if it is different from
                // our fallback authority. This ensures we properly preserve
                // Windows UNC paths that come with their own authority.
                authority: uri.authority !== FileAccessImpl.FALLBACK_AUTHORITY ? uri.authority : null,
                query: null,
                fragment: null
            });
        }
        return uri;
    }
    toUri(uriOrModule) {
        if (URI.isUri(uriOrModule)) {
            return uriOrModule;
        }
        if (globalThis._VSCODE_FILE_ROOT) {
            const rootUriOrPath = globalThis._VSCODE_FILE_ROOT;
            // File URL (with scheme)
            if (/^\w[\w\d+.-]*:\/\//.test(rootUriOrPath)) {
                return URI.joinPath(URI.parse(rootUriOrPath, true), uriOrModule);
            }
            // File Path (no scheme)
            const modulePath = paths.join(rootUriOrPath, uriOrModule);
            return URI.file(modulePath);
        }
        throw new Error('Cannot determine URI for module id!');
    }
}
export const FileAccess = new FileAccessImpl();
export const CacheControlheaders = Object.freeze({
    'Cache-Control': 'no-cache, no-store'
});
export const DocumentPolicyheaders = Object.freeze({
    'Document-Policy': 'include-js-call-stacks-in-crash-reports'
});
export var COI;
(function (COI) {
    const coiHeaders = new Map([
        ['1', { 'Cross-Origin-Opener-Policy': 'same-origin' }],
        ['2', { 'Cross-Origin-Embedder-Policy': 'require-corp' }],
        ['3', { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' }],
    ]);
    COI.CoopAndCoep = Object.freeze(coiHeaders.get('3'));
    const coiSearchParamName = 'vscode-coi';
    /**
     * Extract desired headers from `vscode-coi` invocation
     */
    function getHeadersFromQuery(url) {
        let params;
        if (typeof url === 'string') {
            params = new URL(url).searchParams;
        }
        else if (url instanceof URL) {
            params = url.searchParams;
        }
        else if (URI.isUri(url)) {
            params = new URL(url.toString(true)).searchParams;
        }
        const value = params?.get(coiSearchParamName);
        if (!value) {
            return undefined;
        }
        return coiHeaders.get(value);
    }
    COI.getHeadersFromQuery = getHeadersFromQuery;
    /**
     * Add the `vscode-coi` query attribute based on wanting `COOP` and `COEP`. Will be a noop when `crossOriginIsolated`
     * isn't enabled the current context
     */
    function addSearchParam(urlOrSearch, coop, coep) {
        if (!globalThis.crossOriginIsolated) {
            // depends on the current context being COI
            return;
        }
        const value = coop && coep ? '3' : coep ? '2' : '1';
        if (urlOrSearch instanceof URLSearchParams) {
            urlOrSearch.set(coiSearchParamName, value);
        }
        else {
            urlOrSearch[coiSearchParamName] = value;
        }
    }
    COI.addSearchParam = addSearchParam;
})(COI || (COI = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV0d29yay5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL25ldHdvcmsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLE1BQU0sTUFBTSxhQUFhLENBQUM7QUFDdEMsT0FBTyxLQUFLLFFBQVEsTUFBTSxlQUFlLENBQUM7QUFDMUMsT0FBTyxFQUFFLGdCQUFnQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDL0IsT0FBTyxLQUFLLEtBQUssTUFBTSxXQUFXLENBQUM7QUFFbkMsTUFBTSxLQUFXLE9BQU8sQ0EySnZCO0FBM0pELFdBQWlCLE9BQU87SUFFdkI7OztPQUdHO0lBQ1UsZ0JBQVEsR0FBRyxVQUFVLENBQUM7SUFFbkM7O09BRUc7SUFDVSxjQUFNLEdBQUcsUUFBUSxDQUFDO0lBRS9COztPQUVHO0lBQ1UsZ0JBQVEsR0FBRyxTQUFTLENBQUM7SUFFbEM7O09BRUc7SUFDVSxtQkFBVyxHQUFHLGFBQWEsQ0FBQztJQUV6Qzs7T0FFRztJQUNVLDBCQUFrQixHQUFHLG9CQUFvQixDQUFDO0lBRTFDLFlBQUksR0FBRyxNQUFNLENBQUM7SUFFZCxhQUFLLEdBQUcsT0FBTyxDQUFDO0lBRWhCLFlBQUksR0FBRyxNQUFNLENBQUM7SUFFZCxjQUFNLEdBQUcsUUFBUSxDQUFDO0lBRWxCLGdCQUFRLEdBQUcsVUFBVSxDQUFDO0lBRXRCLFlBQUksR0FBRyxNQUFNLENBQUM7SUFFZCxlQUFPLEdBQUcsU0FBUyxDQUFDO0lBRXBCLG9CQUFZLEdBQUcsZUFBZSxDQUFDO0lBRS9CLDRCQUFvQixHQUFHLHdCQUF3QixDQUFDO0lBRWhELG1DQUEyQixHQUFHLGdDQUFnQyxDQUFDO0lBRS9ELHNCQUFjLEdBQUcsaUJBQWlCLENB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