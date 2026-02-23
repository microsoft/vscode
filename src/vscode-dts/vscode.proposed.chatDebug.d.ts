/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 1

declare module 'vscode' {
	/**
	 * The severity level of a chat debug log event.
	 */
	export enum ChatDebugLogLevel {
		Trace = 0,
		Info = 1,
		Warning = 2,
		Error = 3
	}

	/**
	 * The outcome of a tool call.
	 */
	export enum ChatDebugToolCallResult {
		Success = 0,
		Error = 1
	}

	/**
	 * A tool call event in the chat debug log, representing the invocation
	 * of a tool (e.g., file search, terminal command, code edit).
	 */
	export class ChatDebugToolCallEvent {
		/**
		 * A unique identifier for this event.
		 */
		id?: string;

		/**
		 * The chat session this event belongs to. When provided, the event
		 * is attributed to this session even if it arrives through a progress
		 * pipeline opened for a different session.
		 */
		sessionResource?: Uri;

		/**
		 * The timestamp when the event was created.
		 */
		created: Date;

		/**
		 * The id of a parent event, used to build a hierarchical tree
		 * (e.g., tool calls nested under a model turn).
		 */
		parentEventId?: string;

		/**
		 * The name of the tool that was called.
		 */
		toolName: string;

		/**
		 * An optional identifier for the tool call, as assigned by the model.
		 */
		toolCallId?: string;

		/**
		 * The serialized input (arguments) passed to the tool.
		 */
		input?: string;

		/**
		 * The serialized output (result) returned by the tool.
		 */
		output?: string;

		/**
		 * The outcome of the tool call.
		 */
		result?: ChatDebugToolCallResult;

		/**
		 * How long the tool call took to complete, in milliseconds.
		 */
		durationInMillis?: number;

		/**
		 * Create a new ChatDebugToolCallEvent.
		 * @param toolName The name of the tool that was called.
		 * @param created The timestamp when the event was created.
		 */
		constructor(toolName: string, created: Date);
	}

	/**
	 * A model turn event in the chat debug log, representing a single
	 * request/response exchange with a language model.
	 */
	export class ChatDebugModelTurnEvent {
		/**
		 * A unique identifier for this event.
		 */
		id?: string;

		/**
		 * The chat session this event belongs to. When provided, the event
		 * is attributed to this session even if it arrives through a progress
		 * pipeline opened for a different session.
		 */
		sessionResource?: Uri;

		/**
		 * The timestamp when the event was created.
		 */
		created: Date;

		/**
		 * The id of a parent event, used to build a hierarchical tree.
		 */
		parentEventId?: string;

		/**
		 * The identifier of the model used (e.g., "gpt-4o").
		 */
		model?: string;

		/**
		 * The number of tokens in the input/prompt.
		 */
		inputTokens?: number;

		/**
		 * The number of tokens in the model's output/completion.
		 */
		outputTokens?: number;

		/**
		 * The total number of tokens consumed (input + output).
		 */
		totalTokens?: number;

		/**
		 * The estimated cost of this model turn, in US dollars.
		 */
		cost?: number;

		/**
		 * How long the model turn took to complete, in milliseconds.
		 */
		durationInMillis?: number;

		/**
		 * Create a new ChatDebugModelTurnEvent.
		 * @param created The timestamp when the event was created.
		 */
		constructor(created: Date);
	}

	/**
	 * A generic log event in the chat debug log, for unstructured or
	 * miscellaneous messages that don't fit a more specific event type.
	 */
	export class ChatDebugGenericEvent {
		/**
		 * A unique identifier for this event.
		 */
		id?: string;

		/**
		 * The chat session this event belongs to. When provided, the event
		 * is attributed to this session even if it arrives through a progress
		 * pipeline opened for a different session.
		 */
		sessionResource?: Uri;

		/**
		 * The timestamp when the event was created.
		 */
		created: Date;

		/**
		 * The id of a parent event, used to build a hierarchical tree.
		 */
		parentEventId?: string;

		/**
		 * A short name describing the event (e.g., "Resolved skills (start)").
		 */
		name: string;

		/**
		 * Optional details of the event.
		 */
		details?: string;

