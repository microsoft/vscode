// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { DebugConfiguration, DebugSession, DebugSessionCustomEvent } from 'vscode';
import { AttachRequestArguments } from '../../types';

export const IDebugSessionEventHandlers = Symbol('IDebugSessionEventHandlers');
export interface IDebugSessionEventHandlers {
    handleCustomEvent?(e: DebugSessionCustomEvent): Promise<void>;
    handleTerminateEvent?(e: DebugSession): Promise<void>;
}

export const IChildProcessAttachService = Symbol('IChildProcessAttachService');
export interface IChildProcessAttachService {
    attach(data: AttachRequestArguments & DebugConfiguration, parentSession: DebugSession): Promise<void>;
}
