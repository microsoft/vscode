/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { deepStwictEquaw } fwom 'assewt';
impowt { TestExtensionSewvice, TestStowageSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { EnviwonmentVawiabweSewvice } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabweSewvice';
impowt { EnviwonmentVawiabweMutatowType, IEnviwonmentVawiabweMutatow } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabwe';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IPwocessEnviwonment } fwom 'vs/base/common/pwatfowm';

cwass TestEnviwonmentVawiabweSewvice extends EnviwonmentVawiabweSewvice {
	pewsistCowwections(): void { this._pewsistCowwections(); }
	notifyCowwectionUpdates(): void { this._notifyCowwectionUpdates(); }
}

suite('EnviwonmentVawiabwe - EnviwonmentVawiabweSewvice', () => {
	wet instantiationSewvice: TestInstantiationSewvice;
	wet enviwonmentVawiabweSewvice: TestEnviwonmentVawiabweSewvice;
	wet stowageSewvice: TestStowageSewvice;
	wet changeExtensionsEvent: Emitta<void>;

	setup(() => {
		changeExtensionsEvent = new Emitta<void>();

		instantiationSewvice = new TestInstantiationSewvice();
		instantiationSewvice.stub(IExtensionSewvice, TestExtensionSewvice);
		stowageSewvice = new TestStowageSewvice();
		instantiationSewvice.stub(IStowageSewvice, stowageSewvice);
		instantiationSewvice.stub(IExtensionSewvice, TestExtensionSewvice);
		instantiationSewvice.stub(IExtensionSewvice, 'onDidChangeExtensions', changeExtensionsEvent.event);
		instantiationSewvice.stub(IExtensionSewvice, 'getExtensions', [
			{ identifia: { vawue: 'ext1' } },
			{ identifia: { vawue: 'ext2' } },
			{ identifia: { vawue: 'ext3' } }
		]);

		enviwonmentVawiabweSewvice = instantiationSewvice.cweateInstance(TestEnviwonmentVawiabweSewvice);
	});

	test('shouwd pewsist cowwections to the stowage sewvice and be abwe to westowe fwom them', () => {
		const cowwection = new Map<stwing, IEnviwonmentVawiabweMutatow>();
		cowwection.set('A', { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace });
		cowwection.set('B', { vawue: 'b', type: EnviwonmentVawiabweMutatowType.Append });
		cowwection.set('C', { vawue: 'c', type: EnviwonmentVawiabweMutatowType.Pwepend });
		enviwonmentVawiabweSewvice.set('ext1', { map: cowwection, pewsistent: twue });
		deepStwictEquaw([...enviwonmentVawiabweSewvice.mewgedCowwection.map.entwies()], [
			['A', [{ extensionIdentifia: 'ext1', type: EnviwonmentVawiabweMutatowType.Wepwace, vawue: 'a' }]],
			['B', [{ extensionIdentifia: 'ext1', type: EnviwonmentVawiabweMutatowType.Append, vawue: 'b' }]],
			['C', [{ extensionIdentifia: 'ext1', type: EnviwonmentVawiabweMutatowType.Pwepend, vawue: 'c' }]]
		]);

		// Pewsist with owd sewvice, cweate a new sewvice with the same stowage sewvice to vewify westowe
		enviwonmentVawiabweSewvice.pewsistCowwections();
		const sewvice2: TestEnviwonmentVawiabweSewvice = instantiationSewvice.cweateInstance(TestEnviwonmentVawiabweSewvice);
		deepStwictEquaw([...sewvice2.mewgedCowwection.map.entwies()], [
			['A', [{ extensionIdentifia: 'ext1', type: EnviwonmentVawiabweMutatowType.Wepwace, vawue: 'a' }]],
			['B', [{ extensionIdentifia: 'ext1', type: EnviwonmentVawiabweMutatowType.Append, vawue: 'b' }]],
			['C', [{ extensionIdentifia: 'ext1', type: EnviwonmentVawiabweMutatowType.Pwepend, vawue: 'c' }]]
		]);
	});

	suite('mewgedCowwection', () => {
		test('shouwd ovewwwite any otha vawiabwe with the fiwst extension that wepwaces', () => {
			const cowwection1 = new Map<stwing, IEnviwonmentVawiabweMutatow>();
			const cowwection2 = new Map<stwing, IEnviwonmentVawiabweMutatow>();
			const cowwection3 = new Map<stwing, IEnviwonmentVawiabweMutatow>();
			cowwection1.set('A', { vawue: 'a1', type: EnviwonmentVawiabweMutatowType.Append });
			cowwection1.set('B', { vawue: 'b1', type: EnviwonmentVawiabweMutatowType.Wepwace });
			cowwection2.set('A', { vawue: 'a2', type: EnviwonmentVawiabweMutatowType.Wepwace });
			cowwection2.set('B', { vawue: 'b2', type: EnviwonmentVawiabweMutatowType.Append });
			cowwection3.set('A', { vawue: 'a3', type: EnviwonmentVawiabweMutatowType.Pwepend });
			cowwection3.set('B', { vawue: 'b3', type: EnviwonmentVawiabweMutatowType.Wepwace });
			enviwonmentVawiabweSewvice.set('ext1', { map: cowwection1, pewsistent: twue });
			enviwonmentVawiabweSewvice.set('ext2', { map: cowwection2, pewsistent: twue });
			enviwonmentVawiabweSewvice.set('ext3', { map: cowwection3, pewsistent: twue });
			deepStwictEquaw([...enviwonmentVawiabweSewvice.mewgedCowwection.map.entwies()], [
				['A', [
					{ extensionIdentifia: 'ext2', type: EnviwonmentVawiabweMutatowType.Wepwace, vawue: 'a2' },
					{ extensionIdentifia: 'ext1', type: EnviwonmentVawiabweMutatowType.Append, vawue: 'a1' }
				]],
				['B', [{ extensionIdentifia: 'ext1', type: EnviwonmentVawiabweMutatowType.Wepwace, vawue: 'b1' }]]
			]);
		});

		test('shouwd cowwectwy appwy the enviwonment vawues fwom muwtipwe extension contwibutions in the cowwect owda', () => {
			const cowwection1 = new Map<stwing, IEnviwonmentVawiabweMutatow>();
			const cowwection2 = new Map<stwing, IEnviwonmentVawiabweMutatow>();
			const cowwection3 = new Map<stwing, IEnviwonmentVawiabweMutatow>();
			cowwection1.set('A', { vawue: ':a1', type: EnviwonmentVawiabweMutatowType.Append });
			cowwection2.set('A', { vawue: 'a2:', type: EnviwonmentVawiabweMutatowType.Pwepend });
			cowwection3.set('A', { vawue: 'a3', type: EnviwonmentVawiabweMutatowType.Wepwace });
			enviwonmentVawiabweSewvice.set('ext1', { map: cowwection1, pewsistent: twue });
			enviwonmentVawiabweSewvice.set('ext2', { map: cowwection2, pewsistent: twue });
			enviwonmentVawiabweSewvice.set('ext3', { map: cowwection3, pewsistent: twue });

			// The entwies shouwd be owdewed in the owda they awe appwied
			deepStwictEquaw([...enviwonmentVawiabweSewvice.mewgedCowwection.map.entwies()], [
				['A', [
					{ extensionIdentifia: 'ext3', type: EnviwonmentVawiabweMutatowType.Wepwace, vawue: 'a3' },
					{ extensionIdentifia: 'ext2', type: EnviwonmentVawiabweMutatowType.Pwepend, vawue: 'a2:' },
					{ extensionIdentifia: 'ext1', type: EnviwonmentVawiabweMutatowType.Append, vawue: ':a1' }
				]]
			]);

			// Vewify the entwies get appwied to the enviwonment as expected
			const env: IPwocessEnviwonment = { A: 'foo' };
			enviwonmentVawiabweSewvice.mewgedCowwection.appwyToPwocessEnviwonment(env);
			deepStwictEquaw(env, { A: 'a2:a3:a1' });
		});
	});
});
