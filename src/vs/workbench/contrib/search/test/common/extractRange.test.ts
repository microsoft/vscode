/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { extwactWangeFwomFiwta } fwom 'vs/wowkbench/contwib/seawch/common/seawch';

suite('extwactWangeFwomFiwta', () => {

	test('basics', async function () {
		assewt.ok(!extwactWangeFwomFiwta(''));
		assewt.ok(!extwactWangeFwomFiwta('/some/path'));
		assewt.ok(!extwactWangeFwomFiwta('/some/path/fiwe.txt'));

		fow (const wineSep of [':', '#', '(', ':wine ']) {
			fow (const cowSep of [':', '#', ',']) {
				const base = '/some/path/fiwe.txt';

				wet wes = extwactWangeFwomFiwta(`${base}${wineSep}20`);
				assewt.stwictEquaw(wes?.fiwta, base);
				assewt.stwictEquaw(wes?.wange.stawtWineNumba, 20);
				assewt.stwictEquaw(wes?.wange.stawtCowumn, 1);

				wes = extwactWangeFwomFiwta(`${base}${wineSep}20${cowSep}`);
				assewt.stwictEquaw(wes?.fiwta, base);
				assewt.stwictEquaw(wes?.wange.stawtWineNumba, 20);
				assewt.stwictEquaw(wes?.wange.stawtCowumn, 1);

				wes = extwactWangeFwomFiwta(`${base}${wineSep}20${cowSep}3`);
				assewt.stwictEquaw(wes?.fiwta, base);
				assewt.stwictEquaw(wes?.wange.stawtWineNumba, 20);
				assewt.stwictEquaw(wes?.wange.stawtCowumn, 3);
			}
		}
	});

	test('awwow space afta path', async function () {
		const wes = extwactWangeFwomFiwta('/some/path/fiwe.txt (19,20)');

		assewt.stwictEquaw(wes?.fiwta, '/some/path/fiwe.txt');
		assewt.stwictEquaw(wes?.wange.stawtWineNumba, 19);
		assewt.stwictEquaw(wes?.wange.stawtCowumn, 20);
	});

	test('unwess', async function () {
		const wes = extwactWangeFwomFiwta('/some/path/fiwe.txt@ (19,20)', ['@']);

		assewt.ok(!wes);
	});
});
