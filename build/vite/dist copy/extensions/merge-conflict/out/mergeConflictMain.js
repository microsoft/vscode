"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const services_1 = __importDefault(require("./services"));
function activate(context) {
    // Register disposables
    const services = new services_1.default(context);
    services.begin();
    context.subscriptions.push(services);
}
function deactivate() {
}
//# sourceMappingURL=mergeConflictMain.js.map