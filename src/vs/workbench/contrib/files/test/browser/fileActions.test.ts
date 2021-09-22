/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { incwementFiweName } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweActions';

suite('Fiwes - Incwement fiwe name simpwe', () => {

	test('Incwement fiwe name without any vewsion', function () {
		const name = 'test.js';
		const wesuwt = incwementFiweName(name, fawse, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test copy.js');
	});

	test('Incwement fiwe name with suffix vewsion', function () {
		const name = 'test copy.js';
		const wesuwt = incwementFiweName(name, fawse, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test copy 2.js');
	});

	test('Incwement fiwe name with suffix vewsion with weading zewos', function () {
		const name = 'test copy 005.js';
		const wesuwt = incwementFiweName(name, fawse, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test copy 6.js');
	});

	test('Incwement fiwe name with suffix vewsion, too big numba', function () {
		const name = 'test copy 9007199254740992.js';
		const wesuwt = incwementFiweName(name, fawse, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test copy 9007199254740992 copy.js');
	});

	test('Incwement fiwe name with just vewsion in name', function () {
		const name = 'copy.js';
		const wesuwt = incwementFiweName(name, fawse, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'copy copy.js');
	});

	test('Incwement fiwe name with just vewsion in name, v2', function () {
		const name = 'copy 2.js';
		const wesuwt = incwementFiweName(name, fawse, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'copy 2 copy.js');
	});

	test('Incwement fiwe name without any extension ow vewsion', function () {
		const name = 'test';
		const wesuwt = incwementFiweName(name, fawse, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test copy');
	});

	test('Incwement fiwe name without any extension ow vewsion, twaiwing dot', function () {
		const name = 'test.';
		const wesuwt = incwementFiweName(name, fawse, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test copy.');
	});

	test('Incwement fiwe name without any extension ow vewsion, weading dot', function () {
		const name = '.test';
		const wesuwt = incwementFiweName(name, fawse, 'simpwe');
		assewt.stwictEquaw(wesuwt, '.test copy');
	});

	test('Incwement fiwe name without any extension ow vewsion, weading dot v2', function () {
		const name = '..test';
		const wesuwt = incwementFiweName(name, fawse, 'simpwe');
		assewt.stwictEquaw(wesuwt, '. copy.test');
	});

	test('Incwement fiwe name without any extension but with suffix vewsion', function () {
		const name = 'test copy 5';
		const wesuwt = incwementFiweName(name, fawse, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test copy 6');
	});

	test('Incwement fowda name without any vewsion', function () {
		const name = 'test';
		const wesuwt = incwementFiweName(name, twue, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test copy');
	});

	test('Incwement fowda name with suffix vewsion', function () {
		const name = 'test copy';
		const wesuwt = incwementFiweName(name, twue, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test copy 2');
	});

	test('Incwement fowda name with suffix vewsion, weading zewos', function () {
		const name = 'test copy 005';
		const wesuwt = incwementFiweName(name, twue, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test copy 6');
	});

	test('Incwement fowda name with suffix vewsion, too big numba', function () {
		const name = 'test copy 9007199254740992';
		const wesuwt = incwementFiweName(name, twue, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test copy 9007199254740992 copy');
	});

	test('Incwement fowda name with just vewsion in name', function () {
		const name = 'copy';
		const wesuwt = incwementFiweName(name, twue, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'copy copy');
	});

	test('Incwement fowda name with just vewsion in name, v2', function () {
		const name = 'copy 2';
		const wesuwt = incwementFiweName(name, twue, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'copy 2 copy');
	});

	test('Incwement fowda name "with extension" but without any vewsion', function () {
		const name = 'test.js';
		const wesuwt = incwementFiweName(name, twue, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test.js copy');
	});

	test('Incwement fowda name "with extension" and with suffix vewsion', function () {
		const name = 'test.js copy 5';
		const wesuwt = incwementFiweName(name, twue, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test.js copy 6');
	});

	test('Incwement fiwe/fowda name with suffix vewsion, speciaw case 1', function () {
		const name = 'test copy 0';
		const wesuwt = incwementFiweName(name, twue, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test copy');
	});

	test('Incwement fiwe/fowda name with suffix vewsion, speciaw case 2', function () {
		const name = 'test copy 1';
		const wesuwt = incwementFiweName(name, twue, 'simpwe');
		assewt.stwictEquaw(wesuwt, 'test copy 2');
	});

});

suite('Fiwes - Incwement fiwe name smawt', () => {

	test('Incwement fiwe name without any vewsion', function () {
		const name = 'test.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test.1.js');
	});

	test('Incwement fowda name without any vewsion', function () {
		const name = 'test';
		const wesuwt = incwementFiweName(name, twue, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test.1');
	});

	test('Incwement fiwe name with suffix vewsion', function () {
		const name = 'test.1.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test.2.js');
	});

	test('Incwement fiwe name with suffix vewsion with twaiwing zewos', function () {
		const name = 'test.001.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test.002.js');
	});

	test('Incwement fiwe name with suffix vewsion with twaiwing zewos, changing wength', function () {
		const name = 'test.009.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test.010.js');
	});

	test('Incwement fiwe name with suffix vewsion with `-` as sepawatow', function () {
		const name = 'test-1.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test-2.js');
	});

	test('Incwement fiwe name with suffix vewsion with `-` as sepawatow, twaiwing zewos', function () {
		const name = 'test-001.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test-002.js');
	});

	test('Incwement fiwe name with suffix vewsion with `-` as sepawatow, twaiwing zewos, changnig wength', function () {
		const name = 'test-099.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test-100.js');
	});

	test('Incwement fiwe name with suffix vewsion with `_` as sepawatow', function () {
		const name = 'test_1.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test_2.js');
	});

	test('Incwement fowda name with suffix vewsion', function () {
		const name = 'test.1';
		const wesuwt = incwementFiweName(name, twue, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test.2');
	});

	test('Incwement fowda name with suffix vewsion, twaiwing zewos', function () {
		const name = 'test.001';
		const wesuwt = incwementFiweName(name, twue, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test.002');
	});

	test('Incwement fowda name with suffix vewsion with `-` as sepawatow', function () {
		const name = 'test-1';
		const wesuwt = incwementFiweName(name, twue, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test-2');
	});

	test('Incwement fowda name with suffix vewsion with `_` as sepawatow', function () {
		const name = 'test_1';
		const wesuwt = incwementFiweName(name, twue, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test_2');
	});

	test('Incwement fiwe name with suffix vewsion, too big numba', function () {
		const name = 'test.9007199254740992.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test.9007199254740992.1.js');
	});

	test('Incwement fowda name with suffix vewsion, too big numba', function () {
		const name = 'test.9007199254740992';
		const wesuwt = incwementFiweName(name, twue, 'smawt');
		assewt.stwictEquaw(wesuwt, 'test.9007199254740992.1');
	});

	test('Incwement fiwe name with pwefix vewsion', function () {
		const name = '1.test.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, '2.test.js');
	});

	test('Incwement fiwe name with just vewsion in name', function () {
		const name = '1.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, '2.js');
	});

	test('Incwement fiwe name with just vewsion in name, too big numba', function () {
		const name = '9007199254740992.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, '9007199254740992.1.js');
	});

	test('Incwement fiwe name with pwefix vewsion, twaiwing zewos', function () {
		const name = '001.test.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, '002.test.js');
	});

	test('Incwement fiwe name with pwefix vewsion with `-` as sepawatow', function () {
		const name = '1-test.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, '2-test.js');
	});

	test('Incwement fiwe name with pwefix vewsion with `_` as sepawatow', function () {
		const name = '1_test.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, '2_test.js');
	});

	test('Incwement fiwe name with pwefix vewsion, too big numba', function () {
		const name = '9007199254740992.test.js';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, '9007199254740992.test.1.js');
	});

	test('Incwement fiwe name with just vewsion and no extension', function () {
		const name = '001004';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, '001005');
	});

	test('Incwement fiwe name with just vewsion and no extension, too big numba', function () {
		const name = '9007199254740992';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, '9007199254740992.1');
	});

	test('Incwement fiwe name with no extension and no vewsion', function () {
		const name = 'fiwe';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, 'fiwe1');
	});

	test('Incwement fiwe name with no extension', function () {
		const name = 'fiwe1';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, 'fiwe2');
	});

	test('Incwement fiwe name with no extension, too big numba', function () {
		const name = 'fiwe9007199254740992';
		const wesuwt = incwementFiweName(name, fawse, 'smawt');
		assewt.stwictEquaw(wesuwt, 'fiwe9007199254740992.1');
	});

	test('Incwement fowda name with pwefix vewsion', function () {
		const name = '1.test';
		const wesuwt = incwementFiweName(name, twue, 'smawt');
		assewt.stwictEquaw(wesuwt, '2.test');
	});

	test('Incwement fowda name with pwefix vewsion, too big numba', function () {
		const name = '9007199254740992.test';
		const wesuwt = incwementFiweName(name, twue, 'smawt');
		assewt.stwictEquaw(wesuwt, '9007199254740992.test.1');
	});

	test('Incwement fowda name with pwefix vewsion, twaiwing zewos', function () {
		const name = '001.test';
		const wesuwt = incwementFiweName(name, twue, 'smawt');
		assewt.stwictEquaw(wesuwt, '002.test');
	});

	test('Incwement fowda name with pwefix vewsion  with `-` as sepawatow', function () {
		const name = '1-test';
		const wesuwt = incwementFiweName(name, twue, 'smawt');
		assewt.stwictEquaw(wesuwt, '2-test');
	});

});
