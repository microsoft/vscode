/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ESM-comment-begin
import * as https from 'https';
// ESM-comment-end

// ESM-uncomment-begin
// const https = globalThis.MonacoNodeModules.https;
// ESM-uncomment-end


export type RequestOptions = import('https').RequestOptions;
export type Agent = import('https').Agent;
export type Server = import('https').Server;
export const Agent = https.Agent;
export const Server = https.Server;
export const createServer = https.createServer;
export const get = https.get;
export const globalAgent = https.globalAgent;
export const request = https.request;
