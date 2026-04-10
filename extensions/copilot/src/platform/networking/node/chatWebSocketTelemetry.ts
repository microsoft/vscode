/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../telemetry/common/telemetry';

interface IChatWebSocketConnectionTelemetryProperties {
	conversationId: string;
	initiatingRequestId: string;
	gitHubRequestId: string;
}

interface IChatWebSocketRequestTelemetryProperties extends IChatWebSocketConnectionTelemetryProperties {
	modelId: string | undefined;
	requestId: string | undefined;
	turnId: string | undefined;
	previousTurnId: string | undefined;
	hadActiveRequest: boolean;
}

export interface IChatWebSocketConnectedTelemetryProperties extends IChatWebSocketConnectionTelemetryProperties {
	connectDurationMs: number;
}

export interface IChatWebSocketConnectErrorTelemetryProperties extends IChatWebSocketConnectionTelemetryProperties {
	error: string;
	connectDurationMs: number;
	responseStatusCode: number | undefined;
	responseStatusText: string | undefined;
	networkError: string | undefined;
}

export interface IChatWebSocketCloseTelemetryProperties extends IChatWebSocketRequestTelemetryProperties {
	closeCode: number;
	closeReason: string;
	closeEventReason: string;
	closeEventWasClean: string;
	connectionDurationMs: number;
	totalSentMessageCount: number;
	totalReceivedMessageCount: number;
	totalSentCharacters: number;
	totalReceivedCharacters: number;
}

export interface IChatWebSocketErrorTelemetryProperties extends IChatWebSocketRequestTelemetryProperties {
	error: string;
	connectionDurationMs: number;
	totalSentMessageCount: number;
	totalReceivedMessageCount: number;
	totalSentCharacters: number;
	totalReceivedCharacters: number;
}

export interface IChatWebSocketCloseDuringSetupTelemetryProperties extends IChatWebSocketConnectionTelemetryProperties {
	closeCode: number;
	closeReason: string;
	closeEventReason: string;
	closeEventWasClean: string;
	connectDurationMs: number;
}

export interface IChatWebSocketRequestSentTelemetryProperties extends IChatWebSocketRequestTelemetryProperties {
	statefulMarkerMatched: boolean;
	previousResponseIdUnset: boolean;
	hasCompactionData: boolean;
	tokenCountMax: number;
	connectionDurationMs: number;
	totalSentMessageCount: number;
	totalReceivedMessageCount: number;
	sentMessageCharacters: number;
	totalSentCharacters: number;
	totalReceivedCharacters: number;
}

export interface IChatWebSocketMessageParseErrorTelemetryProperties extends IChatWebSocketRequestTelemetryProperties {
	error: string;
	connectionDurationMs: number;
	totalSentMessageCount: number;
	totalReceivedMessageCount: number;
	receivedMessageCharacters: number;
	totalSentCharacters: number;
	totalReceivedCharacters: number;
}

export type ChatWebSocketRequestOutcome = 'completed' | 'response_failed' | 'response_incomplete' | 'response_cancelled' | 'upstream_error' | 'canceled' | 'superseded' | 'connection_closed' | 'connection_disposed' | 'error_response';

export interface IChatWebSocketRequestOutcomeTelemetryProperties extends IChatWebSocketRequestTelemetryProperties {
	requestOutcome: ChatWebSocketRequestOutcome;
	statefulMarkerMatched: boolean;
	previousResponseIdUnset: boolean;
	hasCompactionData: boolean;
	promptTokenCount: number;
	tokenCountMax: number;
	connectionDurationMs: number;
	requestDurationMs: number;
	totalSentMessageCount: number;
	totalReceivedMessageCount: number;
	totalSentCharacters: number;
	totalReceivedCharacters: number;
	requestSentMessageCount: number;
	requestReceivedMessageCount: number;
	requestSentCharacters: number;
	requestReceivedCharacters: number;
	closeCode?: number;
	closeReason?: string;
	serverErrorMessage?: string;
	serverErrorCode?: string;
}

export class ChatWebSocketTelemetrySender {

