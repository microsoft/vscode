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
require("mocha");
const assert = __importStar(require("assert"));
const htmlFolding_1 = require("../modes/htmlFolding");
const languageModes_1 = require("../modes/languageModes");
const vscode_css_languageservice_1 = require("vscode-css-languageservice");
const nodeFs_1 = require("../node/nodeFs");
async function assertRanges(lines, expected, message, nRanges) {
    const document = languageModes_1.TextDocument.create('test://foo/bar.html', 'html', 1, lines.join('\n'));
    const workspace = {
        settings: {},
        folders: [{ name: 'foo', uri: 'test://foo' }]
    };
    const languageModes = (0, languageModes_1.getLanguageModes)({ css: true, javascript: true }, workspace, vscode_css_languageservice_1.ClientCapabilities.LATEST, (0, nodeFs_1.getNodeFileFS)());
    const actual = await (0, htmlFolding_1.getFoldingRanges)(languageModes, document, nRanges, null);
    let actualRanges = [];
    for (let i = 0; i < actual.length; i++) {
        actualRanges[i] = r(actual[i].startLine, actual[i].endLine, actual[i].kind);
    }
    actualRanges = actualRanges.sort((r1, r2) => r1.startLine - r2.startLine);
    assert.deepStrictEqual(actualRanges, expected, message);
}
function r(startLine, endLine, kind) {
    return { startLine, endLine, kind };
}
suite('HTML Folding', () => {
    test('Embedded JavaScript', async () => {
        const input = [
            /*0*/ '<html>',
            /*1*/ '<head>',
            /*2*/ '<script>',
            /*3*/ 'function f() {',
            /*4*/ '}',
            /*5*/ '</script>',
            /*6*/ '</head>',
            /*7*/ '</html>',
        ];
        await await assertRanges(input, [r(0, 6), r(1, 5), r(2, 4), r(3, 4)]);
    });
    test('Embedded JavaScript - multiple areas', async () => {
        const input = [
            /* 0*/ '<html>',
            /* 1*/ '<head>',
            /* 2*/ '<script>',
            /* 3*/ '  var x = {',
            /* 4*/ '    foo: true,',
            /* 5*/ '    bar: {}',
            /* 6*/ '  };',
            /* 7*/ '</script>',
            /* 8*/ '<script>',
            /* 9*/ '  test(() => { // hello',
            /*10*/ '    f();',
            /*11*/ '  });',
            /*12*/ '</script>',
            /*13*/ '</head>',
            /*14*/ '</html>',
        ];
        await assertRanges(input, [r(0, 13), r(1, 12), r(2, 6), r(3, 6), r(8, 11), r(9, 11), r(9, 11)]);
    });
    test('Embedded JavaScript - incomplete', async () => {
        const input = [
            /* 0*/ '<html>',
            /* 1*/ '<head>',
            /* 2*/ '<script>',
            /* 3*/ '  var x = {',
            /* 4*/ '</script>',
            /* 5*/ '<script>',
            /* 6*/ '  });',
            /* 7*/ '</script>',
            /* 8*/ '</head>',
            /* 9*/ '</html>',
        ];
        await assertRanges(input, [r(0, 8), r(1, 7), r(2, 3), r(5, 6)]);
    });
    test('Embedded JavaScript - regions', async () => {
        const input = [
            /* 0*/ '<html>',
            /* 1*/ '<head>',
            /* 2*/ '<script>',
            /* 3*/ '  // #region Lalala',
            /* 4*/ '   //  #region',
            /* 5*/ '   x = 9;',
            /* 6*/ '  //  #endregion',
            /* 7*/ '  // #endregion Lalala',
            /* 8*/ '</script>',
            /* 9*/ '</head>',
            /*10*/ '</html>',
        ];
        await assertRanges(input, [r(0, 9), r(1, 8), r(2, 7), r(3, 7, 'region'), r(4, 6, 'region')]);
    });
    test('Embedded CSS', async () => {
        const input = [
            /* 0*/ '<html>',
            /* 1*/ '<head>',
            /* 2*/ '<style>',
            /* 3*/ '  foo {',
            /* 4*/ '   display: block;',
            /* 5*/ '   color: black;',
            /* 6*/ '  }',
            /* 7*/ '</style>',
            /* 8*/ '</head>',
            /* 9*/ '</html>',
        ];
        await assertRanges(input, [r(0, 8), r(1, 7), r(2, 6), r(3, 5)]);
    });
    test('Embedded CSS - multiple areas', async () => {
        const input = [
            /* 0*/ '<html>',
            /* 1*/ '<head style="color:red">',
            /* 2*/ '<style>',
            /* 3*/ '  /*',
            /* 4*/ '    foo: true,',
            /* 5*/ '    bar: {}',
            /* 6*/ '  */',
            /* 7*/ '</style>',
            /* 8*/ '<style>',
            /* 9*/ '  @keyframes mymove {',
            /*10*/ '    from {top: 0px;}',
            /*11*/ '  }',
            /*12*/ '</style>',
            /*13*/ '</head>',
            /*14*/ '</html>',
        ];
        await assertRanges(input, [r(0, 13), r(1, 12), r(2, 6), r(3, 6, 'comment'), r(8, 11), r(9, 10)]);
    });
    test('Embedded CSS - regions', async () => {
        const input = [
            /* 0*/ '<html>',
            /* 1*/ '<head>',
            /* 2*/ '<style>',
            /* 3*/ '  /* #region Lalala */',
            /* 4*/ '   /*  #region*/',
            /* 5*/ '   x = 9;',
            /* 6*/ '  /*  #endregion*/',
            /* 7*/ '  /* #endregion Lalala*/',
            /* 8*/ '</style>',
            /* 9*/ '</head>',
            /*10*/ '</html>',
        ];
        await assertRanges(input, [r(0, 9), r(1, 8), r(2, 7), r(3, 7, 'region'), r(4, 6, 'region')]);
    });
    // test('Embedded JavaScript - multi line comment', async () => {
    // 	const input = [
    // 		/* 0*/'<html>',
    // 		/* 1*/'<head>',
    // 		/* 2*/'<script>',
    // 		/* 3*/'  /*',
    // 		/* 4*/'   * Hello',
    // 		/* 5*/'   */',
    // 		/* 6*/'</script>',
    // 		/* 7*/'</head>',
    // 		/* 8*/'</html>',
    // 	];
    // 	await assertRanges(input, [r(0, 7), r(1, 6), r(2, 5), r(3, 5, 'comment')]);
    // });
    test('Test limit', async () => {
        const input = [
            /* 0*/ '<div>',
            /* 1*/ ' <span>',
            /* 2*/ '  <b>',
            /* 3*/ '  ',
            /* 4*/ '  </b>,',
            /* 5*/ '  <b>',
            /* 6*/ '   <pre>',
            /* 7*/ '  ',
            /* 8*/ '   </pre>,',
            /* 9*/ '   <pre>',
            /*10*/ '  ',
            /*11*/ '   </pre>,',
            /*12*/ '  </b>,',
            /*13*/ '  <b>',
            /*14*/ '  ',
            /*15*/ '  </b>,',
            /*16*/ '  <b>',
            /*17*/ '  ',
            /*18*/ '  </b>',
            /*19*/ ' </span>',
            /*20*/ '</div>',
        ];
        await assertRanges(input, [r(0, 19), r(1, 18), r(2, 3), r(5, 11), r(6, 7), r(9, 10), r(13, 14), r(16, 17)], 'no limit', undefined);
        await assertRanges(input, [r(0, 19), r(1, 18), r(2, 3), r(5, 11), r(6, 7), r(9, 10), r(13, 14), r(16, 17)], 'limit 8', 8);
        await assertRanges(input, [r(0, 19), r(1, 18), r(2, 3), r(5, 11), r(6, 7), r(13, 14), r(16, 17)], 'limit 7', 7);
        await assertRanges(input, [r(0, 19), r(1, 18), r(2, 3), r(5, 11), r(13, 14), r(16, 17)], 'limit 6', 6);
        await assertRanges(input, [r(0, 19), r(1, 18), r(2, 3), r(5, 11), r(13, 14)], 'limit 5', 5);
        await assertRanges(input, [r(0, 19), r(1, 18), r(2, 3), r(5, 11)], 'limit 4', 4);
        await assertRanges(input, [r(0, 19), r(1, 18), r(2, 3)], 'limit 3', 3);
        await assertRanges(input, [r(0, 19), r(1, 18)], 'limit 2', 2);
        await assertRanges(input, [r(0, 19)], 'limit 1', 1);
    });
});
//# sourceMappingURL=folding.test.js.map