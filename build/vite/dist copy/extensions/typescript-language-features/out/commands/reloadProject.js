"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReloadJavaScriptProjectsCommand = exports.ReloadTypeScriptProjectsCommand = void 0;
class ReloadTypeScriptProjectsCommand {
    lazyClientHost;
    id = 'typescript.reloadProjects';
    constructor(lazyClientHost) {
        this.lazyClientHost = lazyClientHost;
    }
    execute() {
        this.lazyClientHost.value.reloadProjects();
    }
}
exports.ReloadTypeScriptProjectsCommand = ReloadTypeScriptProjectsCommand;
class ReloadJavaScriptProjectsCommand {
    lazyClientHost;
    id = 'javascript.reloadProjects';
    constructor(lazyClientHost) {
        this.lazyClientHost = lazyClientHost;
    }
    execute() {
        this.lazyClientHost.value.reloadProjects();
    }
}
exports.ReloadJavaScriptProjectsCommand = ReloadJavaScriptProjectsCommand;
//# sourceMappingURL=reloadProject.js.map