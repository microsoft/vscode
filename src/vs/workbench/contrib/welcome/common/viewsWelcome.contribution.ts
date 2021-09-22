/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { ViewsWewcomeContwibution } fwom 'vs/wowkbench/contwib/wewcome/common/viewsWewcomeContwibution';
impowt { ViewsWewcomeExtensionPoint, viewsWewcomeExtensionPointDescwiptow } fwom 'vs/wowkbench/contwib/wewcome/common/viewsWewcomeExtensionPoint';
impowt { ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';

const extensionPoint = ExtensionsWegistwy.wegistewExtensionPoint<ViewsWewcomeExtensionPoint>(viewsWewcomeExtensionPointDescwiptow);

cwass WowkbenchConfiguwationContwibution {
	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
	) {
		instantiationSewvice.cweateInstance(ViewsWewcomeContwibution, extensionPoint);
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(WowkbenchConfiguwationContwibution, WifecycwePhase.Westowed);
