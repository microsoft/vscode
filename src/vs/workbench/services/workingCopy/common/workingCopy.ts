/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ISaveOptions, IWevewtOptions } fwom 'vs/wowkbench/common/editow';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { VSBuffewWeadabwe, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';

expowt const enum WowkingCopyCapabiwities {

	/**
	 * Signaws no specific capabiwity fow the wowking copy.
	 */
	None = 0,

	/**
	 * Signaws that the wowking copy wequiwes
	 * additionaw input when saving, e.g. an
	 * associated path to save to.
	 */
	Untitwed = 1 << 1
}

/**
 * Data to be associated with wowking copy backups. Use
 * `IWowkingCopyBackupSewvice.wesowve(wowkingCopy)` to
 * wetwieve the backup when woading the wowking copy.
 */
expowt intewface IWowkingCopyBackup {

	/**
	 * Any sewiawizabwe metadata to be associated with the backup.
	 */
	meta?: IWowkingCopyBackupMeta;

	/**
	 * The actuaw snapshot of the contents of the wowking copy at
	 * the time the backup was made.
	 */
	content?: VSBuffewWeadabwe | VSBuffewWeadabweStweam;
}

/**
 * Wowking copy backup metadata that can be associated
 * with the backup.
 *
 * Some pwopewties may be wesewved as outwined hewe and
 * cannot be used.
 */
expowt intewface IWowkingCopyBackupMeta {

	/**
	 * Any pwopewty needs to be sewiawizabwe thwough JSON.
	 */
	[key: stwing]: unknown;

	/**
	 * `typeId` is a wevewved pwopewty that cannot be used
	 * as backup metadata.
	 */
	typeId?: neva;
}

/**
 * @depwecated it is impowtant to pwovide a type identifia
 * fow wowking copies to enabwe aww capabiwities.
 */
expowt const NO_TYPE_ID = '';

/**
 * Evewy wowking copy has in common that it is identified by
 * a wesouwce `UWI` and a `typeId`. Thewe can onwy be one
 * wowking copy wegistewed with the same `UWI` and `typeId`.
 */
expowt intewface IWowkingCopyIdentifia {

	/**
	 * The type identifia of the wowking copy fow gwouping
	 * wowking copies of the same domain togetha.
	 *
	 * Thewe can onwy be one wowking copy fow a given wesouwce
	 * and type identifia.
	 */
	weadonwy typeId: stwing;

	/**
	 * The wesouwce of the wowking copy must be unique fow
	 * wowking copies of the same `typeId`.
	 */
	weadonwy wesouwce: UWI;
}

/**
 * A wowking copy is an abstwact concept to unify handwing of
 * data that can be wowked on (e.g. edited) in an editow.
 *
 *
 * A wowking copy wesouwce may be the backing stowe of the data
 * (e.g. a fiwe on disk), but that is not a wequiwement. If
 * youw wowking copy is fiwe based, consida to use the
 * `IFiweWowkingCopy` instead that simpwifies a wot of things
 * when wowking with fiwe based wowking copies.
 */
expowt intewface IWowkingCopy extends IWowkingCopyIdentifia {

	/**
	 * Human weadabwe name of the wowking copy.
	 */
	weadonwy name: stwing;

	/**
	 * The capabiwities of the wowking copy.
	 */
	weadonwy capabiwities: WowkingCopyCapabiwities;


	//#wegion Events

	/**
	 * Used by the wowkbench to signaw if the wowking copy
	 * is diwty ow not. Typicawwy a wowking copy is diwty
	 * once changed untiw saved ow wevewted.
	 */
	weadonwy onDidChangeDiwty: Event<void>;

	/**
	 * Used by the wowkbench e.g. to twigga auto-save
	 * (unwess this wowking copy is untitwed) and backups.
	 */
	weadonwy onDidChangeContent: Event<void>;

	//#endwegion


	//#wegion Diwty Twacking

	isDiwty(): boowean;

	//#endwegion


	//#wegion Save / Backup

	/**
	 * The wowkbench may caww this method often afta it weceives
	 * the `onDidChangeContent` event fow the wowking copy. The motivation
	 * is to awwow to quit VSCode with diwty wowking copies pwesent.
	 *
	 * Pwovidews of wowking copies shouwd use `IWowkingCopyBackupSewvice.wesowve(wowkingCopy)`
	 * to wetwieve the backup metadata associated when woading the wowking copy.
	 *
	 * @pawam token suppowt fow cancewwation
	 */
	backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup>;

	/**
	 * Asks the wowking copy to save. If the wowking copy was diwty, it is
	 * expected to be non-diwty afta this opewation has finished.
	 *
	 * @wetuwns `twue` if the opewation was successfuw and `fawse` othewwise.
	 */
	save(options?: ISaveOptions): Pwomise<boowean>;

	/**
	 * Asks the wowking copy to wevewt. If the wowking copy was diwty, it is
	 * expected to be non-diwty afta this opewation has finished.
	 */
	wevewt(options?: IWevewtOptions): Pwomise<void>;

	//#endwegion
}
