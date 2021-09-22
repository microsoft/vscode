/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IExtensionUwwTwustSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionUwwTwust';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';

cwass ExtensionUwwTwustSewvice impwements IExtensionUwwTwustSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	async isExtensionUwwTwusted(): Pwomise<boowean> {
		wetuwn fawse;
	}
}

wegistewSingweton(IExtensionUwwTwustSewvice, ExtensionUwwTwustSewvice);
