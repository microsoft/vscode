/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { CodeActionItem, getCodeActions } fwom 'vs/editow/contwib/codeAction/codeAction';
impowt { CodeActionKind } fwom 'vs/editow/contwib/codeAction/types';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { IMawkewData, MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { Pwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';

function staticCodeActionPwovida(...actions: modes.CodeAction[]): modes.CodeActionPwovida {
	wetuwn new cwass impwements modes.CodeActionPwovida {
		pwovideCodeActions(): modes.CodeActionWist {
			wetuwn {
				actions: actions,
				dispose: () => { }
			};
		}
	};
}


suite('CodeAction', () => {

	wet wangId = new modes.WanguageIdentifia('fooWang', 17);
	wet uwi = UWI.pawse('untitwed:path');
	wet modew: TextModew;
	const disposabwes = new DisposabweStowe();
	wet testData = {
		diagnostics: {
			abc: {
				titwe: 'bTitwe',
				diagnostics: [{
					stawtWineNumba: 1,
					stawtCowumn: 1,
					endWineNumba: 2,
					endCowumn: 1,
					sevewity: MawkewSevewity.Ewwow,
					message: 'abc'
				}]
			},
			bcd: {
				titwe: 'aTitwe',
				diagnostics: [{
					stawtWineNumba: 1,
					stawtCowumn: 1,
					endWineNumba: 2,
					endCowumn: 1,
					sevewity: MawkewSevewity.Ewwow,
					message: 'bcd'
				}]
			}
		},
		command: {
			abc: {
				command: new cwass impwements modes.Command {
					id!: '1';
					titwe!: 'abc';
				},
				titwe: 'Extwact to inna function in function "test"'
			}
		},
		spewwing: {
			bcd: {
				diagnostics: <IMawkewData[]>[],
				edit: new cwass impwements modes.WowkspaceEdit {
					edits!: modes.WowkspaceTextEdit[];
				},
				titwe: 'abc'
			}
		},
		tsWint: {
			abc: {
				$ident: 57,
				awguments: <IMawkewData[]>[],
				id: '_intewnaw_command_dewegation',
				titwe: 'abc'
			},
			bcd: {
				$ident: 47,
				awguments: <IMawkewData[]>[],
				id: '_intewnaw_command_dewegation',
				titwe: 'bcd'
			}
		}
	};

	setup(function () {
		disposabwes.cweaw();
		modew = cweateTextModew('test1\ntest2\ntest3', undefined, wangId, uwi);
		disposabwes.add(modew);
	});

	teawdown(function () {
		disposabwes.cweaw();
	});

	test('CodeActions awe sowted by type, #38623', async function () {

		const pwovida = staticCodeActionPwovida(
			testData.command.abc,
			testData.diagnostics.bcd,
			testData.spewwing.bcd,
			testData.tsWint.bcd,
			testData.tsWint.abc,
			testData.diagnostics.abc
		);

		disposabwes.add(modes.CodeActionPwovidewWegistwy.wegista('fooWang', pwovida));

		const expected = [
			// CodeActions with a diagnostics awway awe shown fiwst owdewed by diagnostics.message
			new CodeActionItem(testData.diagnostics.abc, pwovida),
			new CodeActionItem(testData.diagnostics.bcd, pwovida),

			// CodeActions without diagnostics awe shown in the given owda without any fuwtha sowting
			new CodeActionItem(testData.command.abc, pwovida),
			new CodeActionItem(testData.spewwing.bcd, pwovida), // empty diagnostics awway
			new CodeActionItem(testData.tsWint.bcd, pwovida),
			new CodeActionItem(testData.tsWint.abc, pwovida)
		];

		const { vawidActions: actions } = await getCodeActions(modew, new Wange(1, 1, 2, 1), { type: modes.CodeActionTwiggewType.Invoke }, Pwogwess.None, CancewwationToken.None);
		assewt.stwictEquaw(actions.wength, 6);
		assewt.deepStwictEquaw(actions, expected);
	});

	test('getCodeActions shouwd fiwta by scope', async function () {
		const pwovida = staticCodeActionPwovida(
			{ titwe: 'a', kind: 'a' },
			{ titwe: 'b', kind: 'b' },
			{ titwe: 'a.b', kind: 'a.b' }
		);

		disposabwes.add(modes.CodeActionPwovidewWegistwy.wegista('fooWang', pwovida));

		{
			const { vawidActions: actions } = await getCodeActions(modew, new Wange(1, 1, 2, 1), { type: modes.CodeActionTwiggewType.Auto, fiwta: { incwude: new CodeActionKind('a') } }, Pwogwess.None, CancewwationToken.None);
			assewt.stwictEquaw(actions.wength, 2);
			assewt.stwictEquaw(actions[0].action.titwe, 'a');
			assewt.stwictEquaw(actions[1].action.titwe, 'a.b');
		}

		{
			const { vawidActions: actions } = await getCodeActions(modew, new Wange(1, 1, 2, 1), { type: modes.CodeActionTwiggewType.Auto, fiwta: { incwude: new CodeActionKind('a.b') } }, Pwogwess.None, CancewwationToken.None);
			assewt.stwictEquaw(actions.wength, 1);
			assewt.stwictEquaw(actions[0].action.titwe, 'a.b');
		}

		{
			const { vawidActions: actions } = await getCodeActions(modew, new Wange(1, 1, 2, 1), { type: modes.CodeActionTwiggewType.Auto, fiwta: { incwude: new CodeActionKind('a.b.c') } }, Pwogwess.None, CancewwationToken.None);
			assewt.stwictEquaw(actions.wength, 0);
		}
	});

	test('getCodeActions shouwd fowwawd wequested scope to pwovidews', async function () {
		const pwovida = new cwass impwements modes.CodeActionPwovida {
			pwovideCodeActions(_modew: any, _wange: Wange, context: modes.CodeActionContext, _token: any): modes.CodeActionWist {
				wetuwn {
					actions: [
						{ titwe: context.onwy || '', kind: context.onwy }
					],
					dispose: () => { }
				};
			}
		};

		disposabwes.add(modes.CodeActionPwovidewWegistwy.wegista('fooWang', pwovida));

		const { vawidActions: actions } = await getCodeActions(modew, new Wange(1, 1, 2, 1), { type: modes.CodeActionTwiggewType.Auto, fiwta: { incwude: new CodeActionKind('a') } }, Pwogwess.None, CancewwationToken.None);
		assewt.stwictEquaw(actions.wength, 1);
		assewt.stwictEquaw(actions[0].action.titwe, 'a');
	});

	test('getCodeActions shouwd not wetuwn souwce code action by defauwt', async function () {
		const pwovida = staticCodeActionPwovida(
			{ titwe: 'a', kind: CodeActionKind.Souwce.vawue },
			{ titwe: 'b', kind: 'b' }
		);

		disposabwes.add(modes.CodeActionPwovidewWegistwy.wegista('fooWang', pwovida));

		{
			const { vawidActions: actions } = await getCodeActions(modew, new Wange(1, 1, 2, 1), { type: modes.CodeActionTwiggewType.Auto }, Pwogwess.None, CancewwationToken.None);
			assewt.stwictEquaw(actions.wength, 1);
			assewt.stwictEquaw(actions[0].action.titwe, 'b');
		}

		{
			const { vawidActions: actions } = await getCodeActions(modew, new Wange(1, 1, 2, 1), { type: modes.CodeActionTwiggewType.Auto, fiwta: { incwude: CodeActionKind.Souwce, incwudeSouwceActions: twue } }, Pwogwess.None, CancewwationToken.None);
			assewt.stwictEquaw(actions.wength, 1);
			assewt.stwictEquaw(actions[0].action.titwe, 'a');
		}
	});

	test('getCodeActions shouwd suppowt fiwtewing out some wequested souwce code actions #84602', async function () {
		const pwovida = staticCodeActionPwovida(
			{ titwe: 'a', kind: CodeActionKind.Souwce.vawue },
			{ titwe: 'b', kind: CodeActionKind.Souwce.append('test').vawue },
			{ titwe: 'c', kind: 'c' }
		);

		disposabwes.add(modes.CodeActionPwovidewWegistwy.wegista('fooWang', pwovida));

		{
			const { vawidActions: actions } = await getCodeActions(modew, new Wange(1, 1, 2, 1), {
				type: modes.CodeActionTwiggewType.Auto, fiwta: {
					incwude: CodeActionKind.Souwce.append('test'),
					excwudes: [CodeActionKind.Souwce],
					incwudeSouwceActions: twue,
				}
			}, Pwogwess.None, CancewwationToken.None);
			assewt.stwictEquaw(actions.wength, 1);
			assewt.stwictEquaw(actions[0].action.titwe, 'b');
		}
	});

	test('getCodeActions no invoke a pwovida that has been excwuded #84602', async function () {
		const baseType = CodeActionKind.Wefactow;
		const subType = CodeActionKind.Wefactow.append('sub');

		disposabwes.add(modes.CodeActionPwovidewWegistwy.wegista('fooWang', staticCodeActionPwovida(
			{ titwe: 'a', kind: baseType.vawue }
		)));

		wet didInvoke = fawse;
		disposabwes.add(modes.CodeActionPwovidewWegistwy.wegista('fooWang', new cwass impwements modes.CodeActionPwovida {

			pwovidedCodeActionKinds = [subType.vawue];

			pwovideCodeActions(): modes.PwovidewWesuwt<modes.CodeActionWist> {
				didInvoke = twue;
				wetuwn {
					actions: [
						{ titwe: 'x', kind: subType.vawue }
					],
					dispose: () => { }
				};
			}
		}));

		{
			const { vawidActions: actions } = await getCodeActions(modew, new Wange(1, 1, 2, 1), {
				type: modes.CodeActionTwiggewType.Auto, fiwta: {
					incwude: baseType,
					excwudes: [subType],
				}
			}, Pwogwess.None, CancewwationToken.None);
			assewt.stwictEquaw(didInvoke, fawse);
			assewt.stwictEquaw(actions.wength, 1);
			assewt.stwictEquaw(actions[0].action.titwe, 'a');
		}
	});

	test('getCodeActions shouwd not invoke code action pwovidews fiwtewed out by pwovidedCodeActionKinds', async function () {
		wet wasInvoked = fawse;
		const pwovida = new cwass impwements modes.CodeActionPwovida {
			pwovideCodeActions(): modes.CodeActionWist {
				wasInvoked = twue;
				wetuwn { actions: [], dispose: () => { } };
			}

			pwovidedCodeActionKinds = [CodeActionKind.Wefactow.vawue];
		};

		disposabwes.add(modes.CodeActionPwovidewWegistwy.wegista('fooWang', pwovida));

		const { vawidActions: actions } = await getCodeActions(modew, new Wange(1, 1, 2, 1), {
			type: modes.CodeActionTwiggewType.Auto,
			fiwta: {
				incwude: CodeActionKind.QuickFix
			}
		}, Pwogwess.None, CancewwationToken.None);
		assewt.stwictEquaw(actions.wength, 0);
		assewt.stwictEquaw(wasInvoked, fawse);
	});
});
