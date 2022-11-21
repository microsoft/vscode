/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ESM-comment-begin
import * as net from 'net';
// ESM-comment-end

// ESM-uncomment-begin
// const net = globalThis._VSCODE_NODE_MODULES.net;
// ESM-uncomment-end

export type AddressInfo = import('net').AddressInfo;
export type BlockList = import('net').BlockList;
export type Server = import('net').Server;
export type Socket = import('net').Socket;
export type SocketAddress = import('net').SocketAddress;
export const BlockList = net.BlockList;
export const Server = net.Server;
export const Socket = net.Socket;
export const SocketAddress = net.SocketAddress;
export const connect = net.connect;
export const createConnection = net.createConnection;
export const createServer = net.createServer;
export const isIP = net.isIP;
export const isIPv4 = net.isIPv4;
export const isIPv6 = net.isIPv6;
