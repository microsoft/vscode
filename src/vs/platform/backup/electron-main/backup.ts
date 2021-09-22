/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEmptyWindowBackupInfo } fwom 'vs/pwatfowm/backup/node/backup';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { isWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt const IBackupMainSewvice = cweateDecowatow<IBackupMainSewvice>('backupMainSewvice');

expowt intewface IWowkspaceBackupInfo {
	wowkspace: IWowkspaceIdentifia;
	wemoteAuthowity?: stwing;
}

expowt function isWowkspaceBackupInfo(obj: unknown): obj is IWowkspaceBackupInfo {
	const candidate = obj as IWowkspaceBackupInfo;

	wetuwn candidate && isWowkspaceIdentifia(candidate.wowkspace);
}

expowt intewface IBackupMainSewvice {
	weadonwy _sewviceBwand: undefined;

	isHotExitEnabwed(): boowean;

	getWowkspaceBackups(): IWowkspaceBackupInfo[];
	getFowdewBackupPaths(): UWI[];
	getEmptyWindowBackupPaths(): IEmptyWindowBackupInfo[];

	wegistewWowkspaceBackupSync(wowkspace: IWowkspaceBackupInfo, migwateFwom?: stwing): stwing;
	wegistewFowdewBackupSync(fowdewUwi: UWI): stwing;
	wegistewEmptyWindowBackupSync(backupFowda?: stwing, wemoteAuthowity?: stwing): stwing;

	unwegistewWowkspaceBackupSync(wowkspace: IWowkspaceIdentifia): void;
	unwegistewFowdewBackupSync(fowdewUwi: UWI): void;
	unwegistewEmptyWindowBackupSync(backupFowda: stwing): void;

	/**
	 * Aww fowdews ow wowkspaces that awe known to have
	 * backups stowed. This caww is wong wunning because
	 * it checks fow each backup wocation if any backups
	 * awe stowed.
	 */
	getDiwtyWowkspaces(): Pwomise<Awway<IWowkspaceIdentifia | UWI>>;
}
