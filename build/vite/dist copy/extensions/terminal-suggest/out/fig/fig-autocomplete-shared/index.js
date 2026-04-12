"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpecLocationSource = exports.makeArray = exports.mergeSubcommands = exports.applyMixin = exports.initializeDefault = exports.convertLoadSpec = exports.convertSubcommand = exports.revertSubcommand = void 0;
const revert_1 = require("./revert");
Object.defineProperty(exports, "revertSubcommand", { enumerable: true, get: function () { return revert_1.revertSubcommand; } });
const convert_1 = require("./convert");
Object.defineProperty(exports, "convertSubcommand", { enumerable: true, get: function () { return convert_1.convertSubcommand; } });
const specMetadata_1 = require("./specMetadata");
Object.defineProperty(exports, "convertLoadSpec", { enumerable: true, get: function () { return specMetadata_1.convertLoadSpec; } });
Object.defineProperty(exports, "initializeDefault", { enumerable: true, get: function () { return specMetadata_1.initializeDefault; } });
const mixins_1 = require("./mixins");
Object.defineProperty(exports, "applyMixin", { enumerable: true, get: function () { return mixins_1.applyMixin; } });
Object.defineProperty(exports, "mergeSubcommands", { enumerable: true, get: function () { return mixins_1.mergeSubcommands; } });
const utils_1 = require("./utils");
Object.defineProperty(exports, "SpecLocationSource", { enumerable: true, get: function () { return utils_1.SpecLocationSource; } });
Object.defineProperty(exports, "makeArray", { enumerable: true, get: function () { return utils_1.makeArray; } });
//# sourceMappingURL=index.js.map