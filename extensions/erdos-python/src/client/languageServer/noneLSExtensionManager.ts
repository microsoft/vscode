// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/* eslint-disable class-methods-use-this */

import { ILanguageServerExtensionManager } from './types';

// This LS manager implements ILanguageServer directly
// instead of extending LanguageServerCapabilities because it doesn't need to do anything.
export class NoneLSExtensionManager implements ILanguageServerExtensionManager {
    dispose(): void {
        // Nothing to do here.
    }

    startLanguageServer(): Promise<void> {
        return Promise.resolve();
    }

    stopLanguageServer(): Promise<void> {
        return Promise.resolve();
    }

    canStartLanguageServer(): boolean {
        return true;
    }

    languageServerNotAvailable(): Promise<void> {
        // Nothing to do here.
        return Promise.resolve();
    }
}
