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
const vscode_1 = require("vscode");
const testUtils_1 = require("./testUtils");
const removeTag_1 = require("../removeTag");
const updateTag_1 = require("../updateTag");
const matchTag_1 = require("../matchTag");
const splitJoinTag_1 = require("../splitJoinTag");
const mergeLines_1 = require("../mergeLines");
suite('Tests for Emmet actions on html tags', () => {
    teardown(testUtils_1.closeAllEditors);
    const contents = `
	<div class="hello">
		<ul>
			<li><span>Hello</span></li>
			<li><span>There</span></li>
			<div><li><span>Bye</span></li></div>
		</ul>
		<span/>
	</div>
	`;
    const spacedContents = `
	<div class="hello">
		<ul>

			<li><span>Hello</span></li>

			<li><span>There</span></li>

			<div><li><span>Bye</span></li></div>


		</ul>
		<span/>
	</div>
	`;
    const contentsWithTemplate = `
	<script type="text/template">
		<ul>
			<li><span>Hello</span></li>
			<li><span>There</span></li>
			<div><li><span>Bye</span></li></div>
		</ul>
		<span/>
	</script>
	`;
    test('update tag with multiple cursors', () => {
        const expectedContents = `
	<div class="hello">
		<ul>
			<li><section>Hello</section></li>
			<section><span>There</span></section>
			<section><li><span>Bye</span></li></section>
		</ul>
		<span/>
	</div>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 17, 3, 17), // cursor inside tags
                new vscode_1.Selection(4, 5, 4, 5), // cursor inside opening tag
                new vscode_1.Selection(5, 35, 5, 35), // cursor inside closing tag
            ];
            return (0, updateTag_1.updateTag)('section').then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    // #region update tag
    test('update tag with entire node selected', () => {
        const expectedContents = `
	<div class="hello">
		<ul>
			<li><section>Hello</section></li>
			<li><span>There</span></li>
			<section><li><span>Bye</span></li></section>
		</ul>
		<span/>
	</div>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 7, 3, 25),
                new vscode_1.Selection(5, 3, 5, 39),
            ];
            return (0, updateTag_1.updateTag)('section').then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    test('update tag with template', () => {
        const expectedContents = `
	<script type="text/template">
		<section>
			<li><span>Hello</span></li>
			<li><span>There</span></li>
			<div><li><span>Bye</span></li></div>
		</section>
		<span/>
	</script>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contentsWithTemplate, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 4, 2, 4), // cursor inside ul tag
            ];
            return (0, updateTag_1.updateTag)('section').then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    // #endregion
    // #region remove tag
    test('remove tag with multiple cursors', () => {
        const expectedContents = `
	<div class="hello">
		<ul>
			<li>Hello</li>
			<span>There</span>
			<li><span>Bye</span></li>
		</ul>
		<span/>
	</div>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 17, 3, 17), // cursor inside tags
                new vscode_1.Selection(4, 5, 4, 5), // cursor inside opening tag
                new vscode_1.Selection(5, 35, 5, 35), // cursor inside closing tag
            ];
            return (0, removeTag_1.removeTag)().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    test('remove tag with boundary conditions', () => {
        const expectedContents = `
	<div class="hello">
		<ul>
			<li>Hello</li>
			<li><span>There</span></li>
			<li><span>Bye</span></li>
		</ul>
		<span/>
	</div>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 7, 3, 25),
                new vscode_1.Selection(5, 3, 5, 39),
            ];
            return (0, removeTag_1.removeTag)().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    test('remove tag with template', () => {
        const expectedContents = `
	<script type="text/template">
		<li><span>Hello</span></li>
		<li><span>There</span></li>
		<div><li><span>Bye</span></li></div>
		<span/>
	</script>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contentsWithTemplate, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 4, 2, 4), // cursor inside ul tag
            ];
            return (0, removeTag_1.removeTag)().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    test('remove tag with extra trim', () => {
        const expectedContents = `
	<div class="hello">
		<li><span>Hello</span></li>

		<li><span>There</span></li>

		<div><li><span>Bye</span></li></div>
		<span/>
	</div>
	`;
        return (0, testUtils_1.withRandomFileEditor)(spacedContents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 4, 2, 4), // cursor inside ul tag
            ];
            return (0, removeTag_1.removeTag)().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    // #endregion
    // #region split/join tag
    test('split/join tag with multiple cursors', () => {
        const expectedContents = `
	<div class="hello">
		<ul>
			<li><span/></li>
			<li><span>There</span></li>
			<div><li><span>Bye</span></li></div>
		</ul>
		<span></span>
	</div>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 17, 3, 17), // join tag
                new vscode_1.Selection(7, 5, 7, 5), // split tag
            ];
            return (0, splitJoinTag_1.splitJoinTag)().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    test('split/join tag with boundary selection', () => {
        const expectedContents = `
	<div class="hello">
		<ul>
			<li><span/></li>
			<li><span>There</span></li>
			<div><li><span>Bye</span></li></div>
		</ul>
		<span></span>
	</div>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 7, 3, 25), // join tag
                new vscode_1.Selection(7, 2, 7, 9), // split tag
            ];
            return (0, splitJoinTag_1.splitJoinTag)().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    test('split/join tag with templates', () => {
        const expectedContents = `
	<script type="text/template">
		<ul>
			<li><span/></li>
			<li><span>There</span></li>
			<div><li><span>Bye</span></li></div>
		</ul>
		<span></span>
	</script>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contentsWithTemplate, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 17, 3, 17), // join tag
                new vscode_1.Selection(7, 5, 7, 5), // split tag
            ];
            return (0, splitJoinTag_1.splitJoinTag)().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    test('split/join tag in jsx with xhtml self closing tag', () => {
        const expectedContents = `
	<div class="hello">
		<ul>
			<li><span /></li>
			<li><span>There</span></li>
			<div><li><span>Bye</span></li></div>
		</ul>
		<span></span>
	</div>
	`;
        const oldValueForSyntaxProfiles = vscode_1.workspace.getConfiguration('emmet').inspect('syntaxProfiles');
        return vscode_1.workspace.getConfiguration('emmet').update('syntaxProfiles', { jsx: { selfClosingStyle: 'xhtml' } }, vscode_1.ConfigurationTarget.Global).then(() => {
            return (0, testUtils_1.withRandomFileEditor)(contents, 'jsx', (editor, doc) => {
                editor.selections = [
                    new vscode_1.Selection(3, 17, 3, 17), // join tag
                    new vscode_1.Selection(7, 5, 7, 5), // split tag
                ];
                return (0, splitJoinTag_1.splitJoinTag)().then(() => {
                    assert.strictEqual(doc.getText(), expectedContents);
                    return vscode_1.workspace.getConfiguration('emmet').update('syntaxProfiles', oldValueForSyntaxProfiles ? oldValueForSyntaxProfiles.globalValue : undefined, vscode_1.ConfigurationTarget.Global);
                });
            });
        });
    });
    // #endregion
    // #region match tag
    test('match tag with multiple cursors', () => {
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, _) => {
            editor.selections = [
                new vscode_1.Selection(1, 0, 1, 0), // just before tag starts, i.e before <
                new vscode_1.Selection(1, 1, 1, 1), // just before tag name starts
                new vscode_1.Selection(1, 2, 1, 2), // inside tag name
                new vscode_1.Selection(1, 6, 1, 6), // after tag name but before opening tag ends
                new vscode_1.Selection(1, 18, 1, 18), // just before opening tag ends
                new vscode_1.Selection(1, 19, 1, 19), // just after opening tag ends
            ];
            (0, matchTag_1.matchTag)();
            editor.selections.forEach(selection => {
                assert.strictEqual(selection.active.line, 8);
                assert.strictEqual(selection.active.character, 3);
                assert.strictEqual(selection.anchor.line, 8);
                assert.strictEqual(selection.anchor.character, 3);
            });
            return Promise.resolve();
        });
    });
    test('match tag with template scripts', () => {
        const templateScript = `
	<script type="text/template">
		<div>
			Hello
		</div>
	</script>`;
        return (0, testUtils_1.withRandomFileEditor)(templateScript, 'html', (editor, _) => {
            editor.selections = [
                new vscode_1.Selection(2, 2, 2, 2), // just before div tag starts, i.e before <
            ];
            (0, matchTag_1.matchTag)();
            editor.selections.forEach(selection => {
                assert.strictEqual(selection.active.line, 4);
                assert.strictEqual(selection.active.character, 4);
                assert.strictEqual(selection.anchor.line, 4);
                assert.strictEqual(selection.anchor.character, 4);
            });
            return Promise.resolve();
        });
    });
    // #endregion
    // #region merge lines
    test('merge lines of tag with children when empty selection', () => {
        const expectedContents = `
	<div class="hello">
		<ul><li><span>Hello</span></li><li><span>There</span></li><div><li><span>Bye</span></li></div></ul>
		<span/>
	</div>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 3, 2, 3)
            ];
            return (0, mergeLines_1.mergeLines)().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    test('merge lines of tag with children when full node selection', () => {
        const expectedContents = `
	<div class="hello">
		<ul><li><span>Hello</span></li><li><span>There</span></li><div><li><span>Bye</span></li></div></ul>
		<span/>
	</div>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 3, 6, 7)
            ];
            return (0, mergeLines_1.mergeLines)().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    test('merge lines is no-op when start and end nodes are on the same line', () => {
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 9, 3, 9), // cursor is inside the <span> in <li><span>Hello</span></li>
                new vscode_1.Selection(4, 5, 4, 5), // cursor is inside the <li> in <li><span>Hello</span></li>
                new vscode_1.Selection(5, 5, 5, 20) // selection spans multiple nodes in the same line
            ];
            return (0, mergeLines_1.mergeLines)().then(() => {
                assert.strictEqual(doc.getText(), contents);
                return Promise.resolve();
            });
        });
    });
    // #endregion
});
//# sourceMappingURL=tagActions.test.js.map