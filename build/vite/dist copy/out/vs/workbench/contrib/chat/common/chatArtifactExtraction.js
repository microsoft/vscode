/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { match as globMatch } from '../../../../base/common/glob.js';
import { getExtensionForMimeType } from '../../../../base/common/mime.js';
import { basename as pathBasename } from '../../../../base/common/path.js';
import { basename } from '../../../../base/common/resources.js';
import { IChatToolInvocation } from './chatService/chatService.js';
import { ChatResponseResource } from './model/chatModel.js';
import { isToolResultInputOutputDetails } from './tools/languageModelToolsService.js';
/**
 * Matches a MIME type against a pattern supporting wildcards.
 * E.g. `image/*` matches `image/png`, `image/jpeg`, etc.
 */
function matchMimeType(pattern, mimeType) {
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
function findFilePathRule(filePath, byFilePath) {
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
function findMimeTypeRule(mimeType, byMimeType) {
    for (const [pattern, config] of Object.entries(byMimeType)) {
        if (matchMimeType(pattern, mimeType)) {
            return config;
        }
    }
    return undefined;
}
function isToolResultOutputDetailsSerialized(obj) {
    return typeof obj === 'object' && obj !== null
        && 'output' in obj && typeof obj.output === 'object'
        && obj.output?.type === 'data'
        && typeof obj.output?.mimeType === 'string';
}
/**
 * Extracts artifacts from a single response's content parts, applying the given rules.
 * Pure function, no side effects.
 */
export function extractArtifactsFromResponse(response, sessionResource, byMimeType, byFilePath) {
    const artifacts = [];
    const seenUris = new Set();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEFydGlmYWN0RXh0cmFjdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRBcnRpZmFjdEV4dHJhY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssSUFBSSxTQUFTLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsUUFBUSxJQUFJLFlBQVksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVoRSxPQUFPLEVBQUUsbUJBQW1CLEVBQXNDLE1BQU0sOEJBQThCLENBQUM7QUFDdkcsT0FBTyxFQUFFLG9CQUFvQixFQUFhLE1BQU0sc0JBQXNCLENBQUM7QUFFdkUsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFdEY7OztHQUdHO0FBQ0gsU0FBUyxhQUFhLENBQUMsT0FBZSxFQUFFLFFBQWdCO0lBQ3ZELElBQUksT0FBTyxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQzFCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUNELE1BQU0sQ0FBQyxXQUFXLEVBQUUsY0FBYyxDQUFDLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN6RCxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNuQyxPQUFPLGNBQWMsS0FBSyxHQUFHLElBQUksV0FBVyxLQUFLLElBQUksQ0FBQztBQUN2RCxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLGdCQUFnQixDQUN4QixRQUFn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