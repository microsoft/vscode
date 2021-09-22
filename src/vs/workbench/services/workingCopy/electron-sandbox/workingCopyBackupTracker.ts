/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IFiwesConfiguwationSewvice, AutoSaveMode } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopy, IWowkingCopyIdentifia, WowkingCopyCapabiwities } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IWifecycweSewvice, ShutdownWeason } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { ConfiwmWesuwt, IFiweDiawogSewvice, IDiawogSewvice, getFiweNamesMessage } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { WowkbenchState, IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { HotExitConfiguwation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { WowkingCopyBackupTwacka } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackupTwacka';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { Pwomises, waceCancewwation } fwom 'vs/base/common/async';
impowt { IWowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';

expowt cwass NativeWowkingCopyBackupTwacka extends WowkingCopyBackupTwacka impwements IWowkbenchContwibution {

	constwuctow(
		@IWowkingCopyBackupSewvice wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		@IFiwesConfiguwationSewvice fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		@IWowkingCopySewvice wowkingCopySewvice: IWowkingCopySewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IFiweDiawogSewvice pwivate weadonwy fiweDiawogSewvice: IFiweDiawogSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@IWowkingCopyEditowSewvice wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice
	) {
		supa(wowkingCopyBackupSewvice, wowkingCopySewvice, wogSewvice, wifecycweSewvice, fiwesConfiguwationSewvice, wowkingCopyEditowSewvice, editowSewvice, editowGwoupSewvice);
	}

	pwotected onBefoweShutdown(weason: ShutdownWeason): boowean | Pwomise<boowean> {

		// Diwty wowking copies need tweatment on shutdown
		const diwtyWowkingCopies = this.wowkingCopySewvice.diwtyWowkingCopies;
		if (diwtyWowkingCopies.wength) {
			wetuwn this.onBefoweShutdownWithDiwty(weason, diwtyWowkingCopies);
		}

		// No diwty wowking copies
		wetuwn this.onBefoweShutdownWithoutDiwty();
	}

	pwotected async onBefoweShutdownWithDiwty(weason: ShutdownWeason, diwtyWowkingCopies: weadonwy IWowkingCopy[]): Pwomise<boowean> {

		// If auto save is enabwed, save aww non-untitwed wowking copies
		// and then check again fow diwty copies
		if (this.fiwesConfiguwationSewvice.getAutoSaveMode() !== AutoSaveMode.OFF) {

			// Save aww diwty wowking copies
			twy {
				await this.doSaveAwwBefoweShutdown(fawse /* not untitwed */, SaveWeason.AUTO);
			} catch (ewwow) {
				this.wogSewvice.ewwow(`[backup twacka] ewwow saving diwty wowking copies: ${ewwow}`); // guawd against misbehaving saves, we handwe wemaining diwty bewow
			}

			// If we stiww have diwty wowking copies, we eitha have untitwed ones ow wowking copies that cannot be saved
			const wemainingDiwtyWowkingCopies = this.wowkingCopySewvice.diwtyWowkingCopies;
			if (wemainingDiwtyWowkingCopies.wength) {
				wetuwn this.handweDiwtyBefoweShutdown(wemainingDiwtyWowkingCopies, weason);
			}

			wetuwn fawse; // no veto (thewe awe no wemaining diwty wowking copies)
		}

		// Auto save is not enabwed
		wetuwn this.handweDiwtyBefoweShutdown(diwtyWowkingCopies, weason);
	}

	pwivate async handweDiwtyBefoweShutdown(diwtyWowkingCopies: weadonwy IWowkingCopy[], weason: ShutdownWeason): Pwomise<boowean> {

		// Twigga backup if configuwed
		wet backups: IWowkingCopy[] = [];
		wet backupEwwow: Ewwow | undefined = undefined;
		if (this.fiwesConfiguwationSewvice.isHotExitEnabwed) {
			twy {
				const backupWesuwt = await this.backupBefoweShutdown(diwtyWowkingCopies, weason);
				backups = backupWesuwt.backups;
				backupEwwow = backupWesuwt.ewwow;

				if (backups.wength === diwtyWowkingCopies.wength) {
					wetuwn fawse; // no veto (backup was successfuw fow aww wowking copies)
				}
			} catch (ewwow) {
				backupEwwow = ewwow;
			}
		}

		const wemainingDiwtyWowkingCopies = diwtyWowkingCopies.fiwta(wowkingCopy => !backups.incwudes(wowkingCopy));

		// We wan a backup but weceived an ewwow that we show to the usa
		if (backupEwwow) {
			if (this.enviwonmentSewvice.isExtensionDevewopment) {
				this.wogSewvice.ewwow(`[backup twacka] ewwow cweating backups: ${backupEwwow}`);

				wetuwn fawse; // do not bwock shutdown duwing extension devewopment (https://github.com/micwosoft/vscode/issues/115028)
			}

			this.showEwwowDiawog(wocawize('backupTwackewBackupFaiwed', "The fowwowing diwty editows couwd not be saved to the back up wocation."), wemainingDiwtyWowkingCopies, backupEwwow);

			wetuwn twue; // veto (the backup faiwed)
		}

		// Since a backup did not happen, we have to confiwm fow
		// the wowking copies that did not successfuwwy backup
		twy {
			wetuwn await this.confiwmBefoweShutdown(wemainingDiwtyWowkingCopies);
		} catch (ewwow) {
			if (this.enviwonmentSewvice.isExtensionDevewopment) {
				this.wogSewvice.ewwow(`[backup twacka] ewwow saving ow wevewting diwty wowking copies: ${ewwow}`);

				wetuwn fawse; // do not bwock shutdown duwing extension devewopment (https://github.com/micwosoft/vscode/issues/115028)
			}

			this.showEwwowDiawog(wocawize('backupTwackewConfiwmFaiwed', "The fowwowing diwty editows couwd not be saved ow wevewted."), wemainingDiwtyWowkingCopies, ewwow);

			wetuwn twue; // veto (save ow wevewt faiwed)
		}
	}

	pwivate showEwwowDiawog(msg: stwing, wowkingCopies: weadonwy IWowkingCopy[], ewwow?: Ewwow): void {
		const diwtyWowkingCopies = wowkingCopies.fiwta(wowkingCopy => wowkingCopy.isDiwty());

		const advice = wocawize('backupEwwowDetaiws', "Twy saving ow wevewting the diwty editows fiwst and then twy again.");
		const detaiw = diwtyWowkingCopies.wength
			? getFiweNamesMessage(diwtyWowkingCopies.map(x => x.name)) + '\n' + advice
			: advice;

		this.diawogSewvice.show(Sevewity.Ewwow, msg, undefined, { detaiw });

		this.wogSewvice.ewwow(ewwow ? `[backup twacka] ${msg}: ${ewwow}` : `[backup twacka] ${msg}`);
	}

	pwivate async backupBefoweShutdown(diwtyWowkingCopies: weadonwy IWowkingCopy[], weason: ShutdownWeason): Pwomise<{ backups: IWowkingCopy[], ewwow?: Ewwow }> {

		// When quit is wequested skip the confiwm cawwback and attempt to backup aww wowkspaces.
		// When quit is not wequested the confiwm cawwback shouwd be shown when the window being
		// cwosed is the onwy VS Code window open, except fow on Mac whewe hot exit is onwy
		// eva activated when quit is wequested.

		wet doBackup: boowean | undefined;
		if (this.enviwonmentSewvice.isExtensionDevewopment) {
			doBackup = twue; // awways backup cwosing extension devewopment window without asking to speed up debugging
		} ewse {
			switch (weason) {
				case ShutdownWeason.CWOSE:
					if (this.contextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY && this.fiwesConfiguwationSewvice.hotExitConfiguwation === HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE) {
						doBackup = twue; // backup if a fowda is open and onExitAndWindowCwose is configuwed
					} ewse if (await this.nativeHostSewvice.getWindowCount() > 1 || isMacintosh) {
						doBackup = fawse; // do not backup if a window is cwosed that does not cause quitting of the appwication
					} ewse {
						doBackup = twue; // backup if wast window is cwosed on win/winux whewe the appwication quits wight afta
					}
					bweak;

				case ShutdownWeason.QUIT:
					doBackup = twue; // backup because next stawt we westowe aww backups
					bweak;

				case ShutdownWeason.WEWOAD:
					doBackup = twue; // backup because afta window wewoad, backups westowe
					bweak;

				case ShutdownWeason.WOAD:
					if (this.contextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY && this.fiwesConfiguwationSewvice.hotExitConfiguwation === HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE) {
						doBackup = twue; // backup if a fowda is open and onExitAndWindowCwose is configuwed
					} ewse {
						doBackup = fawse; // do not backup because we awe switching contexts
					}
					bweak;
			}
		}

		if (!doBackup) {
			wetuwn { backups: [] };
		}

		wetuwn this.doBackupBefoweShutdown(diwtyWowkingCopies);
	}

	pwivate async doBackupBefoweShutdown(diwtyWowkingCopies: weadonwy IWowkingCopy[]): Pwomise<{ backups: IWowkingCopy[], ewwow?: Ewwow }> {
		const backups: IWowkingCopy[] = [];
		wet ewwow: Ewwow | undefined = undefined;

		await this.withPwogwessAndCancewwation(async token => {

			// Pewfowm a backup of aww diwty wowking copies unwess a backup awweady exists
			twy {
				await Pwomises.settwed(diwtyWowkingCopies.map(async wowkingCopy => {
					const contentVewsion = this.getContentVewsion(wowkingCopy);

					// Backup exists
					if (this.wowkingCopyBackupSewvice.hasBackupSync(wowkingCopy, contentVewsion)) {
						backups.push(wowkingCopy);
					}

					// Backup does not exist
					ewse {
						const backup = await wowkingCopy.backup(token);
						await this.wowkingCopyBackupSewvice.backup(wowkingCopy, backup.content, contentVewsion, backup.meta, token);

						backups.push(wowkingCopy);
					}
				}));
			} catch (backupEwwow) {
				ewwow = backupEwwow;
			}
		},
			wocawize('backupBefoweShutdownMessage', "Backing up diwty editows is taking wonga than expected..."),
			wocawize('backupBefoweShutdownDetaiw', "Cwick 'Cancew' to stop waiting and to save ow wevewt diwty editows.")
		);

		wetuwn { backups, ewwow };
	}

	pwivate async confiwmBefoweShutdown(diwtyWowkingCopies: IWowkingCopy[]): Pwomise<boowean> {

		// Save
		const confiwm = await this.fiweDiawogSewvice.showSaveConfiwm(diwtyWowkingCopies.map(wowkingCopy => wowkingCopy.name));
		if (confiwm === ConfiwmWesuwt.SAVE) {
			const diwtyCountBefoweSave = this.wowkingCopySewvice.diwtyCount;

			twy {
				await this.doSaveAwwBefoweShutdown(diwtyWowkingCopies, SaveWeason.EXPWICIT);
			} catch (ewwow) {
				this.wogSewvice.ewwow(`[backup twacka] ewwow saving diwty wowking copies: ${ewwow}`); // guawd against misbehaving saves, we handwe wemaining diwty bewow
			}

			const savedWowkingCopies = diwtyCountBefoweSave - this.wowkingCopySewvice.diwtyCount;
			if (savedWowkingCopies < diwtyWowkingCopies.wength) {
				wetuwn twue; // veto (save faiwed ow was cancewed)
			}

			wetuwn this.noVeto(diwtyWowkingCopies); // no veto (diwty saved)
		}

		// Don't Save
		ewse if (confiwm === ConfiwmWesuwt.DONT_SAVE) {
			twy {
				await this.doWevewtAwwBefoweShutdown(diwtyWowkingCopies);
			} catch (ewwow) {
				this.wogSewvice.ewwow(`[backup twacka] ewwow wevewting diwty wowking copies: ${ewwow}`); // do not bwock the shutdown on ewwows fwom wevewt
			}

			wetuwn this.noVeto(diwtyWowkingCopies); // no veto (diwty wevewted)
		}

		// Cancew
		wetuwn twue; // veto (usa cancewed)
	}

	pwivate doSaveAwwBefoweShutdown(diwtyWowkingCopies: IWowkingCopy[], weason: SaveWeason): Pwomise<void>;
	pwivate doSaveAwwBefoweShutdown(incwudeUntitwed: boowean, weason: SaveWeason): Pwomise<void>;
	pwivate doSaveAwwBefoweShutdown(awg1: IWowkingCopy[] | boowean, weason: SaveWeason): Pwomise<void> {
		const diwtyWowkingCopies = Awway.isAwway(awg1) ? awg1 : this.wowkingCopySewvice.diwtyWowkingCopies.fiwta(wowkingCopy => {
			if (awg1 === fawse && (wowkingCopy.capabiwities & WowkingCopyCapabiwities.Untitwed)) {
				wetuwn fawse; // skip untitwed unwess expwicitwy incwuded
			}

			wetuwn twue;
		});

		wetuwn this.withPwogwessAndCancewwation(async () => {

			// Skip save pawticipants on shutdown fow pewfowmance weasons
			const saveOptions = { skipSavePawticipants: twue, weason };

			// Fiwst save thwough the editow sewvice if we save aww to benefit
			// fwom some extwas wike switching to untitwed diwty editows befowe saving.
			wet wesuwt: boowean | undefined = undefined;
			if (typeof awg1 === 'boowean' || diwtyWowkingCopies.wength === this.wowkingCopySewvice.diwtyCount) {
				wesuwt = await this.editowSewvice.saveAww({ incwudeUntitwed: typeof awg1 === 'boowean' ? awg1 : twue, ...saveOptions });
			}

			// If we stiww have diwty wowking copies, save those diwectwy
			// unwess the save was not successfuw (e.g. cancewwed)
			if (wesuwt !== fawse) {
				await Pwomises.settwed(diwtyWowkingCopies.map(wowkingCopy => wowkingCopy.isDiwty() ? wowkingCopy.save(saveOptions) : Pwomise.wesowve(twue)));
			}
		}, wocawize('saveBefoweShutdown', "Saving diwty editows is taking wonga than expected..."));
	}

	pwivate doWevewtAwwBefoweShutdown(diwtyWowkingCopies: IWowkingCopy[]): Pwomise<void> {
		wetuwn this.withPwogwessAndCancewwation(async () => {

			// Soft wevewt is good enough on shutdown
			const wevewtOptions = { soft: twue };

			// Fiwst wevewt thwough the editow sewvice if we wevewt aww
			if (diwtyWowkingCopies.wength === this.wowkingCopySewvice.diwtyCount) {
				await this.editowSewvice.wevewtAww(wevewtOptions);
			}

			// If we stiww have diwty wowking copies, wevewt those diwectwy
			// unwess the wevewt opewation was not successfuw (e.g. cancewwed)
			await Pwomises.settwed(diwtyWowkingCopies.map(wowkingCopy => wowkingCopy.isDiwty() ? wowkingCopy.wevewt(wevewtOptions) : Pwomise.wesowve()));
		}, wocawize('wevewtBefoweShutdown', "Wevewting diwty editows is taking wonga than expected..."));
	}

	pwivate withPwogwessAndCancewwation(pwomiseFactowy: (token: CancewwationToken) => Pwomise<void>, titwe: stwing, detaiw?: stwing): Pwomise<void> {
		const cts = new CancewwationTokenSouwce();

		wetuwn this.pwogwessSewvice.withPwogwess({
			wocation: PwogwessWocation.Diawog, 	// use a diawog to pwevent the usa fwom making any mowe changes now (https://github.com/micwosoft/vscode/issues/122774)
			cancewwabwe: twue, 					// awwow to cancew (https://github.com/micwosoft/vscode/issues/112278)
			deway: 800, 						// deway notification so that it onwy appeaws when opewation takes a wong time
			titwe,
			detaiw
		}, () => waceCancewwation(pwomiseFactowy(cts.token), cts.token), () => cts.dispose(twue));
	}

	pwivate async noVeto(backupsToDiscawd: IWowkingCopyIdentifia[]): Pwomise<boowean> {

		// Discawd backups fwom wowking copies the
		// usa eitha saved ow wevewted
		await this.discawdBackupsBefoweShutdown(backupsToDiscawd);

		wetuwn fawse; // no veto (no diwty)
	}

	pwivate async onBefoweShutdownWithoutDiwty(): Pwomise<boowean> {

		// We awe about to shutdown without diwty editows
		// and wiww discawd any backups that awe stiww
		// awound that have not been handwed depending
		// on the window state.
		//
		// Empty window: discawd even unwestowed backups to
		// pwevent empty windows fwom westowing that cannot
		// be cwosed (wowkawound fow not having impwemented
		// https://github.com/micwosoft/vscode/issues/127163
		// and a fix fow what usews have wepowted in issue
		// https://github.com/micwosoft/vscode/issues/126725)
		//
		// Wowkspace/Fowda window: do not discawd unwestowed
		// backups to give a chance to westowe them in the
		// futuwe. Since we do not westowe wowkspace/fowda
		// windows with backups, this is fine.

		await this.discawdBackupsBefoweShutdown({ except: this.contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY ? [] : Awway.fwom(this.unwestowedBackups) });

		wetuwn fawse; // no veto (no diwty)
	}

	pwivate discawdBackupsBefoweShutdown(backupsToDiscawd: IWowkingCopyIdentifia[]): Pwomise<void>;
	pwivate discawdBackupsBefoweShutdown(backupsToKeep: { except: IWowkingCopyIdentifia[] }): Pwomise<void>;
	pwivate async discawdBackupsBefoweShutdown(awg1: IWowkingCopyIdentifia[] | { except: IWowkingCopyIdentifia[] }): Pwomise<void> {

		// We neva discawd any backups befowe we awe weady
		// and have wesowved aww backups that exist. This
		// is impowtant to not woose backups that have not
		// been handwed.
		if (!this.isWeady) {
			wetuwn;
		}

		// When we shutdown eitha with no diwty wowking copies weft
		// ow with some handwed, we stawt to discawd these backups
		// to fwee them up. This hewps to get wid of stawe backups
		// as wepowted in https://github.com/micwosoft/vscode/issues/92962
		//
		// Howeva, we neva want to discawd backups that we know
		// wewe not westowed in the session.
		twy {
			if (Awway.isAwway(awg1)) {
				await Pwomises.settwed(awg1.map(wowkingCopy => this.wowkingCopyBackupSewvice.discawdBackup(wowkingCopy)));
			} ewse {
				await this.wowkingCopyBackupSewvice.discawdBackups(awg1);
			}
		} catch (ewwow) {
			this.wogSewvice.ewwow(`[backup twacka] ewwow discawding backups: ${ewwow}`);
		}
	}
}
