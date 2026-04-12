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
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
require("mocha");
const assert = __importStar(require("assert"));
const embeddedSupport = __importStar(require("../modes/embeddedSupport"));
const vscode_html_languageservice_1 = require("vscode-html-languageservice");
const languageModes_1 = require("../modes/languageModes");
suite('HTML Embedded Support', () => {
    const htmlLanguageService = (0, vscode_html_languageservice_1.getLanguageService)();
    function assertLanguageId(value, expectedLanguageId) {
        const offset = value.indexOf('|');
        value = value.substr(0, offset) + value.substr(offset + 1);
        const document = languageModes_1.TextDocument.create('test://test/test.html', 'html', 0, value);
        const position = document.positionAt(offset);
        const docRegions = embeddedSupport.getDocumentRegions(htmlLanguageService, document);
        const languageId = docRegions.getLanguageAtPosition(position);
        assert.strictEqual(languageId, expectedLanguageId);
    }
    function assertEmbeddedLanguageContent(value, languageId, expectedContent) {
        const document = languageModes_1.TextDocument.create('test://test/test.html', 'html', 0, value);
        const docRegions = embeddedSupport.getDocumentRegions(htmlLanguageService, document);
        const content = docRegions.getEmbeddedDocument(languageId);
        assert.strictEqual(content.getText(), expectedContent);
    }
    test('Styles', function () {
        assertLanguageId('|<html><style>foo { }</style></html>', 'html');
        assertLanguageId('<html|><style>foo { }</style></html>', 'html');
        assertLanguageId('<html><st|yle>foo { }</style></html>', 'html');
        assertLanguageId('<html><style>|foo { }</style></html>', 'css');
        assertLanguageId('<html><style>foo| { }</style></html>', 'css');
        assertLanguageId('<html><style>foo { }|</style></html>', 'css');
        assertLanguageId('<html><style>foo { }</sty|le></html>', 'html');
    });
    test('Styles - Incomplete HTML', function () {
        assertLanguageId('|<html><style>foo { }', 'html');
        assertLanguageId('<html><style>fo|o { }', 'css');
        assertLanguageId('<html><style>foo { }|', 'css');
    });
    test('Style in attribute', function () {
        assertLanguageId('<div id="xy" |style="color: red"/>', 'html');
        assertLanguageId('<div id="xy" styl|e="color: red"/>', 'html');
        assertLanguageId('<div id="xy" style=|"color: red"/>', 'html');
        assertLanguageId('<div id="xy" style="|color: red"/>', 'css');
        assertLanguageId('<div id="xy" style="color|: red"/>', 'css');
        assertLanguageId('<div id="xy" style="color: red|"/>', 'css');
        assertLanguageId('<div id="xy" style="color: red"|/>', 'html');
        assertLanguageId('<div id="xy" style=\'color: r|ed\'/>', 'css');
        assertLanguageId('<div id="xy" style|=color:red/>', 'html');
        assertLanguageId('<div id="xy" style=|color:red/>', 'css');
        assertLanguageId('<div id="xy" style=color:r|ed/>', 'css');
        assertLanguageId('<div id="xy" style=color:red|/>', 'css');
        assertLanguageId('<div id="xy" style=color:red/|>', 'html');
    });
    test('Style content', function () {
        assertEmbeddedLanguageContent('<html><style>foo { }</style></html>', 'css', '             foo { }               ');
        assertEmbeddedLanguageContent('<html><script>var i = 0;</script></html>', 'css', '                                        ');
        assertEmbeddedLanguageContent('<html><style>foo { }</style>Hello<style>foo { }</style></html>', 'css', '             foo { }                    foo { }               ');
        assertEmbeddedLanguageContent('<html>\n  <style>\n    foo { }  \n  </style>\n</html>\n', 'css', '\n         \n    foo { }  \n  \n\n');
        assertEmbeddedLanguageContent('<div style="color: red"></div>', 'css', '         __{color: red}       ');
        assertEmbeddedLanguageContent('<div style=color:red></div>', 'css', '        __{color:red}      ');
    });
    test('Scripts', function () {
        assertLanguageId('|<html><script>var i = 0;</script></html>', 'html');
        assertLanguageId('<html|><script>var i = 0;</script></html>', 'html');
        assertLanguageId('<html><scr|ipt>var i = 0;</script></html>', 'html');
        assertLanguageId('<html><script>|var i = 0;</script></html>', 'javascript');
        assertLanguageId('<html><script>var| i = 0;</script></html>', 'javascript');
        assertLanguageId('<html><script>var i = 0;|</script></html>', 'javascript');
        assertLanguageId('<html><script>var i = 0;</scr|ipt></html>', 'html');
        assertLanguageId('<script type="text/javascript">var| i = 0;</script>', 'javascript');
        assertLanguageId('<script type="text/ecmascript">var| i = 0;</script>', 'javascript');
        assertLanguageId('<script type="application/javascript">var| i = 0;</script>', 'javascript');
        assertLanguageId('<script type="application/ecmascript">var| i = 0;</script>', 'javascript');
        assertLanguageId('<script type="application/typescript">var| i = 0;</script>', undefined);
        assertLanguageId('<script type=\'text/javascript\'>var| i = 0;</script>', 'javascript');
    });
    test('Scripts in attribute', function () {
        assertLanguageId('<div |onKeyUp="foo()" onkeydown=\'bar()\'/>', 'html');
        assertLanguageId('<div onKeyUp=|"foo()" onkeydown=\'bar()\'/>', 'html');
        assertLanguageId('<div onKeyUp="|foo()" onkeydown=\'bar()\'/>', 'javascript');
        assertLanguageId('<div onKeyUp="foo(|)" onkeydown=\'bar()\'/>', 'javascript');
        assertLanguageId('<div onKeyUp="foo()|" onkeydown=\'bar()\'/>', 'javascript');
        assertLanguageId('<div onKeyUp="foo()"| onkeydown=\'bar()\'/>', 'html');
        assertLanguageId('<div onKeyUp="foo()" onkeydown=|\'bar()\'/>', 'html');
        assertLanguageId('<div onKeyUp="foo()" onkeydown=\'|bar()\'/>', 'javascript');
        assertLanguageId('<div onKeyUp="foo()" onkeydown=\'bar()|\'/>', 'javascript');
        assertLanguageId('<div onKeyUp="foo()" onkeydown=\'bar()\'|/>', 'html');
        assertLanguageId('<DIV ONKEYUP|=foo()</DIV>', 'html');
        assertLanguageId('<DIV ONKEYUP=|foo()</DIV>', 'javascript');
        assertLanguageId('<DIV ONKEYUP=f|oo()</DIV>', 'javascript');
        assertLanguageId('<DIV ONKEYUP=foo(|)</DIV>', 'javascript');
        assertLanguageId('<DIV ONKEYUP=foo()|</DIV>', 'javascript');
        assertLanguageId('<DIV ONKEYUP=foo()<|/DIV>', 'html');
        assertLanguageId('<label data-content="|Checkbox"/>', 'html');
        assertLanguageId('<label on="|Checkbox"/>', 'html');
    });
    test('Script content', function () {
        assertEmbeddedLanguageContent('<html><script>var i = 0;</script></html>', 'javascript', '              var i = 0;                ');
        assertEmbeddedLanguageContent('<script type="text/javascript">var i = 0;</script>', 'javascript', '                               var i = 0;         ');
        assertEmbeddedLanguageContent('<script><!--this comment should not give error--></script>', 'javascript', '        /* this comment should not give error */         ');
        assertEmbeddedLanguageContent('<script><!--this comment should not give error--> console.log("logging");</script>', 'javascript', '        /* this comment should not give error */ console.log("logging");         ');
        assertEmbeddedLanguageContent('<script>var data=100; <!--this comment should not give error--> </script>', 'javascript', '        var data=100; /* this comment should not give error */          ');
        assertEmbeddedLanguageContent('<div onKeyUp="foo()" onkeydown="bar()"/>', 'javascript', '              foo();            bar();  ');
        assertEmbeddedLanguageContent('<div onKeyUp="return"/>', 'javascript', '              return;  ');
        assertEmbeddedLanguageContent('<div onKeyUp=return\n/><script>foo();</script>', 'javascript', '             return;\n          foo();         ');
    });
    test('Script content - HTML escape characters', function () {
        assertEmbeddedLanguageContent('<div style="font-family: &quot;Arial&quot;"></div>', 'css', '         __{font-family: "     Arial     "}       ');
        assertEmbeddedLanguageContent('<div style="font-family: &#34;Arial&#34;"></div>', 'css', '         __{font-family: "    Arial    "}       ');
        assertEmbeddedLanguageContent('<div style="font-family: &quot;Arial&#34;"></div>', 'css', '         __{font-family: "     Arial    "}       ');
        assertEmbeddedLanguageContent('<div style="font-family:&quot; Arial &quot; "></div>', 'css', '         __{font-family:     " Arial      " }       ');
        assertEmbeddedLanguageContent('<div style="font-family: Arial"></div>', 'css', '         __{font-family: Arial}       ');
    });
});
//# sourceMappingURL=embedded.test.js.map