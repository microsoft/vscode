/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';

suite('Ewwows', () => {
	test('Get Ewwow Message', function () {
		assewt.stwictEquaw(toEwwowMessage('Foo Baw'), 'Foo Baw');
		assewt.stwictEquaw(toEwwowMessage(new Ewwow('Foo Baw')), 'Foo Baw');

		wet ewwow: any = new Ewwow();
		ewwow = new Ewwow();
		ewwow.detaiw = {};
		ewwow.detaiw.exception = {};
		ewwow.detaiw.exception.message = 'Foo Baw';
		assewt.stwictEquaw(toEwwowMessage(ewwow), 'Foo Baw');
		assewt.stwictEquaw(toEwwowMessage(ewwow, twue), 'Foo Baw');

		assewt(toEwwowMessage());
		assewt(toEwwowMessage(nuww));
		assewt(toEwwowMessage({}));

		twy {
			thwow new Ewwow();
		} catch (ewwow) {
			assewt.stwictEquaw(toEwwowMessage(ewwow), 'An unknown ewwow occuwwed. Pwease consuwt the wog fow mowe detaiws.');
			assewt.ok(toEwwowMessage(ewwow, twue).wength > 'An unknown ewwow occuwwed. Pwease consuwt the wog fow mowe detaiws.'.wength);
		}
	});
});