	public static sendConnectedTelemetry(
		telemetryService: ITelemetryService,
		properties: IChatWebSocketConnectedTelemetryProperties,
	) {
		/* __GDPR__
			"websocket.connected" : {
				"owner": "chrmarti",
				"comment": "Report a successful WebSocket connection.",
				"conversationId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the conversation" },
				"initiatingRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the request that initiated the connection" },
				"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id if available" },
				"connectDurationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to establish the WebSocket connection in milliseconds", "isMeasurement": true }
			}
		*/
		telemetryService.sendTelemetryEvent('websocket.connected', { github: true, microsoft: true }, {
			conversationId: properties.conversationId,
			initiatingRequestId: properties.initiatingRequestId,
			gitHubRequestId: properties.gitHubRequestId,
		}, {
			connectDurationMs: properties.connectDurationMs,
		});
	}

	public static sendConnectErrorTelemetry(
		telemetryService: ITelemetryService,
		properties: IChatWebSocketConnectErrorTelemetryProperties,
	) {
		/* __GDPR__
			"websocket.connectError" : {
				"owner": "chrmarti",
				"comment": "Report a failed WebSocket connection attempt.",
				"conversationId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the conversation" },
				"initiatingRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the request that initiated the connection" },
				"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id if available" },
				"error": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Error message for the failed connection" },
				"connectDurationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time until the connection error in milliseconds", "isMeasurement": true },
				"responseStatusCode": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "HTTP response status code from the failed connection attempt", "isMeasurement": true },
				"responseStatusText": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "HTTP response status text from the failed connection attempt" },
				"networkError": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The underlying network error code and message from the dispatch layer" }
			}
		*/
		telemetryService.sendTelemetryErrorEvent('websocket.connectError', { github: true, microsoft: true }, {
			conversationId: properties.conversationId,
			initiatingRequestId: properties.initiatingRequestId,
			gitHubRequestId: properties.gitHubRequestId,
			error: properties.error,
			responseStatusText: properties.responseStatusText,
			networkError: properties.networkError,
		}, {
			connectDurationMs: properties.connectDurationMs,
			responseStatusCode: properties.responseStatusCode,
		});
	}

	public static sendCloseTelemetry(
		telemetryService: ITelemetryService,
		properties: IChatWebSocketCloseTelemetryProperties,
	) {
		/* __GDPR__
			"websocket.close" : {
				"owner": "chrmarti",
				"comment": "Report a WebSocket connection close event.",
				"conversationId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the conversation" },
				"initiatingRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the request that initiated the connection" },
				"turnId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the turn" },
				"previousTurnId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Turn id of the previous request on this connection" },
				"hadActiveRequest": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the previous request was still active when the new one began", "isMeasurement": true },
				"requestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the current turn request" },
				"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id if available" },
				"modelId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model identifier from the request body" },
				"closeReason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Human-readable description of the close code" },
				"closeEventReason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Close event reason string from server" },
				"closeEventWasClean": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the connection closed cleanly" },
				"closeCode": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "WebSocket close code", "isMeasurement": true },
				"totalSentMessageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of messages sent over this connection", "isMeasurement": true },
				"totalReceivedMessageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of messages received over this connection", "isMeasurement": true },
				"totalSentCharacters": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Total characters sent over this connection", "isMeasurement": true },
				"totalReceivedCharacters": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Total characters received over this connection", "isMeasurement": true },
				"connectionDurationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "How long the connection was open in milliseconds", "isMeasurement": true }
			}
		*/
		telemetryService.sendTelemetryEvent('websocket.close', { github: true, microsoft: true }, {
			conversationId: properties.conversationId,
			initiatingRequestId: properties.initiatingRequestId,
			turnId: properties.turnId,
			previousTurnId: properties.previousTurnId,
			requestId: properties.requestId,
			gitHubRequestId: properties.gitHubRequestId,
			modelId: properties.modelId,
			closeReason: properties.closeReason,
			closeEventReason: properties.closeEventReason,
			closeEventWasClean: properties.closeEventWasClean,
		}, {
			hadActiveRequest: properties.hadActiveRequest ? 1 : 0,
			closeCode: properties.closeCode,
			totalSentMessageCount: properties.totalSentMessageCount,
			totalReceivedMessageCount: properties.totalReceivedMessageCount,
			totalSentCharacters: properties.totalSentCharacters,
			totalReceivedCharacters: properties.totalReceivedCharacters,
			connectionDurationMs: properties.connectionDurationMs,
		});
	}

