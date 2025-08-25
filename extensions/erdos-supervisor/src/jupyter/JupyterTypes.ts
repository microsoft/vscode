/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export enum JupyterChannel {
	Shell = 'shell',
	Control = 'control',
	Stdin = 'stdin',
	IOPub = 'iopub',
	Heartbeat = 'heartbeat'
}

export enum JupyterMessageType {
	ClearOutput = 'clear_output',
	CommClose = 'comm_close',
	CommInfoReply = 'comm_info_reply',
	CommInfoRequest = 'comm_info_request',
	CommMsg = 'comm_msg',
	CommOpen = 'comm_open',
	DisplayData = 'display_data',
	Error = 'error',
	ExecuteInput = 'execute_input',
	ExecuteReply = 'execute_reply',
	ExecuteRequest = 'execute_request',
	ExecuteResult = 'execute_result',
	InputReply = 'input_reply',
	InputRequest = 'input_request',
	IsCompleteReply = 'is_complete_reply',
	IsCompleteRequest = 'is_complete_request',
	KernelInfoReply = 'kernel_info_reply',
	KernelInfoRequest = 'kernel_info_request',
	RpcReply = 'rpc_reply',
	RpcRequest = 'rpc_request',
	ShutdownReply = 'shutdown_reply',
	ShutdownRequest = 'shutdown_request',
	Status = 'status',
	Stream = 'stream',
	UpdateDisplayData = 'update_display_data',
}

export interface JupyterMessageHeader {
	msg_id: string;
	session: string;
	username: string;
	date: string;
	msg_type: JupyterMessageType;
	version: string;
}

export interface JupyterMessage {
	header: JupyterMessageHeader;
	parent_header: JupyterMessageHeader;
	metadata: Record<string, unknown>;
	content: unknown;
	channel: JupyterChannel;
	buffers: Array<Uint8Array>;
}

export interface JupyterLanguageInfoErdos {
	input_prompt?: string;
	continuation_prompt?: string;
}

export interface JupyterLanguageInfo {
	name: string;
	version: string;
	mimetype: string;
	file_extension: string;
	pygments_lexer: string;
	codemirror_mode: string;
	nbconvert_exporter: string;
	erdos?: JupyterLanguageInfoErdos;
}

export interface JupyterHelpLink {
	text: string;
	url: string;
}

export interface JupyterDisplayData {
	data: Record<string, unknown>;
	metadata: Record<string, unknown>;
	transient?: {
		display_id?: string;
		[key: string]: unknown;
	};
}

export interface JupyterExecuteRequest {
	code: string;
	silent: boolean;
	store_history: boolean;
	user_expressions: Record<string, unknown>;
	allow_stdin: boolean;
	stop_on_error: boolean;
}

export interface JupyterExecuteResult extends JupyterDisplayData {
	execution_count: number;
}

export interface JupyterIsCompleteRequest {
	code: string;
}

export interface JupyterIsCompleteReply {
	status: 'complete' | 'incomplete' | 'invalid' | 'unknown';
	indent: string;
}

export interface JupyterCommInfoRequest {
	target_name: string;
}

export interface JupyterComm {
	target_name: string;
}

export interface JupyterCommInfoReply {
	status: 'ok' | 'error';
	comms: Record<string, JupyterComm>;
}

export interface JupyterCommOpen {
	comm_id: string;
	target_name: string;
	data: Record<string, unknown>;
}

export interface JupyterCommClose {
	comm_id: string;
	data: object;
}

export interface JupyterCommMsg {
	comm_id: string;
	data: Record<string, unknown>;
}

export interface JupyterShutdownRequest {
	restart: boolean;
}

export interface JupyterShutdownReply {
	status: 'ok' | 'error';
	restart: boolean;
}

export interface JupyterInputReply {
	value: string;
}

export interface JupyterInputRequest {
	prompt: string;
	password: boolean;
}

export interface JupyterClearOutput {
	wait: boolean;
}

export interface JupyterErrorReply {
	ename: string;
	evalue: string;
	traceback: Array<string>;
}

export interface JupyterExecuteInput {
	code: string;
	execution_count: number;
}

export interface JupyterKernelStatus {
	execution_state: 'busy' | 'idle' | 'starting';
}

export interface JupyterStreamOutput {
	name: string;
	text: string;
}

export interface JupyterUpdateDisplayData {
	data: Record<string, unknown>;
	metadata: Record<string, unknown>;
	transient: {
		display_id: string;
		[key: string]: unknown;
	};
}

export interface JupyterCommRequest {
	method: string;
	params: Record<string, unknown>;
}

export interface KernelInfoReply {
	status: 'ok' | 'error';
	protocol_version: string;
	implementation_version: string;
	language_info: JupyterLanguageInfo;
	banner: string;
	debugger: boolean;
	help_links: Array<JupyterHelpLink>;
}
