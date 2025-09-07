/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Widget interaction handlers for React components
 */
export interface IErdosAiWidgetHandlers {
	onAccept?: (messageId: number, content: string) => void;
	onCancel?: (messageId: number) => void;
	onAllowList?: (messageId: number, content: string) => void;
}

/**
 * Widget function call information for React components
 */
export interface IErdosAiWidgetInfo {
	messageId: number;
	requestId: string;
	functionCallType: 'search_replace' | 'run_console_cmd' | 'run_terminal_cmd' | 'delete_file' | 'run_file';
	filename?: string;
	initialContent?: string;
	language?: string;
	autoAccept?: boolean; // Flag to auto-accept without user interaction
	diffStats?: {
		added: number;
		deleted: number;
	};
	startLine?: number;
	endLine?: number;
}
