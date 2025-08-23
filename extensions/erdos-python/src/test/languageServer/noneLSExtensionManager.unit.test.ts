// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import { NoneLSExtensionManager } from '../../client/languageServer/noneLSExtensionManager';

suite('Language Server - No LS extension manager', () => {
    let manager: NoneLSExtensionManager;

    setup(() => {
        manager = new NoneLSExtensionManager();
    });

    test('canStartLanguageServer should return true', () => {
        const result = manager.canStartLanguageServer();

        assert.strictEqual(result, true);
    });
});
