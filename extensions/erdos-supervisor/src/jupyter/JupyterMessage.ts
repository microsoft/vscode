/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { JupyterChannel } from './JupyterChannel';
import { JupyterMessageHeader } from './JupyterMessageHeader';

export interface JupyterMessage {
	header: JupyterMessageHeader;
	parent_header: JupyterMessageHeader | null;
	metadata: Record<string, unknown>;
	content: unknown;
	channel: JupyterChannel;
	buffers: Array<Uint8Array>;
}

export interface JupyterMessageBuilder {
	withHeader(header: JupyterMessageHeader): JupyterMessageBuilder;
	withParentHeader(parentHeader: JupyterMessageHeader): JupyterMessageBuilder;
	withMetadata(metadata: Record<string, unknown>): JupyterMessageBuilder;
	withContent(content: unknown): JupyterMessageBuilder;
	withChannel(channel: JupyterChannel): JupyterMessageBuilder;
	withBuffers(buffers: Array<Uint8Array>): JupyterMessageBuilder;
	build(): JupyterMessage;
}

export class JupyterMessageBuilderImpl implements JupyterMessageBuilder {
	private _header?: JupyterMessageHeader;
	private _parentHeader: JupyterMessageHeader | null = null;
	private _metadata: Record<string, unknown> = {};
	private _content: unknown = null;
	private _channel?: JupyterChannel;
	private _buffers: Array<Uint8Array> = [];

	withHeader(header: JupyterMessageHeader): JupyterMessageBuilder {
		this._header = header;
		return this;
	}

	withParentHeader(parentHeader: JupyterMessageHeader): JupyterMessageBuilder {
		this._parentHeader = parentHeader;
		return this;
	}

	withMetadata(metadata: Record<string, unknown>): JupyterMessageBuilder {
		this._metadata = metadata;
		return this;
	}

	withContent(content: unknown): JupyterMessageBuilder {
		this._content = content;
		return this;
	}

	withChannel(channel: JupyterChannel): JupyterMessageBuilder {
		this._channel = channel;
		return this;
	}

	withBuffers(buffers: Array<Uint8Array>): JupyterMessageBuilder {
		this._buffers = buffers;
		return this;
	}

	build(): JupyterMessage {
		if (!this._header) {
			throw new Error('Header is required for Jupyter message');
		}
		if (!this._channel) {
			throw new Error('Channel is required for Jupyter message');
		}

		return {
			header: this._header,
			parent_header: this._parentHeader,
			metadata: this._metadata,
			content: this._content,
			channel: this._channel,
			buffers: this._buffers
		};
	}
}

export function createJupyterMessage(): JupyterMessageBuilder {
	return new JupyterMessageBuilderImpl();
}
