/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBufferReadableStream } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isUNC } from '../../../../base/common/extpath.js';
import { Schemas } from '../../../../base/common/network.js';
import { posix, win32 } from '../../../../base/common/path.js';
import { isWindows, OperatingSystem } from '../../../../base/common/platform.js';
import { originalFSPath } from '../../../../base/common/resources.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { FileOperationError, FileOperationResult, FileSystemProviderErrorCode, FileType, hasFileRealpathCapability, IFileService, IWriteFileOptions, toFileSystemProviderErrorCode } from '../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { getWebviewContentMimeType } from '../../../../platform/webview/common/mimeTypes.js';

export namespace WebviewResourceResponse {
	export enum Type { Success, Failed, AccessDenied, NotModified }

	export class StreamSuccess {
		readonly type = Type.Success;

		constructor(
			public readonly stream: VSBufferReadableStream,
			public readonly etag: string | undefined,
			public readonly mtime: number | undefined,
			public readonly mimeType: string,
			public readonly size: number,
		) { }
	}

	export const Failed = { type: Type.Failed } as const;
	export const AccessDenied = { type: Type.AccessDenied } as const;

	export class NotModified {
		readonly type = Type.NotModified;

		constructor(
			public readonly mimeType: string,
			public readonly mtime: number | undefined,
		) { }
	}

	export type StreamResponse = StreamSuccess | typeof Failed | typeof AccessDenied | NotModified;
}

export async function loadLocalResource(
	accessor: ServicesAccessor,
	requestUri: URI,
	options: {
		ifNoneMatch: string | undefined;
		roots: ReadonlyArray<URI>;
		remoteOS?: OperatingSystem;
		range?: { readonly start: number; readonly end?: number };
	},
	token: CancellationToken,
): Promise<WebviewResourceResponse.StreamResponse> {
	const uriIdentityService = accessor.get(IUriIdentityService);
	const fileService = accessor.get(IFileService);
	const logService = accessor.get(ILogService);

	const request = toContainmentRequest(requestUri, options.roots, options.remoteOS);
	const resourceToLoad = request && isContainedInAnyRoot(request.resource, request.roots, uriIdentityService, request.forcePosixSemantics)
		? normalizeResourcePath(request.requestUri)
		: undefined;

	logService.trace(`Webview.loadLocalResource - trying to load resource. requestUri=${requestUri}, resourceToLoad=${resourceToLoad}`);

	if (!request || !resourceToLoad) {
		logService.trace(`Webview.loadLocalResource - access denied. requestUri=${requestUri}, resourceToLoad=${resourceToLoad}`);
		return WebviewResourceResponse.AccessDenied;
	}

	const containment = await checkResolvedContainment(request, fileService, uriIdentityService, options.remoteOS);
	if (containment === Containment.NotFound) {
		logService.trace(`Webview.loadLocalResource - not found. requestUri=${requestUri}, resourceToLoad=${resourceToLoad}`);
		return WebviewResourceResponse.Failed;
	}
	if (containment === Containment.NotContained) {
		logService.trace(`Webview.loadLocalResource - access denied, resolved resource is outside of all roots. requestUri=${requestUri}, resourceToLoad=${resourceToLoad}`);
		return WebviewResourceResponse.AccessDenied;
	}

	const mime = getWebviewContentMimeType(requestUri); // Use the original path for the mime

	try {
		const readOptions: { etag?: string; position?: number; length?: number } = { etag: options.ifNoneMatch };
		if (options.range) {
			readOptions.position = options.range.start;
			if (options.range.end !== undefined) {
				if (options.range.end < options.range.start) {
					return WebviewResourceResponse.Failed;
				}
				readOptions.length = options.range.end - options.range.start + 1;
			}
		}
		const result = await fileService.readFileStream(resourceToLoad, readOptions, token);
		logService.trace(`Webview.loadLocalResource - Loaded. requestUri=${requestUri}, resourceToLoad=${resourceToLoad}`);
		return new WebviewResourceResponse.StreamSuccess(result.value, result.etag, result.mtime, mime, result.size);
	} catch (err) {
		if (err instanceof FileOperationError) {
			const result = err.fileOperationResult;

			// NotModified status is expected and can be handled gracefully
			if (result === FileOperationResult.FILE_NOT_MODIFIED_SINCE) {
				logService.trace(`Webview.loadLocalResource - not modified. requestUri=${requestUri}, resourceToLoad=${resourceToLoad}`);
				return new WebviewResourceResponse.NotModified(mime, (err.options as IWriteFileOptions | undefined)?.mtime);
			}
		}

		// Otherwise the error is unexpected.
		logService.error(`Webview.loadLocalResource - Error using fileReader. requestUri=${requestUri}, resourceToLoad=${resourceToLoad}`);
		return WebviewResourceResponse.Failed;
	}
}

