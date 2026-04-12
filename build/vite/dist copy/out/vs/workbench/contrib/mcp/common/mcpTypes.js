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
import { equals as arraysEqual } from '../../../../base/common/arrays.js';
import { assertNever } from '../../../../base/common/assert.js';
import { decodeHex, encodeHex, VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals as objectsEqual } from '../../../../base/common/objects.js';
import { ObservableMap } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { MCP } from './modelContextProtocol.js';
export const extensionMcpCollectionPrefix = 'ext.';
export function extensionPrefixedIdentifier(identifier, id) {
    return ExtensionIdentifier.toKey(identifier) + '/' + id;
}
export var McpCollectionSortOrder;
(function (McpCollectionSortOrder) {
    McpCollectionSortOrder[McpCollectionSortOrder["WorkspaceFolder"] = 0] = "WorkspaceFolder";
    McpCollectionSortOrder[McpCollectionSortOrder["Workspace"] = 100] = "Workspace";
    McpCollectionSortOrder[McpCollectionSortOrder["User"] = 200] = "User";
    McpCollectionSortOrder[McpCollectionSortOrder["Extension"] = 300] = "Extension";
    McpCollectionSortOrder[McpCollectionSortOrder["Plugin"] = 350] = "Plugin";
    McpCollectionSortOrder[McpCollectionSortOrder["Filesystem"] = 400] = "Filesystem";
    McpCollectionSortOrder[McpCollectionSortOrder["RemoteBoost"] = -50] = "RemoteBoost";
})(McpCollectionSortOrder || (McpCollectionSortOrder = {}));
export var McpCollectionDefinition;
(function (McpCollectionDefinition) {
    function equals(a, b) {
        return a.id === b.id
            && a.remoteAuthority === b.remoteAuthority
            && a.label === b.label
            && a.trustBehavior === b.trustBehavior
            && objectsEqual(a.sandbox, b.sandbox);
    }
    McpCollectionDefinition.equals = equals;
})(McpCollectionDefinition || (McpCollectionDefinition = {}));
export var McpServerStaticToolAvailability;
(function (McpServerStaticToolAvailability) {
    /** Tool is expected to be present as soon as the server is started. */
    McpServerStaticToolAvailability[McpServerStaticToolAvailability["Initial"] = 0] = "Initial";
    /** Tool may be present later. */
    McpServerStaticToolAvailability[McpServerStaticToolAvailability["Dynamic"] = 1] = "Dynamic";
})(McpServerStaticToolAvailability || (McpServerStaticToolAvailability = {}));
export var McpServerDefinition;
(function (McpServerDefinition) {
    function toSerialized(def) {
        return def;
    }
    McpServerDefinition.toSerialized = toSerialized;
    function fromSerialized(def) {
        return {
            id: def.id,
            label: def.label,
            cacheNonce: def.cacheNonce,
            staticMetadata: def.staticMetadata,
            launch: McpServerLaunch.fromSerialized(def.launch),
            sandboxEnabled: def.sandboxEnabled,
            variableReplacement: def.variableReplacement ? McpServerDefinitionVariableReplacement.fromSerialized(def.variableReplacement) : undefined,
        };
    }
    McpServerDefinition.fromSerialized = fromSerialized;
    function equals(a, b) {
        return a.id === b.id
            && a.label === b.label
            && a.cacheNonce === b.cacheNonce
            && arraysEqual(a.roots, b.roots, (a, b) => a.toString() === b.toString())
            && objectsEqual(a.launch, b.launch)
            && objectsEqual(a.presentation, b.presentation)
            && objectsEqual(a.variableReplacement, b.variableReplacement)
            && objectsEqual(a.devMode, b.devMode)
            && a.sandboxEnabled === b.sandboxEnabled;
    }
    McpServerDefinition.equals = equals;
})(McpServerDefinition || (McpServerDefinition = {}));
export var McpServerDefinitionVariableReplacement;
(function (McpServerDefinitionVariableReplacement) {
    function toSerialized(def) {
        return def;
    }
    McpServerDefinitionVariableReplacement.toSerialized = toSerialized;
    function fromSerialized(def) {
        return {
            section: def.section,
            folder: def.folder ? { ...def.folder, uri: URI.revive(def.folder.uri) } : undefined,
            target: def.target,
        };
    }
    McpServerDefinitionVariableReplacement.fromSerialized = fromSerialized;
})(McpServerDefinitionVariableReplacement || (McpServerDefinitionVariableReplacement = {}));
export var IAutostartResult;
(function (IAutostartResult) {
    IAutostartResult.Empty = { working: false, starting: [], serversRequiringInteraction: [] };
})(IAutostartResult || (IAutostartResult = {}));
export var LazyCollectionState;
(function (LazyCollectionState) {
    LazyCollectionState[LazyCollectionState["HasUnknown"] = 0] = "HasUnknown";
    LazyCollectionState[LazyCollectionState["LoadingUnknown"] = 1] = "LoadingUnknown";
    LazyCollectionState[LazyCollectionState["AllKnown"] = 2] = "AllKnown";
})(LazyCollectionState || (LazyCollectionState = {}));
export const IMcpService = createDecorator('IMcpService');
export class McpStartServerInteraction {
    constructor() {
        /** @internal */
        this.participants = new ObservableMap();
    }
}
export var McpServerTrust;
(function (McpServerTrust) {
    let Kind;
    (function (Kind) {
        /** The server is trusted */
        Kind[Kind["Trusted"] = 0] = "Trusted";
        /** The server is trusted as long as its nonce matches */
        Kind[Kind["TrustedOnNonce"] = 1] = "TrustedOnNonce";
        /** The server trust was denied. */
        Kind[Kind["Untrusted"] = 2] = "Untrusted";
        /** The server is not yet trusted or untrusted. */
        Kind[Kind["Unknown"] = 3] = "Unknown";
    })(Kind = McpServerTrust.Kind || (McpServerTrust.Kind = {}));
})(McpServerTrust || (McpServerTrust = {}));
export const isMcpResourceTemplate = (obj) => {
    return obj.template !== undefined;
};
export const isMcpResource = (obj) => {
    return obj.mcpUri !== undefined;
};
export var McpServerCacheState;
(function (McpServerCacheState) {
    /** Tools have not been read before */
    McpServerCacheState[McpServerCacheState["Unknown"] = 0] = "Unknown";
    /** Tools were read from the cache */
    McpServerCacheState[McpServerCacheState["Cached"] = 1] = "Cached";
    /** Tools were read from the cache or live, but they may be outdated. */
    McpServerCacheState[McpServerCacheState["Outdated"] = 2] = "Outdated";
    /** Tools are refreshing for the first time */
    McpServerCacheState[McpServerCacheState["RefreshingFromUnknown"] = 3] = "RefreshingFromUnknown";
    /** Tools are refreshing and the current tools are cached */
    McpServerCacheState[McpServerCacheState["RefreshingFromCached"] = 4] = "RefreshingFromCached";
    /** Tool state is live, server is connected */
    McpServerCacheState[McpServerCacheState["Live"] = 5] = "Live";
})(McpServerCacheState || (McpServerCacheState = {}));
export const mcpPromptReplaceSpecialChars = (s) => s.replace(/[^a-z0-9_.-]/gi, '_');
export const mcpPromptPrefix = (definition) => `/mcp.` + mcpPromptReplaceSpecialChars(definition.label);
/**
 * Visibility of an MCP tool, based on the MCP Apps `_meta.ui.visibility` field.
 * @see https://github.com/anthropics/mcp/blob/main/apps.md
 */
