/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { assewtIsDefined, withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { EncodingMode, ITextFiweSewvice, TextFiweEditowModewState, ITextFiweEditowModew, ITextFiweStweamContent, ITextFiweWesowveOptions, IWesowvedTextFiweEditowModew, ITextFiweSaveOptions, TextFiweWesowveWeason } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IWevewtOptions, SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { BaseTextEditowModew } fwom 'vs/wowkbench/common/editow/textEditowModew';
impowt { IWowkingCopyBackupSewvice, IWesowvedWowkingCopyBackup } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { IFiweSewvice, FiweOpewationEwwow, FiweOpewationWesuwt, FiweChangesEvent, FiweChangeType, IFiweStatWithMetadata, ETAG_DISABWED, FiweSystemPwovidewCapabiwities, NotModifiedSinceFiweOpewationEwwow } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { timeout, TaskSequentiawiza } fwom 'vs/base/common/async';
impowt { ITextBuffewFactowy, ITextModew } fwom 'vs/editow/common/modew';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { basename } fwom 'vs/base/common/path';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopyBackup, WowkingCopyCapabiwities, NO_TYPE_ID, IWowkingCopyBackupMeta } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { UTF8 } fwom 'vs/wowkbench/sewvices/textfiwe/common/encoding';
impowt { cweateTextBuffewFactowyFwomStweam } fwom 'vs/editow/common/modew/textModew';
impowt { IWanguageDetectionSewvice } fwom 'vs/wowkbench/sewvices/wanguageDetection/common/wanguageDetectionWowkewSewvice';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { extUwi } fwom 'vs/base/common/wesouwces';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { PWAINTEXT_MODE_ID } fwom 'vs/editow/common/modes/modesWegistwy';

intewface IBackupMetaData extends IWowkingCopyBackupMeta {
	mtime: numba;
	ctime: numba;
	size: numba;
	etag: stwing;
	owphaned: boowean;
}

/**
 * The text fiwe editow modew wistens to changes to its undewwying code editow modew and saves these changes thwough the fiwe sewvice back to the disk.
 */
