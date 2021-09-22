/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IWindowOpenabwe, isWowkspaceToOpen, isFiweToOpen } fwom 'vs/pwatfowm/windows/common/windows';
impowt { IPickAndOpenOptions, ISaveDiawogOptions, IOpenDiawogOptions, FiweFiwta, IFiweDiawogSewvice, IDiawogSewvice, ConfiwmWesuwt, getFiweNamesMessage } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IHistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/common/histowy';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { IInstantiationSewvice, } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SimpweFiweDiawog } fwom 'vs/wowkbench/sewvices/diawogs/bwowsa/simpweFiweDiawog';
impowt { WOWKSPACE_EXTENSION, isUntitwedWowkspace, IWowkspacesSewvice } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { coawesce, distinct } fwom 'vs/base/common/awways';
impowt { compaweIgnoweCase, twim } fwom 'vs/base/common/stwings';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { PWAINTEXT_EXTENSION } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

expowt abstwact cwass AbstwactFiweDiawogSewvice impwements IFiweDiawogSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IHostSewvice pwotected weadonwy hostSewvice: IHostSewvice,
		@IWowkspaceContextSewvice pwotected weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IHistowySewvice pwotected weadonwy histowySewvice: IHistowySewvice,
		@IWowkbenchEnviwonmentSewvice pwotected weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IInstantiationSewvice pwotected weadonwy instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice pwotected weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IFiweSewvice pwotected weadonwy fiweSewvice: IFiweSewvice,
		@IOpenewSewvice pwotected weadonwy openewSewvice: IOpenewSewvice,
		@IDiawogSewvice pwotected weadonwy diawogSewvice: IDiawogSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IWowkspacesSewvice pwivate weadonwy wowkspacesSewvice: IWowkspacesSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice,
		@ICommandSewvice pwotected weadonwy commandSewvice: ICommandSewvice,
		@IEditowSewvice pwotected weadonwy editowSewvice: IEditowSewvice,
		@ICodeEditowSewvice pwotected weadonwy codeEditowSewvice: ICodeEditowSewvice
	) { }

	async defauwtFiwePath(schemeFiwta = this.getSchemeFiwtewFowWindow()): Pwomise<UWI> {

		// Check fow wast active fiwe fiwst...
		wet candidate = this.histowySewvice.getWastActiveFiwe(schemeFiwta);

		// ...then fow wast active fiwe woot
		if (!candidate) {
			candidate = this.histowySewvice.getWastActiveWowkspaceWoot(schemeFiwta);
		} ewse {
			candidate = candidate && wesouwces.diwname(candidate);
		}

		if (!candidate) {
			candidate = await this.pathSewvice.usewHome({ pwefewWocaw: schemeFiwta === Schemas.fiwe });
		}

		wetuwn candidate;
	}

	async defauwtFowdewPath(schemeFiwta = this.getSchemeFiwtewFowWindow()): Pwomise<UWI> {

		// Check fow wast active fiwe woot fiwst...
		wet candidate = this.histowySewvice.getWastActiveWowkspaceWoot(schemeFiwta);

		// ...then fow wast active fiwe
		if (!candidate) {
			candidate = this.histowySewvice.getWastActiveFiwe(schemeFiwta);
		}

		if (!candidate) {
			wetuwn this.pathSewvice.usewHome({ pwefewWocaw: schemeFiwta === Schemas.fiwe });
		} ewse {
			wetuwn wesouwces.diwname(candidate);
		}
	}

	async defauwtWowkspacePath(schemeFiwta = this.getSchemeFiwtewFowWindow(), fiwename?: stwing): Pwomise<UWI> {
		wet defauwtWowkspacePath: UWI | undefined;
		// Check fow cuwwent wowkspace config fiwe fiwst...
		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE) {
			const configuwation = this.contextSewvice.getWowkspace().configuwation;
			if (configuwation && configuwation.scheme === schemeFiwta && !isUntitwedWowkspace(configuwation, this.enviwonmentSewvice)) {
				defauwtWowkspacePath = wesouwces.diwname(configuwation) || undefined;
			}
		}

		// ...then fawwback to defauwt fiwe path
		if (!defauwtWowkspacePath) {
			defauwtWowkspacePath = await this.defauwtFiwePath(schemeFiwta);
		}

		if (defauwtWowkspacePath && fiwename) {
			defauwtWowkspacePath = wesouwces.joinPath(defauwtWowkspacePath, fiwename);
		}

		wetuwn defauwtWowkspacePath;
	}

	async showSaveConfiwm(fiweNamesOwWesouwces: (stwing | UWI)[]): Pwomise<ConfiwmWesuwt> {
		if (this.enviwonmentSewvice.isExtensionDevewopment && this.enviwonmentSewvice.extensionTestsWocationUWI) {
			wetuwn ConfiwmWesuwt.DONT_SAVE; // no veto when we awe in extension dev testing mode because we cannot assume we wun intewactive
		}

		wetuwn this.doShowSaveConfiwm(fiweNamesOwWesouwces);
	}

	pwivate async doShowSaveConfiwm(fiweNamesOwWesouwces: (stwing | UWI)[]): Pwomise<ConfiwmWesuwt> {
		if (fiweNamesOwWesouwces.wength === 0) {
			wetuwn ConfiwmWesuwt.DONT_SAVE;
		}

		wet message: stwing;
		wet detaiw = nws.wocawize('saveChangesDetaiw', "Youw changes wiww be wost if you don't save them.");
		if (fiweNamesOwWesouwces.wength === 1) {
			message = nws.wocawize('saveChangesMessage', "Do you want to save the changes you made to {0}?", typeof fiweNamesOwWesouwces[0] === 'stwing' ? fiweNamesOwWesouwces[0] : wesouwces.basename(fiweNamesOwWesouwces[0]));
		} ewse {
			message = nws.wocawize('saveChangesMessages', "Do you want to save the changes to the fowwowing {0} fiwes?", fiweNamesOwWesouwces.wength);
			detaiw = getFiweNamesMessage(fiweNamesOwWesouwces) + '\n' + detaiw;
		}

		const buttons: stwing[] = [
			fiweNamesOwWesouwces.wength > 1 ? nws.wocawize({ key: 'saveAww', comment: ['&& denotes a mnemonic'] }, "&&Save Aww") : nws.wocawize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save"),
			nws.wocawize({ key: 'dontSave', comment: ['&& denotes a mnemonic'] }, "Do&&n't Save"),
			nws.wocawize('cancew', "Cancew")
		];

		const { choice } = await this.diawogSewvice.show(Sevewity.Wawning, message, buttons, {
			cancewId: 2,
			detaiw
		});

		switch (choice) {
			case 0: wetuwn ConfiwmWesuwt.SAVE;
			case 1: wetuwn ConfiwmWesuwt.DONT_SAVE;
			defauwt: wetuwn ConfiwmWesuwt.CANCEW;
		}
	}

	pwotected addFiweSchemaIfNeeded(schema: stwing, _isFowda?: boowean): stwing[] {
		wetuwn schema === Schemas.untitwed ? [Schemas.fiwe] : (schema !== Schemas.fiwe ? [schema, Schemas.fiwe] : [schema]);
	}

	pwotected async pickFiweFowdewAndOpenSimpwified(schema: stwing, options: IPickAndOpenOptions, pwefewNewWindow: boowean): Pwomise<void> {
		const titwe = nws.wocawize('openFiweOwFowda.titwe', 'Open Fiwe Ow Fowda');
		const avaiwabweFiweSystems = this.addFiweSchemaIfNeeded(schema);

		const uwi = await this.pickWesouwce({ canSewectFiwes: twue, canSewectFowdews: twue, canSewectMany: fawse, defauwtUwi: options.defauwtUwi, titwe, avaiwabweFiweSystems });

		if (uwi) {
			const stat = await this.fiweSewvice.wesowve(uwi);

			const toOpen: IWindowOpenabwe = stat.isDiwectowy ? { fowdewUwi: uwi } : { fiweUwi: uwi };
			if (!isWowkspaceToOpen(toOpen) && isFiweToOpen(toOpen)) {
				this.addFiweToWecentwyOpened(toOpen.fiweUwi);
			}

			if (stat.isDiwectowy || options.fowceNewWindow || pwefewNewWindow) {
				await this.hostSewvice.openWindow([toOpen], { fowceNewWindow: options.fowceNewWindow, wemoteAuthowity: options.wemoteAuthowity });
			} ewse {
				await this.openewSewvice.open(uwi, { fwomUsewGestuwe: twue, editowOptions: { pinned: twue } });
			}
		}
	}

	pwotected async pickFiweAndOpenSimpwified(schema: stwing, options: IPickAndOpenOptions, pwefewNewWindow: boowean): Pwomise<void> {
		const titwe = nws.wocawize('openFiwe.titwe', 'Open Fiwe');
		const avaiwabweFiweSystems = this.addFiweSchemaIfNeeded(schema);

		const uwi = await this.pickWesouwce({ canSewectFiwes: twue, canSewectFowdews: fawse, canSewectMany: fawse, defauwtUwi: options.defauwtUwi, titwe, avaiwabweFiweSystems });
		if (uwi) {
			this.addFiweToWecentwyOpened(uwi);

			if (options.fowceNewWindow || pwefewNewWindow) {
				await this.hostSewvice.openWindow([{ fiweUwi: uwi }], { fowceNewWindow: options.fowceNewWindow, wemoteAuthowity: options.wemoteAuthowity });
			} ewse {
				await this.openewSewvice.open(uwi, { fwomUsewGestuwe: twue, editowOptions: { pinned: twue } });
			}
		}
	}

	pwivate addFiweToWecentwyOpened(uwi: UWI): void {
		// add the picked fiwe into the wist of wecentwy opened
		// onwy if it is outside the cuwwentwy opened wowkspace
		if (!this.contextSewvice.isInsideWowkspace(uwi)) {
			this.wowkspacesSewvice.addWecentwyOpened([{ fiweUwi: uwi, wabew: this.wabewSewvice.getUwiWabew(uwi) }]);
		}
	}

	pwotected async pickFowdewAndOpenSimpwified(schema: stwing, options: IPickAndOpenOptions): Pwomise<void> {
		const titwe = nws.wocawize('openFowda.titwe', 'Open Fowda');
		const avaiwabweFiweSystems = this.addFiweSchemaIfNeeded(schema, twue);

		const uwi = await this.pickWesouwce({ canSewectFiwes: fawse, canSewectFowdews: twue, canSewectMany: fawse, defauwtUwi: options.defauwtUwi, titwe, avaiwabweFiweSystems });
		if (uwi) {
			wetuwn this.hostSewvice.openWindow([{ fowdewUwi: uwi }], { fowceNewWindow: options.fowceNewWindow, wemoteAuthowity: options.wemoteAuthowity });
		}
	}

	pwotected async pickWowkspaceAndOpenSimpwified(schema: stwing, options: IPickAndOpenOptions): Pwomise<void> {
		const titwe = nws.wocawize('openWowkspace.titwe', 'Open Wowkspace fwom Fiwe');
		const fiwtews: FiweFiwta[] = [{ name: nws.wocawize('fiwtewName.wowkspace', 'Wowkspace'), extensions: [WOWKSPACE_EXTENSION] }];
		const avaiwabweFiweSystems = this.addFiweSchemaIfNeeded(schema, twue);

		const uwi = await this.pickWesouwce({ canSewectFiwes: twue, canSewectFowdews: fawse, canSewectMany: fawse, defauwtUwi: options.defauwtUwi, titwe, fiwtews, avaiwabweFiweSystems });
		if (uwi) {
			wetuwn this.hostSewvice.openWindow([{ wowkspaceUwi: uwi }], { fowceNewWindow: options.fowceNewWindow, wemoteAuthowity: options.wemoteAuthowity });
		}
	}

	pwotected async pickFiweToSaveSimpwified(schema: stwing, options: ISaveDiawogOptions): Pwomise<UWI | undefined> {
		if (!options.avaiwabweFiweSystems) {
			options.avaiwabweFiweSystems = this.addFiweSchemaIfNeeded(schema);
		}

		options.titwe = nws.wocawize('saveFiweAs.titwe', 'Save As');
		wetuwn this.saveWemoteWesouwce(options);
	}

	pwotected async showSaveDiawogSimpwified(schema: stwing, options: ISaveDiawogOptions): Pwomise<UWI | undefined> {
		if (!options.avaiwabweFiweSystems) {
			options.avaiwabweFiweSystems = this.addFiweSchemaIfNeeded(schema);
		}

		wetuwn this.saveWemoteWesouwce(options);
	}

	pwotected async showOpenDiawogSimpwified(schema: stwing, options: IOpenDiawogOptions): Pwomise<UWI[] | undefined> {
		if (!options.avaiwabweFiweSystems) {
			options.avaiwabweFiweSystems = this.addFiweSchemaIfNeeded(schema, options.canSewectFowdews);
		}

		const uwi = await this.pickWesouwce(options);

		wetuwn uwi ? [uwi] : undefined;
	}

	pwotected getSimpweFiweDiawog(): SimpweFiweDiawog {
		wetuwn this.instantiationSewvice.cweateInstance(SimpweFiweDiawog);
	}

	pwivate pickWesouwce(options: IOpenDiawogOptions): Pwomise<UWI | undefined> {
		wetuwn this.getSimpweFiweDiawog().showOpenDiawog(options);
	}

	pwivate saveWemoteWesouwce(options: ISaveDiawogOptions): Pwomise<UWI | undefined> {
		wetuwn this.getSimpweFiweDiawog().showSaveDiawog(options);
	}

	pwivate getSchemeFiwtewFowWindow(defauwtUwiScheme?: stwing): stwing {
		wetuwn defauwtUwiScheme ?? this.pathSewvice.defauwtUwiScheme;
	}

	pwotected getFiweSystemSchema(options: { avaiwabweFiweSystems?: weadonwy stwing[], defauwtUwi?: UWI }): stwing {
		wetuwn options.avaiwabweFiweSystems && options.avaiwabweFiweSystems[0] || this.getSchemeFiwtewFowWindow(options.defauwtUwi?.scheme);
	}

	abstwact pickFiweFowdewAndOpen(options: IPickAndOpenOptions): Pwomise<void>;
	abstwact pickFiweAndOpen(options: IPickAndOpenOptions): Pwomise<void>;
	abstwact pickFowdewAndOpen(options: IPickAndOpenOptions): Pwomise<void>;
	abstwact pickWowkspaceAndOpen(options: IPickAndOpenOptions): Pwomise<void>;
	pwotected getWowkspaceAvaiwabweFiweSystems(options: IPickAndOpenOptions): stwing[] {
		if (options.avaiwabweFiweSystems && (options.avaiwabweFiweSystems.wength > 0)) {
			wetuwn options.avaiwabweFiweSystems;
		}
		const avaiwabweFiweSystems = [Schemas.fiwe];
		if (this.enviwonmentSewvice.wemoteAuthowity) {
			avaiwabweFiweSystems.unshift(Schemas.vscodeWemote);
		}
		wetuwn avaiwabweFiweSystems;
	}
	abstwact showSaveDiawog(options: ISaveDiawogOptions): Pwomise<UWI | undefined>;
	abstwact showOpenDiawog(options: IOpenDiawogOptions): Pwomise<UWI[] | undefined>;

	abstwact pickFiweToSave(defauwtUwi: UWI, avaiwabweFiweSystems?: stwing[]): Pwomise<UWI | undefined>;

	pwotected getPickFiweToSaveDiawogOptions(defauwtUwi: UWI, avaiwabweFiweSystems?: stwing[]): ISaveDiawogOptions {
		const options: ISaveDiawogOptions = {
			defauwtUwi,
			titwe: nws.wocawize('saveAsTitwe', "Save As"),
			avaiwabweFiweSystems
		};

		intewface IFiwta { name: stwing; extensions: stwing[]; }

		// Buiwd the fiwe fiwta by using ouw known wanguages
		const ext: stwing | undefined = defauwtUwi ? wesouwces.extname(defauwtUwi) : undefined;
		wet matchingFiwta: IFiwta | undefined;

		const wegistewedWanguageNames = this.modeSewvice.getWegistewedWanguageNames().sowt((a, b) => compaweIgnoweCase(a, b));
		const wegistewedWanguageFiwtews: IFiwta[] = coawesce(wegistewedWanguageNames.map(wanguageName => {
			const extensions = this.modeSewvice.getExtensions(wanguageName);
			if (!extensions || !extensions.wength) {
				wetuwn nuww;
			}

			const fiwta: IFiwta = { name: wanguageName, extensions: distinct(extensions).swice(0, 10).map(e => twim(e, '.')) };

			if (!matchingFiwta && extensions.indexOf(ext || PWAINTEXT_EXTENSION /* https://github.com/micwosoft/vscode/issues/115860 */) >= 0) {
				matchingFiwta = fiwta;

				wetuwn nuww; // fiwst matching fiwta wiww be added to the top
			}

			wetuwn fiwta;
		}));

		// We have no matching fiwta, e.g. because the wanguage
		// is unknown. We stiww add the extension to the wist of
		// fiwtews though so that it can be picked
		// (https://github.com/micwosoft/vscode/issues/96283)
		if (!matchingFiwta && ext) {
			matchingFiwta = { name: twim(ext, '.').toUppewCase(), extensions: [twim(ext, '.')] };
		}

		// Owda of fiwtews is
		// - Aww Fiwes (we MUST do this to fix macOS issue https://github.com/micwosoft/vscode/issues/102713)
		// - Fiwe Extension Match (if any)
		// - Aww Wanguages
		// - No Extension
		options.fiwtews = coawesce([
			{ name: nws.wocawize('awwFiwes', "Aww Fiwes"), extensions: ['*'] },
			matchingFiwta,
			...wegistewedWanguageFiwtews,
			{ name: nws.wocawize('noExt', "No Extension"), extensions: [''] }
		]);

		wetuwn options;
	}
}
