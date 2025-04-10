// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// Also copied from pylint repo

import * as util from 'util';
import { Disposable, LogOutputChannel } from 'vscode';

type Arguments = unknown[];
class OutputChannelLogger {
	constructor(private readonly channel: LogOutputChannel) { }

	public traceLog(...data: Arguments): void {
		this.channel.appendLine(util.format(...data));
	}

	public traceError(...data: Arguments): void {
		this.channel.error(util.format(...data));
	}

	public traceWarn(...data: Arguments): void {
		this.channel.warn(util.format(...data));
	}

	public traceInfo(...data: Arguments): void {
		this.channel.info(util.format(...data));
	}

	public traceVerbose(...data: Arguments): void {
		this.channel.debug(util.format(...data));
	}
}

let channel: OutputChannelLogger | undefined;
export function registerLogger(logChannel: LogOutputChannel): Disposable {
	channel = new OutputChannelLogger(logChannel);
	return {
		dispose: () => {
			channel = undefined;
		},
	};
}

export function traceLog(...args: Arguments): void {
	channel?.traceLog(...args);
}

export function traceError(...args: Arguments): void {
	channel?.traceError(...args);
}

export function traceWarn(...args: Arguments): void {
	channel?.traceWarn(...args);
}

export function traceInfo(...args: Arguments): void {
	channel?.traceInfo(...args);
}

export function traceVerbose(...args: Arguments): void {
	channel?.traceVerbose(...args);
}