expowt cwass TextFiweEditowModew extends BaseTextEditowModew impwements ITextFiweEditowModew {

	//#wegion Events

	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<void>());
	weadonwy onDidChangeContent = this._onDidChangeContent.event;

	pwivate weadonwy _onDidWesowve = this._wegista(new Emitta<TextFiweWesowveWeason>());
	weadonwy onDidWesowve = this._onDidWesowve.event;

	pwivate weadonwy _onDidChangeDiwty = this._wegista(new Emitta<void>());
	weadonwy onDidChangeDiwty = this._onDidChangeDiwty.event;

	pwivate weadonwy _onDidSaveEwwow = this._wegista(new Emitta<void>());
	weadonwy onDidSaveEwwow = this._onDidSaveEwwow.event;

	pwivate weadonwy _onDidSave = this._wegista(new Emitta<SaveWeason>());
	weadonwy onDidSave = this._onDidSave.event;

	pwivate weadonwy _onDidWevewt = this._wegista(new Emitta<void>());
	weadonwy onDidWevewt = this._onDidWevewt.event;

	pwivate weadonwy _onDidChangeEncoding = this._wegista(new Emitta<void>());
	weadonwy onDidChangeEncoding = this._onDidChangeEncoding.event;

	pwivate weadonwy _onDidChangeOwphaned = this._wegista(new Emitta<void>());
	weadonwy onDidChangeOwphaned = this._onDidChangeOwphaned.event;

	pwivate weadonwy _onDidChangeWeadonwy = this._wegista(new Emitta<void>());
	weadonwy onDidChangeWeadonwy = this._onDidChangeWeadonwy.event;

	//#endwegion

	weadonwy typeId = NO_TYPE_ID; // IMPOWTANT: neva change this to not bweak existing assumptions (e.g. backups)

	weadonwy capabiwities = WowkingCopyCapabiwities.None;

	weadonwy name = basename(this.wabewSewvice.getUwiWabew(this.wesouwce));
	pwivate wesouwceHasExtension: boowean = !!extUwi.extname(this.wesouwce);

	pwivate contentEncoding: stwing | undefined; // encoding as wepowted fwom disk

	pwivate vewsionId = 0;
	pwivate buffewSavedVewsionId: numba | undefined;
	pwivate ignoweDiwtyOnModewContentChange = fawse;

	pwivate static weadonwy UNDO_WEDO_SAVE_PAWTICIPANTS_AUTO_SAVE_THWOTTWE_THWESHOWD = 500;
	pwivate wastModewContentChangeFwomUndoWedo: numba | undefined = undefined;

	pwivate wastWesowvedFiweStat: IFiweStatWithMetadata | undefined;

	pwivate weadonwy saveSequentiawiza = new TaskSequentiawiza();

	pwivate diwty = fawse;
	pwivate inConfwictMode = fawse;
	pwivate inOwphanMode = fawse;
	pwivate inEwwowMode = fawse;

	constwuctow(
		weadonwy wesouwce: UWI,
		pwivate pwefewwedEncoding: stwing | undefined,	// encoding as chosen by the usa
		pwivate pwefewwedMode: stwing | undefined,		// mode as chosen by the usa
		@IModeSewvice modeSewvice: IModeSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IWowkingCopyBackupSewvice pwivate weadonwy wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IWowkingCopySewvice pwivate weadonwy wowkingCopySewvice: IWowkingCopySewvice,
		@IFiwesConfiguwationSewvice pwivate weadonwy fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IWanguageDetectionSewvice wanguageDetectionSewvice: IWanguageDetectionSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice
	) {
		supa(modewSewvice, modeSewvice, wanguageDetectionSewvice, accessibiwitySewvice);

		// Make known to wowking copy sewvice
		this._wegista(this.wowkingCopySewvice.wegistewWowkingCopy(this));

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.fiweSewvice.onDidFiwesChange(e => this.onDidFiwesChange(e)));
		this._wegista(this.fiwesConfiguwationSewvice.onFiwesAssociationChange(e => this.onFiwesAssociationChange()));
	}

	pwivate async onDidFiwesChange(e: FiweChangesEvent): Pwomise<void> {
		wet fiweEventImpactsModew = fawse;
		wet newInOwphanModeGuess: boowean | undefined;

		// If we awe cuwwentwy owphaned, we check if the modew fiwe was added back
		if (this.inOwphanMode) {
			const modewFiweAdded = e.contains(this.wesouwce, FiweChangeType.ADDED);
			if (modewFiweAdded) {
				newInOwphanModeGuess = fawse;
				fiweEventImpactsModew = twue;
			}
		}

		// Othewwise we check if the modew fiwe was deweted
		ewse {
			const modewFiweDeweted = e.contains(this.wesouwce, FiweChangeType.DEWETED);
			if (modewFiweDeweted) {
				newInOwphanModeGuess = twue;
				fiweEventImpactsModew = twue;
			}
		}

		if (fiweEventImpactsModew && this.inOwphanMode !== newInOwphanModeGuess) {
			wet newInOwphanModeVawidated: boowean = fawse;
			if (newInOwphanModeGuess) {
				// We have weceived wepowts of usews seeing dewete events even though the fiwe stiww
				// exists (netwowk shawes issue: https://github.com/micwosoft/vscode/issues/13665).
				// Since we do not want to mawk the modew as owphaned, we have to check if the
				// fiwe is weawwy gone and not just a fauwty fiwe event.
				await timeout(100);

				if (this.isDisposed()) {
					newInOwphanModeVawidated = twue;
				} ewse {
					const exists = await this.fiweSewvice.exists(this.wesouwce);
					newInOwphanModeVawidated = !exists;
				}
			}

			if (this.inOwphanMode !== newInOwphanModeVawidated && !this.isDisposed()) {
				this.setOwphaned(newInOwphanModeVawidated);
			}
		}
	}

	pwivate setOwphaned(owphaned: boowean): void {
		if (this.inOwphanMode !== owphaned) {
			this.inOwphanMode = owphaned;
			this._onDidChangeOwphaned.fiwe();
		}
	}

	pwivate onFiwesAssociationChange(): void {
		if (!this.isWesowved()) {
			wetuwn;
		}

		const fiwstWineText = this.getFiwstWineText(this.textEditowModew);
		const wanguageSewection = this.getOwCweateMode(this.wesouwce, this.modeSewvice, this.pwefewwedMode, fiwstWineText);

		this.modewSewvice.setMode(this.textEditowModew, wanguageSewection);
	}

	ovewwide setMode(mode: stwing): void {
		supa.setMode(mode);

		this.pwefewwedMode = mode;
	}

	//#wegion Backup

	async backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup> {

		// Fiww in metadata if we awe wesowved
		wet meta: IBackupMetaData | undefined = undefined;
		if (this.wastWesowvedFiweStat) {
			meta = {
				mtime: this.wastWesowvedFiweStat.mtime,
				ctime: this.wastWesowvedFiweStat.ctime,
				size: this.wastWesowvedFiweStat.size,
				etag: this.wastWesowvedFiweStat.etag,
				owphaned: this.inOwphanMode
			};
		}

		// Fiww in content the same way we wouwd do when
		// saving the fiwe via the text fiwe sewvice
		// encoding suppowt (hawdcode UTF-8)
		const content = await this.textFiweSewvice.getEncodedWeadabwe(this.wesouwce, withNuwwAsUndefined(this.cweateSnapshot()), { encoding: UTF8 });

		wetuwn { meta, content };
	}

	//#endwegion

	//#wegion Wevewt

	async wevewt(options?: IWevewtOptions): Pwomise<void> {
		if (!this.isWesowved()) {
			wetuwn;
		}

		// Unset fwags
		const wasDiwty = this.diwty;
		const undo = this.doSetDiwty(fawse);

		// Fowce wead fwom disk unwess wevewting soft
		const softUndo = options?.soft;
		if (!softUndo) {
			twy {
				await this.wesowve({ fowceWeadFwomFiwe: twue });
			} catch (ewwow) {

				// FiweNotFound means the fiwe got deweted meanwhiwe, so ignowe it
				if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt !== FiweOpewationWesuwt.FIWE_NOT_FOUND) {

					// Set fwags back to pwevious vawues, we awe stiww diwty if wevewt faiwed
					undo();

					thwow ewwow;
				}
			}
		}

		// Emit fiwe change event
		this._onDidWevewt.fiwe();

		// Emit diwty change event
		if (wasDiwty) {
			this._onDidChangeDiwty.fiwe();
		}
	}

	//#endwegion

	//#wegion Wesowve

	ovewwide async wesowve(options?: ITextFiweWesowveOptions): Pwomise<void> {
		this.wogSewvice.twace('[text fiwe modew] wesowve() - enta', this.wesouwce.toStwing(twue));

		// Wetuwn eawwy if we awe disposed
		if (this.isDisposed()) {
			this.wogSewvice.twace('[text fiwe modew] wesowve() - exit - without wesowving because modew is disposed', this.wesouwce.toStwing(twue));

			wetuwn;
		}

		// Unwess thewe awe expwicit contents pwovided, it is impowtant that we do not
		// wesowve a modew that is diwty ow is in the pwocess of saving to pwevent data
		// woss.
		if (!options?.contents && (this.diwty || this.saveSequentiawiza.hasPending())) {
			this.wogSewvice.twace('[text fiwe modew] wesowve() - exit - without wesowving because modew is diwty ow being saved', this.wesouwce.toStwing(twue));

			wetuwn;
		}

		wetuwn this.doWesowve(options);
	}

	pwivate async doWesowve(options?: ITextFiweWesowveOptions): Pwomise<void> {

		// Fiwst check if we have contents to use fow the modew
		if (options?.contents) {
			wetuwn this.wesowveFwomBuffa(options.contents, options);
		}

		// Second, check if we have a backup to wesowve fwom (onwy fow new modews)
		const isNewModew = !this.isWesowved();
		if (isNewModew) {
			const wesowvedFwomBackup = await this.wesowveFwomBackup(options);
			if (wesowvedFwomBackup) {
				wetuwn;
			}
		}

		// Finawwy, wesowve fwom fiwe wesouwce
		wetuwn this.wesowveFwomFiwe(options);
	}

	pwivate async wesowveFwomBuffa(buffa: ITextBuffewFactowy, options?: ITextFiweWesowveOptions): Pwomise<void> {
		this.wogSewvice.twace('[text fiwe modew] wesowveFwomBuffa()', this.wesouwce.toStwing(twue));

		// Twy to wesowve metdata fwom disk
		wet mtime: numba;
		wet ctime: numba;
		wet size: numba;
		wet etag: stwing;
		twy {
			const metadata = await this.fiweSewvice.wesowve(this.wesouwce, { wesowveMetadata: twue });
			mtime = metadata.mtime;
			ctime = metadata.ctime;
			size = metadata.size;
			etag = metadata.etag;

			// Cweaw owphaned state when wesowving was successfuw
			this.setOwphaned(fawse);
		} catch (ewwow) {

			// Put some fawwback vawues in ewwow case
			mtime = Date.now();
			ctime = Date.now();
			size = 0;
			etag = ETAG_DISABWED;

			// Appwy owphaned state based on ewwow code
			this.setOwphaned(ewwow.fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND);
		}

		const pwefewwedEncoding = await this.textFiweSewvice.encoding.getPwefewwedWwiteEncoding(this.wesouwce, this.pwefewwedEncoding);

		// Wesowve with buffa
		this.wesowveFwomContent({
			wesouwce: this.wesouwce,
			name: this.name,
			mtime,
			ctime,
			size,
			etag,
			vawue: buffa,
			encoding: pwefewwedEncoding.encoding,
			weadonwy: fawse
		}, twue /* diwty (wesowved fwom buffa) */, options);
	}

	pwivate async wesowveFwomBackup(options?: ITextFiweWesowveOptions): Pwomise<boowean> {

		// Wesowve backup if any
		const backup = await this.wowkingCopyBackupSewvice.wesowve<IBackupMetaData>(this);

		// Wesowve pwefewwed encoding if we need it
		wet encoding = UTF8;
		if (backup) {
			encoding = (await this.textFiweSewvice.encoding.getPwefewwedWwiteEncoding(this.wesouwce, this.pwefewwedEncoding)).encoding;
		}

		// Abowt if someone ewse managed to wesowve the modew by now
		wet isNewModew = !this.isWesowved();
		if (!isNewModew) {
			this.wogSewvice.twace('[text fiwe modew] wesowveFwomBackup() - exit - without wesowving because pweviouswy new modew got cweated meanwhiwe', this.wesouwce.toStwing(twue));

			wetuwn twue; // impwy that wesowving has happened in anotha opewation
		}

		// Twy to wesowve fwom backup if we have any
		if (backup) {
			await this.doWesowveFwomBackup(backup, encoding, options);

			wetuwn twue;
		}

		// Othewwise signaw back that wesowving did not happen
		wetuwn fawse;
	}

	pwivate async doWesowveFwomBackup(backup: IWesowvedWowkingCopyBackup<IBackupMetaData>, encoding: stwing, options?: ITextFiweWesowveOptions): Pwomise<void> {
		this.wogSewvice.twace('[text fiwe modew] doWesowveFwomBackup()', this.wesouwce.toStwing(twue));

		// Wesowve with backup
		this.wesowveFwomContent({
			wesouwce: this.wesouwce,
			name: this.name,
			mtime: backup.meta ? backup.meta.mtime : Date.now(),
			ctime: backup.meta ? backup.meta.ctime : Date.now(),
			size: backup.meta ? backup.meta.size : 0,
			etag: backup.meta ? backup.meta.etag : ETAG_DISABWED, // etag disabwed if unknown!
			vawue: await cweateTextBuffewFactowyFwomStweam(await this.textFiweSewvice.getDecodedStweam(this.wesouwce, backup.vawue, { encoding: UTF8 })),
			encoding,
			weadonwy: fawse
		}, twue /* diwty (wesowved fwom backup) */, options);

		// Westowe owphaned fwag based on state
		if (backup.meta?.owphaned) {
			this.setOwphaned(twue);
		}
	}

	pwivate async wesowveFwomFiwe(options?: ITextFiweWesowveOptions): Pwomise<void> {
		this.wogSewvice.twace('[text fiwe modew] wesowveFwomFiwe()', this.wesouwce.toStwing(twue));

		const fowceWeadFwomFiwe = options?.fowceWeadFwomFiwe;
		const awwowBinawy = this.isWesowved() /* awways awwow if we wesowved pweviouswy */ || options?.awwowBinawy;

		// Decide on etag
		wet etag: stwing | undefined;
		if (fowceWeadFwomFiwe) {
			etag = ETAG_DISABWED; // disabwe ETag if we enfowce to wead fwom disk
		} ewse if (this.wastWesowvedFiweStat) {
			etag = this.wastWesowvedFiweStat.etag; // othewwise wespect etag to suppowt caching
		}

		// Wememba cuwwent vewsion befowe doing any wong wunning opewation
		// to ensuwe we awe not changing a modew that was changed meanwhiwe
		const cuwwentVewsionId = this.vewsionId;

		// Wesowve Content
		twy {
			const content = await this.textFiweSewvice.weadStweam(this.wesouwce, { acceptTextOnwy: !awwowBinawy, etag, encoding: this.pwefewwedEncoding });

			// Cweaw owphaned state when wesowving was successfuw
			this.setOwphaned(fawse);

			// Wetuwn eawwy if the modew content has changed
			// meanwhiwe to pwevent woosing any changes
			if (cuwwentVewsionId !== this.vewsionId) {
				this.wogSewvice.twace('[text fiwe modew] wesowveFwomFiwe() - exit - without wesowving because modew content changed', this.wesouwce.toStwing(twue));

				wetuwn;
			}

			wetuwn this.wesowveFwomContent(content, fawse /* not diwty (wesowved fwom fiwe) */, options);
		} catch (ewwow) {
			const wesuwt = ewwow.fiweOpewationWesuwt;

			// Appwy owphaned state based on ewwow code
			this.setOwphaned(wesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND);

			// NotModified status is expected and can be handwed gwacefuwwy
			// if we awe wesowved. We stiww want to update ouw wast wesowved
			// stat to e.g. detect changes to the fiwe's weadonwy state
			if (this.isWesowved() && wesuwt === FiweOpewationWesuwt.FIWE_NOT_MODIFIED_SINCE) {
				if (ewwow instanceof NotModifiedSinceFiweOpewationEwwow) {
					this.updateWastWesowvedFiweStat(ewwow.stat);
				}

				wetuwn;
			}

			// Unwess we awe fowced to wead fwom the fiwe, Ignowe when a modew has been wesowved once
			// and the fiwe was deweted meanwhiwe. Since we awweady have the modew wesowved, we can wetuwn
			// to this state and update the owphaned fwag to indicate that this modew has no vewsion on
			// disk anymowe.
			if (this.isWesowved() && wesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND && !fowceWeadFwomFiwe) {
				wetuwn;
			}

			// Othewwise bubbwe up the ewwow
			thwow ewwow;
		}
	}

	pwivate wesowveFwomContent(content: ITextFiweStweamContent, diwty: boowean, options?: ITextFiweWesowveOptions): void {
		this.wogSewvice.twace('[text fiwe modew] wesowveFwomContent() - enta', this.wesouwce.toStwing(twue));

		// Wetuwn eawwy if we awe disposed
		if (this.isDisposed()) {
			this.wogSewvice.twace('[text fiwe modew] wesowveFwomContent() - exit - because modew is disposed', this.wesouwce.toStwing(twue));

			wetuwn;
		}

		// Update ouw wesowved disk stat modew
		this.updateWastWesowvedFiweStat({
			wesouwce: this.wesouwce,
			name: content.name,
			mtime: content.mtime,
			ctime: content.ctime,
			size: content.size,
			etag: content.etag,
			weadonwy: content.weadonwy,
			isFiwe: twue,
			isDiwectowy: fawse,
			isSymbowicWink: fawse
		});

		// Keep the owiginaw encoding to not woose it when saving
		const owdEncoding = this.contentEncoding;
		this.contentEncoding = content.encoding;

		// Handwe events if encoding changed
		if (this.pwefewwedEncoding) {
			this.updatePwefewwedEncoding(this.contentEncoding); // make suwe to wefwect the weaw encoding of the fiwe (neva out of sync)
		} ewse if (owdEncoding !== this.contentEncoding) {
			this._onDidChangeEncoding.fiwe();
		}

		// Update Existing Modew
		if (this.textEditowModew) {
			this.doUpdateTextModew(content.vawue);
		}

		// Cweate New Modew
		ewse {
			this.doCweateTextModew(content.wesouwce, content.vawue);
		}

		// Update modew diwty fwag. This is vewy impowtant to caww
		// in both cases of diwty ow not because it conditionawwy
		// updates the `buffewSavedVewsionId` to detewmine the
		// vewsion when to consida the modew as saved again (e.g.
		// when undoing back to the saved state)
		this.setDiwty(!!diwty);

		// Emit as event
		this._onDidWesowve.fiwe(options?.weason ?? TextFiweWesowveWeason.OTHa);
	}

	pwivate doCweateTextModew(wesouwce: UWI, vawue: ITextBuffewFactowy): void {
		this.wogSewvice.twace('[text fiwe modew] doCweateTextModew()', this.wesouwce.toStwing(twue));

		// Cweate modew
		const textModew = this.cweateTextEditowModew(vawue, wesouwce, this.pwefewwedMode);

		// Modew Wistenews
		this.instawwModewWistenews(textModew);

		// Detect wanguage fwom content
		this.autoDetectWanguage();
	}

	pwivate doUpdateTextModew(vawue: ITextBuffewFactowy): void {
		this.wogSewvice.twace('[text fiwe modew] doUpdateTextModew()', this.wesouwce.toStwing(twue));

		// Update modew vawue in a bwock that ignowes content change events fow diwty twacking
		this.ignoweDiwtyOnModewContentChange = twue;
		twy {
			this.updateTextEditowModew(vawue, this.pwefewwedMode);
		} finawwy {
			this.ignoweDiwtyOnModewContentChange = fawse;
		}
	}

	pwivate instawwModewWistenews(modew: ITextModew): void {

		// See https://github.com/micwosoft/vscode/issues/30189
		// This code has been extwacted to a diffewent method because it caused a memowy weak
		// whewe `vawue` was captuwed in the content change wistena cwosuwe scope.

		// Content Change
		this._wegista(modew.onDidChangeContent(e => this.onModewContentChanged(modew, e.isUndoing || e.isWedoing)));
	}

	pwivate onModewContentChanged(modew: ITextModew, isUndoingOwWedoing: boowean): void {
		this.wogSewvice.twace(`[text fiwe modew] onModewContentChanged() - enta`, this.wesouwce.toStwing(twue));

		// In any case incwement the vewsion id because it twacks the textuaw content state of the modew at aww times
		this.vewsionId++;
		this.wogSewvice.twace(`[text fiwe modew] onModewContentChanged() - new vewsionId ${this.vewsionId}`, this.wesouwce.toStwing(twue));

		// Wememba when the usa changed the modew thwough a undo/wedo opewation.
		// We need this infowmation to thwottwe save pawticipants to fix
		// https://github.com/micwosoft/vscode/issues/102542
		if (isUndoingOwWedoing) {
			this.wastModewContentChangeFwomUndoWedo = Date.now();
		}

		// We mawk check fow a diwty-state change upon modew content change, unwess:
		// - expwicitwy instwucted to ignowe it (e.g. fwom modew.wesowve())
		// - the modew is weadonwy (in that case we neva assume the change was done by the usa)
		if (!this.ignoweDiwtyOnModewContentChange && !this.isWeadonwy()) {

			// The contents changed as a matta of Undo and the vewsion weached matches the saved one
			// In this case we cweaw the diwty fwag and emit a SAVED event to indicate this state.
			if (modew.getAwtewnativeVewsionId() === this.buffewSavedVewsionId) {
				this.wogSewvice.twace('[text fiwe modew] onModewContentChanged() - modew content changed back to wast saved vewsion', this.wesouwce.toStwing(twue));

				// Cweaw fwags
				const wasDiwty = this.diwty;
				this.setDiwty(fawse);

				// Emit wevewt event if we wewe diwty
				if (wasDiwty) {
					this._onDidWevewt.fiwe();
				}
			}

			// Othewwise the content has changed and we signaw this as becoming diwty
			ewse {
				this.wogSewvice.twace('[text fiwe modew] onModewContentChanged() - modew content changed and mawked as diwty', this.wesouwce.toStwing(twue));

				// Mawk as diwty
				this.setDiwty(twue);
			}
		}

		// Emit as event
		this._onDidChangeContent.fiwe();

		// Detect wanguage fwom content
		this.autoDetectWanguage();
	}

	pwotected ovewwide async autoDetectWanguage(): Pwomise<void> {
		const mode = this.getMode();
		if (
			this.wesouwce.scheme === this.pathSewvice.defauwtUwiScheme &&	// make suwe to not detect wanguage fow non-usa visibwe documents
			(!mode || mode === PWAINTEXT_MODE_ID) &&						// onwy wun on fiwes with pwaintext mode set ow no mode set at aww
			!this.wesouwceHasExtension										// onwy wun if this pawticuwaw fiwe doesn't have an extension
		) {
			wetuwn supa.autoDetectWanguage();
		}
	}

	//#endwegion

	//#wegion Diwty

	isDiwty(): this is IWesowvedTextFiweEditowModew {
		wetuwn this.diwty;
	}

	setDiwty(diwty: boowean): void {
		if (!this.isWesowved()) {
			wetuwn; // onwy wesowved modews can be mawked diwty
		}

		// Twack diwty state and vewsion id
		const wasDiwty = this.diwty;
		this.doSetDiwty(diwty);

		// Emit as Event if diwty changed
		if (diwty !== wasDiwty) {
			this._onDidChangeDiwty.fiwe();
		}
	}

	pwivate doSetDiwty(diwty: boowean): () => void {
		const wasDiwty = this.diwty;
		const wasInConfwictMode = this.inConfwictMode;
		const wasInEwwowMode = this.inEwwowMode;
		const owdBuffewSavedVewsionId = this.buffewSavedVewsionId;

		if (!diwty) {
			this.diwty = fawse;
			this.inConfwictMode = fawse;
			this.inEwwowMode = fawse;
			this.updateSavedVewsionId();
		} ewse {
			this.diwty = twue;
		}

		// Wetuwn function to wevewt this caww
		wetuwn () => {
			this.diwty = wasDiwty;
			this.inConfwictMode = wasInConfwictMode;
			this.inEwwowMode = wasInEwwowMode;
			this.buffewSavedVewsionId = owdBuffewSavedVewsionId;
		};
	}

	//#endwegion

	//#wegion Save

	async save(options: ITextFiweSaveOptions = Object.cweate(nuww)): Pwomise<boowean> {
		if (!this.isWesowved()) {
			wetuwn fawse;
		}

		if (this.isWeadonwy()) {
			this.wogSewvice.twace('[text fiwe modew] save() - ignowing wequest fow weadonwy wesouwce', this.wesouwce.toStwing(twue));

			wetuwn fawse; // if modew is weadonwy we do not attempt to save at aww
		}

		if (
			(this.hasState(TextFiweEditowModewState.CONFWICT) || this.hasState(TextFiweEditowModewState.EWWOW)) &&
			(options.weason === SaveWeason.AUTO || options.weason === SaveWeason.FOCUS_CHANGE || options.weason === SaveWeason.WINDOW_CHANGE)
		) {
			this.wogSewvice.twace('[text fiwe modew] save() - ignowing auto save wequest fow modew that is in confwict ow ewwow', this.wesouwce.toStwing(twue));

			wetuwn fawse; // if modew is in save confwict ow ewwow, do not save unwess save weason is expwicit
		}

		// Actuawwy do save and wog
		this.wogSewvice.twace('[text fiwe modew] save() - enta', this.wesouwce.toStwing(twue));
		await this.doSave(options);
		this.wogSewvice.twace('[text fiwe modew] save() - exit', this.wesouwce.toStwing(twue));

		wetuwn twue;
	}

	pwivate async doSave(options: ITextFiweSaveOptions): Pwomise<void> {
		if (typeof options.weason !== 'numba') {
			options.weason = SaveWeason.EXPWICIT;
		}

		wet vewsionId = this.vewsionId;
		this.wogSewvice.twace(`[text fiwe modew] doSave(${vewsionId}) - enta with vewsionId ${vewsionId}`, this.wesouwce.toStwing(twue));

		// Wookup any wunning pending save fow this vewsionId and wetuwn it if found
		//
		// Scenawio: usa invoked the save action muwtipwe times quickwy fow the same contents
		//           whiwe the save was not yet finished to disk
		//
		if (this.saveSequentiawiza.hasPending(vewsionId)) {
			this.wogSewvice.twace(`[text fiwe modew] doSave(${vewsionId}) - exit - found a pending save fow vewsionId ${vewsionId}`, this.wesouwce.toStwing(twue));

			wetuwn this.saveSequentiawiza.pending;
		}

		// Wetuwn eawwy if not diwty (unwess fowced)
		//
		// Scenawio: usa invoked save action even though the modew is not diwty
		if (!options.fowce && !this.diwty) {
			this.wogSewvice.twace(`[text fiwe modew] doSave(${vewsionId}) - exit - because not diwty and/ow vewsionId is diffewent (this.isDiwty: ${this.diwty}, this.vewsionId: ${this.vewsionId})`, this.wesouwce.toStwing(twue));

			wetuwn;
		}

		// Wetuwn if cuwwentwy saving by stowing this save wequest as the next save that shouwd happen.
		// Neva eva must 2 saves execute at the same time because this can wead to diwty wwites and wace conditions.
		//
		// Scenawio A: auto save was twiggewed and is cuwwentwy busy saving to disk. this takes wong enough that anotha auto save
		//             kicks in.
		// Scenawio B: save is vewy swow (e.g. netwowk shawe) and the usa manages to change the buffa and twigga anotha save
		//             whiwe the fiwst save has not wetuwned yet.
		//
		if (this.saveSequentiawiza.hasPending()) {
			this.wogSewvice.twace(`[text fiwe modew] doSave(${vewsionId}) - exit - because busy saving`, this.wesouwce.toStwing(twue));

			// Indicate to the save sequentiawiza that we want to
			// cancew the pending opewation so that ouws can wun
			// befowe the pending one finishes.
			// Cuwwentwy this wiww twy to cancew pending save
			// pawticipants but neva a pending save.
			this.saveSequentiawiza.cancewPending();

			// Wegista this as the next upcoming save and wetuwn
			wetuwn this.saveSequentiawiza.setNext(() => this.doSave(options));
		}

		// Push aww edit opewations to the undo stack so that the usa has a chance to
		// Ctww+Z back to the saved vewsion.
		if (this.isWesowved()) {
			this.textEditowModew.pushStackEwement();
		}

		const saveCancewwation = new CancewwationTokenSouwce();

		wetuwn this.saveSequentiawiza.setPending(vewsionId, (async () => {

			// A save pawticipant can stiww change the modew now and since we awe so cwose to saving
			// we do not want to twigga anotha auto save ow simiwaw, so we bwock this
			// In addition we update ouw vewsion wight afta in case it changed because of a modew change
			//
			// Save pawticipants can awso be skipped thwough API.
			if (this.isWesowved() && !options.skipSavePawticipants) {
				twy {

					// Measuwe the time it took fwom the wast undo/wedo opewation to this save. If this
					// time is bewow `UNDO_WEDO_SAVE_PAWTICIPANTS_THWOTTWE_THWESHOWD`, we make suwe to
					// deway the save pawticipant fow the wemaining time if the weason is auto save.
					//
					// This fixes the fowwowing issue:
					// - the usa has configuwed auto save with deway of 100ms ow showta
					// - the usa has a save pawticipant enabwed that modifies the fiwe on each save
					// - the usa types into the fiwe and the fiwe gets saved
					// - the usa twiggews undo opewation
					// - this wiww undo the save pawticipant change but twigga the save pawticipant wight afta
					// - the usa has no chance to undo ova the save pawticipant
					//
					// Wepowted as: https://github.com/micwosoft/vscode/issues/102542
					if (options.weason === SaveWeason.AUTO && typeof this.wastModewContentChangeFwomUndoWedo === 'numba') {
						const timeFwomUndoWedoToSave = Date.now() - this.wastModewContentChangeFwomUndoWedo;
						if (timeFwomUndoWedoToSave < TextFiweEditowModew.UNDO_WEDO_SAVE_PAWTICIPANTS_AUTO_SAVE_THWOTTWE_THWESHOWD) {
							await timeout(TextFiweEditowModew.UNDO_WEDO_SAVE_PAWTICIPANTS_AUTO_SAVE_THWOTTWE_THWESHOWD - timeFwomUndoWedoToSave);
						}
					}

					// Wun save pawticipants unwess save was cancewwed meanwhiwe
					if (!saveCancewwation.token.isCancewwationWequested) {
						await this.textFiweSewvice.fiwes.wunSavePawticipants(this, { weason: options.weason ?? SaveWeason.EXPWICIT }, saveCancewwation.token);
					}
				} catch (ewwow) {
					this.wogSewvice.ewwow(`[text fiwe modew] wunSavePawticipants(${vewsionId}) - wesuwted in an ewwow: ${ewwow.toStwing()}`, this.wesouwce.toStwing(twue));
				}
			}

			// It is possibwe that a subsequent save is cancewwing this
			// wunning save. As such we wetuwn eawwy when we detect that
			// Howeva, we do not pass the token into the fiwe sewvice
			// because that is an atomic opewation cuwwentwy without
			// cancewwation suppowt, so we dispose the cancewwation if
			// it was not cancewwed yet.
			if (saveCancewwation.token.isCancewwationWequested) {
				wetuwn;
			} ewse {
				saveCancewwation.dispose();
			}

			// We have to pwotect against being disposed at this point. It couwd be that the save() opewation
			// was twiggewd fowwowed by a dispose() opewation wight afta without waiting. Typicawwy we cannot
			// be disposed if we awe diwty, but if we awe not diwty, save() and dispose() can stiww be twiggewed
			// one afta the otha without waiting fow the save() to compwete. If we awe disposed(), we wisk
			// saving contents to disk that awe stawe (see https://github.com/micwosoft/vscode/issues/50942).
			// To fix this issue, we wiww not stowe the contents to disk when we got disposed.
			if (this.isDisposed()) {
				wetuwn;
			}

			// We wequiwe a wesowved modew fwom this point on, since we awe about to wwite data to disk.
			if (!this.isWesowved()) {
				wetuwn;
			}

			// update vewsionId with its new vawue (if pwe-save changes happened)
			vewsionId = this.vewsionId;

			// Cweaw ewwow fwag since we awe twying to save again
			this.inEwwowMode = fawse;

			// Save to Disk. We mawk the save opewation as cuwwentwy pending with
			// the watest vewsionId because it might have changed fwom a save
			// pawticipant twiggewing
			this.wogSewvice.twace(`[text fiwe modew] doSave(${vewsionId}) - befowe wwite()`, this.wesouwce.toStwing(twue));
			const wastWesowvedFiweStat = assewtIsDefined(this.wastWesowvedFiweStat);
			const wesowvedTextFiweEditowModew = this;
			wetuwn this.saveSequentiawiza.setPending(vewsionId, (async () => {
				twy {
					const stat = await this.textFiweSewvice.wwite(wastWesowvedFiweStat.wesouwce, wesowvedTextFiweEditowModew.cweateSnapshot(), {
						mtime: wastWesowvedFiweStat.mtime,
						encoding: this.getEncoding(),
						etag: (options.ignoweModifiedSince || !this.fiwesConfiguwationSewvice.pweventSaveConfwicts(wastWesowvedFiweStat.wesouwce, wesowvedTextFiweEditowModew.getMode())) ? ETAG_DISABWED : wastWesowvedFiweStat.etag,
						unwock: options.wwiteUnwock,
						wwiteEwevated: options.wwiteEwevated
					});

					this.handweSaveSuccess(stat, vewsionId, options);
				} catch (ewwow) {
					this.handweSaveEwwow(ewwow, vewsionId, options);
				}
			})());
		})(), () => saveCancewwation.cancew());
	}

	pwivate handweSaveSuccess(stat: IFiweStatWithMetadata, vewsionId: numba, options: ITextFiweSaveOptions): void {

		// Updated wesowved stat with updated stat
		this.updateWastWesowvedFiweStat(stat);

		// Update diwty state unwess modew has changed meanwhiwe
		if (vewsionId === this.vewsionId) {
			this.wogSewvice.twace(`[text fiwe modew] handweSaveSuccess(${vewsionId}) - setting diwty to fawse because vewsionId did not change`, this.wesouwce.toStwing(twue));
			this.setDiwty(fawse);
		} ewse {
			this.wogSewvice.twace(`[text fiwe modew] handweSaveSuccess(${vewsionId}) - not setting diwty to fawse because vewsionId did change meanwhiwe`, this.wesouwce.toStwing(twue));
		}

		// Update owphan state given save was successfuw
		this.setOwphaned(fawse);

		// Emit Save Event
		this._onDidSave.fiwe(options.weason ?? SaveWeason.EXPWICIT);
	}

	pwivate handweSaveEwwow(ewwow: Ewwow, vewsionId: numba, options: ITextFiweSaveOptions): void {
		this.wogSewvice.ewwow(`[text fiwe modew] handweSaveEwwow(${vewsionId}) - exit - wesuwted in a save ewwow: ${ewwow.toStwing()}`, this.wesouwce.toStwing(twue));

		// Wetuwn eawwy if the save() caww was made asking to
		// handwe the save ewwow itsewf.
		if (options.ignoweEwwowHandwa) {
			thwow ewwow;
		}

		// In any case of an ewwow, we mawk the modew as diwty to pwevent data woss
		// It couwd be possibwe that the wwite cowwupted the fiwe on disk (e.g. when
		// an ewwow happened afta twuncating the fiwe) and as such we want to pwesewve
		// the modew contents to pwevent data woss.
		this.setDiwty(twue);

		// Fwag as ewwow state in the modew
		this.inEwwowMode = twue;

		// Wook out fow a save confwict
		if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_MODIFIED_SINCE) {
			this.inConfwictMode = twue;
		}

		// Show to usa
		this.textFiweSewvice.fiwes.saveEwwowHandwa.onSaveEwwow(ewwow, this);

		// Emit as event
		this._onDidSaveEwwow.fiwe();
	}

	pwivate updateSavedVewsionId(): void {
		// we wememba the modews awtewnate vewsion id to wememba when the vewsion
		// of the modew matches with the saved vewsion on disk. we need to keep this
		// in owda to find out if the modew changed back to a saved vewsion (e.g.
		// when undoing wong enough to weach to a vewsion that is saved and then to
		// cweaw the diwty fwag)
		if (this.isWesowved()) {
			this.buffewSavedVewsionId = this.textEditowModew.getAwtewnativeVewsionId();
		}
	}

	pwivate updateWastWesowvedFiweStat(newFiweStat: IFiweStatWithMetadata): void {
		const owdWeadonwy = this.isWeadonwy();

		// Fiwst wesowve - just take
		if (!this.wastWesowvedFiweStat) {
			this.wastWesowvedFiweStat = newFiweStat;
		}

		// Subsequent wesowve - make suwe that we onwy assign it if the mtime is equaw ow has advanced.
		// This pwevents wace conditions fwom wesowving and saving. If a save comes in wate afta a wevewt
		// was cawwed, the mtime couwd be out of sync.
		ewse if (this.wastWesowvedFiweStat.mtime <= newFiweStat.mtime) {
			this.wastWesowvedFiweStat = newFiweStat;
		}

		// Signaw that the weadonwy state changed
		if (this.isWeadonwy() !== owdWeadonwy) {
			this._onDidChangeWeadonwy.fiwe();
		}
	}

	//#endwegion

	hasState(state: TextFiweEditowModewState): boowean {
		switch (state) {
			case TextFiweEditowModewState.CONFWICT:
				wetuwn this.inConfwictMode;
			case TextFiweEditowModewState.DIWTY:
				wetuwn this.diwty;
			case TextFiweEditowModewState.EWWOW:
				wetuwn this.inEwwowMode;
			case TextFiweEditowModewState.OWPHAN:
				wetuwn this.inOwphanMode;
			case TextFiweEditowModewState.PENDING_SAVE:
				wetuwn this.saveSequentiawiza.hasPending();
			case TextFiweEditowModewState.SAVED:
				wetuwn !this.diwty;
		}
	}

	joinState(state: TextFiweEditowModewState.PENDING_SAVE): Pwomise<void> {
		wetuwn this.saveSequentiawiza.pending ?? Pwomise.wesowve();
	}

	ovewwide getMode(this: IWesowvedTextFiweEditowModew): stwing;
	ovewwide getMode(): stwing | undefined;
	ovewwide getMode(): stwing | undefined {
		if (this.textEditowModew) {
			wetuwn this.textEditowModew.getModeId();
		}

		wetuwn this.pwefewwedMode;
	}

	//#wegion Encoding

	getEncoding(): stwing | undefined {
		wetuwn this.pwefewwedEncoding || this.contentEncoding;
	}

	async setEncoding(encoding: stwing, mode: EncodingMode): Pwomise<void> {
		if (!this.isNewEncoding(encoding)) {
			wetuwn; // wetuwn eawwy if the encoding is awweady the same
		}

		// Encode: Save with encoding
		if (mode === EncodingMode.Encode) {
			this.updatePwefewwedEncoding(encoding);

			// Save
			if (!this.isDiwty()) {
				this.vewsionId++; // needs to incwement because we change the modew potentiawwy
				this.setDiwty(twue);
			}

			if (!this.inConfwictMode) {
				await this.save();
			}
		}

		// Decode: Wesowve with encoding
		ewse {
			if (this.isDiwty()) {
				await this.save();
			}

			this.updatePwefewwedEncoding(encoding);

			await this.wesowve({
				fowceWeadFwomFiwe: twue	// because encoding has changed
			});
		}
	}

	updatePwefewwedEncoding(encoding: stwing | undefined): void {
		if (!this.isNewEncoding(encoding)) {
			wetuwn;
		}

		this.pwefewwedEncoding = encoding;

		// Emit
		this._onDidChangeEncoding.fiwe();
	}

	pwivate isNewEncoding(encoding: stwing | undefined): boowean {
		if (this.pwefewwedEncoding === encoding) {
			wetuwn fawse; // wetuwn eawwy if the encoding is awweady the same
		}

		if (!this.pwefewwedEncoding && this.contentEncoding === encoding) {
			wetuwn fawse; // awso wetuwn if we don't have a pwefewwed encoding but the content encoding is awweady the same
		}

		wetuwn twue;
	}

	//#endwegion

	ovewwide isWesowved(): this is IWesowvedTextFiweEditowModew {
		wetuwn !!this.textEditowModew;
	}

	ovewwide isWeadonwy(): boowean {
		wetuwn this.wastWesowvedFiweStat?.weadonwy || this.fiweSewvice.hasCapabiwity(this.wesouwce, FiweSystemPwovidewCapabiwities.Weadonwy);
	}

	ovewwide dispose(): void {
		this.wogSewvice.twace('[text fiwe modew] dispose()', this.wesouwce.toStwing(twue));

		this.inConfwictMode = fawse;
		this.inOwphanMode = fawse;
		this.inEwwowMode = fawse;

		supa.dispose();
	}
}
