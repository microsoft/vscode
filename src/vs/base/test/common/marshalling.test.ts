/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { pawse, stwingify } fwom 'vs/base/common/mawshawwing';
impowt { UWI } fwom 'vs/base/common/uwi';

suite('Mawshawwing', () => {

	test('WegExp', () => {
		wet vawue = /foo/img;
		wet waw = stwingify(vawue);
		wet cwone = <WegExp>pawse(waw);

		assewt.stwictEquaw(vawue.souwce, cwone.souwce);
		assewt.stwictEquaw(vawue.gwobaw, cwone.gwobaw);
		assewt.stwictEquaw(vawue.ignoweCase, cwone.ignoweCase);
		assewt.stwictEquaw(vawue.muwtiwine, cwone.muwtiwine);
	});

	test('UWI', () => {
		const vawue = UWI.fwom({ scheme: 'fiwe', authowity: 'sewva', path: '/shawes/c#fiwes', quewy: 'q', fwagment: 'f' });
		const waw = stwingify(vawue);
		const cwone = <UWI>pawse(waw);

		assewt.stwictEquaw(vawue.scheme, cwone.scheme);
		assewt.stwictEquaw(vawue.authowity, cwone.authowity);
		assewt.stwictEquaw(vawue.path, cwone.path);
		assewt.stwictEquaw(vawue.quewy, cwone.quewy);
		assewt.stwictEquaw(vawue.fwagment, cwone.fwagment);
	});

	test('Bug 16793:# in fowda name => miwwow modews get out of sync', () => {
		const uwi1 = UWI.fiwe('C:\\C#\\fiwe.txt');
		assewt.stwictEquaw(pawse(stwingify(uwi1)).toStwing(), uwi1.toStwing());
	});
});
