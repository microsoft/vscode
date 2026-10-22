/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { isUNC } from '../../../../base/common/extpath.js';
import { StringSHA1 } from '../../../../base/common/hash.js';
import { IMarkdownString, parseHrefAndDimensions, resolveWithBaseUri } from '../../../../base/common/htmlContent.js';
import * as marked from '../../../../base/common/marked/marked.js';
import { getExtensionForMimeType, getMediaMime } from '../../../../base/common/mime.js';
import { Schemas } from '../../../../base/common/network.js';
import { IReader } from '../../../../base/common/observable.js';
import { basename, getComparisonKey, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { isLocation } from '../../../../editor/common/languages.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IChatResponseViewModel, IChatRequestViewModel, isRequestVM } from './model/chatViewModel.js';
import { ChatResponseResource, getAttachableImageExtension, IResponse } from './model/chatModel.js';
import { IChatContentInlineReference, IChatMarkdownContent, IChatToolInvocation, IChatToolInvocationSerialized, IToolResultOutputDetailsSerialized, ToolConfirmKind } from './chatService/chatService.js';
import { isToolResultInputOutputDetails, isToolResultOutputDetails, IToolResultInputOutputDetails, IToolResultOutputDetails, ToolInputOutputBase } from './tools/languageModelToolsService.js';
import { getExplicitFileOrImageAttachmentSummary, type IChatRequestVariableEntry, isImageVariableEntry } from './attachments/chatVariableEntries.js';
import { annotateSpecialMarkdownContent, contentRefUrl } from './widget/annotations.js';

export interface IChatExtractedImage {
	readonly id: string;
	readonly uri: URI;
	readonly name: string;
	readonly mimeType: string;
	readonly data?: VSBuffer;
	readonly source: string;
	readonly caption: string | IMarkdownString | undefined;
	/** Identifies the image in the image carousel when {@link uri} does not, see {@link getChatMarkdownImageId}. */
	readonly carouselId?: string;
}

export interface IChatExtractedImageCollection {
	readonly id: string;
	readonly title: string;
	readonly images: IChatExtractedImage[];
}

interface IChatToolOutputImage {
	readonly uri: URI;
	readonly name: string;
	readonly mimeType: string;
	readonly index: number;
	readonly base64Value?: string;
	readonly byteLength?: number;
	readonly audience?: ToolInputOutputBase['audience'];
}

export function getToolResultImageResources(details: IToolResultInputOutputDetails | undefined, sessionResource: URI, toolCallId: string, name = 'file'): IChatToolOutputImage[] {
	const images: IChatToolOutputImage[] = [];
	for (const [index, output] of details?.output.entries() ?? []) {
		if (!output.mimeType?.startsWith('image/') || output.type === 'embed' && output.isText) {
			continue;
		}
		const imageExtension = getAttachableImageExtension(output.mimeType === 'image/jpg' ? 'image/jpeg' : output.mimeType);
		const extension = imageExtension ? `.${imageExtension}` : getExtensionForMimeType(output.mimeType) ?? '';
		let fileName = `${name}${extension}`;
		if (name === 'generated-image') {
			const hash = new StringSHA1();
			hash.update(JSON.stringify([getComparisonKey(sessionResource), toolCallId, index]));
			fileName = `${name}-${hash.digest().slice(0, 12)}${extension}`;
		}
		images.push({
			uri: output.type === 'ref' ? output.uri : ChatResponseResource.createUri(sessionResource, toolCallId, index, fileName),
			name: output.type === 'ref' && name !== 'generated-image' ? basename(output.uri) : fileName,
			mimeType: output.mimeType,
			index,
			base64Value: output.type === 'embed' ? output.value : undefined,
			byteLength: output.type === 'embed' ? Math.floor(output.value.length * 3 / 4) - (output.value.endsWith('==') ? 2 : output.value.endsWith('=') ? 1 : 0) : undefined,
			audience: output.audience,
		});
	}
	return images;
}

/** Lists successful generated images without loading or decoding their bytes. */
export function getGeneratedImageResources(response: IResponse, sessionResource: URI, reader?: IReader): (IChatToolOutputImage & { readonly toolCallId: string })[] {
	const images: (IChatToolOutputImage & { readonly toolCallId: string })[] = [];
	for (const part of response.value) {
		if (part.kind !== 'toolInvocation' && part.kind !== 'toolInvocationSerialized') {
			continue;
		}
		if (!IChatToolInvocation.isComplete(part, reader) || part.toolSpecificData?.kind !== 'generatedImage' || IChatToolInvocation.resultError(part, reader)) {
			continue;
		}
		const confirmation = IChatToolInvocation.executionConfirmedOrDenied(part, reader);
		if (confirmation?.type === ToolConfirmKind.Denied || confirmation?.type === ToolConfirmKind.Skipped) {
			continue;
		}
		const details = IChatToolInvocation.resultDetails(part, reader);
		if (isToolResultInputOutputDetails(details) && !details.isError) {
			images.push(...getToolResultImageResources(details, sessionResource, part.toolCallId, 'generated-image').map(image => ({ ...image, toolCallId: part.toolCallId })));
		}
	}
	return images;
}

/** Embedded image names are presentation only; the tool and output index identify their bytes. */
export function getChatImageResourceComparisonKey(resource: URI): string {
	const parsed = ChatResponseResource.parseUri(resource);
	return getComparisonKey(parsed ? ChatResponseResource.createUri(parsed.sessionResource, parsed.toolCallId, parsed.index) : resource);
}

/**
 * Extract all images from a chat response's tool invocations, inline references, and Markdown.
 * Tool invocation images are extracted from output details and message URIs.
 * Inline reference images (file URIs) are read via the provided {@link readFile} callback.
 * Markdown images are resolved with {@link resolveImageUri} and loaded lazily.
 */
export async function extractImagesFromChatResponse(
	response: IChatResponseViewModel,
	readFile: (uri: URI) => Promise<VSBuffer>,
	resolveImageUri: (sessionResource: URI, href: string) => string = (_sessionResource, href) => href,
): Promise<IChatExtractedImageCollection> {
	const allImages: IChatExtractedImage[] = [];

	// Walk the content as it renders, with inline references and code block URIs merged into its Markdown
	for (const item of annotateSpecialMarkdownContent(response.response.value)) {
		if (item.kind === 'toolInvocation' || item.kind === 'toolInvocationSerialized') {
			const images = extractImagesFromToolInvocationOutputDetails(item, response.sessionResource);
			allImages.push(...images);
			const messageImages = await extractImagesFromToolInvocationMessages(item, readFile);
			allImages.push(...messageImages);
		} else if (item.kind === 'markdownContent') {
			allImages.push(...await extractImagesFromMarkdown(response.id, item, readFile, href => resolveImageUri(response.sessionResource, href)));
		}
	}

	// Use the corresponding user request as the carousel title
	const request = response.session.getItems().find((item): item is IChatRequestViewModel => isRequestVM(item) && item.id === response.requestId);
	const title = request ? request.messageText.trim() || getExplicitFileOrImageAttachmentSummary(request.variables) || localize('chatImageExtraction.defaultTitle', "Images") : localize('chatImageExtraction.defaultTitle', "Images");

	return {
		id: response.sessionResource.toString() + '_' + response.id,
		title,
		images: allImages,
	};
}

export function extractImagesFromToolInvocationOutputDetails(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, sessionResource: URI): IChatExtractedImage[] {
	const images: IChatExtractedImage[] = [];

	const resultDetails = IChatToolInvocation.resultDetails(toolInvocation);

	const caption = toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage;
	const isGenerated = toolInvocation.toolSpecificData?.kind === 'generatedImage';
	const pushImage = (mimeType: string, data: VSBuffer | undefined, outputIndex: number, resource?: URI, name?: string) => {
		const ext = getExtensionForMimeType(mimeType);
		const permalinkBasename = ext ? `file${ext}` : 'file.bin';
		const uri = resource ?? ChatResponseResource.createUri(sessionResource, toolInvocation.toolCallId, outputIndex, permalinkBasename);
		images.push({
			id: `${toolInvocation.toolCallId}_${outputIndex}`,
			uri,
			name: name ?? localize('chatImageExtraction.imageName', "Image {0}", images.length + 1),
			mimeType,
			data,
			source: localize('chatImageExtraction.toolSource', "Tool: {0}", toolInvocation.toolId),
			caption,
		});
	};

	if (isToolResultInputOutputDetails(resultDetails)) {
		for (const image of getToolResultImageResources(resultDetails, sessionResource, toolInvocation.toolCallId, isGenerated ? 'generated-image' : 'file')) {
			pushImage(image.mimeType, image.base64Value === undefined ? undefined : decodeBase64(image.base64Value), image.index, image.uri, isGenerated ? image.name : undefined);
		}
	}
	else if (isToolResultOutputDetails(resultDetails)) {
		const output = resultDetails.output;
		if (output.mimeType?.startsWith('image/')) {
			const data = getImageDataFromOutputDetails(resultDetails, toolInvocation);
			if (data) {
				pushImage(output.mimeType, data, 0);
			}
		}
	}

	return images;
}

export async function extractImagesFromToolInvocationMessages(
	toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
	readFile: (uri: URI) => Promise<VSBuffer>
): Promise<IChatExtractedImage[]> {
	// Use pastTenseMessage if available, otherwise fall back to invocationMessage.
	// When pastTenseMessage exists it visually replaces invocationMessage in the UI,
	// so we only look at its URIs — we don't fall back to invocationMessage URIs.
	const message = toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage;
	if (!message || typeof message === 'string' || !message.uris || Object.keys(message.uris).length === 0) {
		return [];
	}

	const images: IChatExtractedImage[] = [];
	for (const uriComponents of Object.values(message.uris)) {
		const uri = URI.revive(uriComponents);
		const mimeType = getMediaMime(uri.path);
		if (mimeType?.startsWith('image/')) {
			let data: VSBuffer;
			try {
				data = await readFile(uri);
			} catch {
				continue;
			}
			const name = uri.path.split('/').pop() ?? 'image';
			images.push({
				id: uri.toString(),
				uri,
				name,
				mimeType,
				data,
				source: localize('chatImageExtraction.toolSource', "Tool: {0}", toolInvocation.toolId),
				caption: message,
			});
		}
	}
	return images;
}

function getImageDataFromOutputDetails(resultDetails: IToolResultOutputDetails, toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): VSBuffer | undefined {
	if (toolInvocation.kind === 'toolInvocationSerialized') {
		const serializedDetails = resultDetails as unknown as IToolResultOutputDetailsSerialized;
		if (serializedDetails.output.base64Data) {
			return decodeBase64(serializedDetails.output.base64Data);
		}
		return undefined;
	} else {
		return resultDetails.output.value;
	}
}

async function extractImageFromInlineReference(
	part: IChatContentInlineReference,
	readFile: (uri: URI) => Promise<VSBuffer>,
): Promise<IChatExtractedImage | undefined> {
	const ref = part.inlineReference;
	const refUri = URI.isUri(ref) ? ref : isLocation(ref) ? ref.uri : ref.location.uri;
	const mime = getMediaMime(refUri.path);
	if (!mime?.startsWith('image/')) {
		return undefined;
	}

	let data: VSBuffer;
	try {
		data = await readFile(refUri);
	} catch {
		return undefined;
	}
	const name = part.name ?? refUri.path.split('/').pop() ?? 'image';
	return {
		id: refUri.toString(),
		uri: refUri,
		name,
		mimeType: mime,
		data,
		source: localize('chatImageExtraction.inlineReference', "File"),
		caption: undefined,
	};
}

/**
 * Returns the file that a Markdown image in a chat response shows, or `undefined` when chat does
 * not show a file there. `source` is the image destination after `resolve` resolved it for the
 * response's session; like the Markdown renderer, it is then resolved against the Markdown's base
 * URI and mapped through its URIs.
 */
export function getChatMarkdownImageFile(markdown: IMarkdownString, source: string, resolve: (href: string) => string): URI | undefined {
	const baseUri = markdown.baseUri && URI.from(markdown.baseUri);
	if (!/^\w[\w\d+.-]*:/.test(source) && (!baseUri || baseUri.scheme === Schemas.file && !isLocalFile(baseUri))) {
		// The renderer loads relative destinations only against a base URI that is not a network file
		return undefined;
	}
	const href = baseUri ? resolveWithBaseUri(baseUri, source) : source;
	const uri = URI.parse(href);
	const resource = URI.revive(markdown.uris?.[href]) ?? uri;
	if (resource.scheme === AGENT_HOST_SCHEME) {
		// Only a local raster image that the session resolves to itself, so a response cannot read other files
		const file = fromAgentHostUri(resource);
		const mime = getMediaMime(file.path);
		return isLocalFile(file) && mime && getAttachableImageExtension(mime === 'image/jpg' ? 'image/jpeg' : mime)
			&& isEqual(resource, URI.parse(resolve(file.toString()))) ? resource : undefined;
	}
	// A local file, which remote extension hosts map to the same file on their remote authority
	const isRemoteFileMapping = resource.scheme === Schemas.vscodeRemote
		&& resource.path === uri.path && resource.query === uri.query && resource.fragment === uri.fragment;
	return isLocalFile(uri) && (isLocalFile(resource) || isRemoteFileMapping) && getMediaMime(resource.path)?.startsWith('image/') ? resource : undefined;
}

/**
 * Identifies a file image that a response's Markdown shows in the image carousel. The image shows the
 * file's current contents, unlike an attachment's earlier snapshot of the same file.
 */
export function getChatMarkdownImageId(responseId: string, resource: URI): string {
	return `${responseId}:${resource.toString()}`;
}

function isLocalFile(resource: URI): boolean {
	return resource.scheme === Schemas.file && !resource.authority && !isUNC(resource.fsPath);
}

async function extractImagesFromMarkdown(responseId: string, part: IChatMarkdownContent, readFile: (uri: URI) => Promise<VSBuffer>, resolve: (href: string) => string): Promise<IChatExtractedImage[]> {
	const tokens: (marked.Tokens.Image | marked.Tokens.Link)[] = [];
	marked.walkTokens(marked.lexer(part.content.value), token => {
		if (token.type === 'image' || token.type === 'link') {
			tokens.push(token as marked.Tokens.Image | marked.Tokens.Link);
		}
	});

	const images: IChatExtractedImage[] = [];
	for (const token of tokens) {
		if (token.type === 'link') {
			const inlineReference = token.href.startsWith(contentRefUrl) ? part.inlineReferences?.[URI.parse(token.href).path.slice(1)] : undefined;
			const image = inlineReference && await extractImageFromInlineReference(inlineReference, readFile);
			if (image) {
				images.push(image);
			}
			continue;
		}
		const uri = getChatMarkdownImageFile(part.content, resolve(parseHrefAndDimensions(token.href).href), resolve);
		if (uri) {
			const id = getChatMarkdownImageId(responseId, uri);
			images.push({
				id,
				uri,
				name: basename(uri),
				mimeType: getMediaMime(uri.path) ?? 'image/png',
				source: localize('chatImageExtraction.response', "Response"),
				caption: token.text || undefined,
				carouselId: id,
			});
		}
	}
	return images;
}

export function coerceImageBuffer(value: unknown): Uint8Array | undefined {
	if (value instanceof Uint8Array) {
		return value;
	}
	if (value instanceof ArrayBuffer) {
		return new Uint8Array(value);
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}

	const record = value as Record<string, unknown>;
	const keys = Object.keys(record).sort((a, b) => Number(a) - Number(b));
	if (keys.length === 0) {
		return undefined;
	}

	const result = new Uint8Array(keys.length);
	for (let index = 0; index < keys.length; index++) {
		const byte = record[keys[index]];
		if (keys[index] !== String(index) || typeof byte !== 'number' || !Number.isInteger(byte) || byte < 0 || byte > 255) {
			return undefined;
		}
		result[index] = byte;
	}
	return result;
}

/**
 * Extract images from a chat request's variable attachments (user-attached images).
 */
export function extractImagesFromChatRequest(
	request: IChatRequestViewModel,
): IChatExtractedImage[] {
	return extractImagesFromChatVariables(request.variables);
}

export function extractImagesFromChatVariables(
	variables: readonly IChatRequestVariableEntry[],
): IChatExtractedImage[] {
	const images: IChatExtractedImage[] = [];
	for (const variable of variables) {
		if (!isImageVariableEntry(variable)) {
			continue;
		}
		const buffer = coerceImageBuffer(variable.value);
		const reference = variable.references?.[0]?.reference;
		const resource = URI.isUri(reference) ? reference : URI.isUri(variable.value) ? variable.value : undefined;
		if (!buffer && !resource) {
			continue;
		}
		const mimeType = variable.mimeType ?? getMediaMime(variable.name) ?? 'image/png';
		const imageUri = resource ?? URI.from({ scheme: 'data', path: `${variable.id}/${encodeURIComponent(variable.name)}` });
		images.push({
			id: imageUri.toString(),
			uri: imageUri,
			name: variable.name,
			mimeType,
			data: buffer ? VSBuffer.wrap(buffer) : undefined,
			source: localize('chatImageExtraction.userAttachment', "Attachment"),
			caption: undefined,
		});
	}
	return images;
}
