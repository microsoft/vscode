/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, LogLevel, OutputChannel, window } from 'vscode';
import { ILogTarget } from '../common/logService';

export let outputChannel: OutputChannel;

export const OutputChannelName = 'GitHub Copilot Chat';

export class NewOutputChannelLogTarget implements ILogTarget {

	private readonly _outputChannel = window.createOutputChannel(OutputChannelName, { log: true });

	constructor(extensionContext: ExtensionContext) {
		outputChannel = this._outputChannel;
		extensionContext.subscriptions.push(this._outputChannel);
	}

	logIt(level: LogLevel, metadataStr: string, ...extra: any[]) {
		try {
			switch (level) {
				case LogLevel.Trace:
					this._outputChannel.trace(metadataStr);
					break;
				case LogLevel.Debug:
					this._outputChannel.debug(metadataStr);
					break;
				case LogLevel.Info:
					this._outputChannel.info(metadataStr);
					break;
				case LogLevel.Warning:
					this._outputChannel.warn(metadataStr);
					break;
				case LogLevel.Error:
					this._outputChannel.error(metadataStr);
					break;
			}
		} catch {
			// The output channel may be closed during extension host shutdown
			// (see https://github.com/microsoft/vscode/issues/303916)
		}
	}

	show(preserveFocus?: boolean): void {
		this._outputChannel.show(preserveFocus);
	}
}