		/**
		 * The severity level of the event.
		 */
		level: ChatDebugLogLevel;

		/**
		 * The category classifying the kind of event.
		 */
		category?: string;

		/**
		 * Create a new ChatDebugGenericEvent.
		 * @param name A short name describing the event.
		 * @param level The severity level.
		 * @param created The timestamp when the event was created.
		 */
		constructor(name: string, level: ChatDebugLogLevel, created: Date);
	}

	/**
	 * The status of a sub-agent invocation.
	 */
	export enum ChatDebugSubagentStatus {
		Running = 0,
		Completed = 1,
		Failed = 2
	}

	/**
	 * A subagent invocation event in the chat debug log, representing
	 * a spawned sub-agent within a chat session.
	 */
	export class ChatDebugSubagentInvocationEvent {
		/**
		 * A unique identifier for this event.
		 */
		id?: string;

		/**
		 * The chat session this event belongs to. When provided, the event
		 * is attributed to this session even if it arrives through a progress
		 * pipeline opened for a different session.
		 */
		sessionResource?: Uri;

		/**
		 * The timestamp when the event was created.
		 */
		created: Date;

		/**
		 * The id of a parent event, used to build a hierarchical tree.
		 */
		parentEventId?: string;

		/**
		 * The name of the sub-agent that was invoked.
		 */
		agentName: string;

		/**
		 * A short description of the task assigned to the sub-agent.
		 */
		description?: string;

		/**
		 * The current status of the sub-agent invocation.
		 */
		status?: ChatDebugSubagentStatus;

		/**
		 * How long the sub-agent took to complete, in milliseconds.
		 */
		durationInMillis?: number;

		/**
		 * The number of tool calls made by this sub-agent.
		 */
		toolCallCount?: number;

		/**
		 * The number of model turns within this sub-agent.
		 */
		modelTurnCount?: number;

		/**
		 * Create a new ChatDebugSubagentInvocationEvent.
		 * @param agentName The name of the sub-agent.
		 * @param created The timestamp when the event was created.
		 */
		constructor(agentName: string, created: Date);
	}

	/**
	 * A user message event in the chat debug log, representing the prompt
	 * sent by the user (including system context, instructions, etc.).
	 */
	export class ChatDebugUserMessageEvent {
		/**
		 * A unique identifier for this event.
		 */
		id?: string;

		/**
		 * The chat session this event belongs to. When provided, the event
		 * is attributed to this session even if it arrives through a progress
		 * pipeline opened for a different session.
		 */
		sessionResource?: Uri;

		/**
		 * The timestamp when the event was created.
		 */
		created: Date;

		/**
		 * The id of a parent event, used to build a hierarchical tree.
		 */
		parentEventId?: string;

		/**
		 * A short summary of the user's request for display in the event list.
		 */
		message: string;

		/**
		 * The structured sections of the full prompt (e.g., userRequest, context,
		 * reminderInstructions). Rendered as collapsible sections in the detail view.
		 */
		sections: ChatDebugMessageSection[];

		/**
		 * Create a new ChatDebugUserMessageEvent.
		 * @param message A short summary of the user's request.
		 * @param created The timestamp when the event was created.
		 */
		constructor(message: string, created: Date);
	}

	/**
	 * An agent response event in the chat debug log, representing the
	 * response produced by the agent (including reasoning, if available).
	 */
	export class ChatDebugAgentResponseEvent {
		/**
		 * A unique identifier for this event.
		 */
		id?: string;

		/**
		 * The chat session this event belongs to. When provided, the event
		 * is attributed to this session even if it arrives through a progress
		 * pipeline opened for a different session.
		 */
		sessionResource?: Uri;

		/**
		 * The timestamp when the event was created.
		 */
		created: Date;

		/**
		 * The id of a parent event, used to build a hierarchical tree.
		 */
		parentEventId?: string;

		/**
		 * A short summary of the agent's response for display in the event list.
		 */
		message: string;

		/**
		 * The structured sections of the response (e.g., response text, reasoning).
		 * Rendered as collapsible sections in the detail view.
		 */
		sections: ChatDebugMessageSection[];

