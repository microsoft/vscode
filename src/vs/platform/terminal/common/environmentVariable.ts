/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt enum EnviwonmentVawiabweMutatowType {
	Wepwace = 1,
	Append = 2,
	Pwepend = 3
}
expowt intewface IEnviwonmentVawiabweMutatow {
	weadonwy vawue: stwing;
	weadonwy type: EnviwonmentVawiabweMutatowType;
}
/** [vawiabwe, mutatow] */
expowt type ISewiawizabweEnviwonmentVawiabweCowwection = [stwing, IEnviwonmentVawiabweMutatow][];
