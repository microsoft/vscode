// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, multiInject } from 'inversify';
import { IDebugService } from '../../../common/application/types';
import { IDisposableRegistry } from '../../../common/types';
import { IDebugSessionEventHandlers } from './types';

export class DebugSessionEventDispatcher {
    constructor(
        @multiInject(IDebugSessionEventHandlers) private readonly eventHandlers: IDebugSessionEventHandlers[],
        @inject(IDebugService) private readonly debugService: IDebugService,
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
    ) {}
    public registerEventHandlers() {
        this.disposables.push(
            this.debugService.onDidReceiveDebugSessionCustomEvent((e) => {
                this.eventHandlers.forEach((handler) =>
                    handler.handleCustomEvent ? handler.handleCustomEvent(e).ignoreErrors() : undefined,
                );
            }),
        );
        this.disposables.push(
            this.debugService.onDidTerminateDebugSession((e) => {
                this.eventHandlers.forEach((handler) =>
                    handler.handleTerminateEvent ? handler.handleTerminateEvent(e).ignoreErrors() : undefined,
                );
            }),
        );
    }
}
