"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.revertSubcommand = revertSubcommand;
function makeSingleOrArray(arr) {
    return arr.length === 1 ? arr[0] : arr;
}
function revertOption(option) {
    const { name, args } = option;
    return {
        name: makeSingleOrArray(name),
        args,
    };
}
function revertSubcommand(subcommand, postProcessingFn) {
    const { name, subcommands, options, persistentOptions, args } = subcommand;
    const newSubcommand = {
        name: makeSingleOrArray(name),
        subcommands: Object.values(subcommands).length !== 0
            ? Object.values(subcommands).map((sub) => revertSubcommand(sub, postProcessingFn))
            : undefined,
        options: Object.values(options).length !== 0
            ? [
                ...Object.values(options).map((option) => revertOption(option)),
                ...Object.values(persistentOptions).map((option) => revertOption(option)),
            ]
            : undefined,
        args: Object.values(args).length !== 0 ? makeSingleOrArray(Object.values(args)) : undefined,
    };
    return postProcessingFn(subcommand, newSubcommand);
}
//# sourceMappingURL=revert.js.map