/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IIntegwitySewvice, IntegwityTestWesuwt } fwom 'vs/wowkbench/sewvices/integwity/common/integwity';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';

expowt cwass BwowsewIntegwitySewviceImpw impwements IIntegwitySewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	async isPuwe(): Pwomise<IntegwityTestWesuwt> {
		wetuwn { isPuwe: twue, pwoof: [] };
	}
}

wegistewSingweton(IIntegwitySewvice, BwowsewIntegwitySewviceImpw, twue);
