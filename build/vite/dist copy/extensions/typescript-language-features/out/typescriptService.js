"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientCapabilities = exports.ClientCapability = exports.ServerResponse = exports.ServerType = void 0;
var ServerType;
(function (ServerType) {
    ServerType["Syntax"] = "syntax";
    ServerType["Semantic"] = "semantic";
})(ServerType || (exports.ServerType = ServerType = {}));
var ServerResponse;
(function (ServerResponse) {
    class Cancelled {
        reason;
        type = 'cancelled';
        constructor(reason) {
            this.reason = reason;
        }
    }
    ServerResponse.Cancelled = Cancelled;
    ServerResponse.NoContent = { type: 'noContent' };
    ServerResponse.NoServer = { type: 'noServer' };
})(ServerResponse || (exports.ServerResponse = ServerResponse = {}));
var ClientCapability;
(function (ClientCapability) {
    /**
     * Basic syntax server. All clients should support this.
     */
    ClientCapability[ClientCapability["Syntax"] = 0] = "Syntax";
    /**
     * Advanced syntax server that can provide single file IntelliSense.
     */
    ClientCapability[ClientCapability["EnhancedSyntax"] = 1] = "EnhancedSyntax";
    /**
     * Complete, multi-file semantic server
     */
    ClientCapability[ClientCapability["Semantic"] = 2] = "Semantic";
})(ClientCapability || (exports.ClientCapability = ClientCapability = {}));
class ClientCapabilities {
    capabilities;
    constructor(...capabilities) {
        this.capabilities = new Set(capabilities);
    }
    has(capability) {
        return this.capabilities.has(capability);
    }
}
exports.ClientCapabilities = ClientCapabilities;
//# sourceMappingURL=typescriptService.js.map