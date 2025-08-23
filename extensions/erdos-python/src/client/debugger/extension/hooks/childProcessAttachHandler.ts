// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { DebugConfiguration, DebugSessionCustomEvent } from 'vscode';
import { swallowExceptions } from '../../../common/utils/decorators';
import { AttachRequestArguments } from '../../types';
import { DebuggerEvents } from './constants';
import { IChildProcessAttachService, IDebugSessionEventHandlers } from './types';
import { DebuggerTypeName } from '../../constants';

/**
 * This class is responsible for automatically attaching the debugger to any
 * child processes launched. I.e. this is the class responsible for multi-proc debugging.
 */
@injectable()
export class ChildProcessAttachEventHandler implements IDebugSessionEventHandlers {
    constructor(
        @inject(IChildProcessAttachService) private readonly childProcessAttachService: IChildProcessAttachService,
    ) {}

    @swallowExceptions('Handle child process launch')
    public async handleCustomEvent(event: DebugSessionCustomEvent): Promise<void> {
        if (!event || event.session.configuration.type !== DebuggerTypeName) {
            return;
        }

        let data: AttachRequestArguments & DebugConfiguration;
        if (
            event.event === DebuggerEvents.PtvsdAttachToSubprocess ||
            event.event === DebuggerEvents.DebugpyAttachToSubprocess
        ) {
            data = event.body as AttachRequestArguments & DebugConfiguration;
        } else {
            return;
        }

        if (Object.keys(data).length > 0) {
            await this.childProcessAttachService.attach(data, event.session);
        }
    }
}
