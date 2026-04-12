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
require("mocha");
const vscode = __importStar(require("vscode"));
const copyFiles_1 = require("../languageFeatures/copyFiles/copyFiles");
suite('resolveCopyDestination', () => {
    test('Relative destinations should resolve next to document', async () => {
        const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
        {
            const dest = (0, copyFiles_1.resolveCopyDestination)(documentUri, 'img.png', '${fileName}', () => vscode.Uri.parse('test://projects/project/'));
            assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.png');
        }
        {
            const dest = (0, copyFiles_1.resolveCopyDestination)(documentUri, 'img.png', './${fileName}', () => vscode.Uri.parse('test://projects/project/'));
            assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.png');
        }
        {
            const dest = (0, copyFiles_1.resolveCopyDestination)(documentUri, 'img.png', '../${fileName}', () => vscode.Uri.parse('test://projects/project/'));
            assert.strictEqual(dest.toString(), 'test://projects/project/img.png');
        }
    });
    test('Destination starting with / should go to workspace root', async () => {
        const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
        const dest = (0, copyFiles_1.resolveCopyDestination)(documentUri, 'img.png', '/${fileName}', () => vscode.Uri.parse('test://projects/project/'));
        assert.strictEqual(dest.toString(), 'test://projects/project/img.png');
    });
    test('If there is no workspace root, / should resolve to document dir', async () => {
        const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
        const dest = (0, copyFiles_1.resolveCopyDestination)(documentUri, 'img.png', '/${fileName}', () => undefined);
        assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.png');
    });
    test('If path ends in /, we should automatically add the fileName', async () => {
        {
            const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
            const dest = (0, copyFiles_1.resolveCopyDestination)(documentUri, 'img.png', 'images/', () => vscode.Uri.parse('test://projects/project/'));
            assert.strictEqual(dest.toString(), 'test://projects/project/sub/images/img.png');
        }
        {
            const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
            const dest = (0, copyFiles_1.resolveCopyDestination)(documentUri, 'img.png', './', () => vscode.Uri.parse('test://projects/project/'));
            assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.png');
        }
        {
            const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
            const dest = (0, copyFiles_1.resolveCopyDestination)(documentUri, 'img.png', '/', () => vscode.Uri.parse('test://projects/project/'));
            assert.strictEqual(dest.toString(), 'test://projects/project/img.png');
        }
    });
    test('Basic transform', async () => {
        const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
        const dest = (0, copyFiles_1.resolveCopyDestination)(documentUri, 'img.png', '${fileName/.png/.gif/}', () => undefined);
        assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.gif');
    });
    test('Transforms should support capture groups', async () => {
        const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
        const dest = (0, copyFiles_1.resolveCopyDestination)(documentUri, 'img.png', '${fileName/(.+)\\.(.+)/$2.$1/}', () => undefined);
        assert.strictEqual(dest.toString(), 'test://projects/project/sub/png.img');
    });
    test('Should support escaping snippet variables ', async () => {
        const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
        // Escape leading '$'
        assert.strictEqual((0, copyFiles_1.resolveCopyDestination)(documentUri, 'img.png', '\\${fileName}', () => undefined).toString(true), 'test://projects/project/sub/${fileName}');
        // Escape closing '}'
        assert.strictEqual((0, copyFiles_1.resolveCopyDestination)(documentUri, 'img.png', '${fileName\\}', () => undefined).toString(true), 'test://projects/project/sub/${fileName\\}');
    });
    test('Transforms should support escaped slashes', async () => {
        const documentUri = vscode.Uri.parse('test://projects/project/sub/readme.md');
        const dest = (0, copyFiles_1.resolveCopyDestination)(documentUri, 'img.png', '${fileName/(.+)/x\\/y/}.${fileExtName}', () => undefined);
        assert.strictEqual(dest.toString(), 'test://projects/project/sub/x/y.png');
    });
});
//# sourceMappingURL=copyFile.test.js.map