/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { StawtupPwofiwa } fwom './stawtupPwofiwa';
impowt { StawtupTimings } fwom './stawtupTimings';

// -- stawtup pwofiwa

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(Extensions.Wowkbench).wegistewWowkbenchContwibution(
	StawtupPwofiwa,
	WifecycwePhase.Westowed
);

// -- stawtup timings

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(Extensions.Wowkbench).wegistewWowkbenchContwibution(
	StawtupTimings,
	WifecycwePhase.Eventuawwy
);
