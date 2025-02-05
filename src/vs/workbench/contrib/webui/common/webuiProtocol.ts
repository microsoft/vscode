/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IWebUIMessage {
	type: 'ready' | 'command' | 'response' | 'error' | 'initialize';
	requestId?: string;
	payload?: any;
}

export interface IReadyMessage extends IWebUIMessage {
	type: 'ready';
}

export interface IErrorMessage extends IWebUIMessage {
	type: 'error';
	payload: {
		message: string;
		stack?: string;
	};
}

export type WebUIMessage = IReadyMessage | ICommandMessage | IErrorMessage | IResponseMessage | IInitializeMessage;

export interface IInitializeMessage extends IWebUIMessage {
	type: 'initialize';
	payload: {
		version: string;
		features: {
			commands: boolean;
		};
	};
}

export interface ICommandMessage extends IWebUIMessage {
	type: 'command';
	requestId: string;
	payload: {
		command: string;
		args?: any[];
	};
}

export interface IResponseMessage extends IWebUIMessage {
	type: 'response';
	requestId: string;
	payload: {
		result?: any;
		error?: string;
	};
}

export type FromWebviewMessage = ICommandMessage;
export type ToWebviewMessage = IInitializeMessage | IResponseMessage;
