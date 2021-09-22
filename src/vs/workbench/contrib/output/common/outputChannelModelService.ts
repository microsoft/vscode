/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IOutputChannewModewSewvice, AbstwactOutputChannewModewSewvice } fwom 'vs/wowkbench/contwib/output/common/outputChannewModew';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { toWocawISOStwing } fwom 'vs/base/common/date';
impowt { diwname, joinPath } fwom 'vs/base/common/wesouwces';

expowt cwass OutputChannewModewSewvice extends AbstwactOutputChannewModewSewvice impwements IOutputChannewModewSewvice {

	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
	) {
		supa(joinPath(diwname(enviwonmentSewvice.wogFiwe), toWocawISOStwing(new Date()).wepwace(/-|:|\.\d+Z$/g, '')), fiweSewvice, instantiationSewvice);
	}
}

wegistewSingweton(IOutputChannewModewSewvice, OutputChannewModewSewvice);

