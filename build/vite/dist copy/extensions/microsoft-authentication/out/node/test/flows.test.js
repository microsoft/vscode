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
const assert = __importStar(require("assert"));
const flows_1 = require("../flows");
suite('getMsalFlows', () => {
    test('should return all flows for local extension host with supported client and no broker', () => {
        const query = {
            extensionHost: 1 /* ExtensionHost.Local */,
            supportedClient: true,
            isBrokerSupported: false,
            isPortableMode: false
        };
        const flows = (0, flows_1.getMsalFlows)(query);
        assert.strictEqual(flows.length, 3);
        assert.strictEqual(flows[0].label, 'default');
        assert.strictEqual(flows[1].label, 'protocol handler');
        assert.strictEqual(flows[2].label, 'device code');
    });
    test('should return only default flow for local extension host with supported client and broker', () => {
        const query = {
            extensionHost: 1 /* ExtensionHost.Local */,
            supportedClient: true,
            isBrokerSupported: true,
            isPortableMode: false
        };
        const flows = (0, flows_1.getMsalFlows)(query);
        assert.strictEqual(flows.length, 1);
        assert.strictEqual(flows[0].label, 'default');
    });
    test('should return protocol handler and device code flows for remote extension host with supported client and no broker', () => {
        const query = {
            extensionHost: 0 /* ExtensionHost.Remote */,
            supportedClient: true,
            isBrokerSupported: false,
            isPortableMode: false
        };
        const flows = (0, flows_1.getMsalFlows)(query);
        assert.strictEqual(flows.length, 2);
        assert.strictEqual(flows[0].label, 'protocol handler');
        assert.strictEqual(flows[1].label, 'device code');
    });
    test('should return only default and device code flows for local extension host with unsupported client and no broker', () => {
        const query = {
            extensionHost: 1 /* ExtensionHost.Local */,
            supportedClient: false,
            isBrokerSupported: false,
            isPortableMode: false
        };
        const flows = (0, flows_1.getMsalFlows)(query);
        assert.strictEqual(flows.length, 2);
        assert.strictEqual(flows[0].label, 'default');
        assert.strictEqual(flows[1].label, 'device code');
    });
    test('should return only device code flow for remote extension host with unsupported client and no broker', () => {
        const query = {
            extensionHost: 0 /* ExtensionHost.Remote */,
            supportedClient: false,
            isBrokerSupported: false,
            isPortableMode: false
        };
        const flows = (0, flows_1.getMsalFlows)(query);
        assert.strictEqual(flows.length, 1);
        assert.strictEqual(flows[0].label, 'device code');
    });
    test('should return default flow for local extension host with unsupported client and broker', () => {
        const query = {
            extensionHost: 1 /* ExtensionHost.Local */,
            supportedClient: false,
            isBrokerSupported: true,
            isPortableMode: false
        };
        const flows = (0, flows_1.getMsalFlows)(query);
        assert.strictEqual(flows.length, 1);
        assert.strictEqual(flows[0].label, 'default');
    });
    test('should exclude protocol handler flow in portable mode', () => {
        const query = {
            extensionHost: 1 /* ExtensionHost.Local */,
            supportedClient: true,
            isBrokerSupported: false,
            isPortableMode: true
        };
        const flows = (0, flows_1.getMsalFlows)(query);
        assert.strictEqual(flows.length, 2);
        assert.strictEqual(flows[0].label, 'default');
        assert.strictEqual(flows[1].label, 'device code');
    });
});
//# sourceMappingURL=flows.test.js.map