/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorAutoIndentStrategy } from '../../../../common/config/editorOptions.js';
import { Selection } from '../../../../common/core/selection.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { IndentationRule } from '../../../../common/languages/languageConfiguration.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { LanguageService } from '../../../../common/services/languageService.js';
import { MoveLinesCommand } from '../../browser/moveLinesCommand.js';
import { testCommand } from '../../../../test/browser/testCommand.js';
import { TestLanguageConfigurationService } from '../../../../test/common/modes/testLanguageConfigurationService.js';

const enum MoveLinesDirection {
	Up,
	Down
}

function testMoveLinesDownCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection, languageConfigurationService?: ILanguageConfigurationService): void {
	testMoveLinesUpOrDownCommand(MoveLinesDirection.Down, lines, selection, expectedLines, expectedSelection, languageConfigurationService);
}

function testMoveLinesUpCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection, languageConfigurationService?: ILanguageConfigurationService): void {
	testMoveLinesUpOrDownCommand(MoveLinesDirection.Up, lines, selection, expectedLines, expectedSelection, languageConfigurationService);
}

function testMoveLinesDownWithIndentCommand(languageId: string, lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection, languageConfigurationService?: ILanguageConfigurationService): void {
	testMoveLinesUpOrDownWithIndentCommand(MoveLinesDirection.Down, languageId, lines, selection, expectedLines, expectedSelection, languageConfigurationService);
}

function testMoveLinesUpWithIndentCommand(languageId: string, lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection, languageConfigurationService?: ILanguageConfigurationService): void {
	testMoveLinesUpOrDownWithIndentCommand(MoveLinesDirection.Up, languageId, lines, selection, expectedLines, expectedSelection, languageConfigurationService);
}

function testMoveLinesUpOrDownCommand(direction: MoveLinesDirection, lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection, languageConfigurationService?: ILanguageConfigurationService) {
	const disposables = new DisposableStore();
	if (!languageConfigurationService) {
		languageConfigurationService = disposables.add(new TestLanguageConfigurationService());
	}
	testCommand(lines, null, selection, (accessor, sel) => new MoveLinesCommand(sel, direction === MoveLinesDirection.Up ? false : true, EditorAutoIndentStrategy.Advanced, languageConfigurationService), expectedLines, expectedSelection);
	disposables.dispose();
}

function testMoveLinesUpOrDownWithIndentCommand(direction: MoveLinesDirection, languageId: string, lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection, languageConfigurationService?: ILanguageConfigurationService) {
	const disposables = new DisposableStore();
	if (!languageConfigurationService) {
		languageConfigurationService = disposables.add(new TestLanguageConfigurationService());
	}
	testCommand(lines, languageId, selection, (accessor, sel) => new MoveLinesCommand(sel, direction === MoveLinesDirection.Up ? false : true, EditorAutoIndentStrategy.Full, languageConfigurationService), expectedLines, expectedSelection);
	disposables.dispose();
}

suite('Editor Contrib - Move Lines Command', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('move first up / last down disabled', function () {
		testMoveLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 1, 1),
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 1, 1)
		);

		testMoveLinesDownCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 1, 5, 1),
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 1, 5, 1)
		);
	});

	test('move first line down', function () {
		testMoveLinesDownCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 4, 1, 1),
			[
				'second line',
				'first',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 4, 2, 1)
		);
	});

	test('move 2nd line up', function () {
		testMoveLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 1, 2, 1),
			[
				'second line',
				'first',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 1, 1)
		);
	});

	test('issue #1322a: move 2nd line up', function () {
		testMoveLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 12, 2, 12),
			[
				'second line',
				'first',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 12, 1, 12)
		);
	});

	test('issue #1322b: move last line up', function () {
		testMoveLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 6, 5, 6),
			[
				'first',
				'second line',
				'third line',
				'fifth',
				'fourth line'
			],
			new Selection(4, 6, 4, 6)
		);
	});

	test('issue #1322c: move last line selected up', function () {
		testMoveLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 6, 5, 1),
			[
				'first',
				'second line',
				'third line',
				'fifth',
				'fourth line'
			],
			new Selection(4, 6, 4, 1)
		);
	});

	test('move last line up', function () {
		testMoveLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 1, 5, 1),
			[
				'first',
				'second line',
				'third line',
				'fifth',
				'fourth line'
			],
			new Selection(4, 1, 4, 1)
		);
	});

	test('move 4th line down', function () {
		testMoveLinesDownCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(4, 1, 4, 1),
			[
				'first',
				'second line',
				'third line',
				'fifth',
				'fourth line'
			],
			new Selection(5, 1, 5, 1)
		);
	});

	test('move multiple lines down', function () {
		testMoveLinesDownCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(4, 4, 2, 2),
			[
				'first',
				'fifth',
				'second line',
				'third line',
				'fourth line'
			],
			new Selection(5, 4, 3, 2)
		);
	});

	test('invisible selection is ignored', function () {
		testMoveLinesDownCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 1, 1, 1),
			[
				'second line',
				'first',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(3, 1, 2, 1)
		);
	});
});

