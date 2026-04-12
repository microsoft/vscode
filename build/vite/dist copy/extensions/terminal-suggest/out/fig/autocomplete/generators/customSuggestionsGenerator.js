"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomSuggestions = getCustomSuggestions;
const helpers_1 = require("./helpers");
async function getCustomSuggestions(generator, context, executableExternals) {
    if (!generator.custom) {
        return [];
    }
    if (!(0, helpers_1.haveContextForGenerator)(context)) {
        console.info('Don\'t have context for custom generator');
        return [];
    }
    const { tokenArray, currentWorkingDirectory, currentProcess, isDangerous, searchTerm, environmentVariables, } = context;
    try {
        const result = await (0, helpers_1.runCachedGenerator)(generator, context, () => generator.custom(tokenArray, executableExternals.executeCommand, {
            currentWorkingDirectory,
            currentProcess,
            sshPrefix: '',
            searchTerm,
            environmentVariables,
            isDangerous,
        }), generator.cache?.cacheKey);
        return result?.map((name) => ({ ...name, type: name?.type || 'arg' }));
    }
    catch (e) {
        console.error('we had an error with the custom function generator', e);
        return [];
    }
}
//# sourceMappingURL=customSuggestionsGenerator.js.map