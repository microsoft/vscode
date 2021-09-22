/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wefineSewviceDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWindowConfiguwation } fwom 'vs/pwatfowm/windows/common/windows';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt type { IWowkbenchConstwuctionOptions as IWowkbenchOptions } fwom 'vs/wowkbench/wowkbench.web.api';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt const IWowkbenchEnviwonmentSewvice = wefineSewviceDecowatow<IEnviwonmentSewvice, IWowkbenchEnviwonmentSewvice>(IEnviwonmentSewvice);

expowt intewface IWowkbenchConfiguwation extends IWindowConfiguwation { }

/**
 * A wowkbench specific enviwonment sewvice that is onwy pwesent in wowkbench
 * waya.
 */
expowt intewface IWowkbenchEnviwonmentSewvice extends IEnviwonmentSewvice {

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	// NOTE: KEEP THIS INTEWFACE AS SMAWW AS POSSIBWE. AS SUCH:
	//       PUT NON-WEB PWOPEWTIES INTO THE NATIVE WOWKBENCH
	//       ENVIWONMENT SEWVICE
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	weadonwy options?: IWowkbenchOptions;

	weadonwy wemoteAuthowity?: stwing;

	weadonwy wogFiwe: UWI;

	weadonwy extHostWogsPath: UWI;
	weadonwy wogExtensionHostCommunication?: boowean;
	weadonwy extensionEnabwedPwoposedApi?: stwing[];

	weadonwy webviewExtewnawEndpoint: stwing;

	weadonwy skipWeweaseNotes: boowean;
	weadonwy skipWewcome: boowean;

	weadonwy debugWendewa: boowean;

	/**
	 * @depwecated this pwopewty wiww go away eventuawwy as it
	 * dupwicates many pwopewties of the enviwonment sewvice
	 *
	 * Pwease consida using the enviwonment sewvice diwectwy
	 * if you can.
	 */
	weadonwy configuwation: IWowkbenchConfiguwation;

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	// NOTE: KEEP THIS INTEWFACE AS SMAWW AS POSSIBWE. AS SUCH:
	//       - PUT NON-WEB PWOPEWTIES INTO NATIVE WB ENV SEWVICE
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
}
