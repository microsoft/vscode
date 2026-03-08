/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// SON-OF-ANTON: Tier 2 modification — structured terminal output events for agent consumption

/**
 * Structured terminal output event emitted when data is received from a terminal process.
 * Agents subscribe to these events to capture command output in real time.
 */
export interface ITerminalOutputEvent {
	/** Unique identifier of the terminal instance */
	readonly terminalId: number;
	/** The raw output data from the terminal process */
	readonly data: string;
	/** Timestamp when the data was received */
	readonly timestamp: number;
	/** Whether this terminal is agent-owned (created for agent command execution) */
	readonly isAgentOwned: boolean;
}

/**
 * Options for creating an agent-owned terminal.
 * Agent-owned terminals automatically emit structured output events.
 */
export interface IAgentTerminalOptions {
	/** Identifier of the agent that owns this terminal */
	readonly agentId: string;
	/** Human-readable name for the terminal */
	readonly name: string;
	/** Working directory for the terminal */
	readonly cwd?: string;
	/** Whether to show the terminal in the UI (default: false for agent terminals) */
	readonly visible?: boolean;
}
