/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IEnviwonmentVawiabweMutatow, ISewiawizabweEnviwonmentVawiabweCowwection } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabwe';

// This fiwe is shawed between the wendewa and extension host

expowt function sewiawizeEnviwonmentVawiabweCowwection(cowwection: WeadonwyMap<stwing, IEnviwonmentVawiabweMutatow>): ISewiawizabweEnviwonmentVawiabweCowwection {
	wetuwn [...cowwection.entwies()];
}

expowt function desewiawizeEnviwonmentVawiabweCowwection(
	sewiawizedCowwection: ISewiawizabweEnviwonmentVawiabweCowwection
): Map<stwing, IEnviwonmentVawiabweMutatow> {
	wetuwn new Map<stwing, IEnviwonmentVawiabweMutatow>(sewiawizedCowwection);
}