	public static sendErrorTelemetry(
		telemetryService: ITelemetryService,
		properties: IChatWebSocketErrorTelemetryProperties,
	) {
		/* __GDPR__
			"websocket.error" : {
				"owner": "chrmarti",
				"comment": "Report a runtime error on an established WebSocket connection.",
				"conversationId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the conversation" },
				"initiatingRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the request that initiated the connection" },
				"turnId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the turn" },
				"previousTurnId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Turn id of the previous request on this connection" },
				"hadActiveRequest": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the previous request was still active when the new one began", "isMeasurement": true },
				"requestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the current turn request" },
				"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id if available" },
				"modelId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model identifier from the request body" },
				"error": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Error message" },
				"totalSentMessageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of messages sent over this connection", "isMeasurement": true },
				"totalReceivedMessageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of messages received over this connection", "isMeasurement": true },
				"totalSentCharacters": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Total characters sent over this connection", "isMeasurement": true },
				"totalReceivedCharacters": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Total characters received over this connection", "isMeasurement": true },
				"connectionDurationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "How long the connection was open before the error in milliseconds", "isMeasurement": true }
			}
		*/
		telemetryService.sendTelemetryErrorEvent('websocket.error', { github: true, microsoft: true }, {
			conversationId: properties.conversationId,
			initiatingRequestId: properties.initiatingRequestId,
			turnId: properties.turnId,
			previousTurnId: properties.previousTurnId,
			requestId: properties.requestId,
			gitHubRequestId: properties.gitHubRequestId,
			modelId: properties.modelId,
			error: properties.error,
		}, {
			hadActiveRequest: properties.hadActiveRequest ? 1 : 0,
			totalSentMessageCount: properties.totalSentMessageCount,
			totalReceivedMessageCount: properties.totalReceivedMessageCount,
			totalSentCharacters: properties.totalSentCharacters,
			totalReceivedCharacters: properties.totalReceivedCharacters,
			connectionDurationMs: properties.connectionDurationMs,
		});
	}

	public static sendCloseDuringSetupTelemetry(
		telemetryService: ITelemetryService,
		properties: IChatWebSocketCloseDuringSetupTelemetryProperties,
	) {
		/* __GDPR__
			"websocket.closeDuringSetup" : {
				"owner": "chrmarti",
				"comment": "Report when a WebSocket connection is closed during setup before fully opening.",
				"conversationId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the conversation" },
				"initiatingRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the request that initiated the connection" },
				"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id if available" },
				"closeReason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Human-readable description of the close code" },
				"closeEventReason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Close event reason string from server" },
				"closeEventWasClean": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the connection closed cleanly" },
				"closeCode": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "WebSocket close code", "isMeasurement": true },
				"connectDurationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time until the connection was closed during setup in milliseconds", "isMeasurement": true }
			}
		*/
		telemetryService.sendTelemetryErrorEvent('websocket.closeDuringSetup', { github: true, microsoft: true }, {
			conversationId: properties.conversationId,
			initiatingRequestId: properties.initiatingRequestId,
			gitHubRequestId: properties.gitHubRequestId,
			closeReason: properties.closeReason,
			closeEventReason: properties.closeEventReason,
			closeEventWasClean: properties.closeEventWasClean,
		}, {
			closeCode: properties.closeCode,
			connectDurationMs: properties.connectDurationMs,
		});
	}