class IndentRulesMode extends Disposable {
	public readonly languageId = 'moveLinesIndentMode';
	constructor(
		indentationRules: IndentationRule,
		@ILanguageService languageService: ILanguageService,
		@ILanguageConfigurationService languageConfigurationService: ILanguageConfigurationService
	) {
		super();
		this._register(languageService.registerLanguage({ id: this.languageId }));
		this._register(languageConfigurationService.register(this.languageId, {
			indentationRules: indentationRules
		}));
	}
}

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

		testMoveLinesUpWithIndentCommand(
			mode.languageId,
			[
				'class X {',
				'\tz = 2',
				'}'
			],
			new Selection(2, 1, 2, 1),
			[
				'z = 2',
				'class X {',
				'}'
			],
			new Selection(1, 1, 1, 1),
			languageConfigurationService
		);

		mode.dispose();
		languageService.dispose();
		languageConfigurationService.dispose();
	});

	// https://github.com/microsoft/vscode/issues/28552#issuecomment-307867717
	test('move lines across block', () => {
		const languageService = new LanguageService();
		const languageConfigurationService = new TestLanguageConfigurationService();
		const mode = new IndentRulesMode(indentRules, languageService, languageConfigurationService);

		testMoveLinesDownWithIndentCommand(
			mode.languageId,
			[
				'const value = 2;',
				'const standardLanguageDescriptions = [',
				'    {',
				'        diagnosticSource: \'js\',',
				'    }',
				'];'
			],
			new Selection(1, 1, 1, 1),
			[
				'const standardLanguageDescriptions = [',
				'    const value = 2;',
				'    {',
				'        diagnosticSource: \'js\',',
				'    }',
				'];'
			],
			new Selection(2, 5, 2, 5),
			languageConfigurationService
		);

		mode.dispose();
		languageService.dispose();
		languageConfigurationService.dispose();
	});


	test('move line should still work as before if there is no indentation rules', () => {
		testMoveLinesUpWithIndentCommand(
			null!,
			[
				'if (true) {',
				'    var task = new Task(() => {',
				'        var work = 1234;',
				'    });',
				'}'
			],
			new Selection(3, 1, 3, 1),
			[
				'if (true) {',
				'        var work = 1234;',
				'    var task = new Task(() => {',
				'    });',
				'}'
			],
			new Selection(2, 1, 2, 1)
		);
	});
});

class EnterRulesMode extends Disposable {
	public readonly languageId = 'moveLinesEnterMode';
	constructor(
		@ILanguageService languageService: ILanguageService,
		@ILanguageConfigurationService languageConfigurationService: ILanguageConfigurationService
	) {
		super();
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
}

suite('Editor - contrib - Move Lines Command honors onEnter Rules', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #54829. move block across block', () => {
		const languageService = new LanguageService();
		const languageConfigurationService = new TestLanguageConfigurationService();
		const mode = new EnterRulesMode(languageService, languageConfigurationService);

		testMoveLinesDownWithIndentCommand(
			mode.languageId,

			[
				'if (true) {',
				'    if (false) {',
				'        if (1) {',
				'            console.log(\'b\');',
				'        }',
				'        console.log(\'a\');',
				'    }',
				'}'
			],
			new Selection(3, 9, 5, 10),
			[
				'if (true) {',
				'    if (false) {',
				'        console.log(\'a\');',
				'        if (1) {',
				'            console.log(\'b\');',
				'        }',
				'    }',
				'}'
			],
			new Selection(4, 9, 6, 10),
			languageConfigurationService
		);

		mode.dispose();
		languageService.dispose();
		languageConfigurationService.dispose();
	});
});
