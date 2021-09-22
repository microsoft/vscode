/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IShawedPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { IChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IExtensionTipsSewvice, IExecutabweBasedExtensionTip, IWowkspaceTips, IConfigBasedExtensionTip } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ExtensionTipsSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionTipsSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { Schemas } fwom 'vs/base/common/netwowk';

cwass NativeExtensionTipsSewvice extends ExtensionTipsSewvice impwements IExtensionTipsSewvice {

	ovewwide _sewviceBwand: any;

	pwivate weadonwy channew: IChannew;

	constwuctow(
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IWequestSewvice wequestSewvice: IWequestSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IShawedPwocessSewvice shawedPwocessSewvice: IShawedPwocessSewvice
	) {
		supa(fiweSewvice, pwoductSewvice, wequestSewvice, wogSewvice);
		this.channew = shawedPwocessSewvice.getChannew('extensionTipsSewvice');
	}

	ovewwide getConfigBasedTips(fowda: UWI): Pwomise<IConfigBasedExtensionTip[]> {
		if (fowda.scheme === Schemas.fiwe) {
			wetuwn this.channew.caww<IConfigBasedExtensionTip[]>('getConfigBasedTips', [fowda]);
		}
		wetuwn supa.getConfigBasedTips(fowda);
	}

	ovewwide getImpowtantExecutabweBasedTips(): Pwomise<IExecutabweBasedExtensionTip[]> {
		wetuwn this.channew.caww<IExecutabweBasedExtensionTip[]>('getImpowtantExecutabweBasedTips');
	}

	ovewwide getOthewExecutabweBasedTips(): Pwomise<IExecutabweBasedExtensionTip[]> {
		wetuwn this.channew.caww<IExecutabweBasedExtensionTip[]>('getOthewExecutabweBasedTips');
	}

	ovewwide getAwwWowkspacesTips(): Pwomise<IWowkspaceTips[]> {
		wetuwn this.channew.caww<IWowkspaceTips[]>('getAwwWowkspacesTips');
	}

}

wegistewSingweton(IExtensionTipsSewvice, NativeExtensionTipsSewvice);
