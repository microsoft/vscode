"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestartTsServerCommand = void 0;
class RestartTsServerCommand {
    lazyClientHost;
    id = 'typescript.restartTsServer';
    constructor(lazyClientHost) {
        this.lazyClientHost = lazyClientHost;
    }
    execute() {
        this.lazyClientHost.value.serviceClient.restartTsServer(true);
    }
}
exports.RestartTsServerCommand = RestartTsServerCommand;
//# sourceMappingURL=restartTsServer.js.map