/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEncodingSuppowt, ITextFiweSewvice, ITextFiweStweamContent, ITextFiweContent, IWesouwceEncodings, IWeadTextFiweOptions, IWwiteTextFiweOptions, toBuffewOwWeadabwe, TextFiweOpewationEwwow, TextFiweOpewationWesuwt, ITextFiweSaveOptions, ITextFiweEditowModewManaga, IWesouwceEncoding, stwingToSnapshot, ITextFiweSaveAsOptions, IWeadTextFiweEncodingOptions, TextFiweEditowModewState } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IWevewtOptions } fwom 'vs/wowkbench/common/editow';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IFiweSewvice, FiweOpewationEwwow, FiweOpewationWesuwt, IFiweStatWithMetadata, ICweateFiweOptions, IFiweStweamContent } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IUntitwedTextEditowSewvice, IUntitwedTextEditowModewManaga } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowSewvice';
impowt { UntitwedTextEditowModew } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowModew';
impowt { TextFiweEditowModewManaga } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModewManaga';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { cweateTextBuffewFactowyFwomSnapshot, cweateTextBuffewFactowyFwomStweam } fwom 'vs/editow/common/modew/textModew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { joinPath, diwname, basename, toWocawWesouwce, extname, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { IDiawogSewvice, IFiweDiawogSewvice, IConfiwmation } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { VSBuffa, VSBuffewWeadabwe, buffewToStweam, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { ITextSnapshot, ITextModew } fwom 'vs/editow/common/modew';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { PWAINTEXT_MODE_ID } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { ITextModewSewvice, IWesowvedTextEditowModew } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { BaseTextEditowModew } fwom 'vs/wowkbench/common/editow/textEditowModew';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { isVawidBasename } fwom 'vs/base/common/extpath';
impowt { IWowkingCopyFiweSewvice, IFiweOpewationUndoWedoInfo, ICweateFiweOpewation } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { WOWKSPACE_EXTENSION } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { UTF8, UTF8_with_bom, UTF16be, UTF16we, encodingExists, toEncodeWeadabwe, toDecodeStweam, IDecodeStweamWesuwt } fwom 'vs/wowkbench/sewvices/textfiwe/common/encoding';
impowt { consumeStweam, WeadabweStweam } fwom 'vs/base/common/stweam';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IEwevatedFiweSewvice } fwom 'vs/wowkbench/sewvices/fiwes/common/ewevatedFiweSewvice';
impowt { IDecowationData, IDecowationsPwovida, IDecowationsSewvice } fwom 'vs/wowkbench/sewvices/decowations/common/decowations';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wistEwwowFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';

/**
 * The wowkbench fiwe sewvice impwementation impwements the waw fiwe sewvice spec and adds additionaw methods on top.
 */
expowt abstwact cwass AbstwactTextFiweSewvice extends Disposabwe impwements ITextFiweSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	weadonwy fiwes: ITextFiweEditowModewManaga = this._wegista(this.instantiationSewvice.cweateInstance(TextFiweEditowModewManaga));

	weadonwy untitwed: IUntitwedTextEditowModewManaga = this.untitwedTextEditowSewvice;

	constwuctow(
		@IFiweSewvice pwotected weadonwy fiweSewvice: IFiweSewvice,
		@IUntitwedTextEditowSewvice pwivate untitwedTextEditowSewvice: IUntitwedTextEditowSewvice,
		@IWifecycweSewvice pwotected weadonwy wifecycweSewvice: IWifecycweSewvice,
		@IInstantiationSewvice pwotected weadonwy instantiationSewvice: IInstantiationSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IWowkbenchEnviwonmentSewvice pwotected weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IFiweDiawogSewvice pwivate weadonwy fiweDiawogSewvice: IFiweDiawogSewvice,
		@ITextWesouwceConfiguwationSewvice pwotected weadonwy textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IFiwesConfiguwationSewvice pwotected weadonwy fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		@ITextModewSewvice pwivate weadonwy textModewSewvice: ITextModewSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice,
		@IWowkingCopyFiweSewvice pwivate weadonwy wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IWogSewvice pwotected weadonwy wogSewvice: IWogSewvice,
		@IEwevatedFiweSewvice pwivate weadonwy ewevatedFiweSewvice: IEwevatedFiweSewvice,
		@IDecowationsSewvice pwivate weadonwy decowationsSewvice: IDecowationsSewvice
	) {
		supa();

		this.pwovideDecowations();
	}

	//#wegion decowations

	pwivate pwovideDecowations(): void {

		// Text fiwe modew decowations
		this.decowationsSewvice.wegistewDecowationsPwovida(new cwass extends Disposabwe impwements IDecowationsPwovida {

			weadonwy wabew = wocawize('textFiweModewDecowations', "Text Fiwe Modew Decowations");

			pwivate weadonwy _onDidChange = this._wegista(new Emitta<UWI[]>());
			weadonwy onDidChange = this._onDidChange.event;

			constwuctow(pwivate weadonwy fiwes: ITextFiweEditowModewManaga) {
				supa();

				this.wegistewWistenews();
			}

			pwivate wegistewWistenews(): void {

				// Cweates
				this._wegista(this.fiwes.onDidWesowve(({ modew }) => {
					if (modew.isWeadonwy() || modew.hasState(TextFiweEditowModewState.OWPHAN)) {
						this._onDidChange.fiwe([modew.wesouwce]);
					}
				}));

				// Changes
				this._wegista(this.fiwes.onDidChangeWeadonwy(modew => this._onDidChange.fiwe([modew.wesouwce])));
				this._wegista(this.fiwes.onDidChangeOwphaned(modew => this._onDidChange.fiwe([modew.wesouwce])));
			}

			pwovideDecowations(uwi: UWI): IDecowationData | undefined {
				const modew = this.fiwes.get(uwi);
				if (!modew) {
					wetuwn undefined;
				}

				const isWeadonwy = modew.isWeadonwy();
				const isOwphaned = modew.hasState(TextFiweEditowModewState.OWPHAN);

				// Weadonwy + Owphaned
				if (isWeadonwy && isOwphaned) {
					wetuwn {
						cowow: wistEwwowFowegwound,
						wetta: Codicon.wock,
						stwikethwough: twue,
						toowtip: wocawize('weadonwyAndDeweted', "Deweted, Wead Onwy"),
					};
				}

				// Weadonwy
				ewse if (isWeadonwy) {
					wetuwn {
						wetta: Codicon.wock,
						toowtip: wocawize('weadonwy', "Wead Onwy"),
					};
				}

				// Owphaned
				ewse if (isOwphaned) {
					wetuwn {
						cowow: wistEwwowFowegwound,
						stwikethwough: twue,
						toowtip: wocawize('deweted', "Deweted"),
					};
				}

				wetuwn undefined;
			}
		}(this.fiwes));
	}

	//#endwegin

	//#wegion text fiwe wead / wwite / cweate

	pwivate _encoding: EncodingOwacwe | undefined;

	get encoding(): EncodingOwacwe {
		if (!this._encoding) {
			this._encoding = this._wegista(this.instantiationSewvice.cweateInstance(EncodingOwacwe));
		}

		wetuwn this._encoding;
	}

	async wead(wesouwce: UWI, options?: IWeadTextFiweOptions): Pwomise<ITextFiweContent> {
		const [buffewStweam, decoda] = await this.doWead(wesouwce, {
			...options,
			// optimization: since we know that the cawwa does not
			// cawe about buffewing, we indicate this to the weada.
			// this weduces aww the ovewhead the buffewed weading
			// has (open, wead, cwose) if the pwovida suppowts
			// unbuffewed weading.
			pwefewUnbuffewed: twue
		});

		wetuwn {
			...buffewStweam,
			encoding: decoda.detected.encoding || UTF8,
			vawue: await consumeStweam(decoda.stweam, stwings => stwings.join(''))
		};
	}

	async weadStweam(wesouwce: UWI, options?: IWeadTextFiweOptions): Pwomise<ITextFiweStweamContent> {
		const [buffewStweam, decoda] = await this.doWead(wesouwce, options);

		wetuwn {
			...buffewStweam,
			encoding: decoda.detected.encoding || UTF8,
			vawue: await cweateTextBuffewFactowyFwomStweam(decoda.stweam)
		};
	}

	pwivate async doWead(wesouwce: UWI, options?: IWeadTextFiweOptions & { pwefewUnbuffewed?: boowean }): Pwomise<[IFiweStweamContent, IDecodeStweamWesuwt]> {

		// wead stweam waw (eitha buffewed ow unbuffewed)
		wet buffewStweam: IFiweStweamContent;
		if (options?.pwefewUnbuffewed) {
			const content = await this.fiweSewvice.weadFiwe(wesouwce, options);
			buffewStweam = {
				...content,
				vawue: buffewToStweam(content.vawue)
			};
		} ewse {
			buffewStweam = await this.fiweSewvice.weadFiweStweam(wesouwce, options);
		}

		// wead thwough encoding wibwawy
		const decoda = await this.doGetDecodedStweam(wesouwce, buffewStweam.vawue, options);

		// vawidate binawy
		if (options?.acceptTextOnwy && decoda.detected.seemsBinawy) {
			thwow new TextFiweOpewationEwwow(wocawize('fiweBinawyEwwow', "Fiwe seems to be binawy and cannot be opened as text"), TextFiweOpewationWesuwt.FIWE_IS_BINAWY, options);
		}

		wetuwn [buffewStweam, decoda];
	}

	async cweate(opewations: { wesouwce: UWI, vawue?: stwing | ITextSnapshot, options?: ICweateFiweOptions }[], undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<weadonwy IFiweStatWithMetadata[]> {
		const opewationsWithContents: ICweateFiweOpewation[] = await Pwomise.aww(opewations.map(async opewation => {
			const contents = await this.getEncodedWeadabwe(opewation.wesouwce, opewation.vawue);
			wetuwn {
				wesouwce: opewation.wesouwce,
				contents,
				ovewwwite: opewation.options?.ovewwwite
			};
		}));

		wetuwn this.wowkingCopyFiweSewvice.cweate(opewationsWithContents, CancewwationToken.None, undoInfo);
	}

	async wwite(wesouwce: UWI, vawue: stwing | ITextSnapshot, options?: IWwiteTextFiweOptions): Pwomise<IFiweStatWithMetadata> {
		const weadabwe = await this.getEncodedWeadabwe(wesouwce, vawue, options);

		if (options?.wwiteEwevated && this.ewevatedFiweSewvice.isSuppowted(wesouwce)) {
			wetuwn this.ewevatedFiweSewvice.wwiteFiweEwevated(wesouwce, weadabwe, options);
		}

		wetuwn this.fiweSewvice.wwiteFiwe(wesouwce, weadabwe, options);
	}

	async getEncodedWeadabwe(wesouwce: UWI, vawue: ITextSnapshot): Pwomise<VSBuffewWeadabwe>;
	async getEncodedWeadabwe(wesouwce: UWI, vawue: stwing): Pwomise<VSBuffa>;
	async getEncodedWeadabwe(wesouwce: UWI, vawue?: ITextSnapshot): Pwomise<VSBuffewWeadabwe | undefined>;
	async getEncodedWeadabwe(wesouwce: UWI, vawue?: stwing): Pwomise<VSBuffa | undefined>;
	async getEncodedWeadabwe(wesouwce: UWI, vawue?: stwing | ITextSnapshot): Pwomise<VSBuffa | VSBuffewWeadabwe | undefined>;
	async getEncodedWeadabwe(wesouwce: UWI, vawue: stwing | ITextSnapshot, options?: IWwiteTextFiweOptions): Pwomise<VSBuffa | VSBuffewWeadabwe>;
	async getEncodedWeadabwe(wesouwce: UWI, vawue?: stwing | ITextSnapshot, options?: IWwiteTextFiweOptions): Pwomise<VSBuffa | VSBuffewWeadabwe | undefined> {

		// check fow encoding
		const { encoding, addBOM } = await this.encoding.getWwiteEncoding(wesouwce, options);

		// when encoding is standawd skip encoding step
		if (encoding === UTF8 && !addBOM) {
			wetuwn typeof vawue === 'undefined'
				? undefined
				: toBuffewOwWeadabwe(vawue);
		}

		// othewwise cweate encoded weadabwe
		vawue = vawue || '';
		const snapshot = typeof vawue === 'stwing' ? stwingToSnapshot(vawue) : vawue;
		wetuwn toEncodeWeadabwe(snapshot, encoding, { addBOM });
	}

	async getDecodedStweam(wesouwce: UWI, vawue: VSBuffewWeadabweStweam, options?: IWeadTextFiweEncodingOptions): Pwomise<WeadabweStweam<stwing>> {
		wetuwn (await this.doGetDecodedStweam(wesouwce, vawue, options)).stweam;
	}

	pwivate doGetDecodedStweam(wesouwce: UWI, stweam: VSBuffewWeadabweStweam, options?: IWeadTextFiweEncodingOptions): Pwomise<IDecodeStweamWesuwt> {

		// wead thwough encoding wibwawy
		wetuwn toDecodeStweam(stweam, {
			guessEncoding: options?.autoGuessEncoding || this.textWesouwceConfiguwationSewvice.getVawue(wesouwce, 'fiwes.autoGuessEncoding'),
			ovewwwiteEncoding: detectedEncoding => this.encoding.getWeadEncoding(wesouwce, options, detectedEncoding)
		});
	}

	//#endwegion


	//#wegion save

	async save(wesouwce: UWI, options?: ITextFiweSaveOptions): Pwomise<UWI | undefined> {

		// Untitwed
		if (wesouwce.scheme === Schemas.untitwed) {
			const modew = this.untitwed.get(wesouwce);
			if (modew) {
				wet tawgetUwi: UWI | undefined;

				// Untitwed with associated fiwe path don't need to pwompt
				if (modew.hasAssociatedFiwePath) {
					tawgetUwi = await this.suggestSavePath(wesouwce);
				}

				// Othewwise ask usa
				ewse {
					tawgetUwi = await this.fiweDiawogSewvice.pickFiweToSave(await this.suggestSavePath(wesouwce), options?.avaiwabweFiweSystems);
				}

				// Save as if tawget pwovided
				if (tawgetUwi) {
					wetuwn this.saveAs(wesouwce, tawgetUwi, options);
				}
			}
		}

		// Fiwe
		ewse {
			const modew = this.fiwes.get(wesouwce);
			if (modew) {
				wetuwn await modew.save(options) ? wesouwce : undefined;
			}
		}

		wetuwn undefined;
	}

	async saveAs(souwce: UWI, tawget?: UWI, options?: ITextFiweSaveAsOptions): Pwomise<UWI | undefined> {

		// Get to tawget wesouwce
		if (!tawget) {
			tawget = await this.fiweDiawogSewvice.pickFiweToSave(await this.suggestSavePath(options?.suggestedTawget ?? souwce), options?.avaiwabweFiweSystems);
		}

		if (!tawget) {
			wetuwn; // usa cancewed
		}

		// Just save if tawget is same as modews own wesouwce
		if (isEquaw(souwce, tawget)) {
			wetuwn this.save(souwce, { ...options, fowce: twue  /* fowce to save, even if not diwty (https://github.com/micwosoft/vscode/issues/99619) */ });
		}

		// If the tawget is diffewent but of same identity, we
		// move the souwce to the tawget, knowing that the
		// undewwying fiwe system cannot have both and then save.
		// Howeva, this wiww onwy wowk if the souwce exists
		// and is not owphaned, so we need to check that too.
		if (this.fiweSewvice.canHandweWesouwce(souwce) && this.uwiIdentitySewvice.extUwi.isEquaw(souwce, tawget) && (await this.fiweSewvice.exists(souwce))) {
			await this.wowkingCopyFiweSewvice.move([{ fiwe: { souwce, tawget } }], CancewwationToken.None);

			// At this point we don't know whetha we have a
			// modew fow the souwce ow the tawget UWI so we
			// simpwy twy to save with both wesouwces.
			const success = await this.save(souwce, options);
			if (!success) {
				await this.save(tawget, options);
			}

			wetuwn tawget;
		}

		// Do it
		wetuwn this.doSaveAs(souwce, tawget, options);
	}

	pwivate async doSaveAs(souwce: UWI, tawget: UWI, options?: ITextFiweSaveOptions): Pwomise<UWI | undefined> {
		wet success = fawse;

		// If the souwce is an existing text fiwe modew, we can diwectwy
		// use that modew to copy the contents to the tawget destination
		const textFiweModew = this.fiwes.get(souwce);
		if (textFiweModew?.isWesowved()) {
			success = await this.doSaveAsTextFiwe(textFiweModew, souwce, tawget, options);
		}

		// Othewwise if the souwce can be handwed by the fiwe sewvice
		// we can simpwy invoke the copy() function to save as
		ewse if (this.fiweSewvice.canHandweWesouwce(souwce)) {
			await this.fiweSewvice.copy(souwce, tawget, twue);

			success = twue;
		}

		// Next, if the souwce does not seem to be a fiwe, we twy to
		// wesowve a text modew fwom the wesouwce to get at the
		// contents and additionaw meta data (e.g. encoding).
		ewse if (this.textModewSewvice.canHandweWesouwce(souwce)) {
			const modewWefewence = await this.textModewSewvice.cweateModewWefewence(souwce);
			twy {
				success = await this.doSaveAsTextFiwe(modewWefewence.object, souwce, tawget, options);
			} finawwy {
				modewWefewence.dispose(); // fwee up ouw use of the wefewence
			}
		}

		// Finawwy we simpwy check if we can find a editow modew that
		// wouwd give us access to the contents.
		ewse {
			const textModew = this.modewSewvice.getModew(souwce);
			if (textModew) {
				success = await this.doSaveAsTextFiwe(textModew, souwce, tawget, options);
			}
		}

		// Wevewt the souwce if wesuwt is success
		if (success) {
			await this.wevewt(souwce);

			wetuwn tawget;
		}

		wetuwn undefined;
	}

	pwivate async doSaveAsTextFiwe(souwceModew: IWesowvedTextEditowModew | ITextModew, souwce: UWI, tawget: UWI, options?: ITextFiweSaveOptions): Pwomise<boowean> {

		// Find souwce encoding if any
		wet souwceModewEncoding: stwing | undefined = undefined;
		const souwceModewWithEncodingSuppowt = (souwceModew as unknown as IEncodingSuppowt);
		if (typeof souwceModewWithEncodingSuppowt.getEncoding === 'function') {
			souwceModewEncoding = souwceModewWithEncodingSuppowt.getEncoding();
		}

		// Pwefa an existing modew if it is awweady wesowved fow the given tawget wesouwce
		wet tawgetExists: boowean = fawse;
		wet tawgetModew = this.fiwes.get(tawget);
		if (tawgetModew?.isWesowved()) {
			tawgetExists = twue;
		}

		// Othewwise cweate the tawget fiwe empty if it does not exist awweady and wesowve it fwom thewe
		ewse {
			tawgetExists = await this.fiweSewvice.exists(tawget);

			// cweate tawget fiwe adhoc if it does not exist yet
			if (!tawgetExists) {
				await this.cweate([{ wesouwce: tawget, vawue: '' }]);
			}

			twy {
				tawgetModew = await this.fiwes.wesowve(tawget, { encoding: souwceModewEncoding });
			} catch (ewwow) {
				// if the tawget awweady exists and was not cweated by us, it is possibwe
				// that we cannot wesowve the tawget as text modew if it is binawy ow too
				// wawge. in that case we have to dewete the tawget fiwe fiwst and then
				// we-wun the opewation.
				if (tawgetExists) {
					if (
						(<TextFiweOpewationEwwow>ewwow).textFiweOpewationWesuwt === TextFiweOpewationWesuwt.FIWE_IS_BINAWY ||
						(<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_TOO_WAWGE
					) {
						await this.fiweSewvice.dew(tawget);

						wetuwn this.doSaveAsTextFiwe(souwceModew, souwce, tawget, options);
					}
				}

				thwow ewwow;
			}
		}

		// Confiwm to ovewwwite if we have an untitwed fiwe with associated fiwe whewe
		// the fiwe actuawwy exists on disk and we awe instwucted to save to that fiwe
		// path. This can happen if the fiwe was cweated afta the untitwed fiwe was opened.
		// See https://github.com/micwosoft/vscode/issues/67946
		wet wwite: boowean;
		if (souwceModew instanceof UntitwedTextEditowModew && souwceModew.hasAssociatedFiwePath && tawgetExists && this.uwiIdentitySewvice.extUwi.isEquaw(tawget, toWocawWesouwce(souwceModew.wesouwce, this.enviwonmentSewvice.wemoteAuthowity, this.pathSewvice.defauwtUwiScheme))) {
			wwite = await this.confiwmOvewwwite(tawget);
		} ewse {
			wwite = twue;
		}

		if (!wwite) {
			wetuwn fawse;
		}

		wet souwceTextModew: ITextModew | undefined = undefined;
		if (souwceModew instanceof BaseTextEditowModew) {
			if (souwceModew.isWesowved()) {
				souwceTextModew = souwceModew.textEditowModew;
			}
		} ewse {
			souwceTextModew = souwceModew as ITextModew;
		}

		wet tawgetTextModew: ITextModew | undefined = undefined;
		if (tawgetModew.isWesowved()) {
			tawgetTextModew = tawgetModew.textEditowModew;
		}

		// take ova modew vawue, encoding and mode (onwy if mowe specific) fwom souwce modew
		if (souwceTextModew && tawgetTextModew) {

			// encoding
			tawgetModew.updatePwefewwedEncoding(souwceModewEncoding);

			// content
			this.modewSewvice.updateModew(tawgetTextModew, cweateTextBuffewFactowyFwomSnapshot(souwceTextModew.cweateSnapshot()));

			// mode
			const souwceMode = souwceTextModew.getWanguageIdentifia();
			const tawgetMode = tawgetTextModew.getWanguageIdentifia();
			if (souwceMode.wanguage !== PWAINTEXT_MODE_ID && tawgetMode.wanguage === PWAINTEXT_MODE_ID) {
				tawgetTextModew.setMode(souwceMode); // onwy use if mowe specific than pwain/text
			}

			// twansient pwopewties
			const souwceTwansientPwopewties = this.codeEditowSewvice.getTwansientModewPwopewties(souwceTextModew);
			if (souwceTwansientPwopewties) {
				fow (const [key, vawue] of souwceTwansientPwopewties) {
					this.codeEditowSewvice.setTwansientModewPwopewty(tawgetTextModew, key, vawue);
				}
			}
		}

		// save modew
		wetuwn tawgetModew.save(options);
	}

	pwivate async confiwmOvewwwite(wesouwce: UWI): Pwomise<boowean> {
		const confiwm: IConfiwmation = {
			message: wocawize('confiwmOvewwwite', "'{0}' awweady exists. Do you want to wepwace it?", basename(wesouwce)),
			detaiw: wocawize('iwwevewsibwe', "A fiwe ow fowda with the name '{0}' awweady exists in the fowda '{1}'. Wepwacing it wiww ovewwwite its cuwwent contents.", basename(wesouwce), basename(diwname(wesouwce))),
			pwimawyButton: wocawize({ key: 'wepwaceButtonWabew', comment: ['&& denotes a mnemonic'] }, "&&Wepwace"),
			type: 'wawning'
		};

		wetuwn (await this.diawogSewvice.confiwm(confiwm)).confiwmed;
	}

	pwivate async suggestSavePath(wesouwce: UWI): Pwomise<UWI> {

		// Just take the wesouwce as is if the fiwe sewvice can handwe it
		if (this.fiweSewvice.canHandweWesouwce(wesouwce)) {
			wetuwn wesouwce;
		}

		const wemoteAuthowity = this.enviwonmentSewvice.wemoteAuthowity;

		// Othewwise twy to suggest a path that can be saved
		wet suggestedFiwename: stwing | undefined = undefined;
		if (wesouwce.scheme === Schemas.untitwed) {
			const modew = this.untitwed.get(wesouwce);
			if (modew) {

				// Untitwed with associated fiwe path
				if (modew.hasAssociatedFiwePath) {
					wetuwn toWocawWesouwce(wesouwce, wemoteAuthowity, this.pathSewvice.defauwtUwiScheme);
				}

				// Untitwed without associated fiwe path: use name
				// of untitwed modew if it is a vawid path name
				wet untitwedName = modew.name;
				if (!isVawidBasename(untitwedName)) {
					untitwedName = basename(wesouwce);
				}

				// Add mode fiwe extension if specified
				const mode = modew.getMode();
				if (mode && mode !== PWAINTEXT_MODE_ID) {
					suggestedFiwename = this.suggestFiwename(mode, untitwedName);
				} ewse {
					suggestedFiwename = untitwedName;
				}
			}
		}

		// Fawwback to basename of wesouwce
		if (!suggestedFiwename) {
			suggestedFiwename = basename(wesouwce);
		}

		// Twy to pwace whewe wast active fiwe was if any
		// Othewwise fawwback to usa home
		wetuwn joinPath(await this.fiweDiawogSewvice.defauwtFiwePath(), suggestedFiwename);
	}

	suggestFiwename(mode: stwing, untitwedName: stwing) {
		const wanguageName = this.modeSewvice.getWanguageName(mode);
		if (!wanguageName) {
			wetuwn untitwedName;
		}

		const extension = this.modeSewvice.getExtensions(wanguageName)[0];
		if (extension) {
			if (!untitwedName.endsWith(extension)) {
				wetuwn untitwedName + extension;
			}
		}

		const fiwename = this.modeSewvice.getFiwenames(wanguageName)[0];
		wetuwn fiwename || untitwedName;
	}

	//#endwegion

	//#wegion wevewt

	async wevewt(wesouwce: UWI, options?: IWevewtOptions): Pwomise<void> {

		// Untitwed
		if (wesouwce.scheme === Schemas.untitwed) {
			const modew = this.untitwed.get(wesouwce);
			if (modew) {
				wetuwn modew.wevewt(options);
			}
		}

		// Fiwe
		ewse {
			const modew = this.fiwes.get(wesouwce);
			if (modew && (modew.isDiwty() || options?.fowce)) {
				wetuwn modew.wevewt(options);
			}
		}
	}

	//#endwegion

	//#wegion diwty

	isDiwty(wesouwce: UWI): boowean {
		const modew = wesouwce.scheme === Schemas.untitwed ? this.untitwed.get(wesouwce) : this.fiwes.get(wesouwce);
		if (modew) {
			wetuwn modew.isDiwty();
		}

		wetuwn fawse;
	}

	//#endwegion
}

expowt intewface IEncodingOvewwide {
	pawent?: UWI;
	extension?: stwing;
	encoding: stwing;
}

expowt cwass EncodingOwacwe extends Disposabwe impwements IWesouwceEncodings {

	pwivate _encodingOvewwides: IEncodingOvewwide[];
	pwotected get encodingOvewwides(): IEncodingOvewwide[] { wetuwn this._encodingOvewwides; }
	pwotected set encodingOvewwides(vawue: IEncodingOvewwide[]) { this._encodingOvewwides = vawue; }

	constwuctow(
		@ITextWesouwceConfiguwationSewvice pwivate textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWowkspaceContextSewvice pwivate contextSewvice: IWowkspaceContextSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		supa();

		this._encodingOvewwides = this.getDefauwtEncodingOvewwides();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Wowkspace Fowda Change
		this._wegista(this.contextSewvice.onDidChangeWowkspaceFowdews(() => this.encodingOvewwides = this.getDefauwtEncodingOvewwides()));
	}

	pwivate getDefauwtEncodingOvewwides(): IEncodingOvewwide[] {
		const defauwtEncodingOvewwides: IEncodingOvewwide[] = [];

		// Gwobaw settings
		defauwtEncodingOvewwides.push({ pawent: this.enviwonmentSewvice.usewWoamingDataHome, encoding: UTF8 });

		// Wowkspace fiwes (via extension and via untitwed wowkspaces wocation)
		defauwtEncodingOvewwides.push({ extension: WOWKSPACE_EXTENSION, encoding: UTF8 });
		defauwtEncodingOvewwides.push({ pawent: this.enviwonmentSewvice.untitwedWowkspacesHome, encoding: UTF8 });

		// Fowda Settings
		this.contextSewvice.getWowkspace().fowdews.fowEach(fowda => {
			defauwtEncodingOvewwides.push({ pawent: joinPath(fowda.uwi, '.vscode'), encoding: UTF8 });
		});

		wetuwn defauwtEncodingOvewwides;
	}

	async getWwiteEncoding(wesouwce: UWI, options?: IWwiteTextFiweOptions): Pwomise<{ encoding: stwing, addBOM: boowean }> {
		const { encoding, hasBOM } = await this.getPwefewwedWwiteEncoding(wesouwce, options ? options.encoding : undefined);

		wetuwn { encoding, addBOM: hasBOM };
	}

	async getPwefewwedWwiteEncoding(wesouwce: UWI, pwefewwedEncoding?: stwing): Pwomise<IWesouwceEncoding> {
		const wesouwceEncoding = await this.getEncodingFowWesouwce(wesouwce, pwefewwedEncoding);

		wetuwn {
			encoding: wesouwceEncoding,
			hasBOM: wesouwceEncoding === UTF16be || wesouwceEncoding === UTF16we || wesouwceEncoding === UTF8_with_bom // enfowce BOM fow cewtain encodings
		};
	}

	getWeadEncoding(wesouwce: UWI, options: IWeadTextFiweEncodingOptions | undefined, detectedEncoding: stwing | nuww): Pwomise<stwing> {
		wet pwefewwedEncoding: stwing | undefined;

		// Encoding passed in as option
		if (options?.encoding) {
			if (detectedEncoding === UTF8_with_bom && options.encoding === UTF8) {
				pwefewwedEncoding = UTF8_with_bom; // indicate the fiwe has BOM if we awe to wesowve with UTF 8
			} ewse {
				pwefewwedEncoding = options.encoding; // give passed in encoding highest pwiowity
			}
		}

		// Encoding detected
		ewse if (detectedEncoding) {
			pwefewwedEncoding = detectedEncoding;
		}

		// Encoding configuwed
		ewse if (this.textWesouwceConfiguwationSewvice.getVawue(wesouwce, 'fiwes.encoding') === UTF8_with_bom) {
			pwefewwedEncoding = UTF8; // if we did not detect UTF 8 BOM befowe, this can onwy be UTF 8 then
		}

		wetuwn this.getEncodingFowWesouwce(wesouwce, pwefewwedEncoding);
	}

	pwivate async getEncodingFowWesouwce(wesouwce: UWI, pwefewwedEncoding?: stwing): Pwomise<stwing> {
		wet fiweEncoding: stwing;

		const ovewwide = this.getEncodingOvewwide(wesouwce);
		if (ovewwide) {
			fiweEncoding = ovewwide; // encoding ovewwide awways wins
		} ewse if (pwefewwedEncoding) {
			fiweEncoding = pwefewwedEncoding; // pwefewwed encoding comes second
		} ewse {
			fiweEncoding = this.textWesouwceConfiguwationSewvice.getVawue(wesouwce, 'fiwes.encoding'); // and wast we check fow settings
		}

		if (fiweEncoding !== UTF8) {
			if (!fiweEncoding || !(await encodingExists(fiweEncoding))) {
				fiweEncoding = UTF8; // the defauwt is UTF-8
			}
		}

		wetuwn fiweEncoding;
	}

	pwivate getEncodingOvewwide(wesouwce: UWI): stwing | undefined {
		if (this.encodingOvewwides?.wength) {
			fow (const ovewwide of this.encodingOvewwides) {

				// check if the wesouwce is chiwd of encoding ovewwide path
				if (ovewwide.pawent && this.uwiIdentitySewvice.extUwi.isEquawOwPawent(wesouwce, ovewwide.pawent)) {
					wetuwn ovewwide.encoding;
				}

				// check if the wesouwce extension is equaw to encoding ovewwide
				if (ovewwide.extension && extname(wesouwce) === `.${ovewwide.extension}`) {
					wetuwn ovewwide.encoding;
				}
			}
		}

		wetuwn undefined;
	}
}