export var McpToolVisibility;
(function (McpToolVisibility) {
    /** Tool is visible to and callable by the language model */
    McpToolVisibility[McpToolVisibility["Model"] = 1] = "Model";
    /** Tool is callable by the MCP App UI */
    McpToolVisibility[McpToolVisibility["App"] = 2] = "App";
})(McpToolVisibility || (McpToolVisibility = {}));
export var McpServerTransportType;
(function (McpServerTransportType) {
    /** A command-line MCP server communicating over standard in/out */
    McpServerTransportType[McpServerTransportType["Stdio"] = 1] = "Stdio";
    /** An MCP server that uses Server-Sent Events */
    McpServerTransportType[McpServerTransportType["HTTP"] = 2] = "HTTP";
})(McpServerTransportType || (McpServerTransportType = {}));
export var McpServerLaunch;
(function (McpServerLaunch) {
    function toSerialized(launch) {
        return launch;
    }
    McpServerLaunch.toSerialized = toSerialized;
    function fromSerialized(launch) {
        switch (launch.type) {
            case 2 /* McpServerTransportType.HTTP */:
                return { type: launch.type, uri: URI.revive(launch.uri), headers: launch.headers, authentication: launch.authentication };
            case 1 /* McpServerTransportType.Stdio */:
                return {
                    type: launch.type,
                    cwd: launch.cwd,
                    command: launch.command,
                    args: launch.args,
                    env: launch.env,
                    envFile: launch.envFile,
                    sandbox: launch.sandbox
                };
        }
    }
    McpServerLaunch.fromSerialized = fromSerialized;
    async function hash(launch) {
        const nonce = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(launch)));
        return encodeHex(VSBuffer.wrap(new Uint8Array(nonce)));
    }
    McpServerLaunch.hash = hash;
})(McpServerLaunch || (McpServerLaunch = {}));
/**
 * McpConnectionState is the state of the underlying connection and is
 * communicated e.g. from the extension host to the renderer.
 */
