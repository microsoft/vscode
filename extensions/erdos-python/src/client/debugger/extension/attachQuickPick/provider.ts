// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { l10n } from 'vscode';
import { IPlatformService } from '../../../common/platform/types';
import { IProcessServiceFactory } from '../../../common/process/types';
import { PsProcessParser } from './psProcessParser';
import { IAttachItem, IAttachProcessProvider, ProcessListCommand } from './types';
import { WmicProcessParser } from './wmicProcessParser';

@injectable()
export class AttachProcessProvider implements IAttachProcessProvider {
    constructor(
        @inject(IPlatformService) private readonly platformService: IPlatformService,
        @inject(IProcessServiceFactory) private readonly processServiceFactory: IProcessServiceFactory,
    ) {}

    public getAttachItems(): Promise<IAttachItem[]> {
        return this._getInternalProcessEntries().then((processEntries) => {
            processEntries.sort(
                (
                    { processName: aprocessName, commandLine: aCommandLine },
                    { processName: bProcessName, commandLine: bCommandLine },
                ) => {
                    const compare = (aString: string, bString: string): number => {
                        // localeCompare is significantly slower than < and > (2000 ms vs 80 ms for 10,000 elements)
                        // We can change to localeCompare if this becomes an issue
                        const aLower = aString.toLowerCase();
                        const bLower = bString.toLowerCase();

                        if (aLower === bLower) {
                            return 0;
                        }

                        return aLower < bLower ? -1 : 1;
                    };

                    const aPython = aprocessName.startsWith('python');
                    const bPython = bProcessName.startsWith('python');

                    if (aPython || bPython) {
                        if (aPython && !bPython) {
                            return -1;
                        }
                        if (bPython && !aPython) {
                            return 1;
                        }

                        return aPython ? compare(aCommandLine!, bCommandLine!) : compare(bCommandLine!, aCommandLine!);
                    }

                    return compare(aprocessName, bProcessName);
                },
            );

            return processEntries;
        });
    }

    public async _getInternalProcessEntries(): Promise<IAttachItem[]> {
        let processCmd: ProcessListCommand;
        if (this.platformService.isMac) {
            processCmd = PsProcessParser.psDarwinCommand;
        } else if (this.platformService.isLinux) {
            processCmd = PsProcessParser.psLinuxCommand;
        } else if (this.platformService.isWindows) {
            processCmd = WmicProcessParser.wmicCommand;
        } else {
            throw new Error(l10n.t("Operating system '{0}' not supported.", this.platformService.osType));
        }

        const processService = await this.processServiceFactory.create();
        const output = await processService.exec(processCmd.command, processCmd.args, { throwOnStdErr: true });

        return this.platformService.isWindows
            ? WmicProcessParser.parseProcesses(output.stdout)
            : PsProcessParser.parseProcesses(output.stdout);
    }
}
