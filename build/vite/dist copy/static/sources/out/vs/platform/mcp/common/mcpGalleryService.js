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
import { CancellationToken } from '../../../base/common/cancellation.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { format2, uppercaseFirstLetter } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { asJson, asText, IRequestService } from '../../request/common/request.js';
import { IMcpGalleryManifestService, getMcpGalleryManifestResourceUri } from './mcpGalleryManifest.js';
import { CancellationError } from '../../../base/common/errors.js';
import { isObject, isString } from '../../../base/common/types.js';
var IconMimeType;
(function (IconMimeType) {
    IconMimeType["PNG"] = "image/png";
    IconMimeType["JPEG"] = "image/jpeg";
    IconMimeType["JPG"] = "image/jpg";
    IconMimeType["SVG"] = "image/svg+xml";
    IconMimeType["WEBP"] = "image/webp";
})(IconMimeType || (IconMimeType = {}));
var IconTheme;
(function (IconTheme) {
    IconTheme["LIGHT"] = "light";
    IconTheme["DARK"] = "dark";
})(IconTheme || (IconTheme = {}));
var McpServerSchemaVersion_v2025_07_09;
(function (McpServerSchemaVersion_v2025_07_09) {
    McpServerSchemaVersion_v2025_07_09.VERSION = 'v0-2025-07-09';
    McpServerSchemaVersion_v2025_07_09.SCHEMA = `https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json`;
    class Serializer {
        toRawGalleryMcpServerResult(input) {
            if (!input || typeof input !== 'object' || !Array.isArray(input.servers)) {
                return undefined;
            }
            const from = input;
            const servers = [];
            for (const server of from.servers) {
                const rawServer = this.toRawGalleryMcpServer(server);
                if (!rawServer) {
                    return undefined;
                }
                servers.push(rawServer);
            }
            return {
                metadata: {
                    count: from.metadata.count ?? 0,
                    nextCursor: from.metadata?.next_cursor
                },
                servers
            };
        }
        toRawGalleryMcpServer(input) {
            if (!input || typeof input !== 'object') {
                return undefined;
            }
            const from = input;
            if ((!from.name || !isString(from.name))
                || (!from.description || !isString(from.description))
                || (!from.version || !isString(from.version))) {
                return undefined;
            }
            if (from.$schema && from.$schema !== McpServerSchemaVersion_v2025_07_09.SCHEMA) {
                return undefined;
            }
            const registryInfo = from._meta?.['io.modelcontextprotocol.registry/official'];
            function convertServerInput(input) {
                return {
                    ...input,
                    isRequired: input.is_required,
                    isSecret: input.is_secret,
                };
            }
            function convertVariables(variables) {
                const result = {};
                for (const [key, value] of Object.entries(variables)) {
                    result[key] = convertServerInput(value);
                }
                return result;
            }
            function convertServerArgument(arg) {
                if (arg.type === 'positional') {
                    return {
                        ...arg,
                        valueHint: arg.value_hint,
                        isRepeated: arg.is_repeated,
                        isRequired: arg.is_required,
                        isSecret: arg.is_secret,
                        variables: arg.variables ? convertVariables(arg.variables) : undefined,
                    };
                }
                return {
                    ...arg,
                    isRepeated: arg.is_repeated,
                    isRequired: arg.is_required,
                    isSecret: arg.is_secret,
                    variables: arg.variables ? convertVariables(arg.variables) : undefined,
                };
            }
            function convertKeyValueInput(input) {
                return {
                    ...input,
                    isRequired: input.is_required,
                    isSecret: input.is_secret,
                    variables: input.variables ? convertVariables(input.variables) : undefined,
                };
            }
            function convertTransport(input) {
                switch (input.type) {
                    case 'stdio':
                        return {
                            type: "stdio" /* TransportType.STDIO */,
                        };
                    case 'streamable-http':
                        return {
                            type: "streamable-http" /* TransportType.STREAMABLE_HTTP */,
                            url: input.url,
                            headers: input.headers?.map(convertKeyValueInput),
                        };
                    case 'sse':
                        return {
                            type: "sse" /* TransportType.SSE */,
                            url: input.url,
                            headers: input.headers?.map(convertKeyValueInput),
                        };
                    default:
                        return {
                            type: "stdio" /* TransportType.STDIO */,
                        };
                }
            }
            function convertRegistryType(input) {
                switch (input) {
                    case 'npm':
                        return "npm" /* RegistryType.NODE */;
                    case 'docker':
                    case 'docker-hub':
                    case 'oci':
                        return "oci" /* RegistryType.DOCKER */;
                    case 'pypi':
                        return "pypi" /* RegistryType.PYTHON */;
                    case 'nuget':
                        return "nuget" /* RegistryType.NUGET */;
                    case 'mcpb':
                        return "mcpb" /* RegistryType.MCPB */;
                    default:
                        return "npm" /* RegistryType.NODE */;
                }
            }
            const gitHubInfo = from._meta['io.modelcontextprotocol.registry/publisher-provided']?.github;
            return {
                id: registryInfo.id,
                name: from.name,
                description: from.description,
                repository: from.repository ? {
                    url: from.repository.url,
                    source: from.repository.source,
                    id: from.repository.id,
                } : undefined,
                readme: from.repository?.readme,
                version: from.version,
                createdAt: from.created_at,
                updatedAt: from.updated_at,
                packages: from.packages?.map(p => ({
                    identifier: p.identifier ?? p.name,
                    registryType: convertRegistryType(p.registry_type ?? p.registry_name),
                    version: p.version,
                    fileSha256: p.file_sha256,
                    registryBaseUrl: p.registry_base_url,
                    transport: p.transport ? convertTransport(p.transport) : { type: "stdio" /* TransportType.STDIO */ },
                    packageArguments: p.package_arguments?.map(convertServerArgument),
                    runtimeHint: p.runtime_hint,
                    runtimeArguments: p.runtime_arguments?.map(convertServerArgument),
                    environmentVariables: p.environment_variables?.map(convertKeyValueInput),
                })),
                remotes: from.remotes?.map(remote => {
                    const type = remote.type ?? remote.transport_type ?? remote.transport;
                    return {
                        type: type === "sse" /* TransportType.SSE */ ? "sse" /* TransportType.SSE */ : "streamable-http" /* TransportType.STREAMABLE_HTTP */,
                        url: remote.url,
                        headers: remote.headers?.map(convertKeyValueInput)
                    };
                }),
                registryInfo: {
                    isLatest: registryInfo.is_latest,
                    publishedAt: registryInfo.published_at,
                    updatedAt: registryInfo.updated_at,
                },
                githubInfo: gitHubInfo ? {
                    name: gitHubInfo.name,
                    nameWithOwner: gitHubInfo.name_with_owner,
                    displayName: gitHubInfo.display_name,
                    isInOrganization: gitHubInfo.is_in_organization,
                    license: gitHubInfo.license,
                    opengraphImageUrl: gitHubInfo.opengraph_image_url,
                    ownerAvatarUrl: gitHubInfo.owner_avatar_url,
                    primaryLanguage: gitHubInfo.primary_language,
                    primaryLanguageColor: gitHubInfo.primary_language_color,
                    pushedAt: gitHubInfo.pushed_at,
                    stargazerCount: gitHubInfo.stargazer_count,
                    topics: gitHubInfo.topics,
                    usesCustomOpengraphImage: gitHubInfo.uses_custom_opengraph_image
                } : undefined
            };
        }
    }
    McpServerSchemaVersion_v2025_07_09.SERIALIZER = new Serializer();
})(McpServerSchemaVersion_v2025_07_09 || (McpServerSchemaVersion_v2025_07_09 = {}));
var McpServerSchemaVersion_v0_1;
(function (McpServerSchemaVersion_v0_1) {
    McpServerSchemaVersion_v0_1.VERSION = 'v0.1';
    class Serializer {
        toRawGalleryMcpServerResult(input) {
            if (!input || typeof input !== 'object' || !Array.isArray(input.servers)) {
                return undefined;
            }
            const from = input;
            const servers = [];
            for (const server of from.servers) {
                const rawServer = this.toRawGalleryMcpServer(server);
                if (!rawServer) {
                    if (servers.length === 0) {
                        return undefined;
                    }
                    else {
                        continue;
                    }
                }
                servers.push(rawServer);
            }
            return {
                metadata: from.metadata,
                servers
            };
        }
        toRawGalleryMcpServer(input) {
            if (!input || typeof input !== 'object') {
                return undefined;
            }
            const from = input;
            if ((!from.server || !isObject(from.server))
                || (!from.server.name || !isString(from.server.name))
                || (!from.server.description || !isString(from.server.description))
                || (!from.server.version || !isString(from.server.version))) {
                return undefined;
            }
            const { 'io.modelcontextprotocol.registry/official': registryInfo, ...apicInfo } = from._meta;
            const githubInfo = from.server._meta?.['io.modelcontextprotocol.registry/publisher-provided']?.github;
            return {
                name: from.server.name,
                description: from.server.description,
                version: from.server.version,
                title: from.server.title,
                repository: from.server.repository ? {
                    url: from.server.repository.url,
                    source: from.server.repository.source,
                    id: from.server.repository.id,
                } : undefined,
                readme: githubInfo?.readme,
                icons: from.server.icons,
                websiteUrl: from.server.websiteUrl,
                packages: from.server.packages,
                remotes: from.server.remotes,
                status: registryInfo?.status,
                registryInfo,
                githubInfo,
                apicInfo
            };
        }
    }
    McpServerSchemaVersion_v0_1.SERIALIZER = new Serializer();
})(McpServerSchemaVersion_v0_1 || (McpServerSchemaVersion_v0_1 = {}));
var McpServerSchemaVersion_v0;
(function (McpServerSchemaVersion_v0) {
    McpServerSchemaVersion_v0.VERSION = 'v0';
    class Serializer {
        constructor() {
            this.galleryMcpServerDataSerializers = [];
            this.galleryMcpServerDataSerializers.push(McpServerSchemaVersion_v0_1.SERIALIZER);
            this.galleryMcpServerDataSerializers.push(McpServerSchemaVersion_v2025_07_09.SERIALIZER);
        }
        toRawGalleryMcpServerResult(input) {
            for (const serializer of this.galleryMcpServerDataSerializers) {
                const result = serializer.toRawGalleryMcpServerResult(input);
                if (result) {
                    return result;
                }
            }
            return undefined;
        }
        toRawGalleryMcpServer(input) {
            for (const serializer of this.galleryMcpServerDataSerializers) {
                const result = serializer.toRawGalleryMcpServer(input);
                if (result) {
                    return result;
                }
            }
            return undefined;
        }
    }
    McpServerSchemaVersion_v0.SERIALIZER = new Serializer();
})(McpServerSchemaVersion_v0 || (McpServerSchemaVersion_v0 = {}));
const DefaultPageSize = 50;
const DefaultQueryState = {
    pageSize: DefaultPageSize,
};
class Query {
    constructor(state = DefaultQueryState) {
        this.state = state;
    }
    get pageSize() { return this.state.pageSize; }
    get searchText() { return this.state.searchText; }
    get cursor() { return this.state.cursor; }
    withPage(cursor, pageSize = this.pageSize) {
        return new Query({ ...this.state, pageSize, cursor });
    }
    withSearchText(searchText) {
        return new Query({ ...this.state, searchText });
    }
}
let McpGalleryService = class McpGalleryService extends Disposable {
    constructor(requestService, fileService, logService, mcpGalleryManifestService) {
        super();
        this.requestService = requestService;
        this.fileService = fileService;
        this.logService = logService;
        this.mcpGalleryManifestService = mcpGalleryManifestService;
        this.galleryMcpServerDataSerializers = new Map();
        this.galleryMcpServerDataSerializers.set(McpServerSchemaVersion_v0.VERSION, McpServerSchemaVersion_v0.SERIALIZER);
        this.galleryMcpServerDataSerializers.set(McpServerSchemaVersion_v0_1.VERSION, McpServerSchemaVersion_v0_1.SERIALIZER);
    }
    isEnabled() {
        return this.mcpGalleryManifestService.mcpGalleryManifestStatus === "available" /* McpGalleryManifestStatus.Available */;
    }
    async query(options, token = CancellationToken.None) {
        const mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
        if (!mcpGalleryManifest) {
            return {
                firstPage: { items: [], hasMore: false },
                getNextPage: async () => ({ items: [], hasMore: false })
            };
        }
        let query = new Query();
        if (options?.text) {
            query = query.withSearchText(options.text.trim());
        }
        const { servers, metadata } = await this.queryGalleryMcpServers(query, mcpGalleryManifest, token);
        let currentCursor = metadata.nextCursor;
        return {
            firstPage: { items: servers, hasMore: !!metadata.nextCursor },
            getNextPage: async (ct) => {
                if (ct.isCancellationRequested) {
                    throw new CancellationError();
                }
                if (!currentCursor) {
                    return { items: [], hasMore: false };
                }
                const { servers, metadata: nextMetadata } = await this.queryGalleryMcpServers(query.withPage(currentCursor).withSearchText(undefined), mcpGalleryManifest, ct);
                currentCursor = nextMetadata.nextCursor;
                return { items: servers, hasMore: !!nextMetadata.nextCursor };
            }
        };
    }
    async getMcpServersFromGallery(infos) {
        const mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
        if (!mcpGalleryManifest) {
            return [];
        }
        const mcpServers = [];
        await Promise.allSettled(infos.map(async (info) => {
            const mcpServer = await this.getMcpServerByName(info, mcpGalleryManifest);
            if (mcpServer) {
                mcpServers.push(mcpServer);
            }
        }));
        return mcpServers;
    }
    async getMcpServerByName({ name, id }, mcpGalleryManifest) {
        const mcpServerUrl = this.getLatestServerVersionUrl(name, mcpGalleryManifest);
        if (mcpServerUrl) {
            const mcpServer = await this.getMcpServer(mcpServerUrl);
            if (mcpServer) {
                return mcpServer;
            }
        }
        const byNameUrl = this.getNamedServerUrl(name, mcpGalleryManifest);
        if (byNameUrl) {
            const mcpServer = await this.getMcpServer(byNameUrl);
            if (mcpServer) {
                return mcpServer;
            }
        }
        const byIdUrl = id ? this.getServerIdUrl(id, mcpGalleryManifest) : undefined;
        if (byIdUrl) {
            const mcpServer = await this.getMcpServer(byIdUrl);
            if (mcpServer) {
                return mcpServer;
            }
        }
        return undefined;
    }
    async getReadme(gallery, token) {
        const readmeUrl = gallery.readmeUrl;
        if (!readmeUrl) {
            return Promise.resolve(localize('noReadme', 'No README available'));
        }
        const uri = URI.parse(readmeUrl);
        if (uri.scheme === Schemas.file) {
            try {
                const content = await this.fileService.readFile(uri);
                return content.value.toString();
            }
            catch (error) {
                this.logService.error(`Failed to read file from ${uri}: ${error}`);
            }
        }
        if (uri.authority !== 'raw.githubusercontent.com') {
            return new MarkdownString(localize('readme.viewInBrowser', "You can find information about this server [here]({0})", readmeUrl)).value;
        }
        const context = await this.requestService.request({
            type: 'GET',
            url: readmeUrl,
            callSite: 'mcpGalleryService.getReadme'
        }, token);
        const result = await asText(context);
        if (!result) {
            throw new Error(`Failed to fetch README from ${readmeUrl}`);
        }
        return result;
    }
    toGalleryMcpServer(server, manifest) {
        let publisher = '';
        let displayName = server.title;
        if (server.githubInfo?.name) {
            if (!displayName) {
                displayName = server.githubInfo.name.split('-').map(s => s.toLowerCase() === 'mcp' ? 'MCP' : s.toLowerCase() === 'github' ? 'GitHub' : uppercaseFirstLetter(s)).join(' ');
            }
            publisher = server.githubInfo.nameWithOwner.split('/')[0];
        }
        else {
            const nameParts = server.name.split('/');
            if (nameParts.length > 0) {
                const domainParts = nameParts[0].split('.');
                if (domainParts.length > 0) {
                    publisher = domainParts[domainParts.length - 1]; // Always take the last part as owner
                }
            }
            if (!displayName) {
                displayName = nameParts[nameParts.length - 1].split('-').map(s => uppercaseFirstLetter(s)).join(' ');
            }
        }
        if (server.githubInfo?.displayName) {
            displayName = server.githubInfo.displayName;
        }
        let icon;
        if (server.githubInfo?.preferredImage) {
            icon = {
                light: server.githubInfo.preferredImage,
                dark: server.githubInfo.preferredImage
            };
        }
        else if (server.githubInfo?.ownerAvatarUrl) {
            icon = {
                light: server.githubInfo.ownerAvatarUrl,
                dark: server.githubInfo.ownerAvatarUrl
            };
        }
        else if (server.apicInfo?.['x-ms-icon']) {
            icon = {
                light: server.apicInfo['x-ms-icon'],
                dark: server.apicInfo['x-ms-icon']
            };
        }
        else if (server.icons && server.icons.length > 0) {
            const lightIcon = server.icons.find(icon => icon.theme === 'light') ?? server.icons[0];
            const darkIcon = server.icons.find(icon => icon.theme === 'dark') ?? lightIcon;
            icon = {
                light: lightIcon.src,
                dark: darkIcon.src
            };
        }
        const webUrl = manifest ? this.getWebUrl(server.name, manifest) : undefined;
        const publisherUrl = manifest ? this.getPublisherUrl(publisher, manifest) : undefined;
        return {
            id: server.id,
            name: server.name,
            displayName,
            galleryUrl: manifest?.url,
            webUrl,
            description: server.description,
            status: server.status ?? "active" /* GalleryMcpServerStatus.Active */,
            version: server.version,
            isLatest: server.registryInfo?.isLatest ?? true,
            publishDate: server.registryInfo?.publishedAt ? Date.parse(server.registryInfo.publishedAt) : undefined,
            lastUpdated: server.githubInfo?.pushedAt ? Date.parse(server.githubInfo.pushedAt) : server.registryInfo?.updatedAt ? Date.parse(server.registryInfo.updatedAt) : undefined,
            repositoryUrl: server.repository?.url,
            readme: server.readme,
            icon,
            publisher,
            publisherUrl,
            license: server.githubInfo?.license,
            starsCount: server.githubInfo?.stargazerCount,
            topics: server.githubInfo?.topics,
            configuration: {
                packages: server.packages,
                remotes: server.remotes
            }
        };
    }
    async queryGalleryMcpServers(query, mcpGalleryManifest, token) {
        const { servers, metadata } = await this.queryRawGalleryMcpServers(query, mcpGalleryManifest, token);
        return {
            servers: servers.map(item => this.toGalleryMcpServer(item, mcpGalleryManifest)),
            metadata
        };
    }
    async queryRawGalleryMcpServers(query, mcpGalleryManifest, token) {
        const mcpGalleryUrl = this.getMcpGalleryUrl(mcpGalleryManifest);
        if (!mcpGalleryUrl) {
            return { servers: [], metadata: { count: 0 } };
        }
        const uri = URI.parse(mcpGalleryUrl);
        if (uri.scheme === Schemas.file) {
            try {
                const content = await this.fileService.readFile(uri);
                const data = content.value.toString();
                return JSON.parse(data);
            }
            catch (error) {
                this.logService.error(`Failed to read file from ${uri}: ${error}`);
            }
        }
        let url = `${mcpGalleryUrl}?limit=${query.pageSize}&version=latest`;
        if (query.cursor) {
            url += `&cursor=${query.cursor}`;
        }
        if (query.searchText) {
            const text = encodeURIComponent(query.searchText);
            url += `&search=${text}`;
        }
        const context = await this.requestService.request({
            type: 'GET',
            url,
            callSite: 'mcpGalleryService.queryMcpServers'
        }, token);
        const data = await asJson(context);
        if (!data) {
            return { servers: [], metadata: { count: 0 } };
        }
        const result = this.serializeMcpServersResult(data, mcpGalleryManifest);
        if (!result) {
            throw new Error(`Failed to serialize MCP servers result from ${mcpGalleryUrl}`, data);
        }
        return result;
    }
    async getMcpServer(mcpServerUrl, mcpGalleryManifest) {
        const context = await this.requestService.request({
            type: 'GET',
            url: mcpServerUrl,
            callSite: 'mcpGalleryService.getMcpServer'
        }, CancellationToken.None);
        if (context.res.statusCode && context.res.statusCode >= 400 && context.res.statusCode < 500) {
            return undefined;
        }
        const data = await asJson(context);
        if (!data) {
            return undefined;
        }
        if (!mcpGalleryManifest) {
            mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
        }
        mcpGalleryManifest = mcpGalleryManifest && mcpServerUrl.startsWith(mcpGalleryManifest.url) ? mcpGalleryManifest : null;
        const server = this.serializeMcpServer(data, mcpGalleryManifest);
        if (!server) {
            throw new Error(`Failed to serialize MCP server from ${mcpServerUrl}`, data);
        }
        return this.toGalleryMcpServer(server, mcpGalleryManifest);
    }
    serializeMcpServer(data, mcpGalleryManifest) {
        return this.getSerializer(mcpGalleryManifest)?.toRawGalleryMcpServer(data);
    }
    serializeMcpServersResult(data, mcpGalleryManifest) {
        return this.getSerializer(mcpGalleryManifest)?.toRawGalleryMcpServerResult(data);
    }
    getSerializer(mcpGalleryManifest) {
        const version = mcpGalleryManifest?.version ?? 'v0';
        return this.galleryMcpServerDataSerializers.get(version);
    }
    getNamedServerUrl(name, mcpGalleryManifest) {
        const namedResourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, "McpServerNamedResourceUriTemplate" /* McpGalleryResourceType.McpServerNamedResourceUri */);
        if (!namedResourceUriTemplate) {
            return undefined;
        }
        return format2(namedResourceUriTemplate, { name });
    }
    getServerIdUrl(id, mcpGalleryManifest) {
        const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, "McpServerIdUriTemplate" /* McpGalleryResourceType.McpServerIdUri */);
        if (!resourceUriTemplate) {
            return undefined;
        }
        return format2(resourceUriTemplate, { id });
    }
    getLatestServerVersionUrl(name, mcpGalleryManifest) {
        const latestVersionResourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, "McpServerLatestVersionUriTemplate" /* McpGalleryResourceType.McpServerLatestVersionUri */);
        if (!latestVersionResourceUriTemplate) {
            return undefined;
        }
        return format2(latestVersionResourceUriTemplate, { name: encodeURIComponent(name) });
    }
    getWebUrl(name, mcpGalleryManifest) {
        const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, "McpServerWebUriTemplate" /* McpGalleryResourceType.McpServerWebUri */);
        if (!resourceUriTemplate) {
            return undefined;
        }
        return format2(resourceUriTemplate, { name });
    }
    getPublisherUrl(name, mcpGalleryManifest) {
        const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, "PublisherUriTemplate" /* McpGalleryResourceType.PublisherUriTemplate */);
        if (!resourceUriTemplate) {
            return undefined;
        }
        return format2(resourceUriTemplate, { name });
    }
    getMcpGalleryUrl(mcpGalleryManifest) {
        return getMcpGalleryManifestResourceUri(mcpGalleryManifest, "McpServersQueryService" /* McpGalleryResourceType.McpServersQueryService */);
    }
};
McpGalleryService = __decorate([
    __param(0, IRequestService),
    __param(1, IFileService),
    __param(2, ILogService),
    __param(3, IMcpGalleryManifestService)
], McpGalleryService);
export { McpGalleryService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwR2FsbGVyeVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcEdhbGxlcnlTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMzRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFbEYsT0FBTyxFQUFFLDBCQUEwQixFQUE0QixnQ0FBZ0MsRUFBK0MsTUFBTSx5QkFBeUIsQ0FBQztBQUU5SyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBaUZuRSxJQUFXLFlBTVY7QUFORCxXQUFXLFlBQVk7SUFDdEIsaUNBQWlCLENBQUE7SUFDakIsbUNBQW1CLENBQUE7SUFDbkIsaUNB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