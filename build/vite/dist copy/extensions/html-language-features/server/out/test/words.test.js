"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const assert_1 = __importDefault(require("assert"));
const words = __importStar(require("../utils/strings"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
suite('HTML Language Configuration', () => {
    const config = JSON.parse((fs.readFileSync(path.join(__dirname, '../../../../html/language-configuration.json')).toString()));
    function createRegex(str) {
        if (typeof str === 'string') {
            return new RegExp(str, 'g');
        }
        return new RegExp(str.pattern, str.flags);
    }
    const wordRegex = createRegex(config.wordPattern);
    function assertWord(value, expected) {
        const offset = value.indexOf('|');
        value = value.substr(0, offset) + value.substring(offset + 1);
        const actualRange = words.getWordAtText(value, offset, wordRegex);
        assert_1.default.ok(actualRange.start <= offset);
        assert_1.default.ok(actualRange.start + actualRange.length >= offset);
        assert_1.default.strictEqual(value.substr(actualRange.start, actualRange.length), expected);
    }
    test('Words Basic', function () {
        assertWord('|var x1 = new F<A>(a, b);', 'var');
        assertWord('v|ar x1 = new F<A>(a, b);', 'var');
        assertWord('var| x1 = new F<A>(a, b);', 'var');
        assertWord('var |x1 = new F<A>(a, b);', 'x1');
        assertWord('var x1| = new F<A>(a, b);', 'x1');
        assertWord('var x1 = new |F<A>(a, b);', 'F');
        assertWord('var x1 = new F<|A>(a, b);', 'A');
        assertWord('var x1 = new F<A>(|a, b);', 'a');
        assertWord('var x1 = new F<A>(a, b|);', 'b');
        assertWord('var x1 = new F<A>(a, b)|;', '');
        assertWord('var x1 = new F<A>(a, b)|;|', '');
        assertWord('var x1 = |  new F<A>(a, b)|;|', '');
    });
    test('Words Multiline', function () {
        assertWord('console.log("hello");\n|var x1 = new F<A>(a, b);', 'var');
        assertWord('console.log("hello");\n|\nvar x1 = new F<A>(a, b);', '');
        assertWord('console.log("hello");\n\r |var x1 = new F<A>(a, b);', 'var');
    });
    const onEnterBeforeRules = config.onEnterRules.map((r) => createRegex(r.beforeText));
    function assertBeforeRule(text, expectedMatch) {
        for (const reg of onEnterBeforeRules) {
            const start = new Date().getTime();
            assert_1.default.strictEqual(reg.test(text), expectedMatch);
            const totalTime = new Date().getTime() - start;
            assert_1.default.ok(totalTime < 200, `Evaluation of ${reg.source} on ${text} took ${totalTime}ms]`);
        }
    }
    test('OnEnter Before', function () {
        assertBeforeRule('<button attr1=val1 attr2=val2', false);
        assertBeforeRule('<button attr1=val1 attr2=val2>', true);
        assertBeforeRule('<button attr1=\'val1\' attr2="val2">', true);
        assertBeforeRule('<button attr1=val1 attr2=val2></button>', false);
    });
});
//# sourceMappingURL=words.test.js.map