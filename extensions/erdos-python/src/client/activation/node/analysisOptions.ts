// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { LanguageClientOptions } from 'vscode-languageclient';
import { IWorkspaceService } from '../../common/application/types';

import { LanguageServerAnalysisOptionsBase } from '../common/analysisOptions';
import { ILanguageServerOutputChannel } from '../types';

export class NodeLanguageServerAnalysisOptions extends LanguageServerAnalysisOptionsBase {
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(lsOutputChannel: ILanguageServerOutputChannel, workspace: IWorkspaceService) {
        super(lsOutputChannel, workspace);
    }

    protected getConfigSectionsToSynchronize(): string[] {
        return [...super.getConfigSectionsToSynchronize(), 'jupyter.runStartupCommands'];
    }

    // eslint-disable-next-line class-methods-use-this
    protected async getInitializationOptions(): Promise<LanguageClientOptions> {
        return ({
            experimentationSupport: true,
            trustedWorkspaceSupport: true,
        } as unknown) as LanguageClientOptions;
    }
}