/** Used only by tests; returns a resource when its lexical and resolved paths are contained in an allowed root. */
export async function getResourceToLoad(
	requestUri: URI,
	roots: ReadonlyArray<URI>,
	uriIdentityService: IUriIdentityService,
	fileService: IFileService,
	remoteOS?: OperatingSystem,
): Promise<URI | undefined> {
	const request = toContainmentRequest(requestUri, roots, remoteOS);
	if (!request || !isContainedInAnyRoot(request.resource, request.roots, uriIdentityService, request.forcePosixSemantics)) {
		return undefined;
	}
	if (await checkResolvedContainment(request, fileService, uriIdentityService, remoteOS) !== Containment.Contained) {
		return undefined;
	}
	return normalizeResourcePath(request.requestUri);
}

interface IContainmentRequest {
	/** The normalized request, including its query. */
	readonly requestUri: URI;
	/** The normalized resource whose containment is checked. */
	readonly resource: URI;
	readonly roots: ReadonlyArray<URI>;
	readonly forcePosixSemantics: boolean;
}

function toContainmentRequest(requestUri: URI, roots: ReadonlyArray<URI>, remoteOS: OperatingSystem | undefined): IContainmentRequest | undefined {
	if (requestUri.scheme === Schemas.vscodeRemote) {
		if (remoteOS === undefined) {
			return undefined;
		}
		requestUri = normalizeRemoteResource(requestUri, remoteOS);
		roots = roots.map(root => root.scheme === Schemas.vscodeRemote ? normalizeRemoteResource(root, remoteOS) : root);
	}
	const resource = requestUri.with({ query: '' });
	if (hasWindowsParentTraversalSegment(resource)) {
		return undefined;
	}

	const forcePosixSemantics = requestUri.scheme === Schemas.vscodeRemote
		&& (remoteOS === OperatingSystem.Linux || remoteOS === OperatingSystem.Macintosh);
	return { requestUri, resource, roots, forcePosixSemantics };
}

function isContainedInAnyRoot(resource: URI, roots: ReadonlyArray<URI>, uriIdentityService: IUriIdentityService, forcePosixSemantics: boolean): boolean {
	return roots.some(root => containsResource(root, resource, uriIdentityService, forcePosixSemantics));
}

const enum Containment { Contained, NotContained, NotFound }

/**
 * The lexical check does not see symbolic links or junctions inside a root that point outside of it,
 * while reading the resource follows them. On file systems that can resolve links, also require the
 * resolved resource to be inside a root, or inside the resolved location of a root (roots may be
 * links themselves). File systems without link resolution keep the lexical check only.
 */
async function checkResolvedContainment(
	request: IContainmentRequest,
	fileService: IFileService,
	uriIdentityService: IUriIdentityService,
	remoteOS: OperatingSystem | undefined,
	resource: URI = request.resource,
): Promise<Containment> {
	let resolvedResource: URI | undefined;
	try {
		resolvedResource = await resolveRealpath(resource, fileService, remoteOS);
	} catch {
		if (await isMissing(resource, fileService)) {
			// Reading would fail as well. Report it as before resolving links, unless the closest
			// existing folder already resolves outside of all roots.
			const parent = uriIdentityService.extUri.dirname(resource);
			if (!isContainedInAnyRoot(parent, request.roots, uriIdentityService, request.forcePosixSemantics)) {
				return Containment.NotFound; // the parent is a root
			}
			const parentContainment = await checkResolvedContainment(request, fileService, uriIdentityService, remoteOS, parent);
			return parentContainment === Containment.Contained ? Containment.NotFound : parentContainment;
		}
		// Dangling links, and file systems that cannot resolve some links of readable paths.
		// Never fall back to the unresolved resource if a link is involved.
		return checkUnresolvedContainment(request, resource, fileService, uriIdentityService);
	}
	if (!resolvedResource) {
		return Containment.Contained;
	}

	if (isContainedInAnyRoot(resolvedResource, request.roots, uriIdentityService, request.forcePosixSemantics)) {
		return Containment.Contained;
	}

	const resolvedRoots = await Promise.all(request.roots
		.filter(root => root.scheme === request.resource.scheme)
		.map(root => resolveRealpath(root, fileService, remoteOS).catch(() => undefined)));
	return isContainedInAnyRoot(resolvedResource, resolvedRoots.filter(isDefined), uriIdentityService, request.forcePosixSemantics)
		? Containment.Contained
		: Containment.NotContained;
}

/**
 * Checks a resource whose links could not be resolved: it is contained only if neither the resource
 * nor a folder between it and the closest root containing it is a link. Links in the path of a root
 * itself are allowed.
 */
