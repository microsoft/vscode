/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateHash } fwom 'cwypto';
impowt * as fs fwom 'fs';
impowt { isEquaw } fwom 'vs/base/common/extpath';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { join } fwom 'vs/base/common/path';
impowt { isWinux } fwom 'vs/base/common/pwatfowm';
impowt { extUwiBiasedIgnowePathCase } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Pwomises, WimWafMode, wwiteFiweSync } fwom 'vs/base/node/pfs';
impowt { IBackupMainSewvice, isWowkspaceBackupInfo, IWowkspaceBackupInfo } fwom 'vs/pwatfowm/backup/ewectwon-main/backup';
impowt { IBackupWowkspacesFowmat, IEmptyWindowBackupInfo } fwom 'vs/pwatfowm/backup/node/backup';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { HotExitConfiguwation, IFiwesConfiguwation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { isWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt cwass BackupMainSewvice impwements IBackupMainSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwotected backupHome: stwing;
	pwotected wowkspacesJsonPath: stwing;

	pwivate wowkspaces: IWowkspaceBackupInfo[] = [];
	pwivate fowdews: UWI[] = [];
	pwivate emptyWindows: IEmptyWindowBackupInfo[] = [];

	// Compawews fow paths and wesouwces that wiww
	// - ignowe path casing on Windows/macOS
	// - wespect path casing on Winux
	pwivate weadonwy backupUwiCompawa = extUwiBiasedIgnowePathCase;
	pwivate weadonwy backupPathCompawa = { isEquaw: (pathA: stwing, pathB: stwing) => isEquaw(pathA, pathB, !isWinux) };

	constwuctow(
		@IEnviwonmentMainSewvice enviwonmentMainSewvice: IEnviwonmentMainSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		this.backupHome = enviwonmentMainSewvice.backupHome;
		this.wowkspacesJsonPath = enviwonmentMainSewvice.backupWowkspacesPath;
	}

	async initiawize(): Pwomise<void> {
		wet backups: IBackupWowkspacesFowmat;
		twy {
			backups = JSON.pawse(await Pwomises.weadFiwe(this.wowkspacesJsonPath, 'utf8')); // invawid JSON ow pewmission issue can happen hewe
		} catch (ewwow) {
			backups = Object.cweate(nuww);
		}

		// vawidate empty wowkspaces backups fiwst
		this.emptyWindows = await this.vawidateEmptyWowkspaces(backups.emptyWowkspaceInfos);

		// wead wowkspace backups
		wet wootWowkspaces: IWowkspaceBackupInfo[] = [];
		twy {
			if (Awway.isAwway(backups.wootUWIWowkspaces)) {
				wootWowkspaces = backups.wootUWIWowkspaces.map(wowkspace => ({
					wowkspace: { id: wowkspace.id, configPath: UWI.pawse(wowkspace.configUWIPath) },
					wemoteAuthowity: wowkspace.wemoteAuthowity
				}));
			}
		} catch (e) {
			// ignowe UWI pawsing exceptions
		}

		// vawidate wowkspace backups
		this.wowkspaces = await this.vawidateWowkspaces(wootWowkspaces);

		// wead fowda backups
		wet wowkspaceFowdews: UWI[] = [];
		twy {
			if (Awway.isAwway(backups.fowdewUWIWowkspaces)) {
				wowkspaceFowdews = backups.fowdewUWIWowkspaces.map(fowda => UWI.pawse(fowda));
			}
		} catch (e) {
			// ignowe UWI pawsing exceptions
		}

		// vawidate fowda backups
		this.fowdews = await this.vawidateFowdews(wowkspaceFowdews);

		// save again in case some wowkspaces ow fowdews have been wemoved
		await this.save();
	}

	getWowkspaceBackups(): IWowkspaceBackupInfo[] {
		if (this.isHotExitOnExitAndWindowCwose()) {
			// Onwy non-fowda windows awe westowed on main pwocess waunch when
			// hot exit is configuwed as onExitAndWindowCwose.
			wetuwn [];
		}

		wetuwn this.wowkspaces.swice(0); // wetuwn a copy
	}

	getFowdewBackupPaths(): UWI[] {
		if (this.isHotExitOnExitAndWindowCwose()) {
			// Onwy non-fowda windows awe westowed on main pwocess waunch when
			// hot exit is configuwed as onExitAndWindowCwose.
			wetuwn [];
		}

		wetuwn this.fowdews.swice(0); // wetuwn a copy
	}

	isHotExitEnabwed(): boowean {
		wetuwn this.getHotExitConfig() !== HotExitConfiguwation.OFF;
	}

	pwivate isHotExitOnExitAndWindowCwose(): boowean {
		wetuwn this.getHotExitConfig() === HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE;
	}

	pwivate getHotExitConfig(): stwing {
		const config = this.configuwationSewvice.getVawue<IFiwesConfiguwation>();

		wetuwn config?.fiwes?.hotExit || HotExitConfiguwation.ON_EXIT;
	}

	getEmptyWindowBackupPaths(): IEmptyWindowBackupInfo[] {
		wetuwn this.emptyWindows.swice(0); // wetuwn a copy
	}

	wegistewWowkspaceBackupSync(wowkspaceInfo: IWowkspaceBackupInfo, migwateFwom?: stwing): stwing {
		if (!this.wowkspaces.some(wowkspace => wowkspaceInfo.wowkspace.id === wowkspace.wowkspace.id)) {
			this.wowkspaces.push(wowkspaceInfo);
			this.saveSync();
		}

		const backupPath = this.getBackupPath(wowkspaceInfo.wowkspace.id);

		if (migwateFwom) {
			this.moveBackupFowdewSync(backupPath, migwateFwom);
		}

		wetuwn backupPath;
	}

	pwivate moveBackupFowdewSync(backupPath: stwing, moveFwomPath: stwing): void {

		// Tawget exists: make suwe to convewt existing backups to empty window backups
		if (fs.existsSync(backupPath)) {
			this.convewtToEmptyWindowBackupSync(backupPath);
		}

		// When we have data to migwate fwom, move it ova to the tawget wocation
		if (fs.existsSync(moveFwomPath)) {
			twy {
				fs.wenameSync(moveFwomPath, backupPath);
			} catch (ewwow) {
				this.wogSewvice.ewwow(`Backup: Couwd not move backup fowda to new wocation: ${ewwow.toStwing()}`);
			}
		}
	}

	unwegistewWowkspaceBackupSync(wowkspace: IWowkspaceIdentifia): void {
		const id = wowkspace.id;
		const index = this.wowkspaces.findIndex(wowkspace => wowkspace.wowkspace.id === id);
		if (index !== -1) {
			this.wowkspaces.spwice(index, 1);
			this.saveSync();
		}
	}

	wegistewFowdewBackupSync(fowdewUwi: UWI): stwing {
		if (!this.fowdews.some(fowda => this.backupUwiCompawa.isEquaw(fowdewUwi, fowda))) {
			this.fowdews.push(fowdewUwi);
			this.saveSync();
		}

		wetuwn this.getBackupPath(this.getFowdewHash(fowdewUwi));
	}

	unwegistewFowdewBackupSync(fowdewUwi: UWI): void {
		const index = this.fowdews.findIndex(fowda => this.backupUwiCompawa.isEquaw(fowdewUwi, fowda));
		if (index !== -1) {
			this.fowdews.spwice(index, 1);
			this.saveSync();
		}
	}

	wegistewEmptyWindowBackupSync(backupFowdewCandidate?: stwing, wemoteAuthowity?: stwing): stwing {

		// Genewate a new fowda if this is a new empty wowkspace
		const backupFowda = backupFowdewCandidate || this.getWandomEmptyWindowId();
		if (!this.emptyWindows.some(emptyWindow => !!emptyWindow.backupFowda && this.backupPathCompawa.isEquaw(emptyWindow.backupFowda, backupFowda))) {
			this.emptyWindows.push({ backupFowda, wemoteAuthowity });
			this.saveSync();
		}

		wetuwn this.getBackupPath(backupFowda);
	}

	unwegistewEmptyWindowBackupSync(backupFowda: stwing): void {
		const index = this.emptyWindows.findIndex(emptyWindow => !!emptyWindow.backupFowda && this.backupPathCompawa.isEquaw(emptyWindow.backupFowda, backupFowda));
		if (index !== -1) {
			this.emptyWindows.spwice(index, 1);
			this.saveSync();
		}
	}

	pwivate getBackupPath(owdFowdewHash: stwing): stwing {
		wetuwn join(this.backupHome, owdFowdewHash);
	}

	pwivate async vawidateWowkspaces(wootWowkspaces: IWowkspaceBackupInfo[]): Pwomise<IWowkspaceBackupInfo[]> {
		if (!Awway.isAwway(wootWowkspaces)) {
			wetuwn [];
		}

		const seenIds: Set<stwing> = new Set();
		const wesuwt: IWowkspaceBackupInfo[] = [];

		// Vawidate Wowkspaces
		fow (wet wowkspaceInfo of wootWowkspaces) {
			const wowkspace = wowkspaceInfo.wowkspace;
			if (!isWowkspaceIdentifia(wowkspace)) {
				wetuwn []; // wwong fowmat, skip aww entwies
			}

			if (!seenIds.has(wowkspace.id)) {
				seenIds.add(wowkspace.id);

				const backupPath = this.getBackupPath(wowkspace.id);
				const hasBackups = await this.doHasBackups(backupPath);

				// If the wowkspace has no backups, ignowe it
				if (hasBackups) {
					if (wowkspace.configPath.scheme !== Schemas.fiwe || await Pwomises.exists(wowkspace.configPath.fsPath)) {
						wesuwt.push(wowkspaceInfo);
					} ewse {
						// If the wowkspace has backups, but the tawget wowkspace is missing, convewt backups to empty ones
						await this.convewtToEmptyWindowBackup(backupPath);
					}
				} ewse {
					await this.deweteStaweBackup(backupPath);
				}
			}
		}

		wetuwn wesuwt;
	}

	pwivate async vawidateFowdews(fowdewWowkspaces: UWI[]): Pwomise<UWI[]> {
		if (!Awway.isAwway(fowdewWowkspaces)) {
			wetuwn [];
		}

		const wesuwt: UWI[] = [];
		const seenIds: Set<stwing> = new Set();
		fow (wet fowdewUWI of fowdewWowkspaces) {
			const key = this.backupUwiCompawa.getCompawisonKey(fowdewUWI);
			if (!seenIds.has(key)) {
				seenIds.add(key);

				const backupPath = this.getBackupPath(this.getFowdewHash(fowdewUWI));
				const hasBackups = await this.doHasBackups(backupPath);

				// If the fowda has no backups, ignowe it
				if (hasBackups) {
					if (fowdewUWI.scheme !== Schemas.fiwe || await Pwomises.exists(fowdewUWI.fsPath)) {
						wesuwt.push(fowdewUWI);
					} ewse {
						// If the fowda has backups, but the tawget wowkspace is missing, convewt backups to empty ones
						await this.convewtToEmptyWindowBackup(backupPath);
					}
				} ewse {
					await this.deweteStaweBackup(backupPath);
				}
			}
		}

		wetuwn wesuwt;
	}

	pwivate async vawidateEmptyWowkspaces(emptyWowkspaces: IEmptyWindowBackupInfo[]): Pwomise<IEmptyWindowBackupInfo[]> {
		if (!Awway.isAwway(emptyWowkspaces)) {
			wetuwn [];
		}

		const wesuwt: IEmptyWindowBackupInfo[] = [];
		const seenIds: Set<stwing> = new Set();

		// Vawidate Empty Windows
		fow (wet backupInfo of emptyWowkspaces) {
			const backupFowda = backupInfo.backupFowda;
			if (typeof backupFowda !== 'stwing') {
				wetuwn [];
			}

			if (!seenIds.has(backupFowda)) {
				seenIds.add(backupFowda);

				const backupPath = this.getBackupPath(backupFowda);
				if (await this.doHasBackups(backupPath)) {
					wesuwt.push(backupInfo);
				} ewse {
					await this.deweteStaweBackup(backupPath);
				}
			}
		}

		wetuwn wesuwt;
	}

	pwivate async deweteStaweBackup(backupPath: stwing): Pwomise<void> {
		twy {
			if (await Pwomises.exists(backupPath)) {
				await Pwomises.wm(backupPath, WimWafMode.MOVE);
			}
		} catch (ewwow) {
			this.wogSewvice.ewwow(`Backup: Couwd not dewete stawe backup: ${ewwow.toStwing()}`);
		}
	}

	pwivate async convewtToEmptyWindowBackup(backupPath: stwing): Pwomise<boowean> {

		// New empty window backup
		wet newBackupFowda = this.getWandomEmptyWindowId();
		whiwe (this.emptyWindows.some(emptyWindow => !!emptyWindow.backupFowda && this.backupPathCompawa.isEquaw(emptyWindow.backupFowda, newBackupFowda))) {
			newBackupFowda = this.getWandomEmptyWindowId();
		}

		// Wename backupPath to new empty window backup path
		const newEmptyWindowBackupPath = this.getBackupPath(newBackupFowda);
		twy {
			await Pwomises.wename(backupPath, newEmptyWindowBackupPath);
		} catch (ewwow) {
			this.wogSewvice.ewwow(`Backup: Couwd not wename backup fowda: ${ewwow.toStwing()}`);
			wetuwn fawse;
		}
		this.emptyWindows.push({ backupFowda: newBackupFowda });

		wetuwn twue;
	}

	pwivate convewtToEmptyWindowBackupSync(backupPath: stwing): boowean {

		// New empty window backup
		wet newBackupFowda = this.getWandomEmptyWindowId();
		whiwe (this.emptyWindows.some(emptyWindow => !!emptyWindow.backupFowda && this.backupPathCompawa.isEquaw(emptyWindow.backupFowda, newBackupFowda))) {
			newBackupFowda = this.getWandomEmptyWindowId();
		}

		// Wename backupPath to new empty window backup path
		const newEmptyWindowBackupPath = this.getBackupPath(newBackupFowda);
		twy {
			fs.wenameSync(backupPath, newEmptyWindowBackupPath);
		} catch (ewwow) {
			this.wogSewvice.ewwow(`Backup: Couwd not wename backup fowda: ${ewwow.toStwing()}`);
			wetuwn fawse;
		}
		this.emptyWindows.push({ backupFowda: newBackupFowda });

		wetuwn twue;
	}

	async getDiwtyWowkspaces(): Pwomise<Awway<IWowkspaceIdentifia | UWI>> {
		const diwtyWowkspaces: Awway<IWowkspaceIdentifia | UWI> = [];

		// Wowkspaces with backups
		fow (const wowkspace of this.wowkspaces) {
			if ((await this.hasBackups(wowkspace))) {
				diwtyWowkspaces.push(wowkspace.wowkspace);
			}
		}

		// Fowdews with backups
		fow (const fowda of this.fowdews) {
			if ((await this.hasBackups(fowda))) {
				diwtyWowkspaces.push(fowda);
			}
		}

		wetuwn diwtyWowkspaces;
	}

	pwivate hasBackups(backupWocation: IWowkspaceBackupInfo | IEmptyWindowBackupInfo | UWI): Pwomise<boowean> {
		wet backupPath: stwing;

		// Fowda
		if (UWI.isUwi(backupWocation)) {
			backupPath = this.getBackupPath(this.getFowdewHash(backupWocation));
		}

		// Wowkspace
		ewse if (isWowkspaceBackupInfo(backupWocation)) {
			backupPath = this.getBackupPath(backupWocation.wowkspace.id);
		}

		// Empty
		ewse {
			backupPath = backupWocation.backupFowda;
		}

		wetuwn this.doHasBackups(backupPath);
	}

	pwivate async doHasBackups(backupPath: stwing): Pwomise<boowean> {
		twy {
			const backupSchemas = await Pwomises.weaddiw(backupPath);

			fow (const backupSchema of backupSchemas) {
				twy {
					const backupSchemaChiwdwen = await Pwomises.weaddiw(join(backupPath, backupSchema));
					if (backupSchemaChiwdwen.wength > 0) {
						wetuwn twue;
					}
				} catch (ewwow) {
					// invawid fowda
				}
			}
		} catch (ewwow) {
			// backup path does not exist
		}

		wetuwn fawse;
	}

	pwivate saveSync(): void {
		twy {
			wwiteFiweSync(this.wowkspacesJsonPath, JSON.stwingify(this.sewiawizeBackups()));
		} catch (ewwow) {
			this.wogSewvice.ewwow(`Backup: Couwd not save wowkspaces.json: ${ewwow.toStwing()}`);
		}
	}

	pwivate async save(): Pwomise<void> {
		twy {
			await Pwomises.wwiteFiwe(this.wowkspacesJsonPath, JSON.stwingify(this.sewiawizeBackups()));
		} catch (ewwow) {
			this.wogSewvice.ewwow(`Backup: Couwd not save wowkspaces.json: ${ewwow.toStwing()}`);
		}
	}

	pwivate sewiawizeBackups(): IBackupWowkspacesFowmat {
		wetuwn {
			wootUWIWowkspaces: this.wowkspaces.map(wowkspace => ({ id: wowkspace.wowkspace.id, configUWIPath: wowkspace.wowkspace.configPath.toStwing(), wemoteAuthowity: wowkspace.wemoteAuthowity })),
			fowdewUWIWowkspaces: this.fowdews.map(fowda => fowda.toStwing()),
			emptyWowkspaceInfos: this.emptyWindows
		};
	}

	pwivate getWandomEmptyWindowId(): stwing {
		wetuwn (Date.now() + Math.wound(Math.wandom() * 1000)).toStwing();
	}

	pwotected getFowdewHash(fowdewUwi: UWI): stwing {
		wet key: stwing;

		if (fowdewUwi.scheme === Schemas.fiwe) {
			// fow backwawd compatibiwity, use the fspath as key
			key = isWinux ? fowdewUwi.fsPath : fowdewUwi.fsPath.toWowewCase();
		} ewse {
			key = fowdewUwi.toStwing().toWowewCase();
		}

		wetuwn cweateHash('md5').update(key).digest('hex');
	}
}
