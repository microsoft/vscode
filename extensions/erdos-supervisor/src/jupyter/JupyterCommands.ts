/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { SocketSession } from '../ws/SocketSession';
import { unpackSerializedObjectWithBuffers } from '../util';
import { 
	JupyterChannel, 
	JupyterMessageHeader, 
	JupyterMessageType,
	JupyterCommOpen,
	JupyterCommClose,
	JupyterCommMsg,
	JupyterInputReply
} from './JupyterTypes';

export abstract class JupyterCommand<T> {
	private _msgId: string = '';

	constructor(
		public readonly commandType: JupyterMessageType,
		public readonly commandPayload: T,
		public readonly channel: JupyterChannel) {
	}

	protected createMsgId(): string {
		return Math.random().toString(16).substring(2, 12);
	}

	protected get metadata(): any {
		return {};
	}

	protected createParentHeader(): JupyterMessageHeader | null {
		return null;
	}

	get msgId(): string {
		if (!this._msgId) {
			this._msgId = this.createMsgId();
		}
		return this._msgId;
	}

	public sendCommand(socket: SocketSession) {
		const header: JupyterMessageHeader = {
			msg_id: this.msgId,
			session: socket.sessionId,
			username: socket.userId,
			date: new Date().toISOString(),
			msg_type: this.commandType,
			version: '5.3'
		};

		const { content, buffers } = unpackSerializedObjectWithBuffers(this.commandPayload);
		const payload = {
			header,
			parent_header: this.createParentHeader(),
			metadata: this.metadata,
			content,
			channel: this.channel,
			buffers
		};
		const text = JSON.stringify(payload);
		socket.channel.debug(`>>> SEND ${this.commandType} [${this.channel}]: ${JSON.stringify(this.commandPayload)}`);
		socket.ws.send(text);
	}
}

export class CommOpenCommand extends JupyterCommand<JupyterCommOpen> {
	constructor(payload: JupyterCommOpen, private readonly _metadata?: Record<string, unknown>) {
		super(JupyterMessageType.CommOpen, payload, JupyterChannel.Shell);
	}

	override get metadata(): Record<string, unknown> {
		if (typeof this._metadata === 'undefined') {
			return {};
		}
		return this._metadata;
	}
}

export class CommCloseCommand extends JupyterCommand<JupyterCommClose> {
	constructor(id: string) {
		super(JupyterMessageType.CommClose, {
			comm_id: id,
			data: {}
		}, JupyterChannel.Shell);
	}
}

export class CommMsgCommand extends JupyterCommand<JupyterCommMsg> {
	constructor(private readonly _id: string, payload: JupyterCommMsg) {
		super(JupyterMessageType.CommMsg, payload, JupyterChannel.Shell);
	}

	protected override createMsgId(): string {
		return this._id;
	}
}

export class InputReplyCommand extends JupyterCommand<JupyterInputReply> {
	constructor(readonly parent: JupyterMessageHeader | null, value: string) {
		super(JupyterMessageType.InputReply, { value }, JupyterChannel.Stdin);
	}

	protected override createParentHeader(): JupyterMessageHeader | null {
		return this.parent;
	}
}

export class RpcReplyCommand extends JupyterCommand<any> {
	constructor(readonly parent: JupyterMessageHeader | null, value: any) {
		super(JupyterMessageType.RpcReply, value, JupyterChannel.Stdin);
	}

	protected override createParentHeader(): JupyterMessageHeader | null {
		return this.parent;
	}
}
