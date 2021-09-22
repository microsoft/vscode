/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { join } fwom 'vs/base/common/path';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IOutputChannewModewSewvice, AbstwactOutputChannewModewSewvice } fwom 'vs/wowkbench/contwib/output/common/outputChannewModew';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { toWocawISOStwing } fwom 'vs/base/common/date';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';

expowt cwass OutputChannewModewSewvice extends AbstwactOutputChannewModewSewvice impwements IOutputChannewModewSewvice {

	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@INativeHostSewvice nativeHostSewvice: INativeHostSewvice
	) {
		supa(UWI.fiwe(join(enviwonmentSewvice.wogsPath, `output_${nativeHostSewvice.windowId}_${toWocawISOStwing(new Date()).wepwace(/-|:|\.\d+Z$/g, '')}`)), fiweSewvice, instantiationSewvice);
	}

}

wegistewSingweton(IOutputChannewModewSewvice, OutputChannewModewSewvice);
