/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, Sequencer } from '../../../../../base/common/async.js';
import { decodeBase64, encodeBase64, newWriteableBufferStream, VSBuffer, VSBufferReadableStream } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { canceled } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, IReference, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { rewriteMarkdownLinks } from '../../../../../base/common/markdownLinks.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { getExtensionForMimeType } from '../../../../../base/common/mime.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { createFileSystemProviderError, FileOperationResult, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileService, IFileStat, IFileSystemProviderWithFileReadWriteCapability, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { chatResourceLockKey, IChatResourceLease, IChatSessionResourceLocks } from './chatSessionResourceLocks.js';
import { coerceImageBuffer } from '../attachments/chatImageData.js';

const binaryKey = '$chatBinary';
const binaryTextKey = '$chatBinaryText';
export const chatSessionResourceScheme = 'vscode-chat-binary';

type Representation = 'bytes' | 'base64' | 'buffer' | 'uri';

export interface IStoredBinary {
	readonly version: 1;
	readonly sha256: string;
	readonly size: number;
	readonly representation: Representation;
	readonly mimeType?: string;
	readonly query?: string;
	readonly fragment?: string;
	readonly sourceUri?: string;
	readonly unavailable?: 'missing' | 'corrupt';
}

interface IResourceOwner {
	readonly directory: URI;
	readonly resources: Map<string, ChatBinaryReference>;
	readonly leases: Map<string, number>;
	readonly encoded: Map<string, IStoredBinary>;
	readonly pending: Set<string>;
	readonly pins: Map<string, { holder: MutableDisposable<IChatResourceLease>; ready: Promise<IChatResourceLease> }>;
	readonly releasing: Set<Promise<void>>;
	deleted: boolean;
	keep?: ReadonlySet<string>;
}

const resourceReferences = new WeakMap<URI, ChatBinaryReference>();
const resourceStrings = new Map<string, ChatBinaryReference>();
const resourceProviders = new WeakMap<IFileService, { resources: ResourceMap<ChatBinaryReference>; registration: IDisposable; owners: number }>();

/** An immutable, verified, lazily read value. It is never accepted from imports or extension DTOs. */
export class ChatBinaryReference {
	readonly uri: URI;

	constructor(
		readonly descriptor: IStoredBinary,
		readonly directory: URI,
		readonly read: (token?: CancellationToken) => Promise<VSBuffer>,
		readonly retain: () => IDisposable,
		readonly ready: () => Promise<void>,
	) {
		this.uri = URI.from({ scheme: chatSessionResourceScheme, path: `/${generateUuid()}${descriptor.mimeType ? getExtensionForMimeType(descriptor.mimeType) ?? '.bin' : '.bin'}` });
		resourceReferences.set(this.uri, this);
		resourceStrings.set(this.uri.toString(), this);
	}

	toJSON(): never {
		throw new Error('Chat binary resources must be resolved before portable serialization');
	}
}

export function getChatBinaryReference(value: unknown): ChatBinaryReference | undefined {
	return value instanceof ChatBinaryReference ? value : URI.isUri(value) && value.scheme === chatSessionResourceScheme ? resourceReferences.get(value) ?? resourceStrings.get(value.toString()) : undefined;
}

export function cloneChatData<T>(value: T): T;
export function cloneChatData(value: unknown, mapBinary: (reference: ChatBinaryReference) => unknown): unknown;
export function cloneChatData(value: unknown, mapBinary?: (reference: ChatBinaryReference) => unknown): unknown {
	const buffers = new Map<Uint8Array, Uint8Array>();
	const ancestors = new Set<object>();
	const clone = (item: unknown, applyToJSON = true): unknown => {
		const reference = getChatBinaryReference(item);
		if (reference) {
			return mapBinary ? mapBinary(reference) : item;
		}
		if (URI.isUri(item)) {
			return item;
		}
		if (item instanceof ArrayBuffer) {
			return item.slice(0);
		}
		if (item instanceof Uint8Array || item instanceof VSBuffer) {
			const source = item instanceof VSBuffer ? item.buffer : item;
			let copy = buffers.get(source);
			if (!copy) {
				copy = source.slice();
				buffers.set(source, copy);
			}
			return item instanceof VSBuffer ? VSBuffer.wrap(copy) : copy;
		}
		if (!item || typeof item !== 'object') {
			return item;
		}
		if (applyToJSON && isRecord(item) && typeof item.toJSON === 'function') {
			return clone(item.toJSON(), false);
		}
		if (ancestors.has(item)) {
			throw new Error('Cannot serialize circular chat data');
		}
		ancestors.add(item);
		try {
			if (Array.isArray(item)) {
				return item.map(child => clone(child));
			}
			const result: Record<string, unknown> = {};
			for (const [key, child] of Object.entries(item)) {
				if (typeof child !== 'function') {
					Object.defineProperty(result, key, { value: clone(child), enumerable: true, writable: true, configurable: true });
				}
			}
			return result;
		} finally {
			ancestors.delete(item);
		}
	};
	return clone(value);
}

export class ChatBinaryReferenceCollection extends Disposable {
	private readonly references = this._register(new DisposableMap<ChatBinaryReference, IDisposable>());

	add(value: unknown): void {
		for (const reference of chatBinaryReferences(value)) {
			if (!this.references.has(reference)) {
				this.references.set(reference, reference.retain());
			}
		}
	}

	set(value: unknown): void {
		const references = chatBinaryReferences(value);
		for (const reference of references) {
			if (!this.references.has(reference)) {
				this.references.set(reference, reference.retain());
			}
		}
		for (const reference of this.references.keys()) {
			if (!references.has(reference)) {
				this.references.deleteAndDispose(reference);
			}
		}
	}

	clear(): void {
		this.references.clearAndDisposeAll();
	}
}

function chatBinaryReferences(value: unknown): Set<ChatBinaryReference> {
	const seen = new Set<ChatBinaryReference>();
	const visited = new Set<object>();
	const visit = (item: unknown, applyToJSON = true): void => {
		const reference = getChatBinaryReference(item);
		if (reference) {
			if (!seen.has(reference)) {
				seen.add(reference);
			}
		} else if (typeof item === 'string') {
			for (const match of item.matchAll(resourcePattern())) {
				visit(resourceStrings.get(match[0]));
			}
		} else if (item && typeof item === 'object' && !URI.isUri(item) && !(item instanceof Uint8Array) && !(item instanceof VSBuffer)) {
			if (visited.has(item)) {
				return;
			}
			visited.add(item);
			if (applyToJSON && isRecord(item) && typeof item.toJSON === 'function') {
				const serialized = item.toJSON();
				if (serialized !== item) {
					visit(serialized, false);
					return;
				}
			}
			for (const child of Object.values(item)) {
				visit(child);
			}
		}
	};
	visit(value);
	return seen;
}

export function retainChatBinaryReferences(value: unknown): IDisposable {
	const store = new DisposableStore();
	try {
		for (const reference of chatBinaryReferences(value)) {
			store.add(reference.retain());
		}
		return store;
	} catch (error) {
		store.dispose();
		throw error;
	}
}

export function hasChatBinaryReferences(value: unknown): boolean {
	return chatBinaryReferences(value).size > 0;
}

/** A conservative fast-path check; literal data-URL text can opt in without being rewritten. */
export function hasChatBinaryPayload(value: unknown): boolean {
	const visited = new Set<object>();
	const visit = (item: unknown, applyToJSON = true): boolean => {
		if (getChatBinaryReference(item) || item instanceof Uint8Array || item instanceof VSBuffer || item instanceof ArrayBuffer) {
			return true;
		}
		if (URI.isUri(item)) {
			return item.scheme === Schemas.data;
		}
		if (typeof item === 'string') {
			return hasBinaryMediaTarget(item);
		}
		if (!item || typeof item !== 'object' || visited.has(item)) {
			return false;
		}
		visited.add(item);
		if (isRecord(item)) {
			if (applyToJSON && typeof item.toJSON === 'function') {
				const serialized = item.toJSON();
				if (serialized !== item) {
					return visit(serialized, false);
				}
			}
			if (Object.hasOwn(item, binaryKey) || typeof item.$base64 === 'string' || typeof item.base64Data === 'string'
				|| item.type === 'embed' && !item.isText && typeof item.value === 'string'
				|| typeof item.mimeType === 'string' && (typeof item.data === 'string' || typeof item.blob === 'string')
				|| (item.kind === 'image' || item.kind === 'notebookOutput') && item.value && typeof item.value === 'object' && !URI.isUri(item.value)
				|| item.kind === 'element' && item.imageData && typeof item.imageData === 'object') {
				return true;
			}
		}
		return Object.values(item).some(child => visit(child));
	};
	return visit(value);
}

function hasBinaryMediaTarget(value: string): boolean {
	return /data:[\w.+/-]+;base64,/.test(value) || value.includes(`${chatSessionResourceScheme}:`);
}

function resourcePattern(): RegExp {
	return /vscode-chat-binary:\/[a-f0-9-]+\.[a-z0-9]+/g;
}

const markdownProperties = new Set(['response', 'content', 'invocationMessage', 'pastTenseMessage', 'originMessage', 'tooltip', 'message', 'markdown', 'toolResultMessage']);

function rewriteMedia(markdown: string, replace: (href: string) => string | undefined): string {
	const replacements = new Map<string, string>();
	return rewriteMarkdownLinks(markdown, {
		rewriteLink: token => {
			const replacement = replace(token.href);
			if (replacement === undefined) {
				return undefined;
			}
			replacements.set(token.href, replacement);
			return token.raw.includes(token.href) ? token.raw.replace(token.href, replacement) : undefined;
		},
		additionalEdits: (source, context) => context.definitionRanges.map(range => {
			let replacement = source.slice(range.start, range.end);
			for (const [href, value] of replacements) {
				replacement = replacement.replaceAll(href, value);
			}
			return { ...range, replacement };
		}),
	});
}

function markdownParts<T>(markdown: string, resolve: (href: string) => T | undefined): (string | T)[] {
	const marker = `\0${generateUuid()}:`;
	const values: T[] = [];
	const rewritten = rewriteMedia(markdown, href => {
		const value = resolve(href);
		if (value === undefined) {
			return undefined;
		}
		values.push(value);
		return `${marker}${values.length - 1}\0`;
	});
	const result: (string | T)[] = [];
	let offset = 0;
	while (true) {
		const start = rewritten.indexOf(marker, offset);
		if (start < 0) {
			result.push(rewritten.slice(offset));
			return result;
		}
		const end = rewritten.indexOf('\0', start + marker.length);
		result.push(rewritten.slice(offset, start), values[Number(rewritten.slice(start + marker.length, end))]);
		offset = end + 1;
	}
}

/** Resolves media targets, never code, prose, commands, or unknown capability-looking text. */
export async function resolveChatMarkdownResources(markdown: string, token = CancellationToken.None, allowUnavailable = false): Promise<string> {
	if (!markdown.includes(`${chatSessionResourceScheme}:`)) {
		return markdown;
	}
	let result = '';
	let unavailable = false;
	for (const part of markdownParts(markdown, href => resourceStrings.get(href))) {
		try {
			result += typeof part === 'string' ? part : `data:${part.descriptor.mimeType ?? 'application/octet-stream'};base64,${encodeBase64(await part.read(token))}`;
		} catch (error) {
			if (!allowUnavailable || !(error instanceof ChatBinaryUnavailableError)) {
				throw error;
			}
			result += '#saved-resource-unavailable';
			unavailable = true;
		}
	}
	return unavailable ? `${result}\n\n${unavailableHistoryText}` : result;
}

export function assertPortableChatData(value: unknown): void {
	if (isRecord(value) && (Object.hasOwn(value, binaryKey) || Object.hasOwn(value, binaryTextKey) || value.scheme === chatSessionResourceScheme)) {
		throw new Error('Chat imports must contain portable binary data, not local resource references');
	}
	if (typeof value === 'string') {
		rewriteMedia(value, href => {
			if (href.startsWith(`${chatSessionResourceScheme}:`)) {
				throw new Error('Chat imports must contain portable binary data, not local resource references');
			}
			return undefined;
		});
	} else if (value && typeof value === 'object' && !(value instanceof Uint8Array) && !(value instanceof VSBuffer)) {
		for (const child of Object.values(value)) {
			assertPortableChatData(child);
		}
	}
}

function isCanonicalBase64(value: string): boolean {
	if (value.length % 4 !== 0 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(value)) {
		return false;
	}
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	// Nonzero padding bits would change the original string when exporting it again.
	return value.endsWith('==') ? (alphabet.indexOf(value[value.length - 3]) & 15) === 0
		: value.endsWith('=') ? (alphabet.indexOf(value[value.length - 2]) & 3) === 0 : true;
}

export async function writeChatSessionFile(fileService: IFileService, resource: URI, data: VSBuffer, synchronization?: readonly string[]): Promise<void> {
	await fileService.writeFile(resource, data, {
		...(fileService.hasCapability(resource, FileSystemProviderCapabilities.FileAtomicWrite) ? { atomic: { postfix: '.tmp' } } : {}),
		...(synchronization?.length ? { synchronization } : {}),
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function descriptor(value: unknown): IStoredBinary {
	if (isRecord(value) && Object.hasOwn(value, 'version') && value.version !== 1) {
		throw new Error('Unsupported chat binary descriptor version');
	}
	if (!isRecord(value) || value.version !== 1 || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)
		|| typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size < 0
		|| value.representation !== 'bytes' && value.representation !== 'base64' && value.representation !== 'buffer' && value.representation !== 'uri'
		|| value.mimeType !== undefined && typeof value.mimeType !== 'string'
		|| value.query !== undefined && typeof value.query !== 'string'
		|| value.fragment !== undefined && typeof value.fragment !== 'string'
		|| value.sourceUri !== undefined && typeof value.sourceUri !== 'string'
		|| value.unavailable !== undefined && value.unavailable !== 'missing' && value.unavailable !== 'corrupt') {
		throw new ChatStorageCorruptionError('Invalid chat binary descriptor');
	}
	return Object.freeze({
		version: 1,
		sha256: value.sha256,
		size: value.size,
		representation: value.representation,
		...(typeof value.mimeType === 'string' ? { mimeType: value.mimeType } : {}),
		...(typeof value.query === 'string' ? { query: value.query } : {}),
		...(typeof value.fragment === 'string' ? { fragment: value.fragment } : {}),
		...(typeof value.sourceUri === 'string' ? { sourceUri: value.sourceUri } : {}),
		...(value.unavailable === 'missing' || value.unavailable === 'corrupt' ? { unavailable: value.unavailable } : {}),
	});
}

export function getStoredChatBinaryDescriptors(value: unknown): ReadonlyMap<string, IStoredBinary> {
	const descriptors = new Map<string, IStoredBinary>();
	const visit = (item: unknown) => {
		if (isRecord(item) && Object.hasOwn(item, binaryKey)) {
			const info = descriptor(item[binaryKey]);
			if (!info.unavailable) {
				const previous = descriptors.get(info.sha256);
				if (previous && previous.size !== info.size) {
					throw new ChatStorageCorruptionError('Inconsistent chat binary descriptor');
				}
				descriptors.set(info.sha256, info);
			}
		} else if (item && typeof item === 'object') {
			for (const child of Object.values(item)) {
				visit(child);
			}
		}
	};
	visit(value);
	return descriptors;
}

export function getStoredChatBinaryHashes(value: unknown): ReadonlySet<string> {
	return new Set(getStoredChatBinaryDescriptors(value).keys());
}

/** Marks unavailable blobs in a detached stored snapshot without changing their provenance. */
export function markStoredChatBinaryResourcesUnavailable(value: unknown, unavailable: ReadonlyMap<string, ChatBinaryUnavailableError['reason']>): void {
	const visit = (item: unknown) => {
		if (isRecord(item) && Object.hasOwn(item, binaryKey)) {
			const stored = item[binaryKey];
			const info = descriptor(stored);
			const reason = unavailable.get(info.sha256);
			if (reason && isRecord(stored)) {
				item[binaryKey] = { ...stored, unavailable: reason };
			}
		} else if (item && typeof item === 'object') {
			for (const child of Object.values(item)) {
				visit(child);
			}
		}
	};
	visit(value);
}

async function digest(data: VSBuffer): Promise<string> {
	const result = await crypto.subtle.digest('SHA-256', data.buffer.slice());
	return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}

const unavailableHistoryText = localize('chat.savedBinaryUnavailable', "[A saved image or binary resource is unavailable. Reattach it to include its contents.]");

/** Identifies confirmed malformed storage data, not a failed read or an unsupported version. */
export class ChatStorageCorruptionError extends Error { }

export class ChatBinaryUnavailableError extends Error {
	constructor(readonly reason: 'missing' | 'corrupt') {
		super(reason === 'corrupt' ? localize('chat.resourceCorrupt', "The saved chat resource is corrupt.") : localize('chat.resourceUnavailable', "The saved chat resource is unavailable."));
	}
}

/** Resolve only capabilities created by the local store, never arbitrary file/URL references. */
export async function resolveChatBinaryData<T>(value: T, mode: 'export' | 'request' | 'history', token = CancellationToken.None): Promise<T> {
	const reads = new Map<ChatBinaryReference, Promise<VSBuffer | undefined>>();
	const readHistory = (reference: ChatBinaryReference): Promise<VSBuffer | undefined> => {
		let read = reads.get(reference);
		if (!read) {
			read = readReference(reference);
			reads.set(reference, read);
		}
		return read;
	};
	const readReference = async (reference: ChatBinaryReference): Promise<VSBuffer | undefined> => {
		try {
			return await reference.read(token);
		} catch (error) {
			if (mode !== 'history' || !(error instanceof ChatBinaryUnavailableError)) {
				throw error;
			}
			return undefined;
		}
	};
	const visit = async (item: unknown, markdownContext = false, applyToJSON = true): Promise<unknown> => {
		if (token.isCancellationRequested) {
			throw canceled();
		}
		const reference = getChatBinaryReference(item);
		if (reference) {
			const data = await readHistory(reference);
			if (!data) {
				return { unavailable: true, message: unavailableHistoryText };
			}
			switch (URI.isUri(item) ? 'uri' : reference.descriptor.representation) {
				case 'bytes': return mode === 'export' ? { $base64: encodeBase64(data) } : new Uint8Array(data.buffer.buffer, data.buffer.byteOffset, data.byteLength);
				case 'buffer': return data;
				case 'base64': return encodeBase64(data);
				case 'uri': return URI.from({ scheme: Schemas.data, path: `${reference.descriptor.mimeType ?? 'application/octet-stream'};base64,${encodeBase64(data)}`, query: reference.descriptor.query, fragment: reference.descriptor.fragment });
			}
		}
		if (Array.isArray(item)) {
			const result = [];
			for (const child of item) {
				result.push(hasChatBinaryReferences(child) ? await visit(child, markdownContext) : child);
			}
			return result;
		}
		if (isRecord(item) && !URI.isUri(item) && !(item instanceof Uint8Array) && !(item instanceof VSBuffer)) {
			if (!hasChatBinaryReferences(item)) {
				return item;
			}
			if (applyToJSON && typeof item.toJSON === 'function') {
				return visit(item.toJSON(), markdownContext, false);
			}
			const embedded = item.type === 'ref' ? getChatBinaryReference(item.uri) : undefined;
			if (embedded) {
				const { uri: _, ...rest } = item;
				const data = await readHistory(embedded);
				return data ? { ...rest, type: 'embed', ...(embedded.descriptor.sourceUri ? { uri: URI.parse(embedded.descriptor.sourceUri) } : {}), value: encodeBase64(data) }
					: { ...rest, type: 'embed', isText: true, mimeType: 'text/plain', value: unavailableHistoryText };
			}
			const output = item.type === 'data' ? getChatBinaryReference(item.resource) : undefined;
			if (output) {
				const { resource: _, ...rest } = item;
				const data = await readHistory(output);
				return data ? { ...rest, base64Data: encodeBase64(data) } : { ...rest, mimeType: 'text/plain', base64Data: encodeBase64(VSBuffer.fromString(unavailableHistoryText)) };
			}
			if (mode === 'history') {
				const binary = getChatBinaryReference(item.value) ?? getChatBinaryReference(item.imageData) ?? getChatBinaryReference(item.data) ?? getChatBinaryReference(item.blob);
				if (binary && !await readHistory(binary)) {
					if (typeof item.kind === 'string' && typeof item.id === 'string') {
						return { kind: 'generic', id: item.id, name: typeof item.name === 'string' ? item.name : localize('chat.unavailableAttachment', "Unavailable Attachment"), value: unavailableHistoryText };
					}
					if (item.$mid === MarshalledId.LanguageModelDataPart) {
						return { $mid: MarshalledId.LanguageModelTextPart, value: unavailableHistoryText, ...(item.audience !== undefined ? { audience: item.audience } : {}) };
					}
					return { type: 'text', text: unavailableHistoryText };
				}
			}
			const result: Record<string, unknown> = {};
			for (const [key, child] of Object.entries(item)) {
				if (typeof child === 'function') {
					continue;
				}
				const value = key === 'value' && typeof child === 'string' && (markdownContext || item instanceof MarkdownString)
					? await resolveChatMarkdownResources(child, token, mode === 'history') : hasChatBinaryReferences(child) ? await visit(child, markdownProperties.has(key)) : child;
				Object.defineProperty(result, key, { value, enumerable: true, writable: true, configurable: true });
			}
			return result;
		}
		return item;
	};
	const lease = retainChatBinaryReferences(value);
	try {
		return await visit(value, true) as T;
	} finally {
		lease.dispose();
	}
}

/** Streams portable JSON without constructing one session-sized string. */
export function exportChatBinaryData(value: unknown): IReference<VSBufferReadableStream> {
	const lifetime = new DisposableStore();
	const cancellation = lifetime.add(new CancellationTokenSource());
	const lease = lifetime.add(retainChatBinaryReferences(value));
	const stream = newWriteableBufferStream({ highWaterMark: 10 });
	lifetime.add(toDisposable(() => {
		stream.destroy();
	}));
	const chunk = (text: string) => raceCancellationError(Promise.resolve(stream.write(VSBuffer.fromString(text))), cancellation.token);
	const textFragment = async (text: string) => {
		for (let offset = 0; offset < text.length; offset += 8192) {
			await chunk(JSON.stringify(text.slice(offset, offset + 8192)).slice(1, -1));
		}
	};
	const base64Fragment = async (data: VSBuffer) => {
		for (let offset = 0; offset < data.byteLength; offset += 48 * 1024) {
			await chunk(encodeBase64(data.slice(offset, offset + 48 * 1024)));
		}
	};
	const write = async (item: unknown, markdownContext = false, applyToJSON = true): Promise<void> => {
		if (cancellation.token.isCancellationRequested) {
			throw canceled();
		}
		const reference = getChatBinaryReference(item);
		if (reference && reference.descriptor.representation !== 'buffer') {
			const data = await reference.read(cancellation.token);
			const representation = URI.isUri(item) ? 'uri' : reference.descriptor.representation;
			await chunk(representation === 'bytes' ? '{"$base64":"' : representation === 'uri' ? `{"$mid":${MarshalledId.Uri},"scheme":"${Schemas.data}","path":"` : '"');
			if (representation === 'uri') {
				await textFragment(`${reference.descriptor.mimeType ?? 'application/octet-stream'};base64,`);
			}
			await base64Fragment(data);
			await chunk('"');
			if (representation === 'uri') {
				for (const key of ['query', 'fragment'] as const) {
					if (reference.descriptor[key]) {
						await chunk(`,"${key}":`);
						await write(reference.descriptor[key]);
					}
				}
			}
			if (representation !== 'base64') {
				await chunk('}');
			}
		} else if (reference) {
			await write(await reference.read(cancellation.token));
		} else if (typeof item === 'string') {
			await chunk('"');
			for (const part of markdownContext ? markdownParts(item, href => resourceStrings.get(href)) : [item]) {
				if (typeof part === 'string') {
					await textFragment(part);
				} else {
					await textFragment(`data:${part.descriptor.mimeType ?? 'application/octet-stream'};base64,`);
					await base64Fragment(await part.read(cancellation.token));
				}
			}
			await chunk('"');
		} else if (Array.isArray(item)) {
			await chunk('[');
			for (let index = 0; index < item.length; index++) {
				if (index) {
					await chunk(',');
				}
				await write(item[index] ?? null, markdownContext);
			}
			await chunk(']');
		} else if (isRecord(item)) {
			if (applyToJSON && typeof item.toJSON === 'function') {
				await write(item.toJSON(), markdownContext, false);
				return;
			}
			const embedded = item.type === 'ref' ? getChatBinaryReference(item.uri) : undefined;
			if (embedded) {
				const { uri: _, ...rest } = item;
				await write({ ...rest, type: 'embed', ...(embedded.descriptor.sourceUri ? { uri: URI.parse(embedded.descriptor.sourceUri) } : {}), value: embedded });
				return;
			}
			const output = item.type === 'data' ? getChatBinaryReference(item.resource) : undefined;
			if (output) {
				const { resource: _, ...rest } = item;
				await write({ ...rest, base64Data: output });
				return;
			}
			await chunk('{');
			let first = true;
			for (const [key, child] of Object.entries(item)) {
				if (child === undefined || typeof child === 'function') {
					continue;
				}
				await chunk(`${first ? '' : ','}${JSON.stringify(key)}:`);
				first = false;
				await write(child, key === 'value' ? markdownContext || item instanceof MarkdownString : markdownProperties.has(key) && typeof child === 'object');
			}
			await chunk('}');
		} else {
			await chunk(JSON.stringify(item) ?? 'null');
		}
	};
	void write(value, true).then(() => {
		lease.dispose();
		stream.end();
	}, error => {
		lease.dispose();
		if (!lifetime.isDisposed) {
			stream.error(error);
			stream.end();
		}
	});
	return {
		object: stream,
		dispose: () => {
			cancellation.cancel();
			lifetime.dispose();
		}
	};
}

export interface IChatResourceOperations {
	beforeWrite(directory: URI): Promise<void>;
	onUnused(directory: URI): void;
	synchronization(): readonly string[];
}

export class ChatSessionResources extends Disposable {
	private readonly owners = new ResourceMap<IResourceOwner>();
	private readonly queue = new Sequencer();
	private readonly providerResources = new ResourceMap<ChatBinaryReference>();
	private readonly sharedProviderResources: ResourceMap<ChatBinaryReference>;
	private readonly pinHolders = this._register(new DisposableStore());
	private disposed = false;

	constructor(
		private readonly operations: IChatResourceOperations,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IChatSessionResourceLocks private readonly locks: IChatSessionResourceLocks,
	) {
		super();
		let shared = resourceProviders.get(fileService);
		if (!shared) {
			const resources = new ResourceMap<ChatBinaryReference>();
			const denied = () => { throw createFileSystemProviderError('Readonly chat resource', FileSystemProviderErrorCode.NoPermissions); };
			const lookup = (uri: URI) => {
				const reference = resources.get(uri);
				if (!reference) {
					throw createFileSystemProviderError(localize('chat.resourceUnavailable', "The saved chat resource is unavailable."), FileSystemProviderErrorCode.FileNotFound);
				}
				return reference;
			};
			const provider: IFileSystemProviderWithFileReadWriteCapability = {
				capabilities: FileSystemProviderCapabilities.Readonly | FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive,
				onDidChangeCapabilities: Event.None,
				onDidChangeFile: Event.None,
				watch: () => Disposable.None,
				stat: async uri => ({ type: FileType.File, ctime: 0, mtime: 0, size: lookup(uri).descriptor.size }),
				readFile: async uri => (await lookup(uri).read()).buffer,
				readdir: denied, mkdir: denied, delete: denied, rename: denied, writeFile: denied,
			};
			shared = { resources, registration: fileService.registerProvider(chatSessionResourceScheme, provider), owners: 0 };
			resourceProviders.set(fileService, shared);
		}
		const registration = shared;
		registration.owners++;
		this.sharedProviderResources = registration.resources;
		this._register(toDisposable(() => {
			if (--registration.owners === 0) {
				registration.registration.dispose();
				resourceProviders.delete(fileService);
			}
		}));
	}

	private owner(directory: URI): IResourceOwner {
		let owner = this.owners.get(directory);
		if (!owner) {
			owner = { directory, resources: new Map(), leases: new Map(), encoded: new Map(), pending: new Set(), pins: new Map(), releasing: new Set(), deleted: false };
			this.owners.set(directory, owner);
		}
		return owner;
	}

	private reference(info: IStoredBinary, owner: IResourceOwner): ChatBinaryReference {
		const key = JSON.stringify([info.sha256, info.representation, info.mimeType, info.query, info.fragment, info.sourceUri, info.unavailable]);
		let reference = owner.resources.get(key);
		if (reference && reference.descriptor.size !== info.size) {
			throw new ChatStorageCorruptionError('Inconsistent chat binary descriptor');
		}
		if (!reference) {
			reference = new ChatBinaryReference(info, owner.directory,
				async token => {
					const lease = this.retain(owner, info.sha256);
					try {
						await owner.pins.get(info.sha256)!.ready;
						if (this.disposed) {
							throw createFileSystemProviderError('Chat resource owner is disposed', FileSystemProviderErrorCode.Unavailable);
						}
						return await this.queue.queue(async () => {
							if (token?.isCancellationRequested) {
								throw canceled();
							}
							const data = await this.read(info, owner.directory);
							if (token?.isCancellationRequested) {
								throw canceled();
							}
							return data;
						});
					} finally {
						lease.dispose();
					}
				},
				() => this.retain(owner, info.sha256),
				async () => {
					const pin = owner.pins.get(info.sha256);
					if (!pin) {
						throw new Error('Chat resource must be retained before awaiting its lease');
					}
					await pin.ready;
				});
			owner.resources.set(key, reference);
			this.providerResources.set(reference.uri, reference);
			this.sharedProviderResources.set(reference.uri, reference);
		}
		return reference;
	}

	private retain(owner: IResourceOwner, hash: string): IDisposable {
		if (this.disposed) {
			throw createFileSystemProviderError('Chat resource owner is disposed', FileSystemProviderErrorCode.Unavailable);
		}
		owner.leases.set(hash, (owner.leases.get(hash) ?? 0) + 1);
		let pin = owner.pins.get(hash);
		if (!pin) {
			const holder = this.pinHolders.add(new MutableDisposable<IChatResourceLease>());
			const ready = this.locks.shared(chatResourceLockKey('blob', joinPath(owner.directory, hash))).then(lease => {
				if (this.disposed) {
					lease.dispose();
				} else {
					holder.value = lease;
				}
				return lease;
			});
			void ready.catch(error => this.logService.error('Unable to retain chat resource', error));
			pin = { holder, ready };
			owner.pins.set(hash, pin);
		}
		const retainedPin = pin;
		return toDisposable(() => {
			const count = owner.leases.get(hash)! - 1;
			if (count) {
				owner.leases.set(hash, count);
			} else {
				owner.leases.delete(hash);
				const releasing = retainedPin.ready.then(async lease => {
					if (!owner.leases.has(hash) && owner.pins.get(hash) === retainedPin) {
						owner.pins.delete(hash);
						this.pinHolders.delete(retainedPin.holder);
						await lease.whenReleased;
						if (!this.disposed) {
							this.operations.onUnused(owner.directory);
						}
					}
				}, () => {
					owner.pins.delete(hash);
					this.pinHolders.delete(retainedPin.holder);
				});
				owner.releasing.add(releasing);
				void releasing.finally(() => owner.releasing.delete(releasing));
			}
		});
	}

	async pinForRead(value: unknown): Promise<IDisposable> {
		const lease = retainChatBinaryReferences(value);
		try {
			await Promise.all([...chatBinaryReferences(value)].map(reference => reference.ready()));
			return lease;
		} catch (error) {
			lease.dispose();
			throw error;
		}
	}

	private read(info: IStoredBinary, directory: URI): Promise<VSBuffer> {
		return this.readResource(info, joinPath(directory, info.sha256));
	}

	private async readResource(info: IStoredBinary, resource: URI): Promise<VSBuffer> {
		let data: VSBuffer;
		try {
			data = (await this.fileService.readFile(resource)).value;
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				throw new ChatBinaryUnavailableError('missing');
			}
			throw error;
		}
		if (data.byteLength !== info.size || await digest(data) !== info.sha256) {
			throw new ChatBinaryUnavailableError('corrupt');
		}
		return data;
	}

	copyStoredBlob(info: IStoredBinary, source: URI, destination: URI): Promise<ChatBinaryUnavailableError['reason'] | undefined> {
		return this.queue.queue(async () => {
			const reason = await this.copyStoredBlobInQueue(info, destination, () => this.read(info, source));
			if (reason) {
				this.logService.warn('Migrating unavailable chat resource', source, info.sha256, reason);
			}
			return reason;
		});
	}

	private async copyStoredBlobInQueue(info: IStoredBinary, destination: URI, readSource: () => Promise<VSBuffer>): Promise<ChatBinaryUnavailableError['reason'] | undefined> {
		if (this.disposed) {
			throw new Error('Cannot copy resources from a disposed chat store');
		}
		const stored = descriptor(info);
		try {
			await this.read(stored, destination);
			return undefined;
		} catch (error) {
			if (!(error instanceof ChatBinaryUnavailableError)) {
				throw error;
			}
			if (error.reason === 'corrupt') {
				this.logService.warn('Repairing incomplete saved chat resource', destination);
			}
		}
		if (!this.locks.available) {
			throw new Error(localize('chat.storageLocksUnavailable', "Saving chat images requires cross-window storage locks. Open VS Code in a secure browser context."));
		}
		await this.operations.beforeWrite(destination);
		const target = joinPath(destination, stored.sha256);
		const temporary = target.with({ path: `${target.path}.tmp` });
		const options = { synchronization: this.operations.synchronization() };
		let staged = false;
		try {
			await this.readResource(stored, temporary);
			staged = true;
		} catch (error) {
			if (!(error instanceof ChatBinaryUnavailableError)) {
				throw error;
			}
		}
		if (!staged) {
			let data: VSBuffer;
			try {
				data = await readSource();
			} catch (error) {
				if (!(error instanceof ChatBinaryUnavailableError)) {
					throw error;
				}
				try {
					await this.fileService.del(temporary, options);
				} catch (cleanupError) {
					if (toFileOperationResult(cleanupError) !== FileOperationResult.FILE_NOT_FOUND) {
						throw cleanupError;
					}
				}
				return error.reason;
			}
			await this.fileService.writeFile(temporary, data, options);
			await this.readResource(stored, temporary);
		}
		await this.fileService.move(temporary, target, true, options);
		await this.read(stored, destination);
		return undefined;
	}

	prepare<T>(value: T, directory: URI): Promise<{ value: T; hashes: ReadonlySet<string> }> {
		return this.queue.queue(async () => {
			const owner = this.owner(directory);
			owner.deleted = false;
			const hashes = new Set<string>();
			const verified = new Set<string>();
			const store = async (data: VSBuffer, representation: Representation, mimeType?: string): Promise<{ [binaryKey]: IStoredBinary }> => {
				if (!this.locks.available) {
					throw new Error(localize('chat.storageLocksUnavailable', "Saving chat images requires cross-window storage locks. Open VS Code in a secure browser context."));
				}
				const sha256 = await digest(data);
				const info: IStoredBinary = { version: 1, sha256, size: data.byteLength, representation, ...(mimeType ? { mimeType } : {}) };
				hashes.add(sha256);
				owner.pending.add(sha256);
				if (!verified.has(sha256)) {
					const resource = joinPath(directory, sha256);
					try {
						await this.read(info, directory);
					} catch (error) {
						if (!(error instanceof ChatBinaryUnavailableError)) {
							throw error;
						}
						if (error.reason === 'corrupt' && (await this.fileService.stat(resource)).isSymbolicLink) {
							throw error;
						}
						await this.operations.beforeWrite(directory);
						await writeChatSessionFile(this.fileService, resource, data, this.operations.synchronization());
					}
					verified.add(sha256);
				}
				return { [binaryKey]: info };
			};
			const storeEncoded = async (value: string, representation: Representation, mimeType?: string) => {
				if (!isCanonicalBase64(value)) {
					return value;
				}
				const key = `${await digest(VSBuffer.fromString(value))}:${representation}:${mimeType ?? ''}`;
				let info = owner.encoded.get(key);
				if (info && !verified.has(info.sha256)) {
					try {
						await this.read(info, directory);
						verified.add(info.sha256);
					} catch (error) {
						if (!(error instanceof ChatBinaryUnavailableError)) {
							throw error;
						}
						info = undefined;
					}
				}
				if (!info) {
					const data = decodeBase64(value);
					info = (await store(data, representation, mimeType))[binaryKey];
					owner.encoded.set(key, info);
				}
				hashes.add(info.sha256);
				owner.pending.add(info.sha256);
				return { [binaryKey]: info };
			};
			const copy = async (reference: ChatBinaryReference, representation = reference.descriptor.representation, mimeType = reference.descriptor.mimeType) => {
				if (!this.locks.available) {
					throw new Error(localize('chat.storageLocksUnavailable', "Saving chat images requires cross-window storage locks. Open VS Code in a secure browser context."));
				}
				const { unavailable: _, ...info } = reference.descriptor;
				if (!verified.has(info.sha256)) {
					const reason = await this.copyStoredBlobInQueue(info, directory, async () => {
						const lease = reference.retain();
						try {
							await reference.ready();
							return await this.read(info, reference.directory);
						} finally {
							lease.dispose();
						}
					});
					if (reason) {
						this.logService.error('Saving explicit unavailable chat resource', new ChatBinaryUnavailableError(reason));
						return { [binaryKey]: { ...info, representation, ...(mimeType ? { mimeType } : {}), unavailable: reason } };
					}
					verified.add(info.sha256);
				}
				hashes.add(info.sha256);
				owner.pending.add(info.sha256);
				return { [binaryKey]: { ...info, representation, ...(mimeType ? { mimeType } : {}) } };
			};
			const prepareMarkdown = async (markdown: string): Promise<unknown> => {
				if (!hasBinaryMediaTarget(markdown)) {
					return markdown;
				}
				const replacements = new Map<string, { [binaryKey]: IStoredBinary }>();
				const targets = new Set<string>();
				rewriteMedia(markdown, href => { targets.add(href); return undefined; });
				for (const target of targets) {
					const existing = resourceStrings.get(target);
					if (existing) {
						replacements.set(target, await copy(existing, 'uri'));
					} else {
						const match = /^data:(?<mime>[\w.+/-]+);base64,(?<data>[a-zA-Z0-9+/]+={0,2})$/.exec(target);
						if (match?.groups) {
							const stored = await storeEncoded(match.groups.data, 'uri', match.groups.mime);
							if (typeof stored !== 'string') {
								replacements.set(target, stored);
							}
						}
					}
				}
				const parts = markdownParts(markdown, href => replacements.get(href));
				return parts.some(part => typeof part !== 'string') ? { [binaryTextKey]: parts } : markdown;
			};
			const visit = async (item: unknown, mimeType?: string, markdownContext = false, applyToJSON = true): Promise<unknown> => {
				const reference = getChatBinaryReference(item);
				if (reference) {
					return copy(reference, URI.isUri(item) ? 'uri' : reference.descriptor.representation);
				}
				if (item instanceof Uint8Array || item instanceof VSBuffer) {
					return store(item instanceof VSBuffer ? item : VSBuffer.wrap(item), item instanceof VSBuffer ? 'buffer' : 'bytes', mimeType);
				}
				if (Array.isArray(item)) {
					const result = [];
					for (const child of item) {
						result.push(await visit(child, mimeType, markdownContext));
					}
					return result;
				}
				if (URI.isUri(item)) {
					if (item.scheme === Schemas.data) {
						const match = /^(?<mime>[\w.+/-]+);base64,(?<data>[a-zA-Z0-9+/]+={0,2})$/.exec(item.path);
						if (match?.groups) {
							const stored = await storeEncoded(match.groups.data, 'uri', match.groups.mime);
							return typeof stored === 'string' ? item.toJSON() : {
								[binaryKey]: {
									...stored[binaryKey],
									...(item.query ? { query: item.query } : {}),
									...(item.fragment ? { fragment: item.fragment } : {}),
								},
							};
						}
					}
					return item.toJSON();
				}
				if (isRecord(item)) {
					if (Object.hasOwn(item, binaryKey) || Object.hasOwn(item, binaryTextKey)) {
						throw new Error('Untrusted chat resource descriptor');
					}
					if (applyToJSON && typeof item.toJSON === 'function') {
						return visit(item.toJSON(), mimeType, markdownContext, false);
					}
					const mime = typeof item.mimeType === 'string' ? item.mimeType : mimeType;
					if (typeof item.$base64 === 'string') {
						const stored = await storeEncoded(item.$base64, 'bytes', mime);
						return typeof stored === 'string' ? item : stored;
					}
					const embedded = item.type === 'ref' ? getChatBinaryReference(item.uri) : undefined;
					if (embedded) {
						const { uri: _, ...rest } = item;
						return { ...rest, type: 'embed', ...(embedded.descriptor.sourceUri ? { uri: URI.parse(embedded.descriptor.sourceUri).toJSON() } : {}), value: await copy(embedded, 'base64', mime) };
					}
					const output = item.type === 'data' ? getChatBinaryReference(item.resource) : undefined;
					if (output) {
						const { resource: _, ...rest } = item;
						return { ...rest, base64Data: await copy(output, 'base64', mime) };
					}
					const result: Record<string, unknown> = {};
					for (const [key, child] of Object.entries(item)) {
						if (child === undefined || typeof child === 'function') {
							continue;
						}
						if (key === 'uris' && isRecord(child) && (markdownContext || item instanceof MarkdownString)) {
							const entries: Record<string, unknown> = {};
							for (const [href, uri] of Object.entries(child)) {
								if (href.startsWith('data:') && URI.isUri(uri) && isEqual(URI.parse(href), uri)) {
									continue;
								}
								Object.defineProperty(entries, href, { value: await visit(uri), enumerable: true });
							}
							Object.defineProperty(result, key, { value: entries, enumerable: true, writable: true, configurable: true });
							continue;
						}
						const binary = key === 'base64Data' || (key === 'data' || key === 'blob') && !!mime || key === 'value' && item.type === 'embed' && !item.isText;
						const attachmentBytes = (key === 'value' && (item.kind === 'image' || item.kind === 'notebookOutput') || key === 'imageData' && item.kind === 'element')
							? coerceImageBuffer(child) : undefined;
						let transformed = attachmentBytes ? await store(VSBuffer.wrap(attachmentBytes), 'bytes', key === 'imageData' && typeof item.imageMimeType === 'string' ? item.imageMimeType : mime)
							: binary && typeof child === 'string'
							? await storeEncoded(child, 'base64', mime)
							: key === 'value' && typeof child === 'string' && (markdownContext || item instanceof MarkdownString)
								? await prepareMarkdown(child)
								: await visit(child, mime, markdownProperties.has(key));
						if (key === 'value' && item.type === 'embed' && URI.isUri(item.uri) && isRecord(transformed) && Object.hasOwn(transformed, binaryKey)) {
							transformed = { [binaryKey]: { ...descriptor(transformed[binaryKey]), sourceUri: item.uri.toString() } };
						}
						Object.defineProperty(result, key, { value: transformed, enumerable: true, writable: true, configurable: true });
					}
					return result;
				}
				return item;
			};
			return { value: await visit(value, undefined, true) as T, hashes };
		});
	}

	restore<T>(value: T, directory: URI): T {
		if (this.disposed) {
			throw new Error('Cannot restore resources from a disposed chat store');
		}
		const owner = this.owner(directory);
		owner.keep = getStoredChatBinaryHashes(value);
		const visit = (item: unknown): unknown => {
			if (Array.isArray(item)) {
				return item.map(visit);
			}
			if (isRecord(item) && !URI.isUri(item)) {
				if (Object.hasOwn(item, binaryKey)) {
					const info = descriptor(item[binaryKey]);
					const reference = this.reference(info, owner);
					return info.representation === 'uri' ? reference.uri : reference;
				}
				if (Object.hasOwn(item, binaryTextKey)) {
					const parts = item[binaryTextKey];
					if (!Array.isArray(parts)) {
						throw new ChatStorageCorruptionError('Invalid chat binary text');
					}
					return parts.map(part => {
						if (typeof part === 'string') {
							return part;
						}
						if (!isRecord(part) || !Object.hasOwn(part, binaryKey) || descriptor(part[binaryKey]).representation !== 'uri') {
							throw new ChatStorageCorruptionError('Invalid chat binary text resource');
						}
						return String(visit(part));
					}).join('');
				}
				const result: Record<string, unknown> = {};
				for (const [key, child] of Object.entries(item)) {
					Object.defineProperty(result, key, { value: visit(child), enumerable: true, writable: true, configurable: true });
				}
				if (result.type === 'embed' && result.value instanceof ChatBinaryReference) {
					const { value, ...rest } = result;
					return { ...rest, type: 'ref', uri: value.uri };
				}
				if (result.type === 'data' && result.base64Data instanceof ChatBinaryReference) {
					const { base64Data, ...rest } = result;
					return { ...rest, resource: base64Data.uri };
				}
				return result;
			}
			return item;
		};
		return visit(value) as T;
	}

	collect(directory: URI, hashes: ReadonlySet<string>): Promise<boolean> {
		return this.queue.queue(async () => {
			const owner = this.owner(directory);
			owner.deleted = false;
			owner.keep = hashes;
			return this.cleanup(owner);
		});
	}

	confirmWrite(directory: URI, hashes: ReadonlySet<string>): void {
		const owner = this.owner(directory);
		owner.keep = new Set([...(owner.keep ?? []), ...hashes]);
		owner.pending.clear();
	}

	cancelWrite(directory: URI): void {
		const owner = this.owner(directory);
		owner.pending.clear();
		owner.encoded.clear();
	}

	delete(directory: URI): Promise<boolean> {
		return this.queue.queue(async () => {
			const owner = this.owner(directory);
			owner.deleted = true;
			return this.cleanup(owner);
		});
	}

	private async cleanup(owner: IResourceOwner): Promise<boolean> {
		if (!this.locks.available) {
			return false;
		}
		if (!owner.deleted && !owner.keep) {
			return true;
		}
		await Promise.all(owner.releasing);
		let complete = true;
		let children: IFileStat[];
		try {
			children = (await this.fileService.resolve(owner.directory)).children ?? [];
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				throw error;
			}
			children = [];
		}
		for (const child of children) {
			if ((owner.deleted || !owner.keep?.has(child.name)) && /^[a-f0-9]{64}(?:\.tmp)?$/.test(child.name)) {
				if (owner.leases.has(child.name) || owner.pending.has(child.name)) {
					complete = false;
				} else {
					const removed = await this.locks.tryExclusive(chatResourceLockKey('blob', child.resource), () =>
						this.fileService.del(child.resource, { synchronization: this.operations.synchronization() }));
					complete &&= removed;
				}
			}
		}
		for (const [key, info] of owner.encoded) {
			if (!owner.pending.has(info.sha256) && (owner.deleted || !owner.keep?.has(info.sha256))) {
				owner.encoded.delete(key);
			}
		}
		for (const [key, reference] of owner.resources) {
			if (!owner.leases.has(reference.descriptor.sha256) && !owner.pending.has(reference.descriptor.sha256) && (owner.deleted || !owner.keep?.has(reference.descriptor.sha256))) {
				owner.resources.delete(key);
				this.providerResources.delete(reference.uri);
				this.sharedProviderResources.delete(reference.uri);
				resourceStrings.delete(reference.uri.toString());
			}
		}
		if ((owner.deleted || !owner.keep?.size) && !owner.leases.size && !owner.pending.size) {
			if (await this.fileService.exists(owner.directory) && !(await this.fileService.resolve(owner.directory)).children?.length) {
				await this.fileService.del(owner.directory, { synchronization: this.operations.synchronization() });
			}
			if (complete) {
				this.owners.delete(owner.directory);
			}
		}
		return complete;
	}

	override dispose(): void {
		this.disposed = true;
		for (const reference of this.providerResources.values()) {
			resourceStrings.delete(reference.uri.toString());
			this.sharedProviderResources.delete(reference.uri);
		}
		this.providerResources.clear();
		this.owners.clear();
		super.dispose();
	}
}
