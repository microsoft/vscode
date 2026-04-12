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
const l10n = __importStar(require("@vscode/l10n"));
let initialized = false;
const pendingMessages = [];
const messageHandler = async (e) => {
    if (!initialized) {
        const l10nLog = [];
        initialized = true;
        const i10lLocation = e.data.i10lLocation;
        if (i10lLocation) {
            try {
                await l10n.config({ uri: i10lLocation });
                l10nLog.push(`l10n: Configured to ${i10lLocation.toString()}.`);
            }
            catch (e) {
                l10nLog.push(`l10n: Problems loading ${i10lLocation.toString()} : ${e}.`);
            }
        }
        else {
            l10nLog.push(`l10n: No bundle configured.`);
        }
        await import('./jsonServerMain.js');
        if (self.onmessage !== messageHandler) {
            pendingMessages.forEach(msg => self.onmessage?.(msg));
            pendingMessages.length = 0;
        }
        l10nLog.forEach(console.log);
    }
    else {
        pendingMessages.push(e);
    }
};
self.onmessage = messageHandler;
//# sourceMappingURL=jsonServerWorkerMain.js.map