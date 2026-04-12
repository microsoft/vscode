"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShowLockedPreviewToSideCommand = exports.ShowPreviewToSideCommand = exports.ShowPreviewCommand = void 0;
const vscode = __importStar(require("vscode"));
async function showPreview(webviewManager, telemetryReporter, uri, previewSettings) {
    let resource = uri;
    if (!(resource instanceof vscode.Uri)) {
        if (vscode.window.activeTextEditor) {
            // we are relaxed and don't check for markdown files
            resource = vscode.window.activeTextEditor.document.uri;
        }
    }
    if (!(resource instanceof vscode.Uri)) {
        if (!vscode.window.activeTextEditor) {
            // this is most likely toggling the preview
            return vscode.commands.executeCommand('markdown.showSource');
        }
        // nothing found that could be shown or toggled
        return;
    }
    const resourceColumn = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;
    webviewManager.openDynamicPreview(resource, {
        resourceColumn: resourceColumn,
        previewColumn: previewSettings.sideBySide ? vscode.ViewColumn.Beside : resourceColumn,
        locked: !!previewSettings.locked
    });
    telemetryReporter.sendTelemetryEvent('openPreview', {
        where: previewSettings.sideBySide ? 'sideBySide' : 'inPlace',
        how: (uri instanceof vscode.Uri) ? 'action' : 'pallete'
    });
}
class ShowPreviewCommand {
    id = 'markdown.showPreview';
    #webviewManager;
    #telemetryReporter;
    constructor(webviewManager, telemetryReporter) {
        this.#webviewManager = webviewManager;
        this.#telemetryReporter = telemetryReporter;
    }
    execute(mainUri, allUris, previewSettings) {
        for (const uri of Array.isArray(allUris) ? allUris : [mainUri]) {
            showPreview(this.#webviewManager, this.#telemetryReporter, uri, {
                sideBySide: false,
                locked: previewSettings?.locked
            });
        }
    }
}
exports.ShowPreviewCommand = ShowPreviewCommand;
class ShowPreviewToSideCommand {
    id = 'markdown.showPreviewToSide';
    #webviewManager;
    #telemetryReporter;
    constructor(webviewManager, telemetryReporter) {
        this.#webviewManager = webviewManager;
        this.#telemetryReporter = telemetryReporter;
    }
    execute(uri, previewSettings) {
        showPreview(this.#webviewManager, this.#telemetryReporter, uri, {
            sideBySide: true,
            locked: previewSettings?.locked
        });
    }
}
exports.ShowPreviewToSideCommand = ShowPreviewToSideCommand;
class ShowLockedPreviewToSideCommand {
    id = 'markdown.showLockedPreviewToSide';
    #webviewManager;
    #telemetryReporter;
    constructor(webviewManager, telemetryReporter) {
        this.#webviewManager = webviewManager;
        this.#telemetryReporter = telemetryReporter;
    }
    execute(uri) {
        showPreview(this.#webviewManager, this.#telemetryReporter, uri, {
            sideBySide: true,
            locked: true
        });
    }
}
exports.ShowLockedPreviewToSideCommand = ShowLockedPreviewToSideCommand;
//# sourceMappingURL=showPreview.js.map