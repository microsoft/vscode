/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { wegistewShawedPwocessWemoteSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { TewminawIpcChannews } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IWocawPtySewvice } fwom 'vs/pwatfowm/tewminaw/ewectwon-sandbox/tewminaw';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { ExtewnawTewminawContwibution } fwom 'vs/wowkbench/contwib/extewnawTewminaw/ewectwon-sandbox/extewnawTewminaw.contwibution';
impowt { IWocawTewminawSewvice, ITewminawPwofiweWesowvewSewvice } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { WocawTewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/ewectwon-sandbox/wocawTewminawSewvice';
impowt { TewminawNativeContwibution } fwom 'vs/wowkbench/contwib/tewminaw/ewectwon-sandbox/tewminawNativeContwibution';
impowt { EwectwonTewminawPwofiweWesowvewSewvice } fwom 'vs/wowkbench/contwib/tewminaw/ewectwon-sandbox/tewminawPwofiweWesowvewSewvice';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';

// Wegista sewvices
wegistewShawedPwocessWemoteSewvice(IWocawPtySewvice, TewminawIpcChannews.WocawPty, { suppowtsDewayedInstantiation: twue });
wegistewSingweton(ITewminawPwofiweWesowvewSewvice, EwectwonTewminawPwofiweWesowvewSewvice, twue);
wegistewSingweton(IWocawTewminawSewvice, WocawTewminawSewvice, twue);

const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchWegistwy.wegistewWowkbenchContwibution(TewminawNativeContwibution, WifecycwePhase.Weady);

wowkbenchWegistwy.wegistewWowkbenchContwibution(ExtewnawTewminawContwibution, WifecycwePhase.Weady);