export var McpConnectionState;
(function (McpConnectionState) {
    let Kind;
    (function (Kind) {
        Kind[Kind["Stopped"] = 0] = "Stopped";
        Kind[Kind["Starting"] = 1] = "Starting";
        Kind[Kind["Running"] = 2] = "Running";
        Kind[Kind["Error"] = 3] = "Error";
    })(Kind = McpConnectionState.Kind || (McpConnectionState.Kind = {}));
    McpConnectionState.toString = (s) => {
        switch (s.state) {
            case 0 /* Kind.Stopped */:
                return localize('mcpstate.stopped', 'Stopped');
            case 1 /* Kind.Starting */:
                return localize('mcpstate.starting', 'Starting');
            case 2 /* Kind.Running */:
                return localize('mcpstate.running', 'Running');
            case 3 /* Kind.Error */:
                return localize('mcpstate.error', 'Error {0}', s.message);
            default:
                assertNever(s);
        }
    };
    McpConnectionState.toKindString = (s) => {
        switch (s) {
            case 0 /* Kind.Stopped */:
                return 'stopped';
            case 1 /* Kind.Starting */:
                return 'starting';
            case 2 /* Kind.Running */:
                return 'running';
            case 3 /* Kind.Error */:
                return 'error';
            default:
                assertNever(s);
        }
    };
    /** Returns if the MCP state is one where starting a new server is valid */
    McpConnectionState.canBeStarted = (s) => s === 3 /* Kind.Error */ || s === 0 /* Kind.Stopped */;
    /** Gets whether the state is a running state. */
    McpConnectionState.isRunning = (s) => !McpConnectionState.canBeStarted(s.state);
})(McpConnectionState || (McpConnectionState = {}));
export class MpcResponseError extends Error {
    constructor(message, code, data) {
        super(`MPC ${code}: ${message}`);
        this.code = code;
        this.data = data;
    }
}
export class McpConnectionFailedError extends Error {
}
export class UserInteractionRequiredError extends Error {
    static { this.prefix = 'User interaction required: '; }
    static is(error) {
        return error.message.startsWith(this.prefix);
    }
    constructor(reason) {
        super(`${UserInteractionRequiredError.prefix}${reason}`);
        this.reason = reason;
    }
}
export var McpServerEnablementState;
(function (McpServerEnablementState) {
    McpServerEnablementState[McpServerEnablementState["Disabled"] = 0] = "Disabled";
    McpServerEnablementState[McpServerEnablementState["DisabledByAccess"] = 1] = "DisabledByAccess";
    McpServerEnablementState[McpServerEnablementState["DisabledProfile"] = 2] = "DisabledProfile";
    McpServerEnablementState[McpServerEnablementState["DisabledWorkspace"] = 3] = "DisabledWorkspace";
    McpServerEnablementState[McpServerEnablementState["Enabled"] = 4] = "Enabled";
})(McpServerEnablementState || (McpServerEnablementState = {}));
export var McpServerInstallState;
(function (McpServerInstallState) {
    McpServerInstallState[McpServerInstallState["Installing"] = 0] = "Installing";
    McpServerInstallState[McpServerInstallState["Installed"] = 1] = "Installed";
    McpServerInstallState[McpServerInstallState["Uninstalling"] = 2] = "Uninstalling";
    McpServerInstallState[McpServerInstallState["Uninstalled"] = 3] = "Uninstalled";
})(McpServerInstallState || (McpServerInstallState = {}));
export var McpServerEditorTab;
(function (McpServerEditorTab) {
    McpServerEditorTab["Readme"] = "readme";
    McpServerEditorTab["Manifest"] = "manifest";
    McpServerEditorTab["Configuration"] = "configuration";
})(McpServerEditorTab || (McpServerEditorTab = {}));
export const IMcpWorkbenchService = createDecorator('IMcpWorkbenchService');
let McpServerContainers = class McpServerContainers extends Disposable {
    constructor(containers, mcpWorkbenchService) {
        super();
        this.containers = containers;
        this._register(mcpWorkbenchService.onChange(this.update, this));
    }
    set mcpServer(extension) {
        this.containers.forEach(c => c.mcpServer = extension);
    }
    update(server) {
        for (const container of this.containers) {
            if (server && container.mcpServer) {
                if (server.id === container.mcpServer.id) {
                    container.mcpServer = server;
                }
            }
            else {
                container.update();
            }
        }
    }
};
McpServerContainers = __decorate([
    __param(1, IMcpWorkbenchService)
], McpServerContainers);
export { McpServerContainers };
export const McpServersGalleryStatusContext = new RawContextKey('mcpServersGalleryStatus', "unavailable" /* McpGalleryManifestStatus.Unavailable */);
export const HasInstalledMcpServersContext = new RawContextKey('hasInstalledMcpServers', true);
export const InstalledMcpServersViewId = 'workbench.views.mcp.installed';
export var McpResourceURI;
(function (McpResourceURI) {
    McpResourceURI.scheme = 'mcp-resource';
    // Random placeholder for empty authorities, otherwise they're represente as
    // `scheme//path/here` in the URI which would get normalized to `scheme/path/here`.
    const emptyAuthorityPlaceholder = 'dylo78gyp'; // chosen by a fair dice roll. Guaranteed to be random.
    function fromServer(def, resourceURI) {
        if (typeof resourceURI === 'string') {
            resourceURI = URI.parse(resourceURI);
        }
        return resourceURI.with({
            scheme: McpResourceURI.scheme,
            authority: encodeHex(VSBuffer.fromString(def.id)),
            path: ['', resourceURI.scheme, resourceURI.authority || emptyAuthorityPlaceholder].join('/') + resourceURI.path,
        });
    }
    McpResourceURI.fromServer = fromServer;
    function toServer(uri) {
        if (typeof uri === 'string') {
            uri = URI.parse(uri);
        }
        if (uri.scheme !== McpResourceURI.scheme) {
            throw new Error(`Invalid MCP resource URI: ${uri.toString()}`);
        }
        const parts = uri.path.split('/');
        if (parts.length < 3) {
            throw new Error(`Invalid MCP resource URI: ${uri.toString()}`);
        }
        const [, serverScheme, authority, ...path] = parts;
        // URI cannot correctly stringify empty authorities (#250905) so we use URL instead to construct
        const url = new URL(`${serverScheme}://${authority.toLowerCase() === emptyAuthorityPlaceholder ? '' : authority}`);
        url.pathname = path.length ? ('/' + path.join('/')) : '';
        url.search = uri.query;
        url.hash = uri.fragment;
        return {
            definitionId: decodeHex(uri.authority).toString(),
            resourceURL: url,
        };
    }
    McpResourceURI.toServer = toServer;
})(McpResourceURI || (McpResourceURI = {}));
/** Warning: this enum is cached in `mcpServer.ts` and all changes MUST only be additive. */
export var McpCapability;
(function (McpCapability) {
    McpCapability[McpCapability["Logging"] = 1] = "Logging";
    McpCapability[McpCapability["Completions"] = 2] = "Completions";
    McpCapability[McpCapability["Prompts"] = 4] = "Prompts";
    McpCapability[McpCapability["PromptsListChanged"] = 8] = "PromptsListChanged";
    McpCapability[McpCapability["Resources"] = 16] = "Resources";
    McpCapability[McpCapability["ResourcesSubscribe"] = 32] = "ResourcesSubscribe";
    McpCapability[McpCapability["ResourcesListChanged"] = 64] = "ResourcesListChanged";
    McpCapability[McpCapability["Tools"] = 128] = "Tools";
    McpCapability[McpCapability["ToolsListChanged"] = 256] = "ToolsListChanged";
})(McpCapability || (McpCapability = {}));
export const IMcpSamplingService = createDecorator('IMcpServerSampling');
export class McpError extends Error {
    static methodNotFound(method) {
        return new McpError(MCP.METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
    static notAllowed() {
        return new McpError(-32000, 'The user has denied permission to call this method.');
    }
    static unknown(e) {
        const mcpError = new McpError(MCP.INTERNAL_ERROR, `Unknown error: ${e.stack}`);
        mcpError.cause = e;
        return mcpError;
    }
    constructor(code, message, data) {
        super(message);
        this.code = code;
        this.data = data;
    }
}
export var McpToolName;
(function (McpToolName) {
    McpToolName["Prefix"] = "mcp_";
    McpToolName[McpToolName["MaxPrefixLen"] = 18] = "MaxPrefixLen";
    McpToolName[McpToolName["MaxLength"] = 64] = "MaxLength";
})(McpToolName || (McpToolName = {}));
export var ElicitationKind;
(function (ElicitationKind) {
    ElicitationKind[ElicitationKind["Form"] = 0] = "Form";
    ElicitationKind[ElicitationKind["URL"] = 1] = "URL";
})(ElicitationKind || (ElicitationKind = {}));
export const IMcpElicitationService = createDecorator('IMcpElicitationService');
export const McpToolResourceLinkMimeType = 'application/vnd.code.resource-link';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwVHlwZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvY29tbW9uL21jcFR5cGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxNQUFNLElBQUksV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDMUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBSW5GLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsTUFBTSxJQUFJLFlBQVksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVFLE9BQU8sRUFBZSxhQUFhLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUduRixPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLGdDQUFnQyxDQUFDO0FBRXBFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFckYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDM0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBVzdGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUdoRCxNQUFNLENBQUMsTUFBTSw0QkFBNEIsR0FBRyxNQUFNLENBQUM7QUFFbkQsTUFBTSxVQUFVLDJCQUEyQixDQUFDLFVBQStCLEVBQUUsRUFBVTtJQUN0RixPQUFPLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsR0FBRyxHQUFHLEdBQUcsRUFB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