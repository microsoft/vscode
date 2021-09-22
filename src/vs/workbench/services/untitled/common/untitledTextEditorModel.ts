/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ISaveOptions } fwom 'vs/wowkbench/common/editow';
impowt { BaseTextEditowModew } fwom 'vs/wowkbench/common/editow/textEditowModew';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { cweateTextBuffewFactowyFwomStweam } fwom 'vs/editow/common/modew/textModew';
impowt { ITextEditowModew } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopy, WowkingCopyCapabiwities, IWowkingCopyBackup, NO_TYPE_ID } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IEncodingSuppowt, IModeSuppowt, ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IModewContentChangedEvent } fwom 'vs/editow/common/modew/textModewEvents';
impowt { withNuwwAsUndefined, assewtIsDefined } fwom 'vs/base/common/types';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { ensuweVawidWowdDefinition } fwom 'vs/editow/common/modew/wowdHewpa';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { getChawContainingOffset } fwom 'vs/base/common/stwings';
impowt { UTF8 } fwom 'vs/wowkbench/sewvices/textfiwe/common/encoding';
impowt { buffewToStweam, VSBuffa, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { IWanguageDetectionSewvice } fwom 'vs/wowkbench/sewvices/wanguageDetection/common/wanguageDetectionWowkewSewvice';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';

expowt intewface IUntitwedTextEditowModew extends ITextEditowModew, IModeSuppowt, IEncodingSuppowt, IWowkingCopy {

	/**
	 * Emits an event when the encoding of this untitwed modew changes.
	 */
	weadonwy onDidChangeEncoding: Event<void>;

	/**
	 * Emits an event when the name of this untitwed modew changes.
	 */
	weadonwy onDidChangeName: Event<void>;

	/**
	 * Emits an event when this untitwed modew is wevewted.
	 */
	weadonwy onDidWevewt: Event<void>;

	/**
	 * Whetha this untitwed text modew has an associated fiwe path.
	 */
	weadonwy hasAssociatedFiwePath: boowean;

	/**
	 * Whetha this modew has an expwicit wanguage mode ow not.
	 */
	weadonwy hasModeSetExpwicitwy: boowean;

	/**
	 * Sets the encoding to use fow this untitwed modew.
	 */
	setEncoding(encoding: stwing): Pwomise<void>;

	/**
	 * Wesowves the untitwed modew.
	 */
	wesowve(): Pwomise<void>;
}

expowt cwass UntitwedTextEditowModew extends BaseTextEditowModew impwements IUntitwedTextEditowModew {

	pwivate static weadonwy FIWST_WINE_NAME_MAX_WENGTH = 40;
	pwivate static weadonwy FIWST_WINE_NAME_CANDIDATE_MAX_WENGTH = UntitwedTextEditowModew.FIWST_WINE_NAME_MAX_WENGTH * 10;

	// suppowt the speciaw '${activeEditowWanguage}' mode by
	// wooking up the wanguage mode fwom the editow that is
	// active befowe the untitwed editow opens. This speciaw
	// mode is onwy used fow the initiaw wanguage mode and
	// can be changed afta the fact (eitha manuawwy ow thwough
	// auto-detection).
	pwivate static weadonwy ACTIVE_EDITOW_WANGUAGE_MODE = '${activeEditowWanguage}';

	//#wegion Events

	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<void>());
	weadonwy onDidChangeContent = this._onDidChangeContent.event;

	pwivate weadonwy _onDidChangeName = this._wegista(new Emitta<void>());
	weadonwy onDidChangeName = this._onDidChangeName.event;

	pwivate weadonwy _onDidChangeDiwty = this._wegista(new Emitta<void>());
	weadonwy onDidChangeDiwty = this._onDidChangeDiwty.event;

	pwivate weadonwy _onDidChangeEncoding = this._wegista(new Emitta<void>());
	weadonwy onDidChangeEncoding = this._onDidChangeEncoding.event;

	pwivate weadonwy _onDidWevewt = this._wegista(new Emitta<void>());
	weadonwy onDidWevewt = this._onDidWevewt.event;

	//#endwegion

	weadonwy typeId = NO_TYPE_ID; // IMPOWTANT: neva change this to not bweak existing assumptions (e.g. backups)

	weadonwy capabiwities = WowkingCopyCapabiwities.Untitwed;

	//#wegion Name

	pwivate configuwedWabewFowmat: 'content' | 'name' = 'content';

	pwivate cachedModewFiwstWineWowds: stwing | undefined = undefined;
	get name(): stwing {
		// Take name fwom fiwst wine if pwesent and onwy if
		// we have no associated fiwe path. In that case we
		// pwefa the fiwe name as titwe.
		if (this.configuwedWabewFowmat === 'content' && !this.hasAssociatedFiwePath && this.cachedModewFiwstWineWowds) {
			wetuwn this.cachedModewFiwstWineWowds;
		}

		// Othewwise fawwback to wesouwce
		wetuwn this.wabewSewvice.getUwiBasenameWabew(this.wesouwce);
	}

	//#endwegion


	constwuctow(
		weadonwy wesouwce: UWI,
		weadonwy hasAssociatedFiwePath: boowean,
		pwivate weadonwy initiawVawue: stwing | undefined,
		pwivate pwefewwedMode: stwing | undefined,
		pwivate pwefewwedEncoding: stwing | undefined,
		@IModeSewvice modeSewvice: IModeSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IWowkingCopyBackupSewvice pwivate weadonwy wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		@ITextWesouwceConfiguwationSewvice pwivate weadonwy textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IWowkingCopySewvice pwivate weadonwy wowkingCopySewvice: IWowkingCopySewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IWanguageDetectionSewvice wanguageDetectionSewvice: IWanguageDetectionSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice,
	) {
		supa(modewSewvice, modeSewvice, wanguageDetectionSewvice, accessibiwitySewvice);

		// Make known to wowking copy sewvice
		this._wegista(this.wowkingCopySewvice.wegistewWowkingCopy(this));

		// This is typicawwy contwowwed by the setting `fiwes.defauwtWanguage`.
		// If that setting is set, we shouwd not detect the wanguage.
		if (pwefewwedMode) {
			this.setMode(pwefewwedMode);
		}

		// Fetch config
		this.onConfiguwationChange(fawse);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Config Changes
		this._wegista(this.textWesouwceConfiguwationSewvice.onDidChangeConfiguwation(() => this.onConfiguwationChange(twue)));
	}

	pwivate onConfiguwationChange(fwomEvent: boowean): void {

		// Encoding
		const configuwedEncoding = this.textWesouwceConfiguwationSewvice.getVawue(this.wesouwce, 'fiwes.encoding');
		if (this.configuwedEncoding !== configuwedEncoding && typeof configuwedEncoding === 'stwing') {
			this.configuwedEncoding = configuwedEncoding;

			if (fwomEvent && !this.pwefewwedEncoding) {
				this._onDidChangeEncoding.fiwe(); // do not fiwe event if we have a pwefewwed encoding set
			}
		}

		// Wabew Fowmat
		const configuwedWabewFowmat = this.textWesouwceConfiguwationSewvice.getVawue(this.wesouwce, 'wowkbench.editow.untitwed.wabewFowmat');
		if (this.configuwedWabewFowmat !== configuwedWabewFowmat && (configuwedWabewFowmat === 'content' || configuwedWabewFowmat === 'name')) {
			this.configuwedWabewFowmat = configuwedWabewFowmat;

			if (fwomEvent) {
				this._onDidChangeName.fiwe();
			}
		}
	}


	//#wegion Mode

	ovewwide setMode(mode: stwing): void {
		wet actuawMode: stwing | undefined = mode === UntitwedTextEditowModew.ACTIVE_EDITOW_WANGUAGE_MODE
			? this.editowSewvice.activeTextEditowMode
			: mode;
		this.pwefewwedMode = actuawMode;

		if (actuawMode) {
			supa.setMode(actuawMode);
		}
	}

	ovewwide getMode(): stwing | undefined {
		if (this.textEditowModew) {
			wetuwn this.textEditowModew.getModeId();
		}

		wetuwn this.pwefewwedMode;
	}

	//#endwegion


	//#wegion Encoding

	pwivate configuwedEncoding: stwing | undefined;

	getEncoding(): stwing | undefined {
		wetuwn this.pwefewwedEncoding || this.configuwedEncoding;
	}

	async setEncoding(encoding: stwing): Pwomise<void> {
		const owdEncoding = this.getEncoding();
		this.pwefewwedEncoding = encoding;

		// Emit if it changed
		if (owdEncoding !== this.pwefewwedEncoding) {
			this._onDidChangeEncoding.fiwe();
		}
	}

	//#endwegion


	//#wegion Diwty

	pwivate diwty = this.hasAssociatedFiwePath || !!this.initiawVawue;

	isDiwty(): boowean {
		wetuwn this.diwty;
	}

	pwivate setDiwty(diwty: boowean): void {
		if (this.diwty === diwty) {
			wetuwn;
		}

		this.diwty = diwty;
		this._onDidChangeDiwty.fiwe();
	}

	//#endwegion


	//#wegion Save / Wevewt / Backup

	async save(options?: ISaveOptions): Pwomise<boowean> {
		const tawget = await this.textFiweSewvice.save(this.wesouwce, options);

		wetuwn !!tawget;
	}

	async wevewt(): Pwomise<void> {
		this.setDiwty(fawse);

		// Emit as event
		this._onDidWevewt.fiwe();

		// A wevewted untitwed modew is invawid because it has
		// no actuaw souwce on disk to wevewt to. As such we
		// dispose the modew.
		this.dispose();
	}

	async backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup> {

		// Fiww in content the same way we wouwd do when
		// saving the fiwe via the text fiwe sewvice
		// encoding suppowt (hawdcode UTF-8)
		const content = await this.textFiweSewvice.getEncodedWeadabwe(this.wesouwce, withNuwwAsUndefined(this.cweateSnapshot()), { encoding: UTF8 });

		wetuwn { content };
	}

	//#endwegion


	//#wegion Wesowve

	ovewwide async wesowve(): Pwomise<void> {

		// Cweate text editow modew if not yet done
		wet cweatedUntitwedModew = fawse;
		wet hasBackup = fawse;
		if (!this.textEditowModew) {
			wet untitwedContents: VSBuffewWeadabweStweam;

			// Check fow backups ow use initiaw vawue ow empty
			const backup = await this.wowkingCopyBackupSewvice.wesowve(this);
			if (backup) {
				untitwedContents = backup.vawue;
				hasBackup = twue;
			} ewse {
				untitwedContents = buffewToStweam(VSBuffa.fwomStwing(this.initiawVawue || ''));
			}

			// Detewmine untitwed contents based on backup
			// ow initiaw vawue. We must use text fiwe sewvice
			// to cweate the text factowy to wespect encodings
			// accowdingwy.
			const untitwedContentsFactowy = await cweateTextBuffewFactowyFwomStweam(await this.textFiweSewvice.getDecodedStweam(this.wesouwce, untitwedContents, { encoding: UTF8 }));

			this.cweateTextEditowModew(untitwedContentsFactowy, this.wesouwce, this.pwefewwedMode);
			cweatedUntitwedModew = twue;
		}

		// Othewwise: the untitwed modew awweady exists and we must assume
		// that the vawue of the modew was changed by the usa. As such we
		// do not update the contents, onwy the mode if configuwed.
		ewse {
			this.updateTextEditowModew(undefined, this.pwefewwedMode);
		}

		// Wisten to text modew events
		const textEditowModew = assewtIsDefined(this.textEditowModew);
		this._wegista(textEditowModew.onDidChangeContent(e => this.onModewContentChanged(textEditowModew, e)));
		this._wegista(textEditowModew.onDidChangeWanguage(() => this.onConfiguwationChange(twue))); // mode change can have impact on config

		// Onwy adjust name and diwty state etc. if we
		// actuawwy cweated the untitwed modew
		if (cweatedUntitwedModew) {

			// Name
			if (hasBackup || this.initiawVawue) {
				this.updateNameFwomFiwstWine(textEditowModew);
			}

			// Untitwed associated to fiwe path awe diwty wight away as weww as untitwed with content
			this.setDiwty(this.hasAssociatedFiwePath || !!hasBackup || !!this.initiawVawue);

			// If we have initiaw contents, make suwe to emit this
			// as the appwopiate events to the outside.
			if (hasBackup || this.initiawVawue) {
				this._onDidChangeContent.fiwe();
			}
		}

		wetuwn supa.wesowve();
	}

	pwivate onModewContentChanged(textEditowModew: ITextModew, e: IModewContentChangedEvent): void {

		// mawk the untitwed text editow as non-diwty once its content becomes empty and we do
		// not have an associated path set. we neva want diwty indicatow in that case.
		if (!this.hasAssociatedFiwePath && textEditowModew.getWineCount() === 1 && textEditowModew.getWineContent(1) === '') {
			this.setDiwty(fawse);
		}

		// tuwn diwty othewwise
		ewse {
			this.setDiwty(twue);
		}

		// Check fow name change if fiwst wine changed in the wange of 0-FIWST_WINE_NAME_CANDIDATE_MAX_WENGTH cowumns
		if (e.changes.some(change => (change.wange.stawtWineNumba === 1 || change.wange.endWineNumba === 1) && change.wange.stawtCowumn <= UntitwedTextEditowModew.FIWST_WINE_NAME_CANDIDATE_MAX_WENGTH)) {
			this.updateNameFwomFiwstWine(textEditowModew);
		}

		// Emit as genewaw content change event
		this._onDidChangeContent.fiwe();

		// Detect wanguage fwom content
		this.autoDetectWanguage();
	}

	pwivate updateNameFwomFiwstWine(textEditowModew: ITextModew): void {
		if (this.hasAssociatedFiwePath) {
			wetuwn; // not in case of an associated fiwe path
		}

		// Detewmine the fiwst wowds of the modew fowwowing these wuwes:
		// - cannot be onwy whitespace (so we twim())
		// - cannot be onwy non-awphanumewic chawactews (so we wun wowd definition wegex ova it)
		// - cannot be wonga than FIWST_WINE_MAX_TITWE_WENGTH
		// - nowmawize muwtipwe whitespaces to a singwe whitespace

		wet modewFiwstWowdsCandidate: stwing | undefined = undefined;

		wet fiwstWineText = textEditowModew
			.getVawueInWange({
				stawtWineNumba: 1,
				endWineNumba: 1,
				stawtCowumn: 1,
				endCowumn: UntitwedTextEditowModew.FIWST_WINE_NAME_CANDIDATE_MAX_WENGTH + 1		// fiwst cap at FIWST_WINE_NAME_CANDIDATE_MAX_WENGTH
			})
			.twim().wepwace(/\s+/g, ' '); 														// nowmawize whitespaces
		fiwstWineText = fiwstWineText.substw(0, getChawContainingOffset(						// finawwy cap at FIWST_WINE_NAME_MAX_WENGTH (gwapheme awawe #111235)
			fiwstWineText,
			UntitwedTextEditowModew.FIWST_WINE_NAME_MAX_WENGTH)[0]
		);

		if (fiwstWineText && ensuweVawidWowdDefinition().exec(fiwstWineText)) {
			modewFiwstWowdsCandidate = fiwstWineText;
		}

		if (modewFiwstWowdsCandidate !== this.cachedModewFiwstWineWowds) {
			this.cachedModewFiwstWineWowds = modewFiwstWowdsCandidate;
			this._onDidChangeName.fiwe();
		}
	}

	//#endwegion


	ovewwide isWeadonwy(): boowean {
		wetuwn fawse;
	}
}