	public static sendRequestSentTelemetry(
		telemetryService: ITelemetryService,
		properties: IChatWebSocketRequestSentTelemetryProperties,
	) {
		/* __GDPR__
			"websocket.requestSent" : {
				"owner": "chrmarti",
				"comment": "Report when a request is sent over the WebSocket connection.",
				"conversationId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the conversation" },
				"initiatingRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the request that initiated the connection" },
				"turnId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the turn" },
				"previousTurnId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Turn id of the previous request on this connection" },
				"hadActiveRequest": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the previous request was still active when the new one began", "isMeasurement": true },
				"requestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the current turn request" },
				"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id if available" },
				"modelId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model identifier from the request body" },
				"statefulMarkerMatched": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the connection stateful marker matched the previous_response_id sent in the request", "isMeasurement": true },
				"previousResponseIdUnset": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether previous_response_id was undefined in the request", "isMeasurement": true },
				"hasCompactionData": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the request input contains compaction data", "isMeasurement": true },
				"tokenCountMax": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Maximum generated tokens", "isMeasurement": true },
				"totalSentMessageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of messages sent over this connection", "isMeasurement": true },
				"totalReceivedMessageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of messages received over this connection", "isMeasurement": true },
				"sentMessageCharacters": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Character count of this sent message payload", "isMeasurement": true },
				"totalSentCharacters": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Total characters sent over this connection", "isMeasurement": true },
				"totalReceivedCharacters": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Total characters received over this connection", "isMeasurement": true },
				"connectionDurationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "How long the connection has been open when the request is sent in milliseconds", "isMeasurement": true }
			}
		*/
		telemetryService.sendTelemetryEvent('websocket.requestSent', { github: true, microsoft: true }, {
			conversationId: properties.conversationId,
			initiatingRequestId: properties.initiatingRequestId,
			turnId: properties.turnId,
			previousTurnId: properties.previousTurnId,
			requestId: properties.requestId,
			gitHubRequestId: properties.gitHubRequestId,
			modelId: properties.modelId,
		}, {
			hadActiveRequest: properties.hadActiveRequest ? 1 : 0,
			statefulMarkerMatched: properties.statefulMarkerMatched ? 1 : 0,
			previousResponseIdUnset: properties.previousResponseIdUnset ? 1 : 0,
			hasCompactionData: properties.hasCompactionData ? 1 : 0,
			tokenCountMax: properties.tokenCountMax,
			totalSentMessageCount: properties.totalSentMessageCount,
			totalReceivedMessageCount: properties.totalReceivedMessageCount,
			sentMessageCharacters: properties.sentMessageCharacters,
			totalSentCharacters: properties.totalSentCharacters,
			totalReceivedCharacters: properties.totalReceivedCharacters,
			connectionDurationMs: properties.connectionDurationMs,
		});
	}

	public static sendMessageParseErrorTelemetry(
		telemetryService: ITelemetryService,
		properties: IChatWebSocketMessageParseErrorTelemetryProperties,
	) {
		/* __GDPR__
			"websocket.messageParseError" : {
				"owner": "chrmarti",
				"comment": "Report when a received websocket message fails JSON parsing.",
				"conversationId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the conversation" },
				"initiatingRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the request that initiated the connection" },
				"turnId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the turn" },
				"previousTurnId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Turn id of the previous request on this connection" },
				"hadActiveRequest": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the previous request was still active when the new one began", "isMeasurement": true },
				"requestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the current turn request" },
				"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id if available" },
				"modelId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model identifier from the request body" },
				"error": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Parse error message" },
				"totalSentMessageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of messages sent over this connection", "isMeasurement": true },
				"totalReceivedMessageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of messages received over this connection", "isMeasurement": true },
				"receivedMessageCharacters": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Character count of the received message that failed parsing", "isMeasurement": true },
				"totalSentCharacters": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Total characters sent over this connection", "isMeasurement": true },
				"totalReceivedCharacters": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Total characters received over this connection", "isMeasurement": true },
				"connectionDurationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "How long the connection has been open when parsing fails in milliseconds", "isMeasurement": true }
			}
		*/
		telemetryService.sendTelemetryErrorEvent('websocket.messageParseError', { github: true, microsoft: true }, {
			conversationId: properties.conversationId,
			initiatingRequestId: properties.initiatingRequestId,
			turnId: properties.turnId,
			previousTurnId: properties.previousTurnId,
			requestId: properties.requestId,
			gitHubRequestId: properties.gitHubRequestId,
			modelId: properties.modelId,
			error: properties.error,
		}, {
			hadActiveRequest: properties.hadActiveRequest ? 1 : 0,
			totalSentMessageCount: properties.totalSentMessageCount,
			totalReceivedMessageCount: properties.totalReceivedMessageCount,
			receivedMessageCharacters: properties.receivedMessageCharacters,
			totalSentCharacters: properties.totalSentCharacters,
			totalReceivedCharacters: properties.totalReceivedCharacters,
			connectionDurationMs: properties.connectionDurationMs,
		});
	}

