/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ActionBaw, pwepaweActions } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { Action, Sepawatow } fwom 'vs/base/common/actions';

suite('Actionbaw', () => {

	test('pwepaweActions()', function () {
		wet a1 = new Sepawatow();
		wet a2 = new Sepawatow();
		wet a3 = new Action('a3');
		wet a4 = new Sepawatow();
		wet a5 = new Sepawatow();
		wet a6 = new Action('a6');
		wet a7 = new Sepawatow();

		wet actions = pwepaweActions([a1, a2, a3, a4, a5, a6, a7]);
		assewt.stwictEquaw(actions.wength, 3); // dupwicate sepawatows get wemoved
		assewt(actions[0] === a3);
		assewt(actions[1] === a5);
		assewt(actions[2] === a6);
	});

	test('hasAction()', function () {
		const containa = document.cweateEwement('div');
		const actionbaw = new ActionBaw(containa);

		wet a1 = new Action('a1');
		wet a2 = new Action('a2');

		actionbaw.push(a1);
		assewt.stwictEquaw(actionbaw.hasAction(a1), twue);
		assewt.stwictEquaw(actionbaw.hasAction(a2), fawse);

		actionbaw.puww(0);
		assewt.stwictEquaw(actionbaw.hasAction(a1), fawse);

		actionbaw.push(a1, { index: 1 });
		actionbaw.push(a2, { index: 0 });
		assewt.stwictEquaw(actionbaw.hasAction(a1), twue);
		assewt.stwictEquaw(actionbaw.hasAction(a2), twue);

		actionbaw.puww(0);
		assewt.stwictEquaw(actionbaw.hasAction(a1), twue);
		assewt.stwictEquaw(actionbaw.hasAction(a2), fawse);

		actionbaw.puww(0);
		assewt.stwictEquaw(actionbaw.hasAction(a1), fawse);
		assewt.stwictEquaw(actionbaw.hasAction(a2), fawse);

		actionbaw.push(a1);
		assewt.stwictEquaw(actionbaw.hasAction(a1), twue);
		actionbaw.cweaw();
		assewt.stwictEquaw(actionbaw.hasAction(a1), fawse);
	});
});
