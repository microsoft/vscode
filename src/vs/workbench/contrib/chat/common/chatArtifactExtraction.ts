/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { match as globMatch } from '../../../../base/common/glob.js';
import { getExtensionForMimeType } from '../../../../base/common/mime.js';
import { basename as pathBasename } from '../../../../base/common/path.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IChatToolInvocation, IToolResultOutputDetailsSerialized } from './chatService/chatService.js';
import { ChatResponseResource, IResponse } from './model/chatModel.js';
import { IArtifactGroupConfig, IChatArtifact } from './tools/chatArtifactsService.js';
import { isToolResultInputOutputDetails } from './tools/languageModelToolsService.js';

/**
 * Matches a MIME type against a pattern supporting wildcards.
 * E.g. `image/*` matches `image/png`, `image/jpeg`, etc.
 */
function matchMimeType(pattern: string, mimeType: string): boolean {
	if (pattern === mimeType) {
		return true;
	}
	const [patternType, patternSubtype] = pattern.split('/');
	const [type] = mimeType.split('/');
	return patternSubtype === '*' && patternType === type;
}

/**
 * Finds the first matching rule for a file path from byFilePath rules.
 */
function findFilePathRule(
	filePath: string,
	byFilePath: Record<string, IArtifactGroupConfig>
): IArtifactGroupConfig | undefined {
	const fileBasename = pathBasename(filePath);
	for (const [pattern, config] of Object.entries(byFilePath)) {
		if (globMatch(pattern, filePath) || globMatch(pattern, fileBasename)) {
			return config;
		}
	}
	return undefined;
}

/**
 * Finds the first matching rule for a MIME type from byMimeType rules.
 */
function findMimeTypeRule(
	mimeType: string,
	byMimeType: Record<string, IArtifactGroupConfig>
): IArtifactGroupConfig | undefined {
	for (const [pattern, config] of Object.entries(byMimeType)) {
		if (matchMimeType(pattern, mimeType)) {
			return config;
		}
	}
	return undefined;
}

function isToolResultOutputDetailsSerialized(obj: unknown): obj is IToolResultOutputDetailsSerialized {
	return typeof obj === 'object' && obj !== null
		&& 'output' in obj && typeof (obj as IToolResultOutputDetailsSerialized).output === 'object'
		&& (obj as IToolResultOutputDetailsSerialized).output?.type === 'data'
		&& typeof (obj as IToolResultOutputDetailsSerialized).output?.mimeType === 'string';
}

/**
 * Extracts artifacts from a single response's content parts, applying the given rules.
 * Pure function, no side effects.
 */
export function extractArtifactsFromResponse(
	response: IResponse,
	sessionResource: URI,
	byMimeType: Record<string, IArtifactGroupConfig>,
	byFilePath: Record<string, IArtifactGroupConfig>,
): IChatArtifact[] {
	const artifacts: IChatArtifact[] = [];
	const seenUris = new Set<string>();

	for (const part of response.value) {
		// File writes: codeblockUri
		if (part.kind === 'codeblockUri') {
			const uri = part.uri;
			const uriStr = uri.toString();
			if (seenUris.has(uriStr)) {
				continue;
			}
			const rule = findFilePathRule(uri.path, byFilePath);
			if (rule) {
				seenUris.add(uriStr);
				artifacts.push({
					label: basename(uri),
					uri: uriStr,
					type: 'plan',
					groupName: rule.groupName,
					onlyShowGroup: rule.onlyShowGroup,
				});
			}
		}

		// File writes: textEditGroup
		if (part.kind === 'textEditGroup') {
			const uri = part.uri;
			const uriStr = uri.toString();
			if (seenUris.has(uriStr)) {
				continue;
			}
			const rule = findFilePathRule(uri.path, byFilePath);
			if (rule) {
				seenUris.add(uriStr);
				artifacts.push({
					label: basename(uri),
					uri: uriStr,
					type: 'plan',
					groupName: rule.groupName,
					onlyShowGroup: rule.onlyShowGroup,
				});
			}
		}

		// File writes: workspaceEdit
		if (part.kind === 'workspaceEdit') {
			for (const edit of part.edits) {
				const uri = edit.newResource ?? edit.oldResource;
				if (!uri) {
					continue;
				}
				const uriStr = uri.toString();
				if (seenUris.has(uriStr)) {
					continue;
				}
				const rule = findFilePathRule(uri.path, byFilePath);
				if (rule) {
					seenUris.add(uriStr);
					artifacts.push({
						label: basename(uri),
						uri: uriStr,
						type: 'plan',
						groupName: rule.groupName,
						onlyShowGroup: rule.onlyShowGroup,
					});
				}
			}
		}

		// Image results from tool invocations
		if (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') {
			const details = IChatToolInvocation.resultDetails(part);
			if (!details) {
				continue;
			}

			// IToolResultInputOutputDetails — has output array with embedded data parts
			if (isToolResultInputOutputDetails(details)) {
				for (let i = 0; i < details.output.length; i++) {
					const outputPart = details.output[i];
					if (outputPart.type === 'embed' && !outputPart.isText && outputPart.mimeType) {
						const rule = findMimeTypeRule(outputPart.mimeType, byMimeType);
						if (rule) {
							const key = `${part.toolCallId}:${i}`;
							if (!seenUris.has(key)) {
								seenUris.add(key);
								const ext = getExtensionForMimeType(outputPart.mimeType);
								const permalinkBasename = ext ? `file${ext}` : 'file.bin';
								const artifactUri = ChatResponseResource.createUri(sessionResource, part.toolCallId, i, permalinkBasename);
								artifacts.push({
									label: outputPart.uri?.path.split('/').pop() ?? `${rule.groupName} ${i + 1}`,
									uri: artifactUri.toString(),
									toolCallId: part.toolCallId,
									dataPartIndex: i,
									type: 'screenshot',
									groupName: rule.groupName,
									onlyShowGroup: rule.onlyShowGroup,
								});
							}
						}
					}
				}
			}

			// IToolResultOutputDetailsSerialized — single output with mimeType + base64Data
			if (isToolResultOutputDetailsSerialized(details)) {
				const rule = findMimeTypeRule(details.output.mimeType, byMimeType);
				if (rule) {
					const key = `${part.toolCallId}:0`;
					if (!seenUris.has(key)) {
						seenUris.add(key);
						const ext = getExtensionForMimeType(details.output.mimeType);
						const permalinkBasename = ext ? `file${ext}` : 'file.bin';
						const artifactUri = ChatResponseResource.createUri(sessionResource, part.toolCallId, 0, permalinkBasename);
						artifacts.push({
							label: `${rule.groupName}`,
							uri: artifactUri.toString(),
							toolCallId: part.toolCallId,
							dataPartIndex: 0,
							type: 'screenshot',
							groupName: rule.groupName,
							onlyShowGroup: rule.onlyShowGroup,
						});
					}
				}
			}
		}
	}

	return artifacts;
}
