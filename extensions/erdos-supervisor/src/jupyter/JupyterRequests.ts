/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { PromiseHandles } from '../async';
import { SocketSession } from '../ws/SocketSession';
import { JupyterCommand } from './JupyterCommands';
import { 
	JupyterChannel, 
	JupyterMessageType,
	JupyterExecuteRequest,
	JupyterExecuteResult,
	JupyterIsCompleteRequest,
	JupyterIsCompleteReply,
	JupyterCommInfoRequest,
	JupyterCommInfoReply,
	JupyterCommMsg,
	JupyterShutdownRequest,
	JupyterShutdownReply,
	KernelInfoReply
} from './JupyterTypes';

export abstract class JupyterRequest<T, U> extends JupyterCommand<T> {
	private _promise: PromiseHandles<U> = new PromiseHandles<U>();
	constructor(
		requestType: JupyterMessageType,
		requestPayload: T,
		public readonly replyType: JupyterMessageType,
		channel: JupyterChannel) {
		super(requestType, requestPayload, channel);
	}

	public resolve(response: U): void {
		this._promise.resolve(response);
	}

	public reject(reason: any): void {
		this._promise.reject(reason);
	}

	public sendRpc(socket: SocketSession): Promise<U> {
		super.sendCommand(socket);
		return this._promise.promise;
	}
}

export class KernelInfoRequest extends JupyterRequest<Object, KernelInfoReply> {
	constructor() {
		super(JupyterMessageType.KernelInfoRequest, {}, JupyterMessageType.KernelInfoReply, JupyterChannel.Shell);
	}
}

export class ExecuteRequest extends JupyterRequest<JupyterExecuteRequest, JupyterExecuteResult> {
	constructor(readonly requestId: string, req: JupyterExecuteRequest) {
		super(JupyterMessageType.ExecuteRequest, req, JupyterMessageType.ExecuteResult, JupyterChannel.Shell);
	}
	protected override createMsgId(): string {
		return this.requestId;
	}
}

export class IsCompleteRequest extends JupyterRequest<JupyterIsCompleteRequest, JupyterIsCompleteReply> {
	constructor(req: JupyterIsCompleteRequest) {
		super(JupyterMessageType.IsCompleteRequest, req, JupyterMessageType.IsCompleteReply, JupyterChannel.Shell);
	}
}

export class CommInfoRequest extends JupyterRequest<JupyterCommInfoRequest, JupyterCommInfoReply> {
	constructor(target: string) {
		super(
			JupyterMessageType.CommInfoRequest,
			{ target_name: target },
			JupyterMessageType.CommInfoReply,
			JupyterChannel.Shell,
		);
	}
}

export class CommMsgRequest extends JupyterRequest<JupyterCommMsg, JupyterCommMsg> {
	constructor(private readonly _id: string, payload: JupyterCommMsg) {
		super(JupyterMessageType.CommMsg, payload, JupyterMessageType.CommMsg, JupyterChannel.Shell);
	}

	protected override createMsgId(): string {
		return this._id;
	}
}

export class ShutdownRequest extends JupyterRequest<JupyterShutdownRequest, JupyterShutdownReply> {
	constructor(restart: boolean) {
		super(JupyterMessageType.ShutdownRequest, { restart }, JupyterMessageType.ShutdownReply, JupyterChannel.Control);
	}
}
