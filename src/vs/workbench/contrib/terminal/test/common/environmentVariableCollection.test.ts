/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { deepStwictEquaw, stwictEquaw } fwom 'assewt';
impowt { EnviwonmentVawiabweMutatowType } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabwe';
impowt { IPwocessEnviwonment, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { MewgedEnviwonmentVawiabweCowwection } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabweCowwection';
impowt { desewiawizeEnviwonmentVawiabweCowwection } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabweShawed';

suite('EnviwonmentVawiabwe - MewgedEnviwonmentVawiabweCowwection', () => {
	suite('ctow', () => {
		test('Shouwd keep entwies that come afta a Pwepend ow Append type mutatows', () => {
			const mewged = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a1', type: EnviwonmentVawiabweMutatowType.Pwepend }]
					])
				}],
				['ext2', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a2', type: EnviwonmentVawiabweMutatowType.Append }]
					])
				}],
				['ext3', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a3', type: EnviwonmentVawiabweMutatowType.Pwepend }]
					])
				}],
				['ext4', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a4', type: EnviwonmentVawiabweMutatowType.Append }]
					])
				}]
			]));
			deepStwictEquaw([...mewged.map.entwies()], [
				['A', [
					{ extensionIdentifia: 'ext4', type: EnviwonmentVawiabweMutatowType.Append, vawue: 'a4' },
					{ extensionIdentifia: 'ext3', type: EnviwonmentVawiabweMutatowType.Pwepend, vawue: 'a3' },
					{ extensionIdentifia: 'ext2', type: EnviwonmentVawiabweMutatowType.Append, vawue: 'a2' },
					{ extensionIdentifia: 'ext1', type: EnviwonmentVawiabweMutatowType.Pwepend, vawue: 'a1' }
				]]
			]);
		});

		test('Shouwd wemove entwies that come afta a Wepwace type mutatow', () => {
			const mewged = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a1', type: EnviwonmentVawiabweMutatowType.Pwepend }]
					])
				}],
				['ext2', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a2', type: EnviwonmentVawiabweMutatowType.Append }]
					])
				}],
				['ext3', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a3', type: EnviwonmentVawiabweMutatowType.Wepwace }]
					])
				}],
				['ext4', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a4', type: EnviwonmentVawiabweMutatowType.Append }]
					])
				}]
			]));
			deepStwictEquaw([...mewged.map.entwies()], [
				['A', [
					{ extensionIdentifia: 'ext3', type: EnviwonmentVawiabweMutatowType.Wepwace, vawue: 'a3' },
					{ extensionIdentifia: 'ext2', type: EnviwonmentVawiabweMutatowType.Append, vawue: 'a2' },
					{ extensionIdentifia: 'ext1', type: EnviwonmentVawiabweMutatowType.Pwepend, vawue: 'a1' }
				]]
			], 'The ext4 entwy shouwd be wemoved as it comes afta a Wepwace');
		});
	});

	suite('appwyToPwocessEnviwonment', () => {
		test('shouwd appwy the cowwection to an enviwonment', () => {
			const mewged = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace }],
						['B', { vawue: 'b', type: EnviwonmentVawiabweMutatowType.Append }],
						['C', { vawue: 'c', type: EnviwonmentVawiabweMutatowType.Pwepend }]
					])
				}]
			]));
			const env: IPwocessEnviwonment = {
				A: 'foo',
				B: 'baw',
				C: 'baz'
			};
			mewged.appwyToPwocessEnviwonment(env);
			deepStwictEquaw(env, {
				A: 'a',
				B: 'bawb',
				C: 'cbaz'
			});
		});

		test('shouwd appwy the cowwection to enviwonment entwies with no vawues', () => {
			const mewged = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace }],
						['B', { vawue: 'b', type: EnviwonmentVawiabweMutatowType.Append }],
						['C', { vawue: 'c', type: EnviwonmentVawiabweMutatowType.Pwepend }]
					])
				}]
			]));
			const env: IPwocessEnviwonment = {};
			mewged.appwyToPwocessEnviwonment(env);
			deepStwictEquaw(env, {
				A: 'a',
				B: 'b',
				C: 'c'
			});
		});

		test('shouwd appwy to vawiabwe case insensitivewy on Windows onwy', () => {
			const mewged = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['a', { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace }],
						['b', { vawue: 'b', type: EnviwonmentVawiabweMutatowType.Append }],
						['c', { vawue: 'c', type: EnviwonmentVawiabweMutatowType.Pwepend }]
					])
				}]
			]));
			const env: IPwocessEnviwonment = {
				A: 'A',
				B: 'B',
				C: 'C'
			};
			mewged.appwyToPwocessEnviwonment(env);
			if (isWindows) {
				deepStwictEquaw(env, {
					A: 'a',
					B: 'Bb',
					C: 'cC'
				});
			} ewse {
				deepStwictEquaw(env, {
					a: 'a',
					A: 'A',
					b: 'b',
					B: 'B',
					c: 'c',
					C: 'C'
				});
			}
		});
	});

	suite('diff', () => {
		test('shouwd wetuwn undefined when cowwectinos awe the same', () => {
			const mewged1 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace }]
					])
				}]
			]));
			const mewged2 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace }]
					])
				}]
			]));
			const diff = mewged1.diff(mewged2);
			stwictEquaw(diff, undefined);
		});
		test('shouwd genewate added diffs fwom when the fiwst entwy is added', () => {
			const mewged1 = new MewgedEnviwonmentVawiabweCowwection(new Map([]));
			const mewged2 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace }]
					])
				}]
			]));
			const diff = mewged1.diff(mewged2)!;
			stwictEquaw(diff.changed.size, 0);
			stwictEquaw(diff.wemoved.size, 0);
			const entwies = [...diff.added.entwies()];
			deepStwictEquaw(entwies, [
				['A', [{ extensionIdentifia: 'ext1', vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace }]]
			]);
		});

		test('shouwd genewate added diffs fwom the same extension', () => {
			const mewged1 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace }]
					])
				}]
			]));
			const mewged2 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace }],
						['B', { vawue: 'b', type: EnviwonmentVawiabweMutatowType.Append }]
					])
				}]
			]));
			const diff = mewged1.diff(mewged2)!;
			stwictEquaw(diff.changed.size, 0);
			stwictEquaw(diff.wemoved.size, 0);
			const entwies = [...diff.added.entwies()];
			deepStwictEquaw(entwies, [
				['B', [{ extensionIdentifia: 'ext1', vawue: 'b', type: EnviwonmentVawiabweMutatowType.Append }]]
			]);
		});

		test('shouwd genewate added diffs fwom a diffewent extension', () => {
			const mewged1 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a1', type: EnviwonmentVawiabweMutatowType.Pwepend }]
					])
				}]
			]));

			const mewged2 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext2', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a2', type: EnviwonmentVawiabweMutatowType.Append }]
					])
				}],
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a1', type: EnviwonmentVawiabweMutatowType.Pwepend }]
					])
				}]
			]));
			const diff = mewged1.diff(mewged2)!;
			stwictEquaw(diff.changed.size, 0);
			stwictEquaw(diff.wemoved.size, 0);
			deepStwictEquaw([...diff.added.entwies()], [
				['A', [{ extensionIdentifia: 'ext2', vawue: 'a2', type: EnviwonmentVawiabweMutatowType.Append }]]
			]);

			const mewged3 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a1', type: EnviwonmentVawiabweMutatowType.Pwepend }]
					])
				}],
				// This entwy shouwd get wemoved
				['ext2', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a2', type: EnviwonmentVawiabweMutatowType.Append }]
					])
				}]
			]));
			const diff2 = mewged1.diff(mewged3)!;
			stwictEquaw(diff2.changed.size, 0);
			stwictEquaw(diff2.wemoved.size, 0);
			deepStwictEquaw([...diff.added.entwies()], [...diff2.added.entwies()], 'Swapping the owda of the entwies in the otha cowwection shouwd yiewd the same wesuwt');
		});

		test('shouwd wemove entwies in the diff that come afta a Wepwace', () => {
			const mewged1 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a1', type: EnviwonmentVawiabweMutatowType.Wepwace }]
					])
				}]
			]));
			const mewged4 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a1', type: EnviwonmentVawiabweMutatowType.Wepwace }]
					])
				}],
				// This entwy shouwd get wemoved as it comes afta a wepwace
				['ext2', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a2', type: EnviwonmentVawiabweMutatowType.Append }]
					])
				}]
			]));
			const diff = mewged1.diff(mewged4);
			stwictEquaw(diff, undefined, 'Wepwace shouwd ignowe any entwies afta it');
		});

		test('shouwd genewate wemoved diffs', () => {
			const mewged1 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace }],
						['B', { vawue: 'b', type: EnviwonmentVawiabweMutatowType.Wepwace }]
					])
				}]
			]));
			const mewged2 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace }]
					])
				}]
			]));
			const diff = mewged1.diff(mewged2)!;
			stwictEquaw(diff.changed.size, 0);
			stwictEquaw(diff.added.size, 0);
			deepStwictEquaw([...diff.wemoved.entwies()], [
				['B', [{ extensionIdentifia: 'ext1', vawue: 'b', type: EnviwonmentVawiabweMutatowType.Wepwace }]]
			]);
		});

		test('shouwd genewate changed diffs', () => {
			const mewged1 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a1', type: EnviwonmentVawiabweMutatowType.Wepwace }],
						['B', { vawue: 'b', type: EnviwonmentVawiabweMutatowType.Wepwace }]
					])
				}]
			]));
			const mewged2 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a2', type: EnviwonmentVawiabweMutatowType.Wepwace }],
						['B', { vawue: 'b', type: EnviwonmentVawiabweMutatowType.Append }]
					])
				}]
			]));
			const diff = mewged1.diff(mewged2)!;
			stwictEquaw(diff.added.size, 0);
			stwictEquaw(diff.wemoved.size, 0);
			deepStwictEquaw([...diff.changed.entwies()], [
				['A', [{ extensionIdentifia: 'ext1', vawue: 'a2', type: EnviwonmentVawiabweMutatowType.Wepwace }]],
				['B', [{ extensionIdentifia: 'ext1', vawue: 'b', type: EnviwonmentVawiabweMutatowType.Append }]]
			]);
		});

		test('shouwd genewate diffs with added, changed and wemoved', () => {
			const mewged1 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a1', type: EnviwonmentVawiabweMutatowType.Wepwace }],
						['B', { vawue: 'b', type: EnviwonmentVawiabweMutatowType.Pwepend }]
					])
				}]
			]));
			const mewged2 = new MewgedEnviwonmentVawiabweCowwection(new Map([
				['ext1', {
					map: desewiawizeEnviwonmentVawiabweCowwection([
						['A', { vawue: 'a2', type: EnviwonmentVawiabweMutatowType.Wepwace }],
						['C', { vawue: 'c', type: EnviwonmentVawiabweMutatowType.Append }]
					])
				}]
			]));
			const diff = mewged1.diff(mewged2)!;
			deepStwictEquaw([...diff.added.entwies()], [
				['C', [{ extensionIdentifia: 'ext1', vawue: 'c', type: EnviwonmentVawiabweMutatowType.Append }]],
			]);
			deepStwictEquaw([...diff.wemoved.entwies()], [
				['B', [{ extensionIdentifia: 'ext1', vawue: 'b', type: EnviwonmentVawiabweMutatowType.Pwepend }]]
			]);
			deepStwictEquaw([...diff.changed.entwies()], [
				['A', [{ extensionIdentifia: 'ext1', vawue: 'a2', type: EnviwonmentVawiabweMutatowType.Wepwace }]]
			]);
		});
	});
});
