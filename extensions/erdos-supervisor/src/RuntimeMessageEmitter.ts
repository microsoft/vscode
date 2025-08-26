/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
// eslint-disable-next-line import/no-unresolved
import * as erdos from 'erdos';
import { JupyterMessage } from './jupyter/JupyterTypes';
import { isEnumMember } from './util.js';

export class RuntimeMessageEmitter implements vscode.Disposable {

	private readonly _emitter = new vscode.EventEmitter<erdos.LanguageRuntimeCommMessage
		| erdos.LanguageRuntimeCommOpen
		| erdos.LanguageRuntimeResult
		| erdos.LanguageRuntimeOutput
		| erdos.LanguageRuntimeInput
		| erdos.LanguageRuntimeState
		| erdos.LanguageRuntimeClearOutput
		| erdos.LanguageRuntimeError
		| erdos.LanguageRuntimeStream
		| erdos.LanguageRuntimeUpdateOutput
		| erdos.LanguageRuntimePrompt>();

	public readonly event = this._emitter.event;

	public emitJupyter(msg: JupyterMessage): void {
		switch (msg.header.msg_type) {
			case 'clear_output':
				this.onClearOutput(msg, msg.content as any);
				break;
			case 'comm_msg':
				this.onCommMessage(msg, msg.content as any);
				break;
			case 'comm_open':
				this.onCommOpen(msg, msg.content as any);
				break;
			case 'display_data':
				this.onDisplayData(msg, msg.content as any);
				break;
			case 'error':
				this.onErrorResult(msg, msg.content as any);
				break;
			case 'execute_input':
				this.onExecuteInput(msg, msg.content as any);
				break;
			case 'execute_result':
				this.onExecuteResult(msg, msg.content as any);
				break;
			case 'input_request':
				this.onInputRequest(msg, msg.content as any);
				break;
			case 'status':
				this.onKernelStatus(msg, msg.content as any);
				break;
			case 'stream':
				this.onStreamOutput(msg, msg.content as any);
				break;
			case 'update_display_data':
				this.onUpdateDisplayData(msg, msg.content as any);
				break;
		}
	}

	private onCommMessage(message: JupyterMessage, data: any): void {
		this._emitter.fire({
			id: message.header.msg_id,
			parent_id: message.parent_header?.msg_id,
			when: message.header.date,
			type: erdos.LanguageRuntimeMessageType.CommData,
			comm_id: data.comm_id,
			data: data.data,
			metadata: message.metadata,
			buffers: message.buffers,
		} satisfies erdos.LanguageRuntimeCommMessage);
	}

	onExecuteResult(message: JupyterMessage, data: any) {
		this._emitter.fire({
			id: message.header.msg_id,
			parent_id: message.parent_header?.msg_id,
			when: message.header.date,
			type: erdos.LanguageRuntimeMessageType.Result,
			output_id: data.transient?.display_id,
			data: data.data,
			metadata: message.metadata,
		} satisfies erdos.LanguageRuntimeResult);
	}

	onDisplayData(message: JupyterMessage, data: any) {
		this._emitter.fire({
			id: message.header.msg_id,
			parent_id: message.parent_header?.msg_id,
			when: message.header.date,
			type: erdos.LanguageRuntimeMessageType.Output,
			output_id: data.transient?.display_id,
			data: data.data,
			metadata: message.metadata,
		} satisfies erdos.LanguageRuntimeOutput);
	}

	onExecuteInput(message: JupyterMessage, data: any) {
		this._emitter.fire({
			id: message.header.msg_id,
			parent_id: message.parent_header?.msg_id,
			when: message.header.date,
			type: erdos.LanguageRuntimeMessageType.Input,
			code: data.code,
			execution_count: data.execution_count,
			metadata: message.metadata,
		} satisfies erdos.LanguageRuntimeInput);
	}

	onKernelStatus(message: JupyterMessage, data: any) {
		if (!isEnumMember(data.execution_state, erdos.RuntimeOnlineState)) {
			throw new Error(`Unexpected JupyterKernelStatus.execution_state: ${data}`);
		}
		this._emitter.fire({
			id: message.header.msg_id,
			parent_id: message.parent_header?.msg_id,
			when: message.header.date,
			type: erdos.LanguageRuntimeMessageType.State,
			state: data.execution_state,
			metadata: message.metadata,
		} satisfies erdos.LanguageRuntimeState);
	}

	private onCommOpen(message: JupyterMessage, data: any): void {
		this._emitter.fire({
			id: message.header.msg_id,
			parent_id: message.parent_header?.msg_id,
			when: message.header.date,
			type: erdos.LanguageRuntimeMessageType.CommOpen,
			comm_id: data.comm_id,
			target_name: data.target_name,
			data: data.data,
			metadata: message.metadata,
			buffers: message.buffers,
		} satisfies erdos.LanguageRuntimeCommOpen);
	}

	onClearOutput(message: JupyterMessage, data: any) {
		this._emitter.fire({
			id: message.header.msg_id,
			parent_id: message.parent_header?.msg_id,
			when: message.header.date,
			type: erdos.LanguageRuntimeMessageType.ClearOutput,
			wait: data.wait,
			metadata: message.metadata,
		} satisfies erdos.LanguageRuntimeClearOutput);
	}

	private onErrorResult(message: JupyterMessage, data: any) {
		this._emitter.fire({
			id: message.header.msg_id,
			parent_id: message.parent_header?.msg_id,
			when: message.header.date,
			type: erdos.LanguageRuntimeMessageType.Error,
			name: data.ename,
			message: data.evalue,
			traceback: data.traceback,
			metadata: message.metadata,
		} satisfies erdos.LanguageRuntimeError);
	}

	private onStreamOutput(message: JupyterMessage, data: any) {
		if (!isEnumMember(data.name, erdos.LanguageRuntimeStreamName)) {
			throw new Error(`Unexpected JupyterStreamOutput.name: ${data}`);
		}
		this._emitter.fire({
			id: message.header.msg_id,
			parent_id: message.parent_header?.msg_id,
			when: message.header.date,
			type: erdos.LanguageRuntimeMessageType.Stream,
			name: data.name,
			text: data.text,
			metadata: message.metadata,
		} satisfies erdos.LanguageRuntimeStream);
	}

	private onUpdateDisplayData(message: JupyterMessage, data: any) {
		this._emitter.fire({
			id: message.header.msg_id,
			parent_id: message.parent_header?.msg_id,
			when: message.header.date,
			type: erdos.LanguageRuntimeMessageType.UpdateOutput,
			output_id: data.transient.display_id,
			data: data.data,
			metadata: message.metadata,
		} satisfies erdos.LanguageRuntimeUpdateOutput);
	}

	private onInputRequest(message: JupyterMessage, req: any): void {
		this._emitter.fire({
			id: message.header.msg_id,
			parent_id: message.parent_header?.msg_id,
			when: message.header.date,
			type: erdos.LanguageRuntimeMessageType.Prompt,
			prompt: req.prompt,
			password: req.password,
		} satisfies erdos.LanguageRuntimePrompt);
	}

	dispose() {
		this._emitter.dispose();
	}

}
