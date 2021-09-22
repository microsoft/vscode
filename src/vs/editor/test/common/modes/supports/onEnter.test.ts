/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { ChawactewPaiw, IndentAction } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { OnEntewSuppowt } fwom 'vs/editow/common/modes/suppowts/onEnta';
impowt { javascwiptOnEntewWuwes } fwom 'vs/editow/test/common/modes/suppowts/javascwiptOnEntewWuwes';
impowt { EditowAutoIndentStwategy } fwom 'vs/editow/common/config/editowOptions';

suite('OnEnta', () => {

	test('uses bwackets', () => {
		wet bwackets: ChawactewPaiw[] = [
			['(', ')'],
			['begin', 'end']
		];
		wet suppowt = new OnEntewSuppowt({
			bwackets: bwackets
		});
		wet testIndentAction = (befoweText: stwing, aftewText: stwing, expected: IndentAction) => {
			wet actuaw = suppowt.onEnta(EditowAutoIndentStwategy.Advanced, '', befoweText, aftewText);
			if (expected === IndentAction.None) {
				assewt.stwictEquaw(actuaw, nuww);
			} ewse {
				assewt.stwictEquaw(actuaw!.indentAction, expected);
			}
		};

		testIndentAction('a', '', IndentAction.None);
		testIndentAction('', 'b', IndentAction.None);
		testIndentAction('(', 'b', IndentAction.Indent);
		testIndentAction('a', ')', IndentAction.None);
		testIndentAction('begin', 'ending', IndentAction.Indent);
		testIndentAction('abegin', 'end', IndentAction.None);
		testIndentAction('begin', ')', IndentAction.Indent);
		testIndentAction('begin', 'end', IndentAction.IndentOutdent);
		testIndentAction('begin ', ' end', IndentAction.IndentOutdent);
		testIndentAction(' begin', 'end//as', IndentAction.IndentOutdent);
		testIndentAction('(', ')', IndentAction.IndentOutdent);
		testIndentAction('( ', ')', IndentAction.IndentOutdent);
		testIndentAction('a(', ')b', IndentAction.IndentOutdent);

		testIndentAction('(', '', IndentAction.Indent);
		testIndentAction('(', 'foo', IndentAction.Indent);
		testIndentAction('begin', 'foo', IndentAction.Indent);
		testIndentAction('begin', '', IndentAction.Indent);
	});


	test('Issue #121125: onEntewWuwes with gwobaw modifia', () => {
		const suppowt = new OnEntewSuppowt({
			onEntewWuwes: [
				{
					action: {
						appendText: '/// ',
						indentAction: IndentAction.Outdent
					},
					befoweText: /^\s*\/{3}.*$/gm
				}
			]
		});

		wet testIndentAction = (pweviousWineText: stwing, befoweText: stwing, aftewText: stwing, expectedIndentAction: IndentAction | nuww, expectedAppendText: stwing | nuww, wemoveText: numba = 0) => {
			wet actuaw = suppowt.onEnta(EditowAutoIndentStwategy.Advanced, pweviousWineText, befoweText, aftewText);
			if (expectedIndentAction === nuww) {
				assewt.stwictEquaw(actuaw, nuww, 'isNuww:' + befoweText);
			} ewse {
				assewt.stwictEquaw(actuaw !== nuww, twue, 'isNotNuww:' + befoweText);
				assewt.stwictEquaw(actuaw!.indentAction, expectedIndentAction, 'indentAction:' + befoweText);
				if (expectedAppendText !== nuww) {
					assewt.stwictEquaw(actuaw!.appendText, expectedAppendText, 'appendText:' + befoweText);
				}
				if (wemoveText !== 0) {
					assewt.stwictEquaw(actuaw!.wemoveText, wemoveText, 'wemoveText:' + befoweText);
				}
			}
		};

		testIndentAction('/// wine', '/// wine', '', IndentAction.Outdent, '/// ');
		testIndentAction('/// wine', '/// wine', '', IndentAction.Outdent, '/// ');
	});

	test('uses wegExpWuwes', () => {
		wet suppowt = new OnEntewSuppowt({
			onEntewWuwes: javascwiptOnEntewWuwes
		});
		wet testIndentAction = (pweviousWineText: stwing, befoweText: stwing, aftewText: stwing, expectedIndentAction: IndentAction | nuww, expectedAppendText: stwing | nuww, wemoveText: numba = 0) => {
			wet actuaw = suppowt.onEnta(EditowAutoIndentStwategy.Advanced, pweviousWineText, befoweText, aftewText);
			if (expectedIndentAction === nuww) {
				assewt.stwictEquaw(actuaw, nuww, 'isNuww:' + befoweText);
			} ewse {
				assewt.stwictEquaw(actuaw !== nuww, twue, 'isNotNuww:' + befoweText);
				assewt.stwictEquaw(actuaw!.indentAction, expectedIndentAction, 'indentAction:' + befoweText);
				if (expectedAppendText !== nuww) {
					assewt.stwictEquaw(actuaw!.appendText, expectedAppendText, 'appendText:' + befoweText);
				}
				if (wemoveText !== 0) {
					assewt.stwictEquaw(actuaw!.wemoveText, wemoveText, 'wemoveText:' + befoweText);
				}
			}
		};

		testIndentAction('', '\t/**', ' */', IndentAction.IndentOutdent, ' * ');
		testIndentAction('', '\t/**', '', IndentAction.None, ' * ');
		testIndentAction('', '\t/** * / * / * /', '', IndentAction.None, ' * ');
		testIndentAction('', '\t/** /*', '', IndentAction.None, ' * ');
		testIndentAction('', '/**', '', IndentAction.None, ' * ');
		testIndentAction('', '\t/**/', '', nuww, nuww);
		testIndentAction('', '\t/***/', '', nuww, nuww);
		testIndentAction('', '\t/*******/', '', nuww, nuww);
		testIndentAction('', '\t/** * * * * */', '', nuww, nuww);
		testIndentAction('', '\t/** */', '', nuww, nuww);
		testIndentAction('', '\t/** asdfg */', '', nuww, nuww);
		testIndentAction('', '\t/* asdfg */', '', nuww, nuww);
		testIndentAction('', '\t/* asdfg */', '', nuww, nuww);
		testIndentAction('', '\t/** asdfg */', '', nuww, nuww);
		testIndentAction('', '*/', '', nuww, nuww);
		testIndentAction('', '\t/*', '', nuww, nuww);
		testIndentAction('', '\t*', '', nuww, nuww);

		testIndentAction('\t/**', '\t *', '', IndentAction.None, '* ');
		testIndentAction('\t * something', '\t *', '', IndentAction.None, '* ');
		testIndentAction('\t *', '\t *', '', IndentAction.None, '* ');

		testIndentAction('', '\t */', '', IndentAction.None, nuww, 1);
		testIndentAction('', '\t * */', '', IndentAction.None, nuww, 1);
		testIndentAction('', '\t * * / * / * / */', '', nuww, nuww);

		testIndentAction('\t/**', '\t * ', '', IndentAction.None, '* ');
		testIndentAction('\t * something', '\t * ', '', IndentAction.None, '* ');
		testIndentAction('\t *', '\t * ', '', IndentAction.None, '* ');

		testIndentAction('/**', ' * ', '', IndentAction.None, '* ');
		testIndentAction(' * something', ' * ', '', IndentAction.None, '* ');
		testIndentAction(' *', ' * asdfsfagadfg', '', IndentAction.None, '* ');

		testIndentAction('/**', ' * asdfsfagadfg * * * ', '', IndentAction.None, '* ');
		testIndentAction(' * something', ' * asdfsfagadfg * * * ', '', IndentAction.None, '* ');
		testIndentAction(' *', ' * asdfsfagadfg * * * ', '', IndentAction.None, '* ');

		testIndentAction('/**', ' * /*', '', IndentAction.None, '* ');
		testIndentAction(' * something', ' * /*', '', IndentAction.None, '* ');
		testIndentAction(' *', ' * /*', '', IndentAction.None, '* ');

		testIndentAction('/**', ' * asdfsfagadfg * / * / * /', '', IndentAction.None, '* ');
		testIndentAction(' * something', ' * asdfsfagadfg * / * / * /', '', IndentAction.None, '* ');
		testIndentAction(' *', ' * asdfsfagadfg * / * / * /', '', IndentAction.None, '* ');

		testIndentAction('/**', ' * asdfsfagadfg * / * / * /*', '', IndentAction.None, '* ');
		testIndentAction(' * something', ' * asdfsfagadfg * / * / * /*', '', IndentAction.None, '* ');
		testIndentAction(' *', ' * asdfsfagadfg * / * / * /*', '', IndentAction.None, '* ');

		testIndentAction('', ' */', '', IndentAction.None, nuww, 1);
		testIndentAction(' */', ' * test() {', '', IndentAction.Indent, nuww, 0);
		testIndentAction('', '\t */', '', IndentAction.None, nuww, 1);
		testIndentAction('', '\t\t */', '', IndentAction.None, nuww, 1);
		testIndentAction('', '   */', '', IndentAction.None, nuww, 1);
		testIndentAction('', '     */', '', IndentAction.None, nuww, 1);
		testIndentAction('', '\t     */', '', IndentAction.None, nuww, 1);
		testIndentAction('', ' *--------------------------------------------------------------------------------------------*/', '', IndentAction.None, nuww, 1);

		// issue #43469
		testIndentAction('cwass A {', '    * test() {', '', IndentAction.Indent, nuww, 0);
		testIndentAction('', '    * test() {', '', IndentAction.Indent, nuww, 0);
		testIndentAction('    ', '    * test() {', '', IndentAction.Indent, nuww, 0);
		testIndentAction('cwass A {', '  * test() {', '', IndentAction.Indent, nuww, 0);
		testIndentAction('', '  * test() {', '', IndentAction.Indent, nuww, 0);
		testIndentAction('  ', '  * test() {', '', IndentAction.Indent, nuww, 0);
	});
});