		/**
		 * Create a new ChatDebugAgentResponseEvent.
		 * @param message A short summary of the agent's response.
		 * @param created The timestamp when the event was created.
		 */
		constructor(message: string, created: Date);
	}

	/**
	 * A named section within a user message or agent response,
	 * used to display collapsible parts of the prompt or response.
	 */
	export class ChatDebugMessageSection {
		/**
		 * The display name of the section (e.g., "User Request", "Context", "Reasoning").
		 */
		name: string;

		/**
		 * The text content of the section.
		 */
		content: string;

		/**
		 * Create a new ChatDebugMessageSection.
		 * @param name The display name of the section.
		 * @param content The text content.
		 */
		constructor(name: string, content: string);
	}

	/**
	 * Plain text content for a resolved chat debug event.
	 */
	export class ChatDebugEventTextContent {
		/**
		 * The text value.
		 */
		value: string;

		/**
		 * Create a new ChatDebugEventTextContent.
		 * @param value The text value.
		 */
		constructor(value: string);
	}

	/**
	 * The type of a debug message content.
	 */
	export enum ChatDebugMessageContentType {
		User = 0,
		Agent = 1
	}

	/**
	 * Structured message content for a resolved chat debug event,
	 * containing collapsible sections (e.g., prompt parts or response parts).
	 */
	export class ChatDebugEventMessageContent {
		/**
		 * The type of message.
		 */
		type: ChatDebugMessageContentType;

		/**
		 * A short summary of the message.
		 */
		message: string;

		/**
		 * The structured sections of the message.
		 */
		sections: ChatDebugMessageSection[];

		/**
		 * Create a new ChatDebugEventMessageContent.
		 * @param type The type of message.
		 * @param message A short summary.
		 * @param sections The structured sections.
		 */
		constructor(type: ChatDebugMessageContentType, message: string, sections: ChatDebugMessageSection[]);
	}

	/**
	 * Union of all resolved event content types.
	 * Extensions may also return {@link ChatDebugUserMessageEvent} or
	 * {@link ChatDebugAgentResponseEvent} from resolve, which will be
	 * automatically converted to structured message content.
	 */
	export type ChatDebugResolvedEventContent = ChatDebugEventTextContent | ChatDebugEventMessageContent | ChatDebugUserMessageEvent | ChatDebugAgentResponseEvent;

	/**
	 * Union of all chat debug event types. Each type is a class,
	 * following the same pattern as {@link ChatResponsePart}.
	 */
	export type ChatDebugEvent = ChatDebugToolCallEvent | ChatDebugModelTurnEvent | ChatDebugGenericEvent | ChatDebugSubagentInvocationEvent | ChatDebugUserMessageEvent | ChatDebugAgentResponseEvent;

	/**
	 * A provider that supplies debug events for a chat session.
	 */
	export interface ChatDebugLogProvider {
		/**
		 * Called when the debug view is opened for a chat session.
		 * The provider should return initial events and can use
		 * the progress callback to stream additional events over time.
		 *
		 * @param sessionResource The resource URI of the chat session being debugged.
		 * @param progress A progress callback to stream events.
		 * @param token A cancellation token.
		 * @returns Initial events, if any.
		 */
		provideChatDebugLog(
			sessionResource: Uri,
			progress: Progress<ChatDebugEvent>,
			token: CancellationToken
		): ProviderResult<ChatDebugEvent[]>;

		/**
		 * Optionally resolve the full contents of a debug event by its id.
		 * Called when the user expands an event in the debug view, allowing
		 * the provider to defer expensive detail loading until needed.
		 *
		 * @param eventId The id of the event to resolve.
		 * @param token A cancellation token.
		 * @returns The resolved event content to be displayed in the debug detail view.
		 */
		resolveChatDebugLogEvent?(
			eventId: string,
			token: CancellationToken
		): ProviderResult<ChatDebugResolvedEventContent>;
	}

	export namespace chat {
		/**
		 * Register a provider that supplies debug events for chat sessions.
		 * Only one provider can be registered at a time.
		 *
		 * @param provider The chat debug log provider.
		 * @returns A disposable that unregisters the provider.
		 */
		export function registerChatDebugLogProvider(provider: ChatDebugLogProvider): Disposable;
	}
}
