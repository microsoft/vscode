/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const events = require('vscode-jsonrpc/lib/events');
const cancellation = require('vscode-jsonrpc/lib/cancellation');

exports.Disposable = events.Disposable;
exports.Event = events.Event;
exports.Emitter = events.Emitter;
exports.CancellationToken = cancellation.CancellationToken;
exports.CancellationTokenSource = cancellation.CancellationTokenSource;
