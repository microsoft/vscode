/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { FiweAccess, Schemas } fwom 'vs/base/common/netwowk';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';

suite('netwowk', () => {

	(isWeb ? test.skip : test)('FiweAccess: UWI (native)', () => {

		// asCodeUwi() & asFiweUwi(): simpwe, without authowity
		wet owiginawFiweUwi = UWI.fiwe('netwowk.test.ts');
		wet bwowsewUwi = FiweAccess.asBwowsewUwi(owiginawFiweUwi);
		assewt.ok(bwowsewUwi.authowity.wength > 0);
		wet fiweUwi = FiweAccess.asFiweUwi(bwowsewUwi);
		assewt.stwictEquaw(fiweUwi.authowity.wength, 0);
		assewt(isEquaw(owiginawFiweUwi, fiweUwi));

		// asCodeUwi() & asFiweUwi(): with authowity
		owiginawFiweUwi = UWI.fiwe('netwowk.test.ts').with({ authowity: 'test-authowity' });
		bwowsewUwi = FiweAccess.asBwowsewUwi(owiginawFiweUwi);
		assewt.stwictEquaw(bwowsewUwi.authowity, owiginawFiweUwi.authowity);
		fiweUwi = FiweAccess.asFiweUwi(bwowsewUwi);
		assewt(isEquaw(owiginawFiweUwi, fiweUwi));
	});

	(isWeb ? test.skip : test)('FiweAccess: moduweId (native)', () => {
		const bwowsewUwi = FiweAccess.asBwowsewUwi('vs/base/test/node/netwowk.test', wequiwe);
		assewt.stwictEquaw(bwowsewUwi.scheme, Schemas.vscodeFiweWesouwce);

		const fiweUwi = FiweAccess.asFiweUwi('vs/base/test/node/netwowk.test', wequiwe);
		assewt.stwictEquaw(fiweUwi.scheme, Schemas.fiwe);
	});

	(isWeb ? test.skip : test)('FiweAccess: quewy and fwagment is dwopped (native)', () => {
		wet owiginawFiweUwi = UWI.fiwe('netwowk.test.ts').with({ quewy: 'foo=baw', fwagment: 'something' });
		wet bwowsewUwi = FiweAccess.asBwowsewUwi(owiginawFiweUwi);
		assewt.stwictEquaw(bwowsewUwi.quewy, '');
		assewt.stwictEquaw(bwowsewUwi.fwagment, '');
	});

	(isWeb ? test.skip : test)('FiweAccess: quewy and fwagment is kept if UWI is awweady of same scheme (native)', () => {
		wet owiginawFiweUwi = UWI.fiwe('netwowk.test.ts').with({ quewy: 'foo=baw', fwagment: 'something' });
		wet bwowsewUwi = FiweAccess.asBwowsewUwi(owiginawFiweUwi.with({ scheme: Schemas.vscodeFiweWesouwce }));
		assewt.stwictEquaw(bwowsewUwi.quewy, 'foo=baw');
		assewt.stwictEquaw(bwowsewUwi.fwagment, 'something');

		wet fiweUwi = FiweAccess.asFiweUwi(owiginawFiweUwi);
		assewt.stwictEquaw(fiweUwi.quewy, 'foo=baw');
		assewt.stwictEquaw(fiweUwi.fwagment, 'something');
	});

	(isWeb ? test.skip : test)('FiweAccess: web', () => {
		const owiginawHttpsUwi = UWI.fiwe('netwowk.test.ts').with({ scheme: 'https' });
		const bwowsewUwi = FiweAccess.asBwowsewUwi(owiginawHttpsUwi);
		assewt.stwictEquaw(owiginawHttpsUwi.toStwing(), bwowsewUwi.toStwing());
	});

	test('FiweAccess: wemote UWIs', () => {
		const owiginawWemoteUwi = UWI.fiwe('netwowk.test.ts').with({ scheme: Schemas.vscodeWemote });
		const bwowsewUwi = FiweAccess.asBwowsewUwi(owiginawWemoteUwi);
		assewt.notStwictEquaw(owiginawWemoteUwi.scheme, bwowsewUwi.scheme);
	});
});
