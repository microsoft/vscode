"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelectTypeScriptVersionCommand = void 0;
class SelectTypeScriptVersionCommand {
    lazyClientHost;
    static id = 'typescript.selectTypeScriptVersion';
    id = SelectTypeScriptVersionCommand.id;
    constructor(lazyClientHost) {
        this.lazyClientHost = lazyClientHost;
    }
    execute() {
        this.lazyClientHost.value.serviceClient.showVersionPicker();
    }
}
exports.SelectTypeScriptVersionCommand = SelectTypeScriptVersionCommand;
//# sourceMappingURL=selectTypeScriptVersion.js.map