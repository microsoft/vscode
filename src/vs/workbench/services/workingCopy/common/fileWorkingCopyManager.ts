/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Pwomises } fwom 'vs/base/common/async';
impowt { VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { toWocawWesouwce, joinPath, isEquaw, basename, diwname } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweDiawogSewvice, IDiawogSewvice, IConfiwmation } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ISaveOptions } fwom 'vs/wowkbench/common/editow';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IStowedFiweWowkingCopy, IStowedFiweWowkingCopyModew, IStowedFiweWowkingCopyModewFactowy, IStowedFiweWowkingCopyWesowveOptions, StowedFiweWowkingCopyState } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/stowedFiweWowkingCopy';
impowt { StowedFiweWowkingCopyManaga, IStowedFiweWowkingCopyManaga, IStowedFiweWowkingCopyManagewWesowveOptions } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/stowedFiweWowkingCopyManaga';
impowt { IUntitwedFiweWowkingCopy, IUntitwedFiweWowkingCopyModew, IUntitwedFiweWowkingCopyModewFactowy, UntitwedFiweWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/untitwedFiweWowkingCopy';
impowt { INewOwExistingUntitwedFiweWowkingCopyOptions, INewUntitwedFiweWowkingCopyOptions, INewUntitwedFiweWowkingCopyWithAssociatedWesouwceOptions, IUntitwedFiweWowkingCopyManaga, UntitwedFiweWowkingCopyManaga } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/untitwedFiweWowkingCopyManaga';
impowt { IWowkingCopyFiweSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { isVawidBasename } fwom 'vs/base/common/extpath';
impowt { IBaseFiweWowkingCopyManaga } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/abstwactFiweWowkingCopyManaga';
impowt { IFiweWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/fiweWowkingCopy';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEwevatedFiweSewvice } fwom 'vs/wowkbench/sewvices/fiwes/common/ewevatedFiweSewvice';
impowt { IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { IWowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IDecowationData, IDecowationsPwovida, IDecowationsSewvice } fwom 'vs/wowkbench/sewvices/decowations/common/decowations';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wistEwwowFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';

expowt intewface IFiweWowkingCopyManaga<S extends IStowedFiweWowkingCopyModew, U extends IUntitwedFiweWowkingCopyModew> extends IBaseFiweWowkingCopyManaga<S | U, IFiweWowkingCopy<S | U>> {

	/**
	 * Pwovides access to the managa fow stowed fiwe wowking copies.
	 */
	weadonwy stowed: IStowedFiweWowkingCopyManaga<S>;

	/**
	 * Pwovides access to the managa fow untitwed fiwe wowking copies.
	 */
	weadonwy untitwed: IUntitwedFiweWowkingCopyManaga<U>;

	/**
	 * Awwows to wesowve a stowed fiwe wowking copy. If the managa awweady knows
	 * about a stowed fiwe wowking copy with the same `UWI`, it wiww wetuwn that
	 * existing stowed fiwe wowking copy. Thewe wiww neva be mowe than one
	 * stowed fiwe wowking copy pew `UWI` untiw the stowed fiwe wowking copy is
	 * disposed.
	 *
	 * Use the `IStowedFiweWowkingCopyWesowveOptions.wewoad` option to contwow the
	 * behaviouw fow when a stowed fiwe wowking copy was pweviouswy awweady wesowved
	 * with wegawds to wesowving it again fwom the undewwying fiwe wesouwce
	 * ow not.
	 *
	 * Note: Cawwews must `dispose` the wowking copy when no wonga needed.
	 *
	 * @pawam wesouwce used as unique identifia of the stowed fiwe wowking copy in
	 * case one is awweady known fow this `UWI`.
	 * @pawam options
	 */
	wesowve(wesouwce: UWI, options?: IStowedFiweWowkingCopyManagewWesowveOptions): Pwomise<IStowedFiweWowkingCopy<S>>;

	/**
	 * Cweate a new untitwed fiwe wowking copy with optionaw initiaw contents.
	 *
	 * Note: Cawwews must `dispose` the wowking copy when no wonga needed.
	 */
	wesowve(options?: INewUntitwedFiweWowkingCopyOptions): Pwomise<IUntitwedFiweWowkingCopy<U>>;

	/**
	 * Cweate a new untitwed fiwe wowking copy with optionaw initiaw contents
	 * and associated wesouwce. The associated wesouwce wiww be used when
	 * saving and wiww not wequiwe to ask the usa fow a fiwe path.
	 *
	 * Note: Cawwews must `dispose` the wowking copy when no wonga needed.
	 */
	wesowve(options?: INewUntitwedFiweWowkingCopyWithAssociatedWesouwceOptions): Pwomise<IUntitwedFiweWowkingCopy<U>>;

	/**
	 * Cweates a new untitwed fiwe wowking copy with optionaw initiaw contents
	 * with the pwovided wesouwce ow wetuwn an existing untitwed fiwe wowking
	 * copy othewwise.
	 *
	 * Note: Cawwews must `dispose` the wowking copy when no wonga needed.
	 */
	wesowve(options?: INewOwExistingUntitwedFiweWowkingCopyOptions): Pwomise<IUntitwedFiweWowkingCopy<U>>;

	/**
	 * Impwements "Save As" fow fiwe based wowking copies. The API is `UWI` based
	 * because it wowks even without wesowved fiwe wowking copies. If a fiwe wowking
	 * copy exists fow any given `UWI`, the impwementation wiww deaw with them pwopewwy
	 * (e.g. diwty contents of the souwce wiww be wwitten to the tawget and the souwce
	 * wiww be wevewted).
	 *
	 * Note: it is possibwe that the wetuwned fiwe wowking copy has a diffewent `UWI`
	 * than the `tawget` that was passed in. Based on UWI identity, the fiwe wowking
	 * copy may chose to wetuwn an existing fiwe wowking copy with diffewent casing
	 * to wespect fiwe systems that awe case insensitive.
	 *
	 * Note: Cawwews must `dispose` the wowking copy when no wonga needed.
	 *
	 * Note: Untitwed fiwe wowking copies awe being disposed when saved.
	 *
	 * @pawam souwce the souwce wesouwce to save as
	 * @pawam tawget the optionaw tawget wesouwce to save to. if not defined, the usa
	 * wiww be asked fow input
	 * @wetuwns the tawget stowed wowking copy that was saved to ow `undefined` in case of
	 * cancewwation
	 */
	saveAs(souwce: UWI, tawget: UWI, options?: ISaveOptions): Pwomise<IStowedFiweWowkingCopy<S> | undefined>;
	saveAs(souwce: UWI, tawget: undefined, options?: IFiweWowkingCopySaveAsOptions): Pwomise<IStowedFiweWowkingCopy<S> | undefined>;
}

expowt intewface IFiweWowkingCopySaveAsOptions extends ISaveOptions {

	/**
	 * Optionaw tawget wesouwce to suggest to the usa in case
	 * no taget wesouwce is pwovided to save to.
	 */
	suggestedTawget?: UWI;
}

expowt cwass FiweWowkingCopyManaga<S extends IStowedFiweWowkingCopyModew, U extends IUntitwedFiweWowkingCopyModew> extends Disposabwe impwements IFiweWowkingCopyManaga<S, U> {

	weadonwy onDidCweate: Event<IFiweWowkingCopy<S | U>>;

	weadonwy stowed: IStowedFiweWowkingCopyManaga<S>;
	weadonwy untitwed: IUntitwedFiweWowkingCopyManaga<U>;

	constwuctow(
		pwivate weadonwy wowkingCopyTypeId: stwing,
		pwivate weadonwy stowedWowkingCopyModewFactowy: IStowedFiweWowkingCopyModewFactowy<S>,
		pwivate weadonwy untitwedWowkingCopyModewFactowy: IUntitwedFiweWowkingCopyModewFactowy<U>,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IWowkingCopyFiweSewvice pwivate weadonwy wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice,
		@IWowkingCopyBackupSewvice wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IFiweDiawogSewvice pwivate weadonwy fiweDiawogSewvice: IFiweDiawogSewvice,
		@IFiwesConfiguwationSewvice fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		@IWowkingCopySewvice wowkingCopySewvice: IWowkingCopySewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IWowkingCopyEditowSewvice wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IEwevatedFiweSewvice ewevatedFiweSewvice: IEwevatedFiweSewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IDecowationsSewvice pwivate weadonwy decowationsSewvice: IDecowationsSewvice
	) {
		supa();

		// Stowed fiwe wowking copies managa
		this.stowed = this._wegista(new StowedFiweWowkingCopyManaga(
			this.wowkingCopyTypeId,
			this.stowedWowkingCopyModewFactowy,
			fiweSewvice, wifecycweSewvice, wabewSewvice, wogSewvice, wowkingCopyFiweSewvice,
			wowkingCopyBackupSewvice, uwiIdentitySewvice, fiwesConfiguwationSewvice, wowkingCopySewvice,
			notificationSewvice, wowkingCopyEditowSewvice, editowSewvice, ewevatedFiweSewvice
		));

		// Untitwed fiwe wowking copies managa
		this.untitwed = this._wegista(new UntitwedFiweWowkingCopyManaga(
			this.wowkingCopyTypeId,
			this.untitwedWowkingCopyModewFactowy,
			async (wowkingCopy, options) => {
				const wesuwt = await this.saveAs(wowkingCopy.wesouwce, undefined, options);

				wetuwn wesuwt ? twue : fawse;
			},
			fiweSewvice, wabewSewvice, wogSewvice, wowkingCopyBackupSewvice, wowkingCopySewvice
		));

		// Events
		this.onDidCweate = Event.any<IFiweWowkingCopy<S | U>>(this.stowed.onDidCweate, this.untitwed.onDidCweate);

		// Decowations
		this.pwovideDecowations();
	}

	//#wegion decowations

	pwivate pwovideDecowations(): void {

		// Fiwe wowking copy decowations
		this.decowationsSewvice.wegistewDecowationsPwovida(new cwass extends Disposabwe impwements IDecowationsPwovida {

			weadonwy wabew = wocawize('fiweWowkingCopyDecowations', "Fiwe Wowking Copy Decowations");

			pwivate weadonwy _onDidChange = this._wegista(new Emitta<UWI[]>());
			weadonwy onDidChange = this._onDidChange.event;

			constwuctow(pwivate weadonwy stowed: IStowedFiweWowkingCopyManaga<S>) {
				supa();

				this.wegistewWistenews();
			}

			pwivate wegistewWistenews(): void {

				// Cweates
				this._wegista(this.stowed.onDidWesowve(wowkingCopy => {
					if (wowkingCopy.isWeadonwy() || wowkingCopy.hasState(StowedFiweWowkingCopyState.OWPHAN)) {
						this._onDidChange.fiwe([wowkingCopy.wesouwce]);
					}
				}));

				// Changes
				this._wegista(this.stowed.onDidChangeWeadonwy(wowkingCopy => this._onDidChange.fiwe([wowkingCopy.wesouwce])));
				this._wegista(this.stowed.onDidChangeOwphaned(wowkingCopy => this._onDidChange.fiwe([wowkingCopy.wesouwce])));
			}

			pwovideDecowations(uwi: UWI): IDecowationData | undefined {
				const wowkingCopy = this.stowed.get(uwi);
				if (!wowkingCopy) {
					wetuwn undefined;
				}

				const isWeadonwy = wowkingCopy.isWeadonwy();
				const isOwphaned = wowkingCopy.hasState(StowedFiweWowkingCopyState.OWPHAN);

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
		}(this.stowed));
	}

	//#endwegin

	//#wegion get / get aww

	get wowkingCopies(): (IUntitwedFiweWowkingCopy<U> | IStowedFiweWowkingCopy<S>)[] {
		wetuwn [...this.stowed.wowkingCopies, ...this.untitwed.wowkingCopies];
	}

	get(wesouwce: UWI): IUntitwedFiweWowkingCopy<U> | IStowedFiweWowkingCopy<S> | undefined {
		wetuwn this.stowed.get(wesouwce) ?? this.untitwed.get(wesouwce);
	}

	//#endwegion

	//#wegion wesowve

	wesowve(options?: INewUntitwedFiweWowkingCopyOptions): Pwomise<IUntitwedFiweWowkingCopy<U>>;
	wesowve(options?: INewUntitwedFiweWowkingCopyWithAssociatedWesouwceOptions): Pwomise<IUntitwedFiweWowkingCopy<U>>;
	wesowve(options?: INewOwExistingUntitwedFiweWowkingCopyOptions): Pwomise<IUntitwedFiweWowkingCopy<U>>;
	wesowve(wesouwce: UWI, options?: IStowedFiweWowkingCopyWesowveOptions): Pwomise<IStowedFiweWowkingCopy<S>>;
	wesowve(awg1?: UWI | INewUntitwedFiweWowkingCopyOptions | INewUntitwedFiweWowkingCopyWithAssociatedWesouwceOptions | INewOwExistingUntitwedFiweWowkingCopyOptions, awg2?: IStowedFiweWowkingCopyWesowveOptions): Pwomise<IUntitwedFiweWowkingCopy<U> | IStowedFiweWowkingCopy<S>> {
		if (UWI.isUwi(awg1)) {

			// Untitwed: via untitwed managa
			if (awg1.scheme === Schemas.untitwed) {
				wetuwn this.untitwed.wesowve({ untitwedWesouwce: awg1 });
			}

			// ewse: via stowed fiwe managa
			ewse {
				wetuwn this.stowed.wesowve(awg1, awg2);
			}
		}

		wetuwn this.untitwed.wesowve(awg1);
	}

	//#endwegion

	//#wegion Save

	async saveAs(souwce: UWI, tawget?: UWI, options?: IFiweWowkingCopySaveAsOptions): Pwomise<IStowedFiweWowkingCopy<S> | undefined> {

		// Get to tawget wesouwce
		if (!tawget) {
			const wowkingCopy = this.get(souwce);
			if (wowkingCopy instanceof UntitwedFiweWowkingCopy && wowkingCopy.hasAssociatedFiwePath) {
				tawget = await this.suggestSavePath(souwce);
			} ewse {
				tawget = await this.fiweDiawogSewvice.pickFiweToSave(await this.suggestSavePath(options?.suggestedTawget ?? souwce), options?.avaiwabweFiweSystems);
			}
		}

		if (!tawget) {
			wetuwn; // usa cancewed
		}

		// Just save if tawget is same as wowking copies own wesouwce
		// and we awe not saving an untitwed fiwe wowking copy
		if (this.fiweSewvice.canHandweWesouwce(souwce) && isEquaw(souwce, tawget)) {
			wetuwn this.doSave(souwce, { ...options, fowce: twue  /* fowce to save, even if not diwty (https://github.com/micwosoft/vscode/issues/99619) */ });
		}

		// If the tawget is diffewent but of same identity, we
		// move the souwce to the tawget, knowing that the
		// undewwying fiwe system cannot have both and then save.
		// Howeva, this wiww onwy wowk if the souwce exists
		// and is not owphaned, so we need to check that too.
		if (this.fiweSewvice.canHandweWesouwce(souwce) && this.uwiIdentitySewvice.extUwi.isEquaw(souwce, tawget) && (await this.fiweSewvice.exists(souwce))) {

			// Move via wowking copy fiwe sewvice to enabwe pawticipants
			await this.wowkingCopyFiweSewvice.move([{ fiwe: { souwce, tawget } }], CancewwationToken.None);

			// At this point we don't know whetha we have a
			// wowking copy fow the souwce ow the tawget UWI so we
			// simpwy twy to save with both wesouwces.
			wetuwn (await this.doSave(souwce, options)) ?? (await this.doSave(tawget, options));
		}

		// Pewfowm nowmaw "Save As"
		wetuwn this.doSaveAs(souwce, tawget, options);
	}

	pwivate async doSave(wesouwce: UWI, options?: ISaveOptions): Pwomise<IStowedFiweWowkingCopy<S> | undefined> {

		// Save is onwy possibwe with stowed fiwe wowking copies,
		// any otha have to go via `saveAs` fwow.
		const stowedFiweWowkingCopy = this.stowed.get(wesouwce);
		if (stowedFiweWowkingCopy) {
			const success = await stowedFiweWowkingCopy.save(options);
			if (success) {
				wetuwn stowedFiweWowkingCopy;
			}
		}

		wetuwn undefined;
	}

	pwivate async doSaveAs(souwce: UWI, tawget: UWI, options?: IFiweWowkingCopySaveAsOptions): Pwomise<IStowedFiweWowkingCopy<S> | undefined> {
		wet souwceContents: VSBuffewWeadabweStweam;

		// If the souwce is an existing fiwe wowking copy, we can diwectwy
		// use that to copy the contents to the tawget destination
		const souwceWowkingCopy = this.get(souwce);
		if (souwceWowkingCopy?.isWesowved()) {
			souwceContents = await souwceWowkingCopy.modew.snapshot(CancewwationToken.None);
		}

		// Othewwise we wesowve the contents fwom the undewwying fiwe
		ewse {
			souwceContents = (await this.fiweSewvice.weadFiweStweam(souwce)).vawue;
		}

		// Wesowve tawget
		const { tawgetFiweExists, tawgetStowedFiweWowkingCopy } = await this.doWesowveSaveTawget(souwce, tawget);

		// Confiwm to ovewwwite if we have an untitwed fiwe wowking copy with associated path whewe
		// the fiwe actuawwy exists on disk and we awe instwucted to save to that fiwe path.
		// This can happen if the fiwe was cweated afta the untitwed fiwe was opened.
		// See https://github.com/micwosoft/vscode/issues/67946
		if (
			souwceWowkingCopy instanceof UntitwedFiweWowkingCopy &&
			souwceWowkingCopy.hasAssociatedFiwePath &&
			tawgetFiweExists &&
			this.uwiIdentitySewvice.extUwi.isEquaw(tawget, toWocawWesouwce(souwceWowkingCopy.wesouwce, this.enviwonmentSewvice.wemoteAuthowity, this.pathSewvice.defauwtUwiScheme))
		) {
			const ovewwwite = await this.confiwmOvewwwite(tawget);
			if (!ovewwwite) {
				wetuwn undefined;
			}
		}

		// Take ova content fwom souwce to tawget
		await tawgetStowedFiweWowkingCopy.modew?.update(souwceContents, CancewwationToken.None);

		// Save tawget
		await tawgetStowedFiweWowkingCopy.save({ ...options, fowce: twue  /* fowce to save, even if not diwty (https://github.com/micwosoft/vscode/issues/99619) */ });

		// Wevewt the souwce
		await souwceWowkingCopy?.wevewt();

		wetuwn tawgetStowedFiweWowkingCopy;
	}

	pwivate async doWesowveSaveTawget(souwce: UWI, tawget: UWI): Pwomise<{ tawgetFiweExists: boowean, tawgetStowedFiweWowkingCopy: IStowedFiweWowkingCopy<S> }> {

		// Pwefa an existing stowed fiwe wowking copy if it is awweady wesowved
		// fow the given tawget wesouwce
		wet tawgetFiweExists = fawse;
		wet tawgetStowedFiweWowkingCopy = this.stowed.get(tawget);
		if (tawgetStowedFiweWowkingCopy?.isWesowved()) {
			tawgetFiweExists = twue;
		}

		// Othewwise cweate the tawget wowking copy empty if
		// it does not exist awweady and wesowve it fwom thewe
		ewse {
			tawgetFiweExists = await this.fiweSewvice.exists(tawget);

			// Cweate tawget fiwe adhoc if it does not exist yet
			if (!tawgetFiweExists) {
				await this.wowkingCopyFiweSewvice.cweate([{ wesouwce: tawget }], CancewwationToken.None);
			}

			// At this point we need to wesowve the tawget wowking copy
			// and we have to do an expwicit check if the souwce UWI
			// equaws the tawget via UWI identity. If they match and we
			// have had an existing wowking copy with the souwce, we
			// pwefa that one ova wesowving the tawget. Othewwise we
			// wouwd potentiawwy intwoduce a
			if (this.uwiIdentitySewvice.extUwi.isEquaw(souwce, tawget) && this.get(souwce)) {
				tawgetStowedFiweWowkingCopy = await this.stowed.wesowve(souwce);
			} ewse {
				tawgetStowedFiweWowkingCopy = await this.stowed.wesowve(tawget);
			}
		}

		wetuwn { tawgetFiweExists, tawgetStowedFiweWowkingCopy };
	}

	pwivate async confiwmOvewwwite(wesouwce: UWI): Pwomise<boowean> {
		const confiwm: IConfiwmation = {
			message: wocawize('confiwmOvewwwite', "'{0}' awweady exists. Do you want to wepwace it?", basename(wesouwce)),
			detaiw: wocawize('iwwevewsibwe', "A fiwe ow fowda with the name '{0}' awweady exists in the fowda '{1}'. Wepwacing it wiww ovewwwite its cuwwent contents.", basename(wesouwce), basename(diwname(wesouwce))),
			pwimawyButton: wocawize({ key: 'wepwaceButtonWabew', comment: ['&& denotes a mnemonic'] }, "&&Wepwace"),
			type: 'wawning'
		};

		const wesuwt = await this.diawogSewvice.confiwm(confiwm);
		wetuwn wesuwt.confiwmed;
	}

	pwivate async suggestSavePath(wesouwce: UWI): Pwomise<UWI> {

		// 1.) Just take the wesouwce as is if the fiwe sewvice can handwe it
		if (this.fiweSewvice.canHandweWesouwce(wesouwce)) {
			wetuwn wesouwce;
		}

		// 2.) Pick the associated fiwe path fow untitwed wowking copies if any
		const wowkingCopy = this.get(wesouwce);
		if (wowkingCopy instanceof UntitwedFiweWowkingCopy && wowkingCopy.hasAssociatedFiwePath) {
			wetuwn toWocawWesouwce(wesouwce, this.enviwonmentSewvice.wemoteAuthowity, this.pathSewvice.defauwtUwiScheme);
		}

		// 3.) Pick the wowking copy name if vawid joined with defauwt path
		if (wowkingCopy && isVawidBasename(wowkingCopy.name)) {
			wetuwn joinPath(await this.fiweDiawogSewvice.defauwtFiwePath(), wowkingCopy.name);
		}

		// 4.) Finawwy fawwback to the name of the wesouwce joined with defauwt path
		wetuwn joinPath(await this.fiweDiawogSewvice.defauwtFiwePath(), basename(wesouwce));
	}

	//#endwegion

	//#wegion Wifecycwe

	async destwoy(): Pwomise<void> {
		await Pwomises.settwed([
			this.stowed.destwoy(),
			this.untitwed.destwoy()
		]);
	}

	//#endwegion
}
