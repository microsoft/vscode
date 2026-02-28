/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from '../../../../base/common/event.js';
import type { IDisposable } from '../../../../base/common/lifecycle.js';

/**
 * CDP error codes following JSON-RPC 2.0 conventions
 */
export const CDPErrorCode = {
	/** Method not found */
	MethodNotFound: -32601,
	/** Invalid params */
	InvalidParams: -32602,
	/** Internal error */
	InternalError: -32603,
	/** Server error (generic) */
	ServerError: -32000,
} as const;

/**
 * Base CDP error class with error code
 */
export class CDPError extends Error {
	constructor(
		message: string,
		readonly code: number
	) {
		super(message);
		this.name = 'CDPError';
	}
}

/**
 * Error thrown when a CDP method is not found
 */
export class CDPMethodNotFoundError extends CDPError {
	constructor(method: string) {
		super(`Method not found: ${method}`, CDPErrorCode.MethodNotFound);
		this.name = 'CDPMethodNotFoundError';
	}
}

/**
 * Error thrown when CDP params are invalid
 */
export class CDPInvalidParamsError extends CDPError {
	constructor(message: string) {
		super(message, CDPErrorCode.InvalidParams);
		this.name = 'CDPInvalidParamsError';
	}
}

/**
 * Error thrown for internal CDP errors
 */
export class CDPInternalError extends CDPError {
	constructor(message: string) {
		super(message, CDPErrorCode.InternalError);
		this.name = 'CDPInternalError';
	}
}

/**
 * Error thrown for generic CDP server errors
 */
export class CDPServerError extends CDPError {
	constructor(message: string) {
		super(message, CDPErrorCode.ServerError);
		this.name = 'CDPServerError';
	}
}

/**
 * CDP message types
 */
export interface CDPRequest {
	id: number;
	method: string;
	params?: unknown;
	sessionId?: string;
}

export interface CDPResponse {
	id: number;
	result?: unknown;
	error?: { code: number; message: string };
	sessionId?: string;
}

export interface CDPEvent {
	method: string;
	params: unknown;
	sessionId?: string;
}

export interface CDPTargetInfo {
	targetId: string;
	type: string;
	title: string;
	url: string;
	attached: boolean;
	canAccessOpener: boolean;
	browserContextId?: string;
}

export interface CDPBrowserVersion {
	protocolVersion: string;
	product: string;
	revision: string;
	userAgent: string;
	jsVersion: string;
}

export interface CDPWindowBounds {
	left: number;
	top: number;
	width: number;
	height: number;
	windowState: string;
}

/**
 * A debuggable CDP target (e.g., a browser view).
 * Targets can be attached to by CDP clients.
 */
export interface ICDPTarget {
	/** Get target info for CDP protocol. Initializes the target if needed. */
	getTargetInfo(): Promise<CDPTargetInfo>;
	/** Attach to receive events and send commands. Initializes if needed. Dispose to detach. */
	attach(): Promise<ICDPConnection>;
}

/**
 * Service interface for managing CDP targets and browser contexts.
 */
export interface ICDPBrowserTarget extends ICDPTarget {
	/** Event fired when a target is created */
	readonly onTargetCreated: Event<ICDPTarget>;
	/** Event fired when a target is about to be destroyed */
	readonly onTargetDestroyed: Event<ICDPTarget>;

	// Browser-level information
	/** Get browser version info for CDP Browser.getVersion */
	getVersion(): CDPBrowserVersion;
	/** Get the window ID and bounds for a target */
	getWindowForTarget(target: ICDPTarget): { windowId: number; bounds: CDPWindowBounds };

	/** Get all available targets */
	getTargets(): IterableIterator<ICDPTarget>;
	/** Create a new target in the specified browser context */
	createTarget(url: string, browserContextId?: string): Promise<ICDPTarget>;
	/** Activate a target (bring to foreground) */
	activateTarget(target: ICDPTarget): Promise<void>;
	/** Close a target */
	closeTarget(target: ICDPTarget): Promise<boolean>;

	// Browser context management
	/** Get all browser context IDs */
	getBrowserContexts(): string[];
	/** Create a new isolated browser context */
	createBrowserContext(): Promise<string>;
	/** Dispose a browser context and all its targets */
	disposeBrowserContext(browserContextId: string): Promise<void>;
}

/**
 * A bidirectional CDP connection that can send commands and receive events.
 * Returned by ICDPTarget.attach() for low-level connections, and also
 * implemented by CDPBrowserProxy for the full protocol-aware connection.
 */
export interface ICDPConnection extends IDisposable {
	/** The session ID for this connection */
	readonly sessionId: string;

	/** Event fired when the connection receives a CDP event */
	readonly onEvent: Event<CDPEvent>;
	/** Event fired when the connection is closed */
	readonly onClose: Event<void>;

	/**
	 * Send a CDP command and await the result.
	 * @param method The CDP method to call
	 * @param params Optional parameters for the method
	 * @param sessionId Optional session ID for targeting a specific session
	 * @returns Promise resolving to the result or rejecting with a CDPError
	 */
	sendMessage(method: string, params?: unknown, sessionId?: string): Promise<unknown>;
}
