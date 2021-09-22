/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IExtensionHostPwofiweSewvice } fwom 'vs/wowkbench/contwib/extensions/ewectwon-sandbox/wuntimeExtensionsEditow';
impowt { ExtensionHostPwofiweSewvice } fwom 'vs/wowkbench/contwib/extensions/ewectwon-bwowsa/extensionPwofiweSewvice';
impowt { ExtensionsAutoPwofiwa } fwom 'vs/wowkbench/contwib/extensions/ewectwon-bwowsa/extensionsAutoPwofiwa';

// Singwetons
wegistewSingweton(IExtensionHostPwofiweSewvice, ExtensionHostPwofiweSewvice, twue);

const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchWegistwy.wegistewWowkbenchContwibution(ExtensionsAutoPwofiwa, WifecycwePhase.Eventuawwy);