	public static sendRequestOutcomeTelemetry(
		telemetryService: ITelemetryService,
		properties: IChatWebSocketRequestOutcomeTelemetryProperties,
	) {
		/* __GDPR__
			"websocket.requestOutcome" : {
				"owner": "chrmarti",
				"comment": "Report terminal outcome for a websocket request.",
				"conversationId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the conversation" },
				"initiatingRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the request that initiated the connection" },
				"turnId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the turn" },
				"previousTurnId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Turn id of the previous request on this connection" },
				"hadActiveRequest": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the previous request was still active when the new one began", "isMeasurement": true },
				"requestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the current turn request" },
				"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id if available" },
				"modelId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model identifier from the request body" },
				"requestOutcome": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Terminal outcome of the websocket request" },
				"statefulMarkerMatched": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the connection stateful marker matched the previous_response_id sent in the request", "isMeasurement": true },
				"previousResponseIdUnset": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether previous_response_id was undefined in the request", "isMeasurement": true },
				"hasCompactionData": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the request input contains compaction data", "isMeasurement": true },
				"promptTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of prompt tokens, locally counted", "isMeasurement": true },
				"tokenCountMax": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Maximum generated tokens", "isMeasurement": true },
				"totalSentMessageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of messages sent over this connection", "isMeasurement": true },
				"totalReceivedMessageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of messages received over this connection", "isMeasurement": true },
				"totalSentCharacters": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Total characters sent over this connection", "isMeasurement": true },
				"totalReceivedCharacters": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Total characters received over this connection", "isMeasurement": true },
				"requestSentMessageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of messages sent during this request", "isMeasurement": true },
				"requestReceivedMessageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of messages received during this request", "isMeasurement": true },
				"requestSentCharacters": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of characters sent during this request", "isMeasurement": true },
				"requestReceivedCharacters": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of characters received during this request", "isMeasurement": true },
				"connectionDurationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "How long the connection has been open when the request ended in milliseconds", "isMeasurement": true },
				"requestDurationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "How long the request took before terminal outcome in milliseconds", "isMeasurement": true },
				"closeCode": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "WebSocket close code when outcome is connection_closed", "isMeasurement": true },
				"closeReason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "WebSocket close reason when outcome is connection_closed" },
				"serverErrorMessage": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Error message from server error event when outcome is error_response" },
				"serverErrorCode": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Error code from server error event when outcome is error_response" }
			}
		*/
		telemetryService.sendTelemetryEvent('websocket.requestOutcome', { github: true, microsoft: true }, {
			conversationId: properties.conversationId,
			initiatingRequestId: properties.initiatingRequestId,
			turnId: properties.turnId,
			previousTurnId: properties.previousTurnId,
			requestId: properties.requestId,
			gitHubRequestId: properties.gitHubRequestId,
			modelId: properties.modelId,
			requestOutcome: properties.requestOutcome,
			closeReason: properties.closeReason,
			serverErrorMessage: properties.serverErrorMessage,
			serverErrorCode: properties.serverErrorCode,
		}, {
			hadActiveRequest: properties.hadActiveRequest ? 1 : 0,
			statefulMarkerMatched: properties.statefulMarkerMatched ? 1 : 0,
			previousResponseIdUnset: properties.previousResponseIdUnset ? 1 : 0,
			hasCompactionData: properties.hasCompactionData ? 1 : 0,
			promptTokenCount: properties.promptTokenCount,
			tokenCountMax: properties.tokenCountMax,
			totalSentMessageCount: properties.totalSentMessageCount,
			totalReceivedMessageCount: properties.totalReceivedMessageCount,
			totalSentCharacters: properties.totalSentCharacters,
			totalReceivedCharacters: properties.totalReceivedCharacters,
			requestSentMessageCount: properties.requestSentMessageCount,
			requestReceivedMessageCount: properties.requestReceivedMessageCount,
			requestSentCharacters: properties.requestSentCharacters,
			requestReceivedCharacters: properties.requestReceivedCharacters,
			connectionDurationMs: properties.connectionDurationMs,
			requestDurationMs: properties.requestDurationMs,
			closeCode: properties.closeCode,
		});
	}
}