async function checkUnresolvedContainment(request: IContainmentRequest, resource: URI, fileService: IFileService, uriIdentityService: IUriIdentityService): Promise<Containment> {
	const extUri = uriIdentityService.extUri;
	const containingRoots = request.roots.filter(root => containsResource(root, resource, uriIdentityService, request.forcePosixSemantics));
	const closestRoot = containingRoots.reduce<URI | undefined>((closest, root) => !closest || extUri.isEqualOrParent(root, closest) ? root : closest, undefined);
	const provider = fileService.getProvider(resource.scheme);
	if (!closestRoot || !provider) {
		return Containment.NotContained;
	}

	const candidates: URI[] = [];
	for (let current = resource; !extUri.isEqualOrParent(closestRoot, current); current = extUri.dirname(current)) {
		if (extUri.isEqual(extUri.dirname(current), current)) {
			return Containment.NotContained;
		}
		candidates.push(current);
	}

	try {
		const stats = await Promise.all(candidates.map(candidate => provider.stat(candidate)));
		return stats.some(stat => (stat.type & FileType.SymbolicLink) !== 0) ? Containment.NotContained : Containment.Contained;
	} catch {
		return Containment.NotContained;
	}
}

async function isMissing(resource: URI, fileService: IFileService): Promise<boolean> {
	const provider = fileService.getProvider(resource.scheme);
	if (!provider) {
		return false;
	}
	try {
		await provider.stat(resource);
		return false;
	} catch (error) {
		return toFileSystemProviderErrorCode(error) === FileSystemProviderErrorCode.FileNotFound;
	}
}

/**
 * Resolves all links in the path of a resource, or returns `undefined` when its file system cannot.
 */
async function resolveRealpath(resource: URI, fileService: IFileService, remoteOS: OperatingSystem | undefined): Promise<URI | undefined> {
	if (!await fileService.canHandleResource(resource)) {
		return undefined;
	}
	const provider = fileService.getProvider(resource.scheme);
	if (!provider || !hasFileRealpathCapability(provider)) {
		return undefined;
	}

	// Providers return a path in the format of the (possibly remote) operating system.
	const realpath = await provider.realpath(resource.with({ query: '', fragment: '' }), { strict: true });
	if (resource.scheme === Schemas.file) {
		return URI.file(realpath);
	}
	if (resource.scheme === Schemas.vscodeRemote && remoteOS === OperatingSystem.Windows) {
		const path = realpath.replace(/\\/g, '/');
		return resource.with({ path: path.startsWith('/') ? path : `/${path}`, query: '', fragment: '' });
	}
	return resource.with({ path: realpath, query: '', fragment: '' });
}

function containsResource(root: URI, resource: URI, uriIdentityService: IUriIdentityService, forcePosixSemantics: boolean): boolean {
	if (uriIdentityService.extUri.isEqual(root, resource, /* ignoreFragment */ true)) {
		return false;
	}

	// Compare unc paths case-insensitively
	if (root.scheme === Schemas.file && isUNC(root.fsPath)) {
		if (resource.scheme === Schemas.file && isUNC(resource.fsPath)) {
			return uriIdentityService.extUri.isEqualOrParent(
				resource.with({
					path: resource.path.toLowerCase(),
					authority: resource.authority.toLowerCase()
				}),
				root.with({
					path: root.path.toLowerCase(),
					authority: root.authority.toLowerCase()
				}),
				/* ignoreFragment */ true
			);
		}
		return false;
	}

	return uriIdentityService.extUri.isEqualOrParent(resource, root, /* ignoreFragment */ true, forcePosixSemantics);
}

const WINDOWS_PARENT_TRAVERSAL_SEGMENT = /(?:^|[\\/])\.\. +(?=$|[\\/])/;

function hasWindowsParentTraversalSegment(resource: URI): boolean {
	return isWindows
		&& resource.scheme === Schemas.file
		&& WINDOWS_PARENT_TRAVERSAL_SEGMENT.test(resource.path);
}

function normalizeRemoteResource(resource: URI, remoteOS: OperatingSystem): URI {
	if (remoteOS === OperatingSystem.Windows) {
		const path = originalFSPath(URI.from({ scheme: Schemas.file, path: resource.path }));
		const normalizedPath = win32.normalize(path).replace(/\\/g, '/');
		return resource.with({ path: normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}` });
	}
	return resource.with({ path: posix.normalize(resource.path) });
}

function normalizeResourcePath(resource: URI): URI {
	// Rewrite remote uris to a path that the remote file system can understand
	if (resource.scheme === Schemas.vscodeRemote) {
		return URI.from({
			scheme: Schemas.vscodeRemote,
			authority: resource.authority,
			path: '/vscode-resource',
			query: JSON.stringify({
				requestResourcePath: resource.path
			})
		});
	}
	return resource;
}
