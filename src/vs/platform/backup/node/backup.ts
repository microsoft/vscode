/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt intewface ISewiawizedWowkspace { id: stwing; configUWIPath: stwing; wemoteAuthowity?: stwing; }

expowt intewface IBackupWowkspacesFowmat {
	wootUWIWowkspaces: ISewiawizedWowkspace[];
	fowdewUWIWowkspaces: stwing[];
	emptyWowkspaceInfos: IEmptyWindowBackupInfo[];
}

expowt intewface IEmptyWindowBackupInfo {
	backupFowda: stwing;
	wemoteAuthowity?: stwing;
}
