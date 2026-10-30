/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getMediaMime } from '../../../../base/common/mime.js';
import { Schemas } from '../../../../base/common/network.js';
import { IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { getChatImageResourceComparisonKey, getToolResultImageResources } from '../../../../workbench/contrib/chat/common/chatImageExtraction.js';
import { IChatToolInvocation, isLegacyChatTerminalToolInvocationData, ToolConfirmKind } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { isToolResultInputOutputDetails } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { getChatSessionArtifacts, IChat, ISession, ISessionArtifact } from '../../../services/sessions/common/session.js';

export interface IInboxEvidenceImage {
	readonly uri: URI;
	readonly name: string;
	readonly mimeType: string;
	readonly source: 'artifact' | 'tool';
}

export interface IInboxEvidenceCommand {
	readonly id: string;
	readonly command: string;
	readonly state: 'running' | 'background' | 'exited' | 'unavailable' | 'denied' | 'error';
	readonly exitCode?: number;
	readonly output?: string;
	readonly truncated: boolean;
	readonly uri?: URI;
}

export interface IInboxEvidence {
	readonly images: readonly IInboxEvidenceImage[];
	readonly artifacts: readonly ISessionArtifact[];
	readonly requestId: string | undefined;
	readonly conversationAvailable: boolean;
	readonly error: string | undefined;
	readonly canceled: boolean;
}

export function isInboxPreviewImage(uri: URI, mimeType: string): boolean {
	return uri.scheme !== Schemas.http && uri.scheme !== Schemas.https
		&& ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType);
}

/** Recorded chat resources and the selected turn's tool results, never inferred from prose. */
export function collectInboxEvidence(session: ISession, chat: IChat, model: IChatModel | undefined, requestId?: string, reader?: IReader): IInboxEvidence {
	const artifacts = getChatSessionArtifacts(session, chat, reader);
	const images = new Map<string, IInboxEvidenceImage>();
	for (const artifact of artifacts) {
		const uri = artifact.uri;
		const mimeType = uri && getMediaMime(uri.path);
		if (artifact.isArtifact && uri && mimeType && isInboxPreviewImage(uri, mimeType)) {
			images.set(getChatImageResourceComparisonKey(uri), { uri, mimeType, name: artifact.label, source: 'artifact' });
		}
	}
	const requests = model?.getRequests();
	const request = requestId ? requests?.find(request => request.id === requestId) : requests?.at(-1);
	for (const part of request?.response?.response.value ?? []) {
		if (part.kind !== 'toolInvocation' && part.kind !== 'toolInvocationSerialized') {
			continue;
		}
		const complete = IChatToolInvocation.isComplete(part, reader);
		const confirmation = IChatToolInvocation.executionConfirmedOrDenied(part, reader);
		const denied = confirmation?.type === ToolConfirmKind.Denied || confirmation?.type === ToolConfirmKind.Skipped;
		const error = IChatToolInvocation.resultError(part, reader);
		const details = IChatToolInvocation.resultDetails(part, reader);
		if (complete && !denied && !error && isToolResultInputOutputDetails(details) && !details.isError) {
			for (const image of getToolResultImageResources(details, chat.resource, part.toolCallId)) {
				if (isInboxPreviewImage(image.uri, image.mimeType)) {
					const key = getChatImageResourceComparisonKey(image.uri);
					if (!images.has(key)) {
						images.set(key, { uri: image.uri, name: image.name, mimeType: image.mimeType, source: 'tool' });
					}
				}
			}
		}
	}
	return {
		images: [...images.values()],
		artifacts: artifacts.filter(artifact => !artifact.isArtifact || !artifact.uri || !images.has(getChatImageResourceComparisonKey(artifact.uri))),
		requestId: request?.id,
		conversationAvailable: !!model,
		error: request?.response?.result?.errorDetails?.message,
		canceled: request?.response?.isCanceled === true,
	};
}

/** Recorded command sources for interpretation, scoped to the selected turn. */
export function collectInboxCommandEvidence(model: IChatModel | undefined, requestId?: string): IInboxEvidenceCommand[] {
	const requests = model?.getRequests();
	const request = requestId ? requests?.find(request => request.id === requestId) : requests?.at(-1);
	const commands: IInboxEvidenceCommand[] = [];
	for (const part of request?.response?.response.value ?? []) {
		if (part.kind !== 'toolInvocation' && part.kind !== 'toolInvocationSerialized') {
			continue;
		}
		const data = part.toolSpecificData;
		if (data?.kind !== 'terminal') {
			continue;
		}
		const complete = IChatToolInvocation.isComplete(part);
		const confirmation = IChatToolInvocation.executionConfirmedOrDenied(part);
		const denied = confirmation?.type === ToolConfirmKind.Denied || confirmation?.type === ToolConfirmKind.Skipped;
		const error = IChatToolInvocation.resultError(part);
		const terminal = isLegacyChatTerminalToolInvocationData(data) ? undefined : data;
		const exitCode = terminal?.terminalCommandState?.exitCode;
		const background = terminal?.isBackground || terminal?.didContinueInBackground;
		commands.push({
			id: part.toolCallId,
			command: isLegacyChatTerminalToolInvocationData(data) ? data.command : data.commandLine.forDisplay ?? data.commandLine.userEdited ?? data.commandLine.toolEdited ?? data.commandLine.original,
			state: denied ? 'denied' : background ? 'background' : !complete ? 'running' : error ? 'error' : exitCode !== undefined ? 'exited' : 'unavailable',
			exitCode,
			output: terminal?.terminalCommandOutput?.text,
			truncated: terminal?.terminalCommandOutput?.truncated === true,
			uri: terminal?.terminalCommandUri ? URI.revive(terminal.terminalCommandUri) : undefined,
		});
	}
	return commands;
}
