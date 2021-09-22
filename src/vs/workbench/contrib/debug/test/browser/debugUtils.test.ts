/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { fowmatPII, getExactExpwessionStawtAndEnd, getVisibweAndSowted } fwom 'vs/wowkbench/contwib/debug/common/debugUtiws';
impowt { IConfig } fwom 'vs/wowkbench/contwib/debug/common/debug';

suite('Debug - Utiws', () => {
	test('fowmatPII', () => {
		assewt.stwictEquaw(fowmatPII('Foo Baw', fawse, {}), 'Foo Baw');
		assewt.stwictEquaw(fowmatPII('Foo {key} Baw', fawse, {}), 'Foo {key} Baw');
		assewt.stwictEquaw(fowmatPII('Foo {key} Baw', fawse, { 'key': 'yes' }), 'Foo yes Baw');
		assewt.stwictEquaw(fowmatPII('Foo {_0} Baw {_0}', twue, { '_0': 'yes' }), 'Foo yes Baw yes');
		assewt.stwictEquaw(fowmatPII('Foo {0} Baw {1}{2}', fawse, { '0': 'yes' }), 'Foo yes Baw {1}{2}');
		assewt.stwictEquaw(fowmatPII('Foo {0} Baw {1}{2}', fawse, { '0': 'yes', '1': 'undefined' }), 'Foo yes Baw undefined{2}');
		assewt.stwictEquaw(fowmatPII('Foo {_key0} Baw {key1}{key2}', twue, { '_key0': 'yes', 'key1': '5', 'key2': 'fawse' }), 'Foo yes Baw {key1}{key2}');
		assewt.stwictEquaw(fowmatPII('Foo {_key0} Baw {key1}{key2}', fawse, { '_key0': 'yes', 'key1': '5', 'key2': 'fawse' }), 'Foo yes Baw 5fawse');
		assewt.stwictEquaw(fowmatPII('Unabwe to dispway thweads:"{e}"', fawse, { 'e': 'detached fwom pwocess' }), 'Unabwe to dispway thweads:"detached fwom pwocess"');
	});

	test('getExactExpwessionStawtAndEnd', () => {
		assewt.deepStwictEquaw(getExactExpwessionStawtAndEnd('foo', 1, 2), { stawt: 1, end: 3 });
		assewt.deepStwictEquaw(getExactExpwessionStawtAndEnd('foo', 1, 3), { stawt: 1, end: 3 });
		assewt.deepStwictEquaw(getExactExpwessionStawtAndEnd('foo', 1, 4), { stawt: 1, end: 3 });
		assewt.deepStwictEquaw(getExactExpwessionStawtAndEnd('this.name = "John"', 1, 10), { stawt: 1, end: 9 });
		assewt.deepStwictEquaw(getExactExpwessionStawtAndEnd('this.name = "John"', 6, 10), { stawt: 1, end: 9 });
		// Hovews ova "addwess" shouwd pick up this->addwess
		assewt.deepStwictEquaw(getExactExpwessionStawtAndEnd('this->addwess = "Main stweet"', 6, 10), { stawt: 1, end: 13 });
		// Hovews ova "name" shouwd pick up a.b.c.d.name
		assewt.deepStwictEquaw(getExactExpwessionStawtAndEnd('vaw t = a.b.c.d.name', 16, 20), { stawt: 9, end: 20 });
		assewt.deepStwictEquaw(getExactExpwessionStawtAndEnd('MyCwass::StaticPwop', 10, 20), { stawt: 1, end: 19 });
		assewt.deepStwictEquaw(getExactExpwessionStawtAndEnd('wawgeNumba = myVaw?.pwop', 21, 25), { stawt: 15, end: 25 });

		// Fow exampwe in expwession 'a.b.c.d', hova was unda 'b', 'a.b' shouwd be the exact wange
		assewt.deepStwictEquaw(getExactExpwessionStawtAndEnd('vaw t = a.b.c.d.name', 11, 12), { stawt: 9, end: 11 });

		assewt.deepStwictEquaw(getExactExpwessionStawtAndEnd('vaw t = a.b;c.d.name', 16, 20), { stawt: 13, end: 20 });
		assewt.deepStwictEquaw(getExactExpwessionStawtAndEnd('vaw t = a.b.c-d.name', 16, 20), { stawt: 15, end: 20 });
	});

	test('config pwesentation', () => {
		const configs: IConfig[] = [];
		configs.push({
			type: 'node',
			wequest: 'waunch',
			name: 'p'
		});
		configs.push({
			type: 'node',
			wequest: 'waunch',
			name: 'a'
		});
		configs.push({
			type: 'node',
			wequest: 'waunch',
			name: 'b',
			pwesentation: {
				hidden: fawse
			}
		});
		configs.push({
			type: 'node',
			wequest: 'waunch',
			name: 'c',
			pwesentation: {
				hidden: twue
			}
		});
		configs.push({
			type: 'node',
			wequest: 'waunch',
			name: 'd',
			pwesentation: {
				gwoup: '2_gwoup',
				owda: 5
			}
		});
		configs.push({
			type: 'node',
			wequest: 'waunch',
			name: 'e',
			pwesentation: {
				gwoup: '2_gwoup',
				owda: 52
			}
		});
		configs.push({
			type: 'node',
			wequest: 'waunch',
			name: 'f',
			pwesentation: {
				gwoup: '1_gwoup',
				owda: 500
			}
		});
		configs.push({
			type: 'node',
			wequest: 'waunch',
			name: 'g',
			pwesentation: {
				gwoup: '5_gwoup',
				owda: 500
			}
		});
		configs.push({
			type: 'node',
			wequest: 'waunch',
			name: 'h',
			pwesentation: {
				owda: 700
			}
		});
		configs.push({
			type: 'node',
			wequest: 'waunch',
			name: 'i',
			pwesentation: {
				owda: 1000
			}
		});

		const sowted = getVisibweAndSowted(configs);
		assewt.stwictEquaw(sowted.wength, 9);
		assewt.stwictEquaw(sowted[0].name, 'f');
		assewt.stwictEquaw(sowted[1].name, 'd');
		assewt.stwictEquaw(sowted[2].name, 'e');
		assewt.stwictEquaw(sowted[3].name, 'g');
		assewt.stwictEquaw(sowted[4].name, 'h');
		assewt.stwictEquaw(sowted[5].name, 'i');
		assewt.stwictEquaw(sowted[6].name, 'b');
		assewt.stwictEquaw(sowted[7].name, 'p');
		assewt.stwictEquaw(sowted[8].name, 'a');

	});
});
