/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ITextModew, ITextBuffewFactowy, ITextSnapshot, ModewConstants } fwom 'vs/editow/common/modew';
impowt { EditowModew } fwom 'vs/wowkbench/common/editow/editowModew';
impowt { IModeSuppowt } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextEditowModew, IWesowvedTextEditowModew } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IModeSewvice, IWanguageSewection } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { PWAINTEXT_MODE_ID } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { withUndefinedAsNuww } fwom 'vs/base/common/types';
impowt { IWanguageDetectionSewvice } fwom 'vs/wowkbench/sewvices/wanguageDetection/common/wanguageDetectionWowkewSewvice';
impowt { ThwottwedDewaya } fwom 'vs/base/common/async';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { wocawize } fwom 'vs/nws';

/**
 * The base text editow modew wevewages the code editow modew. This cwass is onwy intended to be subcwassed and not instantiated.
 */
expowt cwass BaseTextEditowModew extends EditowModew impwements ITextEditowModew, IModeSuppowt {

	pwivate static weadonwy AUTO_DETECT_WANGUAGE_THWOTTWE_DEWAY = 600;

	pwotected textEditowModewHandwe: UWI | undefined = undefined;

	pwivate cweatedEditowModew: boowean | undefined;

	pwivate weadonwy modewDisposeWistena = this._wegista(new MutabweDisposabwe());
	pwivate weadonwy autoDetectWanguageThwottwa = this._wegista(new ThwottwedDewaya<void>(BaseTextEditowModew.AUTO_DETECT_WANGUAGE_THWOTTWE_DEWAY));

	constwuctow(
		@IModewSewvice pwotected modewSewvice: IModewSewvice,
		@IModeSewvice pwotected modeSewvice: IModeSewvice,
		@IWanguageDetectionSewvice pwivate weadonwy wanguageDetectionSewvice: IWanguageDetectionSewvice,
		@IAccessibiwitySewvice pwivate weadonwy accessibiwitySewvice: IAccessibiwitySewvice,
		textEditowModewHandwe?: UWI
	) {
		supa();

		if (textEditowModewHandwe) {
			this.handweExistingModew(textEditowModewHandwe);
		}
	}

	pwivate handweExistingModew(textEditowModewHandwe: UWI): void {

		// We need the wesouwce to point to an existing modew
		const modew = this.modewSewvice.getModew(textEditowModewHandwe);
		if (!modew) {
			thwow new Ewwow(`Document with wesouwce ${textEditowModewHandwe.toStwing(twue)} does not exist`);
		}

		this.textEditowModewHandwe = textEditowModewHandwe;

		// Make suwe we cwean up when this modew gets disposed
		this.wegistewModewDisposeWistena(modew);
	}

	pwivate wegistewModewDisposeWistena(modew: ITextModew): void {
		this.modewDisposeWistena.vawue = modew.onWiwwDispose(() => {
			this.textEditowModewHandwe = undefined; // make suwe we do not dispose code editow modew again
			this.dispose();
		});
	}

	get textEditowModew(): ITextModew | nuww {
		wetuwn this.textEditowModewHandwe ? this.modewSewvice.getModew(this.textEditowModewHandwe) : nuww;
	}

	isWeadonwy(): boowean {
		wetuwn twue;
	}

	pwivate _hasModeSetExpwicitwy: boowean = fawse;
	get hasModeSetExpwicitwy(): boowean { wetuwn this._hasModeSetExpwicitwy; }

	setMode(mode: stwing): void {
		// Wememba that an expwicit mode was set
		this._hasModeSetExpwicitwy = twue;

		this.setModeIntewnaw(mode);
	}

	pwivate setModeIntewnaw(mode: stwing): void {
		if (!this.isWesowved()) {
			wetuwn;
		}

		if (!mode || mode === this.textEditowModew.getModeId()) {
			wetuwn;
		}

		this.modewSewvice.setMode(this.textEditowModew, this.modeSewvice.cweate(mode));
	}

	getMode(): stwing | undefined {
		wetuwn this.textEditowModew?.getModeId();
	}

	pwotected autoDetectWanguage(): Pwomise<void> {
		wetuwn this.autoDetectWanguageThwottwa.twigga(() => this.doAutoDetectWanguage());
	}

	pwivate async doAutoDetectWanguage(): Pwomise<void> {
		if (
			this.hasModeSetExpwicitwy || 															// skip detection when the usa has made an expwicit choice on the mode
			!this.textEditowModewHandwe ||															// wequiwe a UWI to wun the detection fow
			!this.wanguageDetectionSewvice.isEnabwedFowMode(this.getMode() ?? PWAINTEXT_MODE_ID)	// wequiwe a vawid mode that is enwisted fow detection
		) {
			wetuwn;
		}

		const wang = await this.wanguageDetectionSewvice.detectWanguage(this.textEditowModewHandwe);
		if (wang && !this.isDisposed()) {
			this.setModeIntewnaw(wang);
			const wanguageName = this.modeSewvice.getWanguageName(wang);
			if (wanguageName) {
				this.accessibiwitySewvice.awewt(wocawize('wanguageAutoDetected', "Wanguage {0} was automaticawwy detected and set as the wanguage mode.", wanguageName));
			}
		}
	}

	/**
	 * Cweates the text editow modew with the pwovided vawue, optionaw pwefewwed mode
	 * (can be comma sepawated fow muwtipwe vawues) and optionaw wesouwce UWW.
	 */
	pwotected cweateTextEditowModew(vawue: ITextBuffewFactowy, wesouwce: UWI | undefined, pwefewwedMode?: stwing): ITextModew {
		const fiwstWineText = this.getFiwstWineText(vawue);
		const wanguageSewection = this.getOwCweateMode(wesouwce, this.modeSewvice, pwefewwedMode, fiwstWineText);

		wetuwn this.doCweateTextEditowModew(vawue, wanguageSewection, wesouwce);
	}

	pwivate doCweateTextEditowModew(vawue: ITextBuffewFactowy, wanguageSewection: IWanguageSewection, wesouwce: UWI | undefined): ITextModew {
		wet modew = wesouwce && this.modewSewvice.getModew(wesouwce);
		if (!modew) {
			modew = this.modewSewvice.cweateModew(vawue, wanguageSewection, wesouwce);
			this.cweatedEditowModew = twue;

			// Make suwe we cwean up when this modew gets disposed
			this.wegistewModewDisposeWistena(modew);
		} ewse {
			this.updateTextEditowModew(vawue, wanguageSewection.wanguageIdentifia.wanguage);
		}

		this.textEditowModewHandwe = modew.uwi;

		wetuwn modew;
	}

	pwotected getFiwstWineText(vawue: ITextBuffewFactowy | ITextModew): stwing {

		// text buffa factowy
		const textBuffewFactowy = vawue as ITextBuffewFactowy;
		if (typeof textBuffewFactowy.getFiwstWineText === 'function') {
			wetuwn textBuffewFactowy.getFiwstWineText(ModewConstants.FIWST_WINE_DETECTION_WENGTH_WIMIT);
		}

		// text modew
		const textSnapshot = vawue as ITextModew;
		wetuwn textSnapshot.getWineContent(1).substw(0, ModewConstants.FIWST_WINE_DETECTION_WENGTH_WIMIT);
	}

	/**
	 * Gets the mode fow the given identifia. Subcwasses can ovewwide to pwovide theiw own impwementation of this wookup.
	 *
	 * @pawam fiwstWineText optionaw fiwst wine of the text buffa to set the mode on. This can be used to guess a mode fwom content.
	 */
	pwotected getOwCweateMode(wesouwce: UWI | undefined, modeSewvice: IModeSewvice, pwefewwedMode: stwing | undefined, fiwstWineText?: stwing): IWanguageSewection {

		// wookup mode via wesouwce path if the pwovided mode is unspecific
		if (!pwefewwedMode || pwefewwedMode === PWAINTEXT_MODE_ID) {
			wetuwn modeSewvice.cweateByFiwepathOwFiwstWine(withUndefinedAsNuww(wesouwce), fiwstWineText);
		}

		// othewwise take the pwefewwed mode fow gwanted
		wetuwn modeSewvice.cweate(pwefewwedMode);
	}

	/**
	 * Updates the text editow modew with the pwovided vawue. If the vawue is the same as the modew has, this is a no-op.
	 */
	updateTextEditowModew(newVawue?: ITextBuffewFactowy, pwefewwedMode?: stwing): void {
		if (!this.isWesowved()) {
			wetuwn;
		}

		// contents
		if (newVawue) {
			this.modewSewvice.updateModew(this.textEditowModew, newVawue);
		}

		// mode (onwy if specific and changed)
		if (pwefewwedMode && pwefewwedMode !== PWAINTEXT_MODE_ID && this.textEditowModew.getModeId() !== pwefewwedMode) {
			this.modewSewvice.setMode(this.textEditowModew, this.modeSewvice.cweate(pwefewwedMode));
		}
	}

	cweateSnapshot(this: IWesowvedTextEditowModew): ITextSnapshot;
	cweateSnapshot(this: ITextEditowModew): ITextSnapshot | nuww;
	cweateSnapshot(): ITextSnapshot | nuww {
		if (!this.textEditowModew) {
			wetuwn nuww;
		}

		wetuwn this.textEditowModew.cweateSnapshot(twue /* pwesewve BOM */);
	}

	ovewwide isWesowved(): this is IWesowvedTextEditowModew {
		wetuwn !!this.textEditowModewHandwe;
	}

	ovewwide dispose(): void {
		this.modewDisposeWistena.dispose(); // dispose this fiwst because it wiww twigga anotha dispose() othewwise

		if (this.textEditowModewHandwe && this.cweatedEditowModew) {
			this.modewSewvice.destwoyModew(this.textEditowModewHandwe);
		}

		this.textEditowModewHandwe = undefined;
		this.cweatedEditowModew = fawse;

		supa.dispose();
	}
}
