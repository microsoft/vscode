var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../common/core/position.js';
import { Selection } from '../../../../common/core/selection.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { SnippetController2 } from '../../browser/snippetController2.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { TestLanguageConfigurationService } from '../../../../test/common/modes/testLanguageConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
let TestSnippetController = class TestSnippetController extends SnippetController2 {
    constructor(editor, _contextKeyService) {
        const testLanguageConfigurationService = new TestLanguageConfigurationService();
        super(editor, new NullLogService(), new LanguageFeaturesService(), _contextKeyService, testLanguageConfigurationService);
        this._contextKeyService = _contextKeyService;
        this._testLanguageConfigurationService = testLanguageConfigurationService;
    }
    dispose() {
        super.dispose();
        this._testLanguageConfigurationService.dispose();
    }
    isInSnippetMode() {
        return SnippetController2.InSnippetMode.getValue(this._contextKeyService);
    }
};
TestSnippetController = __decorate([
    __param(1, IContextKeyService)
], TestSnippetController);
suite('SnippetController', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function snippetTest(cb, lines) {
        if (!lines) {
            lines = [
                'function test() {',
                '\tvar x = 3;',
                '\tvar arr = [];',
                '\t',
                '}'
            ];
        }
        const serviceCollection = new ServiceCollection([ILabelService, new class extends mock() {
            }], [IWorkspaceContextService, new class extends mock() {
            }]);
        withTestCodeEditor(lines, { serviceCollection }, (editor) => {
            editor.getModel().updateOptions({
                insertSpaces: false
            });
            const snippetController = editor.registerAndInstantiateContribution(TestSnippetController.ID, TestSnippetController);
            const template = [
                'for (var ${1:index}; $1 < ${2:array}.length; $1++) {',
                '\tvar element = $2[$1];',
                '\t$0',
                '}'
            ].join('\n');
            cb(editor, template, snippetController);
            snippetController.dispose();
        });
    }
    test('Simple accepted', () => {
        snippetTest((editor, template, snippetController) => {
            editor.setPosition({ lineNumber: 4, column: 2 });
            snippetController.insert(template);
            assert.strictEqual(editor.getModel().getLineContent(4), '\tfor (var index; index < array.length; index++) {');
            assert.strictEqual(editor.getModel().getLineContent(5), '\t\tvar element = array[index];');
            assert.strictEqual(editor.getModel().getLineContent(6), '\t\t');
            assert.strictEqual(editor.getModel().getLineContent(7), '\t}');
            editor.trigger('test', 'type', { text: 'i' });
            assert.strictEqual(editor.getModel().getLineContent(4), '\tfor (var i; i < array.length; i++) {');
            assert.strictEqual(editor.getModel().getLineContent(5), '\t\tvar element = array[i];');
            assert.strictEqual(editor.getModel().getLineContent(6), '\t\t');
            assert.strictEqual(editor.getModel().getLineContent(7), '\t}');
            snippetController.next();
            editor.trigger('test', 'type', { text: 'arr' });
            assert.strictEqual(editor.getModel().getLineContent(4), '\tfor (var i; i < arr.length; i++) {');
            assert.strictEqual(editor.getModel().getLineContent(5), '\t\tvar element = arr[i];');
            assert.strictEqual(editor.getModel().getLineContent(6), '\t\t');
            assert.strictEqual(editor.getModel().getLineContent(7), '\t}');
            snippetController.prev();
            editor.trigger('test', 'type', { text: 'j' });
            assert.strictEqual(editor.getModel().getLineContent(4), '\tfor (var j; j < arr.length; j++) {');
            assert.strictEqual(editor.getModel().getLineContent(5), '\t\tvar element = arr[j];');
            assert.strictEqual(editor.getModel().getLineContent(6), '\t\t');
            assert.strictEqual(editor.getModel().getLineContent(7), '\t}');
            snippetController.next();
            snippetController.next();
            assert.deepStrictEqual(editor.getPosition(), new Position(6, 3));
        });
    });
    test('Simple canceled', () => {
        snippetTest((editor, template, snippetController) => {
            editor.setPosition({ lineNumber: 4, column: 2 });
            snippetController.insert(template);
            assert.strictEqual(editor.getModel().getLineContent(4), '\tfor (var index; index < array.length; index++) {');
            assert.strictEqual(editor.getModel().getLineContent(5), '\t\tvar element = array[index];');
            assert.strictEqual(editor.getModel().getLineContent(6), '\t\t');
            assert.strictEqual(editor.getModel().getLineContent(7), '\t}');
            snippetController.cancel();
            assert.deepStrictEqual(editor.getPosition(), new Position(4, 16));
        });
    });
    // test('Stops when deleting lines above', () => {
    // 	snippetTest((editor, codeSnippet, snippetController) => {
    // 		editor.setPosition({ lineNumber: 4, column: 2 });
    // 		snippetController.insert(codeSnippet, 0, 0);
    // 		editor.getModel()!.applyEdits([{
    // 			forceMoveMarkers: false,
    // 			identifier: null,
    // 			isAutoWhitespaceEdit: false,
    // 			range: new Range(1, 1, 3, 1),
    // 			text: null
    // 		}]);
    // 		assert.strictEqual(snippetController.isInSnippetMode(), false);
    // 	});
    // });
    // test('Stops when deleting lines below', () => {
    // 	snippetTest((editor, codeSnippet, snippetController) => {
    // 		editor.setPosition({ lineNumber: 4, column: 2 });
    // 		snippetController.run(codeSnippet, 0, 0);
    // 		editor.getModel()!.applyEdits([{
    // 			forceMoveMarkers: false,
    // 			identifier: null,
    // 			isAutoWhitespaceEdit: false,
    // 			range: new Range(8, 1, 8, 100),
    // 			text: null
    // 		}]);
    // 		assert.strictEqual(snippetController.isInSnippetMode(), false);
    // 	});
    // });
    // test('Stops when inserting lines above', () => {
    // 	snippetTest((editor, codeSnippet, snippetController) => {
    // 		editor.setPosition({ lineNumber: 4, column: 2 });
    // 		snippetController.run(codeSnippet, 0, 0);
    // 		editor.getModel()!.applyEdits([{
    // 			forceMoveMarkers: false,
    // 			identifier: null,
    // 			isAutoWhitespaceEdit: false,
    // 			range: new Range(1, 100, 1, 100),
    // 			text: '\nHello'
    // 		}]);
    // 		assert.strictEqual(snippetController.isInSnippetMode(), false);
    // 	});
    // });
    // test('Stops when inserting lines below', () => {
    // 	snippetTest((editor, codeSnippet, snippetController) => {
    // 		editor.setPosition({ lineNumber: 4, column: 2 });
    // 		snippetController.run(codeSnippet, 0, 0);
    // 		editor.getModel()!.applyEdits([{
    // 			forceMoveMarkers: false,
    // 			identifier: null,
    // 			isAutoWhitespaceEdit: false,
    // 			range: new Range(8, 100, 8, 100),
    // 			text: '\nHello'
    // 		}]);
    // 		assert.strictEqual(snippetController.isInSnippetMode(), false);
    // 	});
    // });
    test('Stops when calling model.setValue()', () => {
        snippetTest((editor, codeSnippet, snippetController) => {
            editor.setPosition({ lineNumber: 4, column: 2 });
            snippetController.insert(codeSnippet);
            editor.getModel().setValue('goodbye');
            assert.strictEqual(snippetController.isInSnippetMode(), false);
        });
    });
    test('Stops when undoing', () => {
        snippetTest((editor, codeSnippet, snippetController) => {
            editor.setPosition({ lineNumber: 4, column: 2 });
            snippetController.insert(codeSnippet);
            editor.getModel().undo();
            assert.strictEqual(snippetController.isInSnippetMode(), false);
        });
    });
    test('Stops when moving cursor outside', () => {
        snippetTest((editor, codeSnippet, snippetController) => {
            editor.setPosition({ lineNumber: 4, column: 2 });
            snippetController.insert(codeSnippet);
            editor.setPosition({ lineNumber: 1, column: 1 });
            assert.strictEqual(snippetController.isInSnippetMode(), false);
        });
    });
    test('Stops when disconnecting editor model', () => {
        snippetTest((editor, codeSnippet, snippetController) => {
            editor.setPosition({ lineNumber: 4, column: 2 });
            snippetController.insert(codeSnippet);
            editor.setModel(null);
            assert.strictEqual(snippetController.isInSnippetMode(), false);
        });
    });
    test('Stops when disposing editor', () => {
        snippetTest((editor, codeSnippet, snippetController) => {
            editor.setPosition({ lineNumber: 4, column: 2 });
            snippetController.insert(codeSnippet);
            snippetController.dispose();
            assert.strictEqual(snippetController.isInSnippetMode(), false);
        });
    });
    test('Final tabstop with multiple selections', () => {
        snippetTest((editor, codeSnippet, snippetController) => {
            editor.setSelections([
                new Selection(1, 1, 1, 1),
                new Selection(2, 1, 2, 1),
            ]);
            codeSnippet = 'foo$0';
            snippetController.insert(codeSnippet);
            assert.strictEqual(editor.getSelections().length, 2);
            const [first, second] = editor.getSelections();
            assert.ok(first.equalsRange({ startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 4 }), first.toString());
            assert.ok(second.equalsRange({ startLineNumber: 2, startColumn: 4, endLineNumber: 2, endColumn: 4 }), second.toString());
        });
        snippetTest((editor, codeSnippet, snippetController) => {
            editor.setSelections([
                new Selection(1, 1, 1, 1),
                new Selection(2, 1, 2, 1),
            ]);
            codeSnippet = 'foo$0bar';
            snippetController.insert(codeSnippet);
            assert.strictEqual(editor.getSelections().length, 2);
            const [first, second] = editor.getSelections();
            assert.ok(first.equalsRange({ startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 4 }), first.toString());
            assert.ok(second.equalsRange({ startLineNumber: 2, startColumn: 4, endLineNumber: 2, endColumn: 4 }), second.toString());
        });
        snippetTest((editor, codeSnippet, snippetController) => {
            editor.setSelections([
                new Selection(1, 1, 1, 1),
                new Selection(1, 5, 1, 5),
            ]);
            codeSnippet = 'foo$0bar';
            snippetController.insert(codeSnippet);
            assert.strictEqual(editor.getSelections().length, 2);
            const [first, second] = editor.getSelections();
            assert.ok(first.equalsRange({ startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 4 }), first.toString());
            assert.ok(second.equalsRange({ startLineNumber: 1, startColumn: 14, endLineNumber: 1, endColumn: 14 }), second.toString());
        });
        snippetTest((editor, codeSnippet, snippetController) => {
            editor.setSelections([
                new Selection(1, 1, 1, 1),
                new Selection(1, 5, 1, 5),
            ]);
            codeSnippet = 'foo\n$0\nbar';
            snippetController.insert(codeSnippet);
            assert.strictEqual(editor.getSelections().length, 2);
            const [first, second] = editor.getSelections();
            assert.ok(first.equalsRange({ startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 }), first.toString());
            assert.ok(second.equalsRange({ startLineNumber: 4, startColumn: 1, endLineNumber: 4, endColumn: 1 }), second.toString());
        });
        snippetTest((editor, codeSnippet, snippetController) => {
            editor.setSelections([
                new Selection(1, 1, 1, 1),
                new Selection(1, 5, 1, 5),
            ]);
            codeSnippet = 'foo\n$0\nbar';
            snippetController.insert(codeSnippet);
            assert.strictEqual(editor.getSelections().length, 2);
            const [first, second] = editor.getSelections();
            assert.ok(first.equalsRange({ startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 }), first.toString());
            assert.ok(second.equalsRange({ startLineNumber: 4, startColumn: 1, endLineNumber: 4, endColumn: 1 }), second.toString());
        });
        snippetTest((editor, codeSnippet, snippetController) => {
            editor.setSelections([
                new Selection(2, 7, 2, 7),
            ]);
            codeSnippet = 'xo$0r';
            snippetController.insert(codeSnippet, { overwriteBefore: 1 });
            assert.strictEqual(editor.getSelections().length, 1);
            assert.ok(editor.getSelection().equalsRange({ startLineNumber: 2, startColumn: 8, endColumn: 8, endLineNumber: 2 }));
        });
    });
    test('Final tabstop, #11742 simple', () => {
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelection(new Selection(1, 19, 1, 19));
            codeSnippet = '{{% url_**$1** %}}';
            controller.insert(codeSnippet, { overwriteBefore: 2 });
            assert.strictEqual(editor.getSelections().length, 1);
            assert.ok(editor.getSelection().equalsRange({ startLineNumber: 1, startColumn: 27, endLineNumber: 1, endColumn: 27 }));
            assert.strictEqual(editor.getModel().getValue(), 'example example {{% url_**** %}}');
        }, ['example example sc']);
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelection(new Selection(1, 3, 1, 3));
            codeSnippet = [
                'afterEach((done) => {',
                '\t${1}test',
                '});'
            ].join('\n');
            controller.insert(codeSnippet, { overwriteBefore: 2 });
            assert.strictEqual(editor.getSelections().length, 1);
            assert.ok(editor.getSelection().equalsRange({ startLineNumber: 2, startColumn: 2, endLineNumber: 2, endColumn: 2 }), editor.getSelection().toString());
            assert.strictEqual(editor.getModel().getValue(), 'afterEach((done) => {\n\ttest\n});');
        }, ['af']);
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelection(new Selection(1, 3, 1, 3));
            codeSnippet = [
                'afterEach((done) => {',
                '${1}\ttest',
                '});'
            ].join('\n');
            controller.insert(codeSnippet, { overwriteBefore: 2 });
            assert.strictEqual(editor.getSelections().length, 1);
            assert.ok(editor.getSelection().equalsRange({ startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 }), editor.getSelection().toString());
            assert.strictEqual(editor.getModel().getValue(), 'afterEach((done) => {\n\ttest\n});');
        }, ['af']);
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelection(new Selection(1, 9, 1, 9));
            codeSnippet = [
                'aft${1}er'
            ].join('\n');
            controller.insert(codeSnippet, { overwriteBefore: 8 });
            assert.strictEqual(editor.getModel().getValue(), 'after');
            assert.strictEqual(editor.getSelections().length, 1);
            assert.ok(editor.getSelection().equalsRange({ startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 4 }), editor.getSelection().toString());
        }, ['afterone']);
    });
    test('Final tabstop, #11742 different indents', () => {
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelections([
                new Selection(2, 4, 2, 4),
                new Selection(1, 3, 1, 3)
            ]);
            codeSnippet = [
                'afterEach((done) => {',
                '\t${0}test',
                '});'
            ].join('\n');
            controller.insert(codeSnippet, { overwriteBefore: 2 });
            assert.strictEqual(editor.getSelections().length, 2);
            const [first, second] = editor.getSelections();
            assert.ok(first.equalsRange({ startLineNumber: 5, startColumn: 3, endLineNumber: 5, endColumn: 3 }), first.toString());
            assert.ok(second.equalsRange({ startLineNumber: 2, startColumn: 2, endLineNumber: 2, endColumn: 2 }), second.toString());
        }, ['af', '\taf']);
    });
    test('Final tabstop, #11890 stay at the beginning', () => {
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelections([
                new Selection(1, 5, 1, 5)
            ]);
            codeSnippet = [
                'afterEach((done) => {',
                '${1}\ttest',
                '});'
            ].join('\n');
            controller.insert(codeSnippet, { overwriteBefore: 2 });
            assert.strictEqual(editor.getSelections().length, 1);
            const [first] = editor.getSelections();
            assert.ok(first.equalsRange({ startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 3 }), first.toString());
        }, ['  af']);
    });
    test('Final tabstop, no tabstop', () => {
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelections([
                new Selection(1, 3, 1, 3)
            ]);
            codeSnippet = 'afterEach';
            controller.insert(codeSnippet, { overwriteBefore: 2 });
            assert.ok(editor.getSelection().equalsRange({ startLineNumber: 1, startColumn: 10, endLineNumber: 1, endColumn: 10 }));
        }, ['af', '\taf']);
    });
    test('Multiple cursor and overwriteBefore/After, issue #11060', () => {
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelections([
                new Selection(1, 7, 1, 7),
                new Selection(2, 4, 2, 4)
            ]);
            codeSnippet = '_foo';
            controller.insert(codeSnippet, { overwriteBefore: 1 });
            assert.strictEqual(editor.getModel().getValue(), 'this._foo\nabc_foo');
        }, ['this._', 'abc']);
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelections([
                new Selection(1, 7, 1, 7),
                new Selection(2, 4, 2, 4)
            ]);
            codeSnippet = 'XX';
            controller.insert(codeSnippet, { overwriteBefore: 1 });
            assert.strictEqual(editor.getModel().getValue(), 'this.XX\nabcXX');
        }, ['this._', 'abc']);
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelections([
                new Selection(1, 7, 1, 7),
                new Selection(2, 4, 2, 4),
                new Selection(3, 5, 3, 5)
            ]);
            codeSnippet = '_foo';
            controller.insert(codeSnippet, { overwriteBefore: 1 });
            assert.strictEqual(editor.getModel().getValue(), 'this._foo\nabc_foo\ndef_foo');
        }, ['this._', 'abc', 'def_']);
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelections([
                new Selection(1, 7, 1, 7), // primary at `this._`
                new Selection(2, 4, 2, 4),
                new Selection(3, 6, 3, 6)
            ]);
            codeSnippet = '._foo';
            controller.insert(codeSnippet, { overwriteBefore: 2 });
            assert.strictEqual(editor.getModel().getValue(), 'this._foo\nabc._foo\ndef._foo');
        }, ['this._', 'abc', 'def._']);
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelections([
                new Selection(3, 6, 3, 6), // primary at `def._`
                new Selection(1, 7, 1, 7),
                new Selection(2, 4, 2, 4),
            ]);
            codeSnippet = '._foo';
            controller.insert(codeSnippet, { overwriteBefore: 2 });
            assert.strictEqual(editor.getModel().getValue(), 'this._foo\nabc._foo\ndef._foo');
        }, ['this._', 'abc', 'def._']);
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelections([
                new Selection(2, 4, 2, 4), // primary at `abc`
                new Selection(3, 6, 3, 6),
                new Selection(1, 7, 1, 7),
            ]);
            codeSnippet = '._foo';
            controller.insert(codeSnippet, { overwriteBefore: 2 });
            assert.strictEqual(editor.getModel().getValue(), 'this._._foo\na._foo\ndef._._foo');
        }, ['this._', 'abc', 'def._']);
    });
    test('Multiple cursor and overwriteBefore/After, #16277', () => {
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelections([
                new Selection(1, 5, 1, 5),
                new Selection(2, 5, 2, 5),
            ]);
            codeSnippet = 'document';
            controller.insert(codeSnippet, { overwriteBefore: 3 });
            assert.strictEqual(editor.getModel().getValue(), '{document}\n{document && true}');
        }, ['{foo}', '{foo && true}']);
    });
    test('Insert snippet twice, #19449', () => {
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelections([
                new Selection(1, 1, 1, 1)
            ]);
            codeSnippet = 'for (var ${1:i}=0; ${1:i}<len; ${1:i}++) { $0 }';
            controller.insert(codeSnippet);
            assert.strictEqual(editor.getModel().getValue(), 'for (var i=0; i<len; i++) {  }for (var i=0; i<len; i++) {  }');
        }, ['for (var i=0; i<len; i++) {  }']);
        snippetTest((editor, codeSnippet, controller) => {
            editor.setSelections([
                new Selection(1, 1, 1, 1)
            ]);
            codeSnippet = 'for (let ${1:i}=0; ${1:i}<len; ${1:i}++) { $0 }';
            controller.insert(codeSnippet);
            assert.strictEqual(editor.getModel().getValue(), 'for (let i=0; i<len; i++) {  }for (var i=0; i<len; i++) {  }');
        }, ['for (var i=0; i<len; i++) {  }']);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldENvbnRyb2xsZXIyLm9sZC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvc25pcHBldC90ZXN0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLm9sZC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNqRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN6RSxPQUFPLEVBQW1CLGtCQUFrQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDakcsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDckgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDN0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDdEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUVqRyxJQUFNLHFCQUFxQixHQUEzQixNQUFNLHFCQUFzQixTQUFRLGtCQUFrQjtJQUlyRCxZ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