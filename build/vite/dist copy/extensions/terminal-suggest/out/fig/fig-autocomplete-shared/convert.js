"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertSubcommand = convertSubcommand;
const utils_1 = require("./utils");
const makeNamedMap = (items) => {
    const nameMapping = {};
    if (!items) {
        return nameMapping;
    }
    for (let i = 0; i < items.length; i += 1) {
        items[i].name.forEach((name) => {
            nameMapping[name] = items[i];
        });
    }
    return nameMapping;
};
function convertOption(option, initialize) {
    return {
        ...initialize.option(option),
        name: (0, utils_1.makeArray)(option.name),
        args: option.args ? (0, utils_1.makeArray)(option.args).map(initialize.arg) : [],
    };
}
function convertSubcommand(subcommand, initialize) {
    const { subcommands, options, args } = subcommand;
    return {
        ...initialize.subcommand(subcommand),
        name: (0, utils_1.makeArray)(subcommand.name),
        subcommands: makeNamedMap(subcommands?.map((s) => convertSubcommand(s, initialize))),
        options: makeNamedMap(options
            ?.filter((option) => !option.isPersistent)
            ?.map((option) => convertOption(option, initialize))),
        persistentOptions: makeNamedMap(options
            ?.filter((option) => option.isPersistent)
            ?.map((option) => convertOption(option, initialize))),
        args: args ? (0, utils_1.makeArray)(args).map(initialize.arg) : [],
    };
}
//# sourceMappingURL=convert.js.map