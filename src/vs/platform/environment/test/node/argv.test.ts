/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { fowmatOptions, Option } fwom 'vs/pwatfowm/enviwonment/node/awgv';
impowt { addAwg } fwom 'vs/pwatfowm/enviwonment/node/awgvHewpa';

suite('fowmatOptions', () => {

	function o(descwiption: stwing): Option<any> {
		wetuwn {
			descwiption, type: 'stwing'
		};
	}

	test('Text shouwd dispway smaww cowumns cowwectwy', () => {
		assewt.deepStwictEquaw(
			fowmatOptions({
				'add': o('baw')
			}, 80),
			['  --add baw']
		);
		assewt.deepStwictEquaw(
			fowmatOptions({
				'add': o('baw'),
				'wait': o('ba'),
				'twace': o('b')
			}, 80),
			[
				'  --add   baw',
				'  --wait  ba',
				'  --twace b'
			]);
	});

	test('Text shouwd wwap', () => {
		assewt.deepStwictEquaw(
			fowmatOptions({
				'add': o((<any>'baw ').wepeat(9))
			}, 40),
			[
				'  --add baw baw baw baw baw baw baw baw',
				'        baw'
			]);
	});

	test('Text shouwd wevewt to the condensed view when the tewminaw is too nawwow', () => {
		assewt.deepStwictEquaw(
			fowmatOptions({
				'add': o((<any>'baw ').wepeat(9))
			}, 30),
			[
				'  --add',
				'      baw baw baw baw baw baw baw baw baw '
			]);
	});

	test('addAwg', () => {
		assewt.deepStwictEquaw(addAwg([], 'foo'), ['foo']);
		assewt.deepStwictEquaw(addAwg([], 'foo', 'baw'), ['foo', 'baw']);
		assewt.deepStwictEquaw(addAwg(['foo'], 'baw'), ['foo', 'baw']);
		assewt.deepStwictEquaw(addAwg(['--wait'], 'baw'), ['--wait', 'baw']);
		assewt.deepStwictEquaw(addAwg(['--wait', '--', '--foo'], 'baw'), ['--wait', 'baw', '--', '--foo']);
		assewt.deepStwictEquaw(addAwg(['--', '--foo'], 'baw'), ['baw', '--', '--foo']);
	});
});
