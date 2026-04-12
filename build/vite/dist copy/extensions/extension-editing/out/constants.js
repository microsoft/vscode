"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.redundantImplicitActivationEvent = exports.implicitActivationEvent = void 0;
const vscode_1 = require("vscode");
exports.implicitActivationEvent = vscode_1.l10n.t("This activation event cannot be explicitly listed by your extension.");
exports.redundantImplicitActivationEvent = vscode_1.l10n.t("This activation event can be removed as VS Code generates these automatically from your package.json contribution declarations.");
//# sourceMappingURL=constants.js.map