/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';

export interface ICommCloseFromWebview {
	type: 'comm_close';
	comm_id: string;
}

export interface ICommMessageFromWebview {
	type: 'comm_msg';
	comm_id: string;
	msg_id: string;
	data: unknown;
	buffers?: Array<Uint8Array>;
}

export interface ICommOpenFromWebview {
	type: 'comm_open';
	comm_id: string;
	target_name: string;
	data: unknown;
	metadata: unknown;
}

export interface IGetPreferredRendererFromWebview {
	type: 'get_preferred_renderer';
	msg_id: string;
	mime_type: string;
}

export interface IInitializeFromWebview {
	type: 'initialize';
}

export type FromWebviewMessage = ICommCloseFromWebview |
	ICommMessageFromWebview |
	ICommOpenFromWebview |
	IGetPreferredRendererFromWebview |
	IInitializeFromWebview;

export interface IInitializeResultToWebview {
	type: 'initialize_result';
}

export interface ICommCloseToWebview {
	type: 'comm_close';
	comm_id: string;
}

export interface ICommMessageToWebview {
	type: 'comm_msg';
	comm_id: string;
	data: unknown;
	buffers?: Array<Uint8Array>;
	parent_id?: string;
}

export interface ICommOpenToWebview {
	type: 'comm_open';
	comm_id: string;
	target_name: string;
	data: unknown;
	buffers?: Array<VSBuffer>;
	metadata: unknown;
}

export interface IGetPreferredRendererResultToWebview {
	type: 'get_preferred_renderer_result';
	parent_id: string;
	renderer_id?: string;
}

export interface IRuntimeMessageClearOutput {
	type: 'clear_output';
	wait: boolean;
}

export interface IRuntimeMessageDisplayData {
	type: 'display_data';
	data: unknown;
	metadata: unknown;
}

export interface IRuntimeMessageError {
	type: 'error';
	name: string;
	message: string;
	traceback: Array<string>;
}

export interface IRuntimeMessageExecuteResult {
	type: 'execute_result';
	data: unknown;
	metadata: unknown;
}

export interface IRuntimeMessageStream {
	type: 'stream';
	name: 'stdout' | 'stderr';
	text: string;
}

export type IRuntimeMessageContent = IRuntimeMessageClearOutput |
	IRuntimeMessageDisplayData |
	IRuntimeMessageError |
	IRuntimeMessageExecuteResult |
	IRuntimeMessageStream;

export interface IRuntimeMessageToWebview {
	type: 'kernel_message';
	parent_id: string;
	content: IRuntimeMessageContent;
}

export type ToWebviewMessage = IInitializeResultToWebview |
	ICommCloseToWebview |
	ICommMessageToWebview |
	ICommOpenToWebview |
	IGetPreferredRendererResultToWebview |
	IRuntimeMessageToWebview;
