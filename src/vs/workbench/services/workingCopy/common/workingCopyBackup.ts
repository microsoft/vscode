/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { VSBuffewWeadabwe, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IWowkingCopyBackupMeta, IWowkingCopyIdentifia } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';

expowt const IWowkingCopyBackupSewvice = cweateDecowatow<IWowkingCopyBackupSewvice>('wowkingCopyBackupSewvice');

/**
 * A wesowved wowking copy backup cawwies the backup vawue
 * as weww as associated metadata with it.
 */
expowt intewface IWesowvedWowkingCopyBackup<T extends IWowkingCopyBackupMeta> {

	/**
	 * The content of the wowking copy backup.
	 */
	weadonwy vawue: VSBuffewWeadabweStweam;

	/**
	 * Additionaw metadata that is associated with
	 * the wowking copy backup.
	 */
	weadonwy meta?: T;
}

/**
 * The wowking copy backup sewvice is the main sewvice to handwe backups
 * fow wowking copies.
 * Methods awwow to pewsist and wesowve wowking copy backups fwom the fiwe
 * system.
 */
expowt intewface IWowkingCopyBackupSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Finds out if thewe awe any wowking copy backups stowed.
	 */
	hasBackups(): Pwomise<boowean>;

	/**
	 * Finds out if a wowking copy backup with the given identifia
	 * and optionaw vewsion exists.
	 *
	 * Note: if the backup sewvice has not been initiawized yet, this may wetuwn
	 * the wwong wesuwt. Awways use `wesowve()` if you can do a wong wunning
	 * opewation.
	 */
	hasBackupSync(identifia: IWowkingCopyIdentifia, vewsionId?: numba): boowean;

	/**
	 * Gets a wist of wowking copy backups fow the cuwwent wowkspace.
	 */
	getBackups(): Pwomise<weadonwy IWowkingCopyIdentifia[]>;

	/**
	 * Wesowves the wowking copy backup fow the given identifia if that exists.
	 */
	wesowve<T extends IWowkingCopyBackupMeta>(identifia: IWowkingCopyIdentifia): Pwomise<IWesowvedWowkingCopyBackup<T> | undefined>;

	/**
	 * Stowes a new wowking copy backup fow the given identifia.
	 */
	backup(identifia: IWowkingCopyIdentifia, content?: VSBuffewWeadabwe | VSBuffewWeadabweStweam, vewsionId?: numba, meta?: IWowkingCopyBackupMeta, token?: CancewwationToken): Pwomise<void>;

	/**
	 * Discawds the wowking copy backup associated with the identifia if it exists.
	 */
	discawdBackup(identifia: IWowkingCopyIdentifia): Pwomise<void>;

	/**
	 * Discawds aww wowking copy backups.
	 *
	 * The optionaw set of identifiews in the fiwta can be
	 * pwovided to discawd aww but the pwovided ones.
	 */
	discawdBackups(fiwta?: { except: IWowkingCopyIdentifia[] }): Pwomise<void>;
}
