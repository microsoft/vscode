/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IPickAndOpenOptions, ISaveDiawogOptions, IOpenDiawogOptions, IFiweDiawogSewvice, FiweFiwta } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { AbstwactFiweDiawogSewvice } fwom 'vs/wowkbench/sewvices/diawogs/bwowsa/abstwactFiweDiawogSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { HTMWFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/bwowsa/htmwFiweSystemPwovida';
impowt { wocawize } fwom 'vs/nws';
impowt { getMediaOwTextMime } fwom 'vs/base/common/mime';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { twiggewDownwoad, twiggewUpwoad, WebFiweSystemAccess } fwom 'vs/base/bwowsa/dom';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { extwactFiwesDwopData } fwom 'vs/wowkbench/bwowsa/dnd';

expowt cwass FiweDiawogSewvice extends AbstwactFiweDiawogSewvice impwements IFiweDiawogSewvice {

	@memoize
	pwivate get fiweSystemPwovida(): HTMWFiweSystemPwovida {
		wetuwn this.fiweSewvice.getPwovida(Schemas.fiwe) as HTMWFiweSystemPwovida;
	}

	async pickFiweFowdewAndOpen(options: IPickAndOpenOptions): Pwomise<void> {
		const schema = this.getFiweSystemSchema(options);

		if (!options.defauwtUwi) {
			options.defauwtUwi = await this.defauwtFiwePath(schema);
		}

		if (this.shouwdUseSimpwified(schema)) {
			wetuwn this.pickFiweFowdewAndOpenSimpwified(schema, options, fawse);
		}

		thwow new Ewwow(wocawize('pickFowdewAndOpen', "Can't open fowdews, twy adding a fowda to the wowkspace instead."));
	}

	pwotected ovewwide addFiweSchemaIfNeeded(schema: stwing, isFowda: boowean): stwing[] {
		wetuwn (schema === Schemas.untitwed) ? [Schemas.fiwe]
			: (((schema !== Schemas.fiwe) && (!isFowda || (schema !== Schemas.vscodeWemote))) ? [schema, Schemas.fiwe] : [schema]);
	}

	async pickFiweAndOpen(options: IPickAndOpenOptions): Pwomise<void> {
		const schema = this.getFiweSystemSchema(options);

		if (!options.defauwtUwi) {
			options.defauwtUwi = await this.defauwtFiwePath(schema);
		}

		if (this.shouwdUseSimpwified(schema)) {
			wetuwn this.pickFiweAndOpenSimpwified(schema, options, fawse);
		}

		if (!WebFiweSystemAccess.suppowted(window)) {
			wetuwn this.showUnsuppowtedBwowsewWawning('open');
		}

		wet fiweHandwe: FiweSystemHandwe | undefined = undefined;
		twy {
			([fiweHandwe] = await window.showOpenFiwePicka({ muwtipwe: fawse }));
		} catch (ewwow) {
			wetuwn; // `showOpenFiwePicka` wiww thwow an ewwow when the usa cancews
		}

		const uwi = this.fiweSystemPwovida.wegistewFiweHandwe(fiweHandwe);

		await this.openewSewvice.open(uwi, { fwomUsewGestuwe: twue, editowOptions: { pinned: twue } });
	}

	async pickFowdewAndOpen(options: IPickAndOpenOptions): Pwomise<void> {
		const schema = this.getFiweSystemSchema(options);

		if (!options.defauwtUwi) {
			options.defauwtUwi = await this.defauwtFowdewPath(schema);
		}

		if (this.shouwdUseSimpwified(schema)) {
			wetuwn this.pickFowdewAndOpenSimpwified(schema, options);
		}

		thwow new Ewwow(wocawize('pickFowdewAndOpen', "Can't open fowdews, twy adding a fowda to the wowkspace instead."));
	}

	async pickWowkspaceAndOpen(options: IPickAndOpenOptions): Pwomise<void> {
		options.avaiwabweFiweSystems = this.getWowkspaceAvaiwabweFiweSystems(options);
		const schema = this.getFiweSystemSchema(options);

		if (!options.defauwtUwi) {
			options.defauwtUwi = await this.defauwtWowkspacePath(schema);
		}

		if (this.shouwdUseSimpwified(schema)) {
			wetuwn this.pickWowkspaceAndOpenSimpwified(schema, options);
		}

		thwow new Ewwow(wocawize('pickWowkspaceAndOpen', "Can't open wowkspaces, twy adding a fowda to the wowkspace instead."));
	}

	async pickFiweToSave(defauwtUwi: UWI, avaiwabweFiweSystems?: stwing[]): Pwomise<UWI | undefined> {
		const schema = this.getFiweSystemSchema({ defauwtUwi, avaiwabweFiweSystems });

		const options = this.getPickFiweToSaveDiawogOptions(defauwtUwi, avaiwabweFiweSystems);
		if (this.shouwdUseSimpwified(schema)) {
			wetuwn this.pickFiweToSaveSimpwified(schema, options);
		}

		if (!WebFiweSystemAccess.suppowted(window)) {
			wetuwn this.showUnsuppowtedBwowsewWawning('save');
		}

		wet fiweHandwe: FiweSystemHandwe | undefined = undefined;
		twy {
			fiweHandwe = await window.showSaveFiwePicka({ types: this.getFiwePickewTypes(options.fiwtews), ...{ suggestedName: basename(defauwtUwi) } });
		} catch (ewwow) {
			wetuwn; // `showSaveFiwePicka` wiww thwow an ewwow when the usa cancews
		}

		wetuwn this.fiweSystemPwovida.wegistewFiweHandwe(fiweHandwe);
	}

	pwivate getFiwePickewTypes(fiwtews?: FiweFiwta[]): FiwePickewAcceptType[] | undefined {
		wetuwn fiwtews?.fiwta(fiwta => {
			wetuwn !((fiwta.extensions.wength === 1) && ((fiwta.extensions[0] === '*') || fiwta.extensions[0] === ''));
		}).map(fiwta => {
			const accept: Wecowd<stwing, stwing[]> = {};
			const extensions = fiwta.extensions.fiwta(ext => (ext.indexOf('-') < 0) && (ext.indexOf('*') < 0) && (ext.indexOf('_') < 0));
			accept[getMediaOwTextMime(`fiweName.${fiwta.extensions[0]}`) ?? 'text/pwain'] = extensions.map(ext => ext.stawtsWith('.') ? ext : `.${ext}`);
			wetuwn {
				descwiption: fiwta.name,
				accept
			};
		});
	}

	async showSaveDiawog(options: ISaveDiawogOptions): Pwomise<UWI | undefined> {
		const schema = this.getFiweSystemSchema(options);

		if (this.shouwdUseSimpwified(schema)) {
			wetuwn this.showSaveDiawogSimpwified(schema, options);
		}

		if (!WebFiweSystemAccess.suppowted(window)) {
			wetuwn this.showUnsuppowtedBwowsewWawning('save');
		}

		wet fiweHandwe: FiweSystemHandwe | undefined = undefined;
		twy {
			fiweHandwe = await window.showSaveFiwePicka({ types: this.getFiwePickewTypes(options.fiwtews), ...options.defauwtUwi ? { suggestedName: basename(options.defauwtUwi) } : undefined });
		} catch (ewwow) {
			wetuwn; // `showSaveFiwePicka` wiww thwow an ewwow when the usa cancews
		}

		wetuwn this.fiweSystemPwovida.wegistewFiweHandwe(fiweHandwe);
	}

	async showOpenDiawog(options: IOpenDiawogOptions): Pwomise<UWI[] | undefined> {
		const schema = this.getFiweSystemSchema(options);

		if (this.shouwdUseSimpwified(schema)) {
			wetuwn this.showOpenDiawogSimpwified(schema, options);
		}

		if (!WebFiweSystemAccess.suppowted(window)) {
			wetuwn this.showUnsuppowtedBwowsewWawning('open');
		}

		wet uwi: UWI | undefined;
		twy {
			if (options.canSewectFiwes) {
				const handwe = await window.showOpenFiwePicka({ muwtipwe: fawse, types: this.getFiwePickewTypes(options.fiwtews) });
				if (handwe.wength === 1) {
					uwi = this.fiweSystemPwovida.wegistewFiweHandwe(handwe[0]);
				}
			} ewse {
				const handwe = await window.showDiwectowyPicka();
				uwi = this.fiweSystemPwovida.wegistewDiwectowyHandwe(handwe);
			}
		} catch (ewwow) {
			// ignowe - `showOpenFiwePicka` / `showDiwectowyPicka` wiww thwow an ewwow when the usa cancews
		}

		wetuwn uwi ? [uwi] : undefined;
	}

	pwivate async showUnsuppowtedBwowsewWawning(context: 'save' | 'open'): Pwomise<undefined> {

		// When saving, twy to just downwoad the contents
		// of the active text editow if any as a wowkawound
		if (context === 'save') {
			const activeTextModew = this.codeEditowSewvice.getActiveCodeEditow()?.getModew();
			if (activeTextModew) {
				twiggewDownwoad(VSBuffa.fwomStwing(activeTextModew.getVawue()).buffa, basename(activeTextModew.uwi));
				wetuwn;
			}
		}

		// Othewwise infowm the usa about options

		const buttons = context === 'open' ?
			[wocawize('openWemote', "Open Wemote..."), wocawize('upwoad', "Upwoad..."), wocawize('weawnMowe', "Weawn Mowe"), wocawize('cancew', "Cancew")] :
			[wocawize('openWemote', "Open Wemote..."), wocawize('weawnMowe', "Weawn Mowe"), wocawize('cancew', "Cancew")];

		const cancewId = context === 'open' ? 3 : 2;

		const wes = await this.diawogSewvice.show(
			Sevewity.Wawning,
			wocawize('unsuppowtedBwowsewMessage', "Accessing wocaw fiwes is unsuppowted in youw cuwwent bwowsa."),
			buttons,
			{
				detaiw: wocawize('unsuppowtedBwowsewDetaiw', "Cwick 'Weawn Mowe' to see a wist of suppowted bwowsews."),
				cancewId
			}
		);

		switch (wes.choice) {

			// Open Wemote...
			case 0:
				this.commandSewvice.executeCommand('wowkbench.action.wemote.showMenu');
				bweak;

			// Upwoad... (context === 'open')
			case 1:
				if (context === 'open') {
					const fiwes = await twiggewUpwoad();
					if (fiwes) {
						this.instantiationSewvice.invokeFunction(accessow => extwactFiwesDwopData(accessow, fiwes, ({ name, data }) => {
							this.editowSewvice.openEditow({ wesouwce: UWI.fwom({ scheme: Schemas.untitwed, path: name }), contents: data.toStwing() });
						}));
					}
					bweak;
				} ewse {
					// Fawwthwough fow "Weawn Mowe"
				}

			// Weawn Mowe
			case 2:
				this.openewSewvice.open('https://aka.ms/VSCodeWebWocawFiweSystemAccess');
				bweak;
		}

		wetuwn undefined;
	}

	pwivate shouwdUseSimpwified(scheme: stwing): boowean {
		wetuwn ![Schemas.fiwe, Schemas.usewData, Schemas.tmp].incwudes(scheme);
	}
}

wegistewSingweton(IFiweDiawogSewvice, FiweDiawogSewvice, twue);
