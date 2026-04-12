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
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Selection } from '../../../../common/core/selection.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { LanguageService } from '../../../../common/services/languageService.js';
import { MoveLinesCommand } from '../../browser/moveLinesCommand.js';
import { testCommand } from '../../../../test/browser/testCommand.js';
import { TestLanguageConfigurationService } from '../../../../test/common/modes/testLanguageConfigurationService.js';
var MoveLinesDirection;
(function (MoveLinesDirection) {
    MoveLinesDirection[MoveLinesDirection["Up"] = 0] = "Up";
    MoveLinesDirection[MoveLinesDirection["Down"] = 1] = "Down";
})(MoveLinesDirection || (MoveLinesDirection = {}));
function testMoveLinesDownCommand(lines, selection, expectedLines, expectedSelection, languageConfigurationService) {
    testMoveLinesUpOrDownCommand(1 /* MoveLinesDirection.Down */, lines, selection, expectedLines, expectedSelection, languageConfigurationService);
}
function testMoveLinesUpCommand(lines, selection, expectedLines, expectedSelection, languageConfigurationService) {
    testMoveLinesUpOrDownCommand(0 /* MoveLinesDirection.Up */, lines, selection, expectedLines, expectedSelection, languageConfigurationService);
}
function testMoveLinesDownWithIndentCommand(languageId, lines, selection, expectedLines, expectedSelection, languageConfigurationService) {
    testMoveLinesUpOrDownWithIndentCommand(1 /* MoveLinesDirection.Down */, languageId, lines, selection, expectedLines, expectedSelection, languageConfigurationService);
}
function testMoveLinesUpWithIndentCommand(languageId, lines, selection, expectedLines, expectedSelection, languageConfigurationService) {
    testMoveLinesUpOrDownWithIndentCommand(0 /* MoveLinesDirection.Up */, languageId, lines, selection, expectedLines, expectedSelection, languageConfigurationService);
}
function testMoveLinesUpOrDownCommand(direction, lines, selection, expectedLines, expectedSelection, languageConfigurationService) {
    const disposables = new DisposableStore();
    if (!languageConfigurationService) {
        languageConfigurationService = disposables.add(new TestLanguageConfigurationService());
    }
    testCommand(lines, null, selection, (accessor, sel) => new MoveLinesCommand(sel, direction === 0 /* MoveLinesDirection.Up */ ? false : true, 3 /* EditorAutoIndentStrategy.Advanced */, languageConfigurationService), expectedLines, expectedSelection);
    disposables.dispose();
}
function testMoveLinesUpOrDownWithIndentCommand(direction, languageId, lines, selection, expectedLines, expectedSelection, languageConfigurationService) {
    const disposables = new DisposableStore();
    if (!languageConfigurationService) {
        languageConfigurationService = disposables.add(new TestLanguageConfigurationService());
    }
    testCommand(lines, languageId, selection, (accessor, sel) => new MoveLinesCommand(sel, direction === 0 /* MoveLinesDirection.Up */ ? false : true, 4 /* EditorAutoIndentStrategy.Full */, languageConfigurationService), expectedLines, expectedSelection);
    disposables.dispose();
}
suite('Editor Contrib - Move Lines Command', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('move first up / last down disabled', function () {
        testMoveLinesUpCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 1, 1, 1), [
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 1, 1, 1));
        testMoveLinesDownCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(5, 1, 5, 1), [
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(5, 1, 5, 1));
    });
    test('move first line down', function () {
        testMoveLinesDownCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 4, 1, 1), [
            'second line',
            'first',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 4, 2, 1));
    });
    test('move 2nd line up', function () {
        testMoveLinesUpCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 1, 2, 1), [
            'second line',
            'first',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 1, 1, 1));
    });
    test('issue #1322a: move 2nd line up', function () {
        testMoveLinesUpCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 12, 2, 12), [
            'second line',
            'first',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 12, 1, 12));
    });
    test('issue #1322b: move last line up', function () {
        testMoveLinesUpCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(5, 6, 5, 6), [
            'first',
            'second line',
            'third line',
            'fifth',
            'fourth line'
        ], new Selection(4, 6, 4, 6));
    });
    test('issue #1322c: move last line selected up', function () {
        testMoveLinesUpCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(5, 6, 5, 1), [
            'first',
            'second line',
            'third line',
            'fifth',
            'fourth line'
        ], new Selection(4, 6, 4, 1));
    });
    test('move last line up', function () {
        testMoveLinesUpCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(5, 1, 5, 1), [
            'first',
            'second line',
            'third line',
            'fifth',
            'fourth line'
        ], new Selection(4, 1, 4, 1));
    });
    test('move 4th line down', function () {
        testMoveLinesDownCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(4, 1, 4, 1), [
            'first',
            'second line',
            'third line',
            'fifth',
            'fourth line'
        ], new Selection(5, 1, 5, 1));
    });
    test('move multiple lines down', function () {
        testMoveLinesDownCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(4, 4, 2, 2), [
            'first',
            'fifth',
            'second line',
            'third line',
            'fourth line'
        ], new Selection(5, 4, 3, 2));
    });
    test('invisible selection is ignored', function () {
        testMoveLinesDownCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 1, 1, 1), [
            'second line',
            'first',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(3, 1, 2, 1));
    });
});
let IndentRulesMode = class IndentRulesMode extends Disposable {
    constructor(indentationRules, languageService, languageConfigurationService) {
        super();
        this.languageId = 'moveLinesIndentMode';
        this._register(languageService.registerLanguage({ id: this.languageId }));
        this._register(languageConfigurationService.register(this.languageId, {
            indentationRules: indentationRules
        }));
    }
};
IndentRulesMode = __decorate([
    __param(1, ILanguageService),
    __param(2, ILanguageConfigurationService)
], IndentRulesMode);
suite('Editor contrib - Move Lines Command honors Indentation Rules', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const indentRules = {
        decreaseIndentPattern: /^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|default):\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
        increaseIndentPattern: /(\{[^}"'`]*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|default):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
        indentNextLinePattern: /^\s*(for|while|if|else)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$)/,
        unIndentedLinePattern: /^(?!.*([;{}]|\S:)\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!.*(\{[^}"']*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|default):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|default):\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*(for|while|if|else)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$))/
    };
    // https://github.com/microsoft/vscode/issues/28552#issuecomment-307862797
    test('first line indentation adjust to 0', () => {
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        const mode = new IndentRulesMode(indentRules, languageService, languageConfigurationService);
        testMoveLinesUpWithIndentCommand(mode.languageId, [
            'class X {',
            '\tz = 2',
            '}'
        ], new Selection(2, 1, 2, 1), [
            'z = 2',
            'class X {',
            '}'
        ], new Selection(1, 1, 1, 1), languageConfigurationService);
        mode.dispose();
        languageService.dispose();
        languageConfigurationService.dispose();
    });
    // https://github.com/microsoft/vscode/issues/28552#issuecomment-307867717
    test('move lines across block', () => {
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        const mode = new IndentRulesMode(indentRules, languageService, languageConfigurationService);
        testMoveLinesDownWithIndentCommand(mode.languageId, [
            'const value = 2;',
            'const standardLanguageDescriptions = [',
            '    {',
            '        diagnosticSource: \'js\',',
            '    }',
            '];'
        ], new Selection(1, 1, 1, 1), [
            'const standardLanguageDescriptions = [',
            '    const value = 2;',
            '    {',
            '        diagnosticSource: \'js\',',
            '    }',
            '];'
        ], new Selection(2, 5, 2, 5), languageConfigurationService);
        mode.dispose();
        languageService.dispose();
        languageConfigurationService.dispose();
    });
    test('move line should still work as before if there is no indentation rules', () => {
        testMoveLinesUpWithIndentCommand(null, [
            'if (true) {',
            '    var task = new Task(() => {',
            '        var work = 1234;',
            '    });',
            '}'
        ], new Selection(3, 1, 3, 1), [
            'if (true) {',
            '        var work = 1234;',
            '    var task = new Task(() => {',
            '    });',
            '}'
        ], new Selection(2, 1, 2, 1));
    });
});
let EnterRulesMode = class EnterRulesMode extends Disposable {
    constructor(languageService, languageConfigurationService) {
        super();
        this.languageId = 'moveLinesEnterMode';
        this._register(languageService.registerLanguage({ id: this.languageId }));
        this._register(languageConfigurationService.register(this.languageId, {
            indentationRules: {
                decreaseIndentPattern: /^\s*\[$/,
                increaseIndentPattern: /^\s*\]$/,
            },
            brackets: [
                ['{', '}']
            ]
        }));
    }
};
EnterRulesMode = __decorate([
    __param(0, ILanguageService),
    __param(1, ILanguageConfigurationService)
], EnterRulesMode);
suite('Editor - contrib - Move Lines Command honors onEnter Rules', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('issue #54829. move block across block', () => {
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        const mode = new EnterRulesMode(languageService, languageConfigurationService);
        testMoveLinesDownWithIndentCommand(mode.languageId, [
            'if (true) {',
            '    if (false) {',
            '        if (1) {',
            '            console.log(\'b\');',
            '        }',
            '        console.log(\'a\');',
            '    }',
            '}'
        ], new Selection(3, 9, 5, 10), [
            'if (true) {',
            '    if (false) {',
            '        console.log(\'a\');',
            '        if (1) {',
            '            console.log(\'b\');',
            '        }',
            '    }',
            '}'
        ], new Selection(4, 9, 6, 10), languageConfigurationService);
        mode.dispose();
        languageService.dispose();
        languageConfigurationService.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW92ZUxpbmVzQ29tbWFuZC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvbGluZXNPcGVyYXRpb25zL3Rlc3QvYnJvd3Nlci9tb3ZlTGluZXNDb21tYW5kLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFNUUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDOUcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUVySCxJQUFXLGtCQUdWO0FBSEQsV0FBVyxrQkFBa0I7SUFDNUIsdURBQUUsQ0FBQTtJQUNGLDJEQUFJLENBQUE7QUFDTCxDQUFDLEVBSFUsa0JBQWtCLEtBQWxCLGtCQUFrQixRQUc1QjtBQUVELFNBQVMsd0JBQXdCLENBQUMsS0FBZSxFQUFFLFNBQW9CLEVBQUUsYUFBdUIsRUFBRSxpQkFBNEIsRUFBRSw0QkFBNEQ7SUFDM0wsNEJBQTRCLGtDQUEwQixLQUFLLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxpQkFBaUIsRUFBRSw0QkFBNEIsQ0FBQyxDQUFD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