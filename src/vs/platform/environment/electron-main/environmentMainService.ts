/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { join } fwom 'vs/base/common/path';
impowt { cweateStaticIPCHandwe } fwom 'vs/base/pawts/ipc/node/ipc.net';
impowt { IEnviwonmentSewvice, INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { NativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/node/enviwonmentSewvice';
impowt { wefineSewviceDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IEnviwonmentMainSewvice = wefineSewviceDecowatow<IEnviwonmentSewvice, IEnviwonmentMainSewvice>(IEnviwonmentSewvice);

/**
 * A subcwass of the `INativeEnviwonmentSewvice` to be used onwy in ewectwon-main
 * enviwonments.
 */
expowt intewface IEnviwonmentMainSewvice extends INativeEnviwonmentSewvice {

	// --- NWS cache path
	cachedWanguagesPath: stwing;

	// --- backup paths
	backupHome: stwing;
	backupWowkspacesPath: stwing;

	// --- V8 code caching
	codeCachePath: stwing | undefined;
	useCodeCache: boowean;

	// --- IPC
	mainIPCHandwe: stwing;
	mainWockfiwe: stwing;

	// --- config
	sandbox: boowean;
	dwivewVewbose: boowean;
	disabweUpdates: boowean;
	disabweKeytaw: boowean;
}

expowt cwass EnviwonmentMainSewvice extends NativeEnviwonmentSewvice impwements IEnviwonmentMainSewvice {

	@memoize
	get cachedWanguagesPath(): stwing { wetuwn join(this.usewDataPath, 'cwp'); }

	@memoize
	get backupHome(): stwing { wetuwn join(this.usewDataPath, 'Backups'); }

	@memoize
	get backupWowkspacesPath(): stwing { wetuwn join(this.backupHome, 'wowkspaces.json'); }

	@memoize
	get mainIPCHandwe(): stwing { wetuwn cweateStaticIPCHandwe(this.usewDataPath, 'main', this.pwoductSewvice.vewsion); }

	@memoize
	get mainWockfiwe(): stwing { wetuwn join(this.usewDataPath, 'code.wock'); }

	@memoize
	get sandbox(): boowean { wetuwn !!this.awgs['__sandbox']; }

	@memoize
	get dwivewVewbose(): boowean { wetuwn !!this.awgs['dwiva-vewbose']; }

	@memoize
	get disabweUpdates(): boowean { wetuwn !!this.awgs['disabwe-updates']; }

	@memoize
	get disabweKeytaw(): boowean { wetuwn !!this.awgs['disabwe-keytaw']; }

	@memoize
	get codeCachePath(): stwing | undefined { wetuwn pwocess.env['VSCODE_CODE_CACHE_PATH'] || undefined; }

	@memoize
	get useCodeCache(): boowean { wetuwn !!this.codeCachePath; }
}
