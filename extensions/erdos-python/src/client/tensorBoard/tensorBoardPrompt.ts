// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { IPersistentState, IPersistentStateFactory } from '../common/types';

enum TensorBoardPromptStateKeys {
    ShowNativeTensorBoardPrompt = 'showNativeTensorBoardPrompt',
}

@injectable()
export class TensorBoardPrompt {
    private state: IPersistentState<boolean>;

    constructor(@inject(IPersistentStateFactory) private persistentStateFactory: IPersistentStateFactory) {
        this.state = this.persistentStateFactory.createWorkspacePersistentState<boolean>(
            TensorBoardPromptStateKeys.ShowNativeTensorBoardPrompt,
            true,
        );
    }

    public isPromptEnabled(): boolean {
        return this.state.value;
    }
}
