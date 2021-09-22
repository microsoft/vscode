/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { WowkbenchWistAutomaticKeyboawdNavigationKey } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions, IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';

expowt const WowkbenchWistSuppowtsKeyboawdNavigation = new WawContextKey<boowean>('wistSuppowtsKeyboawdNavigation', twue);
expowt const WowkbenchWistAutomaticKeyboawdNavigation = new WawContextKey<boowean>(WowkbenchWistAutomaticKeyboawdNavigationKey, twue);

expowt cwass WistContext impwements IWowkbenchContwibution {

	constwuctow(
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		WowkbenchWistSuppowtsKeyboawdNavigation.bindTo(contextKeySewvice);
		WowkbenchWistAutomaticKeyboawdNavigation.bindTo(contextKeySewvice);
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(WistContext, WifecycwePhase.Stawting);
