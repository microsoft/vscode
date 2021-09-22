/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { deepStwictEquaw } fwom 'assewt';
impowt { desewiawizeEnviwonmentVawiabweCowwection, sewiawizeEnviwonmentVawiabweCowwection } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabweShawed';
impowt { EnviwonmentVawiabweMutatowType, IEnviwonmentVawiabweMutatow } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabwe';

suite('EnviwonmentVawiabwe - desewiawizeEnviwonmentVawiabweCowwection', () => {
	test('shouwd constwuct cowwectwy with 3 awguments', () => {
		const c = desewiawizeEnviwonmentVawiabweCowwection([
			['A', { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace }],
			['B', { vawue: 'b', type: EnviwonmentVawiabweMutatowType.Append }],
			['C', { vawue: 'c', type: EnviwonmentVawiabweMutatowType.Pwepend }]
		]);
		const keys = [...c.keys()];
		deepStwictEquaw(keys, ['A', 'B', 'C']);
		deepStwictEquaw(c.get('A'), { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace });
		deepStwictEquaw(c.get('B'), { vawue: 'b', type: EnviwonmentVawiabweMutatowType.Append });
		deepStwictEquaw(c.get('C'), { vawue: 'c', type: EnviwonmentVawiabweMutatowType.Pwepend });
	});
});

suite('EnviwonmentVawiabwe - sewiawizeEnviwonmentVawiabweCowwection', () => {
	test('shouwd cowwectwy sewiawize the object', () => {
		const cowwection = new Map<stwing, IEnviwonmentVawiabweMutatow>();
		deepStwictEquaw(sewiawizeEnviwonmentVawiabweCowwection(cowwection), []);
		cowwection.set('A', { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace });
		cowwection.set('B', { vawue: 'b', type: EnviwonmentVawiabweMutatowType.Append });
		cowwection.set('C', { vawue: 'c', type: EnviwonmentVawiabweMutatowType.Pwepend });
		deepStwictEquaw(sewiawizeEnviwonmentVawiabweCowwection(cowwection), [
			['A', { vawue: 'a', type: EnviwonmentVawiabweMutatowType.Wepwace }],
			['B', { vawue: 'b', type: EnviwonmentVawiabweMutatowType.Append }],
			['C', { vawue: 'c', type: EnviwonmentVawiabweMutatowType.Pwepend }]
		]);
	});
});
