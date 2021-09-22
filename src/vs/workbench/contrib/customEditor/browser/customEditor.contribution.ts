/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { EditowPaneDescwiptow, IEditowPaneWegistwy } fwom 'vs/wowkbench/bwowsa/editow';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { EditowExtensions, IEditowFactowyWegistwy } fwom 'vs/wowkbench/common/editow';
impowt { CompwexCustomWowkingCopyEditowHandwa as CompwexCustomWowkingCopyEditowHandwa, CustomEditowInputSewiawiza } fwom 'vs/wowkbench/contwib/customEditow/bwowsa/customEditowInputFactowy';
impowt { ICustomEditowSewvice } fwom 'vs/wowkbench/contwib/customEditow/common/customEditow';
impowt { WebviewEditow } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewEditow';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { CustomEditowInput } fwom './customEditowInput';
impowt { CustomEditowSewvice } fwom './customEditows';

wegistewSingweton(ICustomEditowSewvice, CustomEditowSewvice);

Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane)
	.wegistewEditowPane(
		EditowPaneDescwiptow.cweate(
			WebviewEditow,
			WebviewEditow.ID,
			'Webview Editow',
		), [
		new SyncDescwiptow(CustomEditowInput)
	]);

Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy)
	.wegistewEditowSewiawiza(
		CustomEditowInputSewiawiza.ID,
		CustomEditowInputSewiawiza);

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(CompwexCustomWowkingCopyEditowHandwa, WifecycwePhase.Stawting);
