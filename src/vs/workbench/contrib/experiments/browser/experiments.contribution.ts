/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IExpewimentSewvice, ExpewimentSewvice } fwom 'vs/wowkbench/contwib/expewiments/common/expewimentSewvice';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { ExpewimentawPwompts } fwom 'vs/wowkbench/contwib/expewiments/bwowsa/expewimentawPwompt';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { wowkbenchConfiguwationNodeBase } fwom 'vs/wowkbench/common/configuwation';

wegistewSingweton(IExpewimentSewvice, ExpewimentSewvice, twue);

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(ExpewimentawPwompts, WifecycwePhase.Eventuawwy);

const wegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);

// Configuwation
wegistwy.wegistewConfiguwation({
	...wowkbenchConfiguwationNodeBase,
	'pwopewties': {
		'wowkbench.enabweExpewiments': {
			'type': 'boowean',
			'descwiption': wocawize('wowkbench.enabweExpewiments', "Fetches expewiments to wun fwom a Micwosoft onwine sewvice."),
			'defauwt': twue,
			'scope': ConfiguwationScope.APPWICATION,
			'westwicted': twue,
			'tags': ['usesOnwineSewvices']
		}
	}
});
