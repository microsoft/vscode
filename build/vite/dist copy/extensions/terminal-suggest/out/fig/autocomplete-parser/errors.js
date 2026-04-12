"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateStateError = exports.ParseArgumentsError = exports.ParsingHistoryError = exports.SpecCDNError = exports.LoadLocalSpecError = exports.DisabledSpecError = exports.WrongDiffVersionedSpecError = exports.MissingSpecError = void 0;
const errors_1 = require("../shared/errors");
// LoadSpecErrors
exports.MissingSpecError = (0, errors_1.createErrorInstance)('MissingSpecError');
exports.WrongDiffVersionedSpecError = (0, errors_1.createErrorInstance)('WrongDiffVersionedSpecError');
exports.DisabledSpecError = (0, errors_1.createErrorInstance)('DisabledSpecError');
exports.LoadLocalSpecError = (0, errors_1.createErrorInstance)('LoadLocalSpecError');
exports.SpecCDNError = (0, errors_1.createErrorInstance)('SpecCDNError');
// ParsingErrors
exports.ParsingHistoryError = (0, errors_1.createErrorInstance)('ParsingHistoryError');
exports.ParseArgumentsError = (0, errors_1.createErrorInstance)('ParseArgumentsError');
exports.UpdateStateError = (0, errors_1.createErrorInstance)('UpdateStateError');
//# sourceMappingURL=errors.js.map