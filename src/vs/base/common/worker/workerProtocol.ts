/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * A message sent from the UI thread to a worker
 */
export interface IClientMessage {
	id:number;
	type:string;
	timestamp:number;
	payload:any;
}

/**
 * A message sent from a worker to the UI thread
 */
export interface IServerMessage {
	monacoWorker:boolean;
	from:number;
	req:string;
	type:string;
	payload:any;
}

/**
 * A message sent from a worker to the UI thread in reply to a UI thread request
 */
export interface IServerReplyMessage extends IServerMessage {
	id:number;
	action:string;
}

/**
 * A message sent from a worker to the UI thread for debugging purposes (console.log, console.info, etc.)
 */
export interface IServerPrintMessage extends IServerMessage {
	level:string;
}

export var MessageType = {
	INITIALIZE: '$initialize',
	REPLY: '$reply',
	PRINT: '$print'
};

export var ReplyType = {
	COMPLETE: 'complete',
	ERROR: 'error',
	PROGRESS: 'progress'
};

export var PrintType = {
	LOG: 'log',
	DEBUG: 'debug',
	INFO: 'info',
	WARN: 'warn',
	ERROR: 'error'
};
