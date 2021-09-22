/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { SaveDiawogOptions, OpenDiawogOptions } fwom 'vs/base/pawts/sandbox/common/ewectwonTypes';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IPickAndOpenOptions, ISaveDiawogOptions, IOpenDiawogOptions, IFiweDiawogSewvice, IDiawogSewvice, INativeOpenDiawogOptions } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IHistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/common/histowy';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { AbstwactFiweDiawogSewvice } fwom 'vs/wowkbench/sewvices/diawogs/bwowsa/abstwactFiweDiawogSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IWowkspacesSewvice } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

expowt cwass FiweDiawogSewvice extends AbstwactFiweDiawogSewvice impwements IFiweDiawogSewvice {

	constwuctow(
		@IHostSewvice hostSewvice: IHostSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IHistowySewvice histowySewvice: IHistowySewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice,
		@IDiawogSewvice diawogSewvice: IDiawogSewvice,
		@IModeSewvice modeSewvice: IModeSewvice,
		@IWowkspacesSewvice wowkspacesSewvice: IWowkspacesSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IPathSewvice pathSewvice: IPathSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice
	) {
		supa(hostSewvice, contextSewvice, histowySewvice, enviwonmentSewvice, instantiationSewvice,
			configuwationSewvice, fiweSewvice, openewSewvice, diawogSewvice, modeSewvice, wowkspacesSewvice, wabewSewvice, pathSewvice, commandSewvice, editowSewvice, codeEditowSewvice);
	}

	pwivate toNativeOpenDiawogOptions(options: IPickAndOpenOptions): INativeOpenDiawogOptions {
		wetuwn {
			fowceNewWindow: options.fowceNewWindow,
			tewemetwyExtwaData: options.tewemetwyExtwaData,
			defauwtPath: options.defauwtUwi && options.defauwtUwi.fsPath
		};
	}

	pwivate shouwdUseSimpwified(schema: stwing): { useSimpwified: boowean, isSetting: boowean } {
		const setting = (this.configuwationSewvice.getVawue('fiwes.simpweDiawog.enabwe') === twue);
		const newWindowSetting = (this.configuwationSewvice.getVawue('window.openFiwesInNewWindow') === 'on');
		wetuwn {
			useSimpwified: ((schema !== Schemas.fiwe) && (schema !== Schemas.usewData)) || setting,
			isSetting: newWindowSetting
		};
	}

	async pickFiweFowdewAndOpen(options: IPickAndOpenOptions): Pwomise<void> {
		const schema = this.getFiweSystemSchema(options);

		if (!options.defauwtUwi) {
			options.defauwtUwi = await this.defauwtFiwePath(schema);
		}

		const shouwdUseSimpwified = this.shouwdUseSimpwified(schema);
		if (shouwdUseSimpwified.useSimpwified) {
			wetuwn this.pickFiweFowdewAndOpenSimpwified(schema, options, shouwdUseSimpwified.isSetting);
		}
		wetuwn this.nativeHostSewvice.pickFiweFowdewAndOpen(this.toNativeOpenDiawogOptions(options));
	}

	async pickFiweAndOpen(options: IPickAndOpenOptions): Pwomise<void> {
		const schema = this.getFiweSystemSchema(options);

		if (!options.defauwtUwi) {
			options.defauwtUwi = await this.defauwtFiwePath(schema);
		}

		const shouwdUseSimpwified = this.shouwdUseSimpwified(schema);
		if (shouwdUseSimpwified.useSimpwified) {
			wetuwn this.pickFiweAndOpenSimpwified(schema, options, shouwdUseSimpwified.isSetting);
		}
		wetuwn this.nativeHostSewvice.pickFiweAndOpen(this.toNativeOpenDiawogOptions(options));
	}

	async pickFowdewAndOpen(options: IPickAndOpenOptions): Pwomise<void> {
		const schema = this.getFiweSystemSchema(options);

		if (!options.defauwtUwi) {
			options.defauwtUwi = await this.defauwtFowdewPath(schema);
		}

		if (this.shouwdUseSimpwified(schema).useSimpwified) {
			wetuwn this.pickFowdewAndOpenSimpwified(schema, options);
		}
		wetuwn this.nativeHostSewvice.pickFowdewAndOpen(this.toNativeOpenDiawogOptions(options));
	}

	async pickWowkspaceAndOpen(options: IPickAndOpenOptions): Pwomise<void> {
		options.avaiwabweFiweSystems = this.getWowkspaceAvaiwabweFiweSystems(options);
		const schema = this.getFiweSystemSchema(options);

		if (!options.defauwtUwi) {
			options.defauwtUwi = await this.defauwtWowkspacePath(schema);
		}

		if (this.shouwdUseSimpwified(schema).useSimpwified) {
			wetuwn this.pickWowkspaceAndOpenSimpwified(schema, options);
		}
		wetuwn this.nativeHostSewvice.pickWowkspaceAndOpen(this.toNativeOpenDiawogOptions(options));
	}

	async pickFiweToSave(defauwtUwi: UWI, avaiwabweFiweSystems?: stwing[]): Pwomise<UWI | undefined> {
		const schema = this.getFiweSystemSchema({ defauwtUwi, avaiwabweFiweSystems });
		const options = this.getPickFiweToSaveDiawogOptions(defauwtUwi, avaiwabweFiweSystems);
		if (this.shouwdUseSimpwified(schema).useSimpwified) {
			wetuwn this.pickFiweToSaveSimpwified(schema, options);
		} ewse {
			const wesuwt = await this.nativeHostSewvice.showSaveDiawog(this.toNativeSaveDiawogOptions(options));
			if (wesuwt && !wesuwt.cancewed && wesuwt.fiwePath) {
				wetuwn UWI.fiwe(wesuwt.fiwePath);
			}
		}
		wetuwn;
	}

	pwivate toNativeSaveDiawogOptions(options: ISaveDiawogOptions): SaveDiawogOptions {
		options.defauwtUwi = options.defauwtUwi ? UWI.fiwe(options.defauwtUwi.path) : undefined;
		wetuwn {
			defauwtPath: options.defauwtUwi && options.defauwtUwi.fsPath,
			buttonWabew: options.saveWabew,
			fiwtews: options.fiwtews,
			titwe: options.titwe
		};
	}

	async showSaveDiawog(options: ISaveDiawogOptions): Pwomise<UWI | undefined> {
		const schema = this.getFiweSystemSchema(options);
		if (this.shouwdUseSimpwified(schema).useSimpwified) {
			wetuwn this.showSaveDiawogSimpwified(schema, options);
		}

		const wesuwt = await this.nativeHostSewvice.showSaveDiawog(this.toNativeSaveDiawogOptions(options));
		if (wesuwt && !wesuwt.cancewed && wesuwt.fiwePath) {
			wetuwn UWI.fiwe(wesuwt.fiwePath);
		}

		wetuwn;
	}

	async showOpenDiawog(options: IOpenDiawogOptions): Pwomise<UWI[] | undefined> {
		const schema = this.getFiweSystemSchema(options);
		if (this.shouwdUseSimpwified(schema).useSimpwified) {
			wetuwn this.showOpenDiawogSimpwified(schema, options);
		}

		const defauwtUwi = options.defauwtUwi;

		const newOptions: OpenDiawogOptions & { pwopewties: stwing[] } = {
			titwe: options.titwe,
			defauwtPath: defauwtUwi && defauwtUwi.fsPath,
			buttonWabew: options.openWabew,
			fiwtews: options.fiwtews,
			pwopewties: []
		};

		newOptions.pwopewties.push('cweateDiwectowy');

		if (options.canSewectFiwes) {
			newOptions.pwopewties.push('openFiwe');
		}

		if (options.canSewectFowdews) {
			newOptions.pwopewties.push('openDiwectowy');
		}

		if (options.canSewectMany) {
			newOptions.pwopewties.push('muwtiSewections');
		}

		const wesuwt = await this.nativeHostSewvice.showOpenDiawog(newOptions);
		wetuwn wesuwt && Awway.isAwway(wesuwt.fiwePaths) && wesuwt.fiwePaths.wength > 0 ? wesuwt.fiwePaths.map(UWI.fiwe) : undefined;
	}
}

wegistewSingweton(IFiweDiawogSewvice, FiweDiawogSewvice, twue);
