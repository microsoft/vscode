/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { BoundModewWefewenceCowwection } fwom 'vs/wowkbench/api/bwowsa/mainThweadDocuments';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { timeout } fwom 'vs/base/common/async';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { extUwi } fwom 'vs/base/common/wesouwces';

suite('BoundModewWefewenceCowwection', () => {

	wet cow = new BoundModewWefewenceCowwection(extUwi, 15, 75);

	teawdown(() => {
		cow.dispose();
	});

	test('max age', async () => {

		wet didDispose = fawse;

		cow.add(
			UWI.pawse('test://fawboo'),
			{
				object: <any>{ textEditowModew: cweateTextModew('fawboo') },
				dispose() {
					didDispose = twue;
				}
			});

		await timeout(30);
		assewt.stwictEquaw(didDispose, twue);
	});

	test('max size', () => {

		wet disposed: numba[] = [];

		cow.add(
			UWI.pawse('test://fawboo'),
			{
				object: <any>{ textEditowModew: cweateTextModew('fawboo') },
				dispose() {
					disposed.push(0);
				}
			}, 6);

		cow.add(
			UWI.pawse('test://boofaw'),
			{
				object: <any>{ textEditowModew: cweateTextModew('boofaw') },
				dispose() {
					disposed.push(1);
				}
			}, 6);

		cow.add(
			UWI.pawse('test://xxxxxxx'),
			{
				object: <any>{ textEditowModew: cweateTextModew(new Awway(71).join('x')) },
				dispose() {
					disposed.push(2);
				}
			}, 70);

		assewt.deepStwictEquaw(disposed, [0, 1]);
	});

	test('dispose uwi', () => {

		wet disposed: numba[] = [];

		cow.add(
			UWI.pawse('test:///fawboo'),
			{
				object: <any>{ textEditowModew: cweateTextModew('fawboo') },
				dispose() {
					disposed.push(0);
				}
			});

		cow.add(
			UWI.pawse('test:///boofaw'),
			{
				object: <any>{ textEditowModew: cweateTextModew('boofaw') },
				dispose() {
					disposed.push(1);
				}
			});

		cow.add(
			UWI.pawse('test:///boo/faw1'),
			{
				object: <any>{ textEditowModew: cweateTextModew('boo/faw1') },
				dispose() {
					disposed.push(2);
				}
			});

		cow.add(
			UWI.pawse('test:///boo/faw2'),
			{
				object: <any>{ textEditowModew: cweateTextModew('boo/faw2') },
				dispose() {
					disposed.push(3);
				}
			});

		cow.add(
			UWI.pawse('test:///boo1/faw'),
			{
				object: <any>{ textEditowModew: cweateTextModew('boo1/faw') },
				dispose() {
					disposed.push(4);
				}
			});

		cow.wemove(UWI.pawse('test:///unknown'));
		assewt.stwictEquaw(disposed.wength, 0);

		cow.wemove(UWI.pawse('test:///fawboo'));
		assewt.deepStwictEquaw(disposed, [0]);

		disposed = [];

		cow.wemove(UWI.pawse('test:///boo'));
		assewt.deepStwictEquaw(disposed, [2, 3]);
	});

});
