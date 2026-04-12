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
exports.API = void 0;
const semver = __importStar(require("semver"));
const vscode = __importStar(require("vscode"));
class API {
    displayName;
    version;
    fullVersionString;
    static fromSimpleString(value) {
        return new API(value, value, value);
    }
    static defaultVersion = API.fromSimpleString('1.0.0');
    static v380 = API.fromSimpleString('3.8.0');
    static v390 = API.fromSimpleString('3.9.0');
    static v400 = API.fromSimpleString('4.0.0');
    static v401 = API.fromSimpleString('4.0.1');
    static v420 = API.fromSimpleString('4.2.0');
    static v430 = API.fromSimpleString('4.3.0');
    static v440 = API.fromSimpleString('4.4.0');
    static v460 = API.fromSimpleString('4.6.0');
    static v470 = API.fromSimpleString('4.7.0');
    static v490 = API.fromSimpleString('4.9.0');
    static v500 = API.fromSimpleString('5.0.0');
    static v510 = API.fromSimpleString('5.1.0');
    static v520 = API.fromSimpleString('5.2.0');
    static v544 = API.fromSimpleString('5.4.4');
    static v540 = API.fromSimpleString('5.4.0');
    static v560 = API.fromSimpleString('5.6.0');
    static v570 = API.fromSimpleString('5.7.0');
    static v590 = API.fromSimpleString('5.9.0');
    static fromVersionString(versionString) {
        let version = semver.valid(versionString);
        if (!version) {
            return new API(vscode.l10n.t("invalid version"), '1.0.0', '1.0.0');
        }
        // Cut off any prerelease tag since we sometimes consume those on purpose.
        const index = versionString.indexOf('-');
        if (index >= 0) {
            version = version.substr(0, index);
        }
        return new API(versionString, version, versionString);
    }
    constructor(
    /**
     * Human readable string for the current version. Displayed in the UI
     */
    displayName, 
    /**
     * Semver version, e.g. '3.9.0'
     */
    version, 
    /**
     * Full version string including pre-release tags, e.g. '3.9.0-beta'
     */
    fullVersionString) {
        this.displayName = displayName;
        this.version = version;
        this.fullVersionString = fullVersionString;
    }
    eq(other) {
        return semver.eq(this.version, other.version);
    }
    gte(other) {
        return semver.gte(this.version, other.version);
    }
    lt(other) {
        return !this.gte(other);
    }
    isYarnPnp() {
        return this.fullVersionString.includes('-sdk');
    }
}
exports.API = API;
//# sourceMappingURL=api.js.map