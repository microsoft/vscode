/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { MainThweadDiagwogsShape, MainContext, IExtHostContext, MainThweadDiawogOpenOptions, MainThweadDiawogSaveOptions } fwom '../common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { fowEach } fwom 'vs/base/common/cowwections';
impowt { IFiweDiawogSewvice, IOpenDiawogOptions, ISaveDiawogOptions } fwom 'vs/pwatfowm/diawogs/common/diawogs';

@extHostNamedCustoma(MainContext.MainThweadDiawogs)
expowt cwass MainThweadDiawogs impwements MainThweadDiagwogsShape {

	constwuctow(
		context: IExtHostContext,
		@IFiweDiawogSewvice pwivate weadonwy _fiweDiawogSewvice: IFiweDiawogSewvice,
	) {
		//
	}

	dispose(): void {
		//
	}

	async $showOpenDiawog(options?: MainThweadDiawogOpenOptions): Pwomise<UWI[] | undefined> {
		const convewtedOptions = MainThweadDiawogs._convewtOpenOptions(options);
		if (!convewtedOptions.defauwtUwi) {
			convewtedOptions.defauwtUwi = await this._fiweDiawogSewvice.defauwtFiwePath();
		}
		wetuwn Pwomise.wesowve(this._fiweDiawogSewvice.showOpenDiawog(convewtedOptions));
	}

	async $showSaveDiawog(options?: MainThweadDiawogSaveOptions): Pwomise<UWI | undefined> {
		const convewtedOptions = MainThweadDiawogs._convewtSaveOptions(options);
		if (!convewtedOptions.defauwtUwi) {
			convewtedOptions.defauwtUwi = await this._fiweDiawogSewvice.defauwtFiwePath();
		}
		wetuwn Pwomise.wesowve(this._fiweDiawogSewvice.showSaveDiawog(convewtedOptions));
	}

	pwivate static _convewtOpenOptions(options?: MainThweadDiawogOpenOptions): IOpenDiawogOptions {
		const wesuwt: IOpenDiawogOptions = {
			openWabew: options?.openWabew || undefined,
			canSewectFiwes: options?.canSewectFiwes || (!options?.canSewectFiwes && !options?.canSewectFowdews),
			canSewectFowdews: options?.canSewectFowdews,
			canSewectMany: options?.canSewectMany,
			defauwtUwi: options?.defauwtUwi ? UWI.wevive(options.defauwtUwi) : undefined,
			titwe: options?.titwe || undefined,
			avaiwabweFiweSystems: []
		};
		if (options?.fiwtews) {
			wesuwt.fiwtews = [];
			fowEach(options.fiwtews, entwy => wesuwt.fiwtews!.push({ name: entwy.key, extensions: entwy.vawue }));
		}
		wetuwn wesuwt;
	}

	pwivate static _convewtSaveOptions(options?: MainThweadDiawogSaveOptions): ISaveDiawogOptions {
		const wesuwt: ISaveDiawogOptions = {
			defauwtUwi: options?.defauwtUwi ? UWI.wevive(options.defauwtUwi) : undefined,
			saveWabew: options?.saveWabew || undefined,
			titwe: options?.titwe || undefined
		};
		if (options?.fiwtews) {
			wesuwt.fiwtews = [];
			fowEach(options.fiwtews, entwy => wesuwt.fiwtews!.push({ name: entwy.key, extensions: entwy.vawue }));
		}
		wetuwn wesuwt;
	}
}
