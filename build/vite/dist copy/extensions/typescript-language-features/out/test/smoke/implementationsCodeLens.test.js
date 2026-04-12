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
const vscode = __importStar(require("vscode"));
const dispose_1 = require("../../utils/dispose");
const testUtils_1 = require("../testUtils");
const referencesCodeLens_test_1 = require("./referencesCodeLens.test");
const Config = {
    referencesCodeLens: 'typescript.referencesCodeLens.enabled',
    implementationsCodeLens: 'typescript.implementationsCodeLens.enabled',
    showOnAllClassMethods: 'typescript.implementationsCodeLens.showOnAllClassMethods',
};
function getCodeLenses(doc) {
    return vscode.commands.executeCommand('vscode.executeCodeLensProvider', doc.uri);
}
suite('TypeScript Implementations CodeLens', () => {
    const configDefaults = Object.freeze({
        [Config.referencesCodeLens]: false,
        [Config.implementationsCodeLens]: true,
        [Config.showOnAllClassMethods]: false,
    });
    const _disposables = [];
    let oldConfig = {};
    setup(async () => {
        // the tests assume that typescript features are registered
        await vscode.extensions.getExtension('vscode.typescript-language-features').activate();
        // Save off config and apply defaults
        oldConfig = await (0, referencesCodeLens_test_1.updateConfig)(configDefaults);
    });
    teardown(async () => {
        (0, dispose_1.disposeAll)(_disposables);
        // Restore config
        await (0, referencesCodeLens_test_1.updateConfig)(oldConfig);
        return vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });
    test('Should show on interfaces and abstract classes', async () => {
        await (0, testUtils_1.withRandomFileEditor)((0, testUtils_1.joinLines)('interface IFoo {}', 'class Foo implements IFoo {}', 'abstract class AbstractBase {}', 'class Concrete extends AbstractBase {}'), 'ts', async (_editor, doc) => {
            const lenses = await getCodeLenses(doc);
            assert.strictEqual(lenses?.length, 2);
            assert.strictEqual(lenses?.[0].range.start.line, 0, 'Expected interface IFoo to have a CodeLens');
            assert.strictEqual(lenses?.[1].range.start.line, 2, 'Expected abstract class AbstractBase to have a CodeLens');
        });
    });
    test('Should show on abstract methods, properties, and getters', async () => {
        await (0, testUtils_1.withRandomFileEditor)((0, testUtils_1.joinLines)('abstract class Base {', '    abstract method(): void;', '    abstract property: string;', '    abstract get getter(): number;', '}', 'class Derived extends Base {', '    method() {}', '    property = "test";', '    get getter() { return 42; }', '}'), 'ts', async (_editor, doc) => {
            const lenses = await getCodeLenses(doc);
            assert.strictEqual(lenses?.length, 4);
            assert.strictEqual(lenses?.[0].range.start.line, 0, 'Expected abstract class to have a CodeLens');
            assert.strictEqual(lenses?.[1].range.start.line, 1, 'Expected abstract method to have a CodeLens');
            assert.strictEqual(lenses?.[2].range.start.line, 2, 'Expected abstract property to have a CodeLens');
            assert.strictEqual(lenses?.[3].range.start.line, 3, 'Expected abstract getter to have a CodeLens');
        });
    });
    test('Should not show implementations on methods by default', async () => {
        await (0, testUtils_1.withRandomFileEditor)((0, testUtils_1.joinLines)('abstract class A {', '    foo() {}', '}', 'class B extends A {', '    foo() {}', '}'), 'ts', async (_editor, doc) => {
            const lenses = await getCodeLenses(doc);
            assert.strictEqual(lenses?.length, 1);
        });
    });
    test('should show on all methods when showOnAllClassMethods is enabled', async () => {
        await (0, referencesCodeLens_test_1.updateConfig)({
            [Config.showOnAllClassMethods]: true
        });
        await (0, testUtils_1.withRandomFileEditor)((0, testUtils_1.joinLines)('abstract class A {', '    foo() {}', '}', 'class B extends A {', '    foo() {}', '}'), 'ts', async (_editor, doc) => {
            const lenses = await getCodeLenses(doc);
            assert.strictEqual(lenses?.length, 3);
            assert.strictEqual(lenses?.[0].range.start.line, 0, 'Expected class A to have a CodeLens');
            assert.strictEqual(lenses?.[1].range.start.line, 1, 'Expected method A.foo to have a CodeLens');
            assert.strictEqual(lenses?.[2].range.start.line, 4, 'Expected method B.foo to have a CodeLens');
        });
    });
    test('should not show on private methods when showOnAllClassMethods is enabled', async () => {
        await (0, referencesCodeLens_test_1.updateConfig)({
            [Config.showOnAllClassMethods]: true
        });
        await (0, testUtils_1.withRandomFileEditor)((0, testUtils_1.joinLines)('abstract class A {', '    public foo() {}', '    private bar() {}', '    protected baz() {}', '}', 'class B extends A {', '    public foo() {}', '    protected baz() {}', '}'), 'ts', async (_editor, doc) => {
            const lenses = await getCodeLenses(doc);
            assert.strictEqual(lenses?.length, 5);
            assert.strictEqual(lenses?.[0].range.start.line, 0, 'Expected class A to have a CodeLens');
            assert.strictEqual(lenses?.[1].range.start.line, 1, 'Expected method A.foo to have a CodeLens');
            assert.strictEqual(lenses?.[2].range.start.line, 3, 'Expected method A.baz to have a CodeLens');
            assert.strictEqual(lenses?.[3].range.start.line, 6, 'Expected method B.foo to have a CodeLens');
            assert.strictEqual(lenses?.[4].range.start.line, 7, 'Expected method B.baz to have a CodeLens');
        });
    });
});
//# sourceMappingURL=implementationsCodeLens.test.js.map