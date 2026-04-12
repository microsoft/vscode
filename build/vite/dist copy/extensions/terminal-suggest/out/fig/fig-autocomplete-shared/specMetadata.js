"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDefault = void 0;
exports.convertLoadSpec = convertLoadSpec;
const convert_1 = require("./convert");
const utils_1 = require("./utils");
function convertLoadSpec(loadSpec, initialize) {
    if (typeof loadSpec === 'string') {
        return [{ name: loadSpec, type: utils_1.SpecLocationSource.GLOBAL }];
    }
    if (typeof loadSpec === 'function') {
        return (...args) => loadSpec(...args).then((result) => {
            if (Array.isArray(result)) {
                return result;
            }
            if (Object.hasOwn(result, 'type')) {
                return [result];
            }
            return (0, convert_1.convertSubcommand)(result, initialize);
        });
    }
    return (0, convert_1.convertSubcommand)(loadSpec, initialize);
}
function initializeOptionMeta(option) {
    return option;
}
// Default initialization functions:
function initializeArgMeta(arg) {
    const { template, ...rest } = arg;
    const generators = template ? [{ template }] : (0, utils_1.makeArray)(arg.generators ?? []);
    return {
        ...rest,
        loadSpec: arg.loadSpec
            ? convertLoadSpec(arg.loadSpec, {
                option: initializeOptionMeta,
                subcommand: initializeSubcommandMeta,
                arg: initializeArgMeta,
            })
            : undefined,
        generators: generators.map((generator) => {
            let { trigger, getQueryTerm } = generator;
            if (generator.template) {
                const templates = (0, utils_1.makeArray)(generator.template);
                if (templates.includes('folders') || templates.includes('filepaths')) {
                    trigger = trigger ?? '/';
                    getQueryTerm = getQueryTerm ?? '/';
                }
            }
            return { ...generator, trigger, getQueryTerm };
        }),
    };
}
function initializeSubcommandMeta(subcommand) {
    return {
        ...subcommand,
        loadSpec: subcommand.loadSpec
            ? convertLoadSpec(subcommand.loadSpec, {
                subcommand: initializeSubcommandMeta,
                option: initializeOptionMeta,
                arg: initializeArgMeta,
            })
            : undefined,
    };
}
exports.initializeDefault = {
    subcommand: initializeSubcommandMeta,
    option: initializeOptionMeta,
    arg: initializeArgMeta,
};
//# sourceMappingURL=specMetadata.js.map