/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../../base/common/assert.js';
import { isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { equals as objectsEqual } from '../../../../../base/common/objects.js';
import { isEqual as _urisEqual } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IChatMarkdownContent, ResponseModelState } from '../chatService/chatService.js';
import { ModifiedFileEntryState } from '../editing/chatEditingService.js';
import { IParsedChatRequest } from '../requestParser/chatParserTypes.js';
import { IChatAgentEditedFileEvent, IChatDataSerializerLog, IChatModel, IChatProgressResponseContent, IChatRequestModel, IChatRequestVariableData, ISerializableChatData, ISerializableChatModelInputState, ISerializableChatRequestData, SerializedChatResponsePart } from './chatModel.js';
import * as Adapt from './objectMutationLog.js';

/**
 * ChatModel has lots of properties and lots of ways those properties can mutate.
 * The naive way to store the ChatModel is serializing it to JSON and calling it
 * a day. However, chats can get very, very long, and thus doing so is slow.
 *
 * In this file, we define a `storageSchema` that adapters from the `IChatModel`
 * into the serializable format. This schema tells us what properties in the chat
 * model correspond to the serialized properties, *and how they change*. For
 * example, `Adapt.constant(...)` defines a property that will never be checked
 * for changes after it's written, and `Adapt.primitive(...)` defines a property
 * that will be checked for changes using strict equality each time we store it.
 *
 * We can then use this to generate a log of mutations that we can append to
 * cheaply without rewriting and reserializing the entire request each time.
 */

const toJson = <T>(obj: T): T extends { toJSON?(): infer R } ? R : T => {
	const cast = obj as { toJSON?: () => T };
	// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
	return (cast && typeof cast.toJSON === 'function' ? cast.toJSON() : obj) as any;
};

const responsePartSchema = Adapt.v<IChatProgressResponseContent, SerializedChatResponsePart>(
	(obj): SerializedChatResponsePart => obj.kind === 'markdownContent' ? obj.content : toJson(obj),
	(a, b) => {
		if (isMarkdownString(a) && isMarkdownString(b)) {
			return a.value === b.value;
		}

		if (hasKey(a, { kind: true }) && hasKey(b, { kind: true })) {
			if (a.kind !== b.kind) {
				return false;
			}

			switch (a.kind) {
				case 'markdownContent':
					return a.content === (b as IChatMarkdownContent).content;

				// Dynamic types that can change after initial push need deep equality
				// Note: these are the *serialized* kind names (e.g. toolInvocationSerialized not toolInvocation)
				case 'toolInvocationSerialized':
				case 'elicitationSerialized':
				case 'progressTaskSerialized':
				case 'textEditGroup':
				case 'multiDiffData':
				case 'mcpServersStarting':
					return objectsEqual(a, b);

				// Static types that won't change after being pushed can use strict equality.
				case 'clearToPreviousToolInvocation':
				case 'codeblockUri':
				case 'command':
				case 'confirmation':
				case 'extensions':
				case 'inlineReference':
				case 'markdownVuln':
				case 'notebookEditGroup':
				case 'progressMessage':
				case 'pullRequest':
				case 'questionCarousel':
				case 'thinking':
				case 'undoStop':
				case 'warning':
				case 'treeData':
				case 'workspaceEdit':
					return a.kind === b.kind;

				default: {
					// Hello developer! You are probably here because you added a new chat response type.
					// This logic controls when we'll update chat parts stored on disk as part of the session.
					// If it's a 'static' type that is not expected to change, add it to the 'return true'
					// block above. However it's a type that is going to change, add it to the 'objectsEqual'
					// block or make something more tailored.
					assertNever(a);
				}
			}
		}

		return false;
	}
);

const urisEqual = (a: UriComponents, b: UriComponents): boolean => {
	return _urisEqual(URI.from(a), URI.from(b));
};

const messageSchema = Adapt.object<IParsedChatRequest, IParsedChatRequest>({
	text: Adapt.v(m => m.text),
	parts: Adapt.v(m => m.parts, (a, b) => a.length === b.length && a.every((part, i) => part.text === b[i].text)),
});

const agentEditedFileEventSchema = Adapt.object<IChatAgentEditedFileEvent, IChatAgentEditedFileEvent>({
	uri: Adapt.v(e => e.uri, urisEqual),
	eventKind: Adapt.v(e => e.eventKind),
});

const chatVariableSchema = Adapt.object<IChatRequestVariableData, IChatRequestVariableData>({
	variables: Adapt.t(v => v.variables, Adapt.array(Adapt.value((a, b) => a.name === b.name))),
});

const requestSchema = Adapt.object<IChatRequestModel, ISerializableChatRequestData>({
	// request parts
	requestId: Adapt.t(m => m.id, Adapt.key()),
	timestamp: Adapt.v(m => m.timestamp),
	confirmation: Adapt.v(m => m.confirmation),
	message: Adapt.t(m => m.message, messageSchema),
	shouldBeRemovedOnSend: Adapt.v(m => m.shouldBeRemovedOnSend, objectsEqual),
	agent: Adapt.v(m => m.response?.agent, (a, b) => a?.id === b?.id),
	modelId: Adapt.v(m => m.modelId),
	editedFileEvents: Adapt.t(m => m.editedFileEvents, Adapt.array(agentEditedFileEventSchema)),
	variableData: Adapt.t(m => m.variableData, chatVariableSchema),
	isHidden: Adapt.v(() => undefined), // deprecated, always undefined for new data
	isCanceled: Adapt.v(() => undefined), // deprecated, modelState is used instead

	// response parts (from ISerializableChatResponseData via response.toJSON())
	response: Adapt.t(m => m.response?.entireResponse.value, Adapt.array(responsePartSchema)),
	responseId: Adapt.v(m => m.response?.id),
	result: Adapt.v(m => m.response?.result, objectsEqual),
	responseMarkdownInfo: Adapt.v(
		m => m.response?.codeBlockInfos?.map(info => ({ suggestionId: info.suggestionId })),
		objectsEqual,
	),
	followups: Adapt.v(m => m.response?.followups, objectsEqual),
	modelState: Adapt.v(m => m.response?.stateT, objectsEqual),
	vote: Adapt.v(m => m.response?.vote),
	voteDownReason: Adapt.v(m => m.response?.voteDownReason),
	slashCommand: Adapt.t(m => m.response?.slashCommand, Adapt.value((a, b) => a?.name === b?.name)),
	usedContext: Adapt.v(m => m.response?.usedContext, objectsEqual),
	contentReferences: Adapt.v(m => m.response?.contentReferences, objectsEqual),
	codeCitations: Adapt.v(m => m.response?.codeCitations, objectsEqual),
	timeSpentWaiting: Adapt.v(m => m.response?.timestamp), // based on response timestamp
}, {
	sealed: (o) => o.modelState?.value === ResponseModelState.Cancelled || o.modelState?.value === ResponseModelState.Failed || o.modelState?.value === ResponseModelState.Complete,
});

const inputStateSchema = Adapt.object<ISerializableChatModelInputState, ISerializableChatModelInputState>({
	attachments: Adapt.v(i => i.attachments, objectsEqual),
	mode: Adapt.v(i => i.mode, (a, b) => a.id === b.id),
	selectedModel: Adapt.v(i => i.selectedModel, (a, b) => a?.identifier === b?.identifier),
	inputText: Adapt.v(i => i.inputText),
	selections: Adapt.v(i => i.selections, objectsEqual),
	contrib: Adapt.v(i => i.contrib, objectsEqual),
});

export const storageSchema = Adapt.object<IChatModel, ISerializableChatData>({
	version: Adapt.v(() => 3),
	creationDate: Adapt.v(m => m.timestamp),
	customTitle: Adapt.v(m => m.hasCustomTitle ? m.title : undefined),
	initialLocation: Adapt.v(m => m.initialLocation),
	inputState: Adapt.t(m => m.inputModel.toJSON(), inputStateSchema),
	responderUsername: Adapt.v(m => m.responderUsername),
	sessionId: Adapt.v(m => m.sessionId),
	requests: Adapt.t(m => m.getRequests(), Adapt.array(requestSchema)),
	hasPendingEdits: Adapt.v(m => m.editingSession?.entries.get().some(e => e.state.get() === ModifiedFileEntryState.Modified)),
	repoData: Adapt.v(m => m.repoData, objectsEqual),
});

export class ChatSessionOperationLog extends Adapt.ObjectMutationLog<IChatModel, ISerializableChatData> implements IChatDataSerializerLog {
	constructor() {
		super(storageSchema, 1024);
	}
}
