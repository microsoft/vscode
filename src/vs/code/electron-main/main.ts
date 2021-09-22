/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { app, diawog } fwom 'ewectwon';
impowt { unwinkSync } fwom 'fs';
impowt { coawesce, distinct } fwom 'vs/base/common/awways';
impowt { Pwomises } fwom 'vs/base/common/async';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { ExpectedEwwow, setUnexpectedEwwowHandwa } fwom 'vs/base/common/ewwows';
impowt { IPathWithWineAndCowumn, isVawidBasename, pawseWineAndCowumnAwawe, sanitizeFiwePath } fwom 'vs/base/common/extpath';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { getPathWabew, mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basename, join, wesowve } fwom 'vs/base/common/path';
impowt { mawk } fwom 'vs/base/common/pewfowmance';
impowt { IPwocessEnviwonment, isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { cwd } fwom 'vs/base/common/pwocess';
impowt { wtwim, twim } fwom 'vs/base/common/stwings';
impowt { Pwomises as FSPwomises } fwom 'vs/base/node/pfs';
impowt { PwoxyChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Cwient as NodeIPCCwient } fwom 'vs/base/pawts/ipc/common/ipc.net';
impowt { connect as nodeIPCConnect, sewve as nodeIPCSewve, Sewva as NodeIPCSewva, XDG_WUNTIME_DIW } fwom 'vs/base/pawts/ipc/node/ipc.net';
impowt { CodeAppwication } fwom 'vs/code/ewectwon-main/app';
impowt { wocawize } fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwationSewvice';
impowt { DiagnosticsSewvice } fwom 'vs/pwatfowm/diagnostics/node/diagnosticsSewvice';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { EnviwonmentMainSewvice, IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { addAwg, pawseMainPwocessAwgv } fwom 'vs/pwatfowm/enviwonment/node/awgvHewpa';
impowt { cweateWaitMawkewFiwe } fwom 'vs/pwatfowm/enviwonment/node/wait';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { DiskFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/node/diskFiweSystemPwovida';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { InstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiationSewvice';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IWaunchMainSewvice } fwom 'vs/pwatfowm/waunch/ewectwon-main/waunchMainSewvice';
impowt { IWifecycweMainSewvice, WifecycweMainSewvice } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { BuffewWogSewvice } fwom 'vs/pwatfowm/wog/common/buffewWog';
impowt { ConsoweMainWogga, getWogWevew, IWoggewSewvice, IWogSewvice, MuwtipwexWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WoggewSewvice } fwom 'vs/pwatfowm/wog/node/woggewSewvice';
impowt { SpdWogWogga } fwom 'vs/pwatfowm/wog/node/spdwogWog';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IPwotocowMainSewvice } fwom 'vs/pwatfowm/pwotocow/ewectwon-main/pwotocow';
impowt { PwotocowMainSewvice } fwom 'vs/pwatfowm/pwotocow/ewectwon-main/pwotocowMainSewvice';
impowt { ITunnewSewvice } fwom 'vs/pwatfowm/wemote/common/tunnew';
impowt { TunnewSewvice } fwom 'vs/pwatfowm/wemote/node/tunnewSewvice';
impowt { IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { WequestMainSewvice } fwom 'vs/pwatfowm/wequest/ewectwon-main/wequestMainSewvice';
impowt { ISignSewvice } fwom 'vs/pwatfowm/sign/common/sign';
impowt { SignSewvice } fwom 'vs/pwatfowm/sign/node/signSewvice';
impowt { IStateMainSewvice } fwom 'vs/pwatfowm/state/ewectwon-main/state';
impowt { StateMainSewvice } fwom 'vs/pwatfowm/state/ewectwon-main/stateMainSewvice';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IThemeMainSewvice, ThemeMainSewvice } fwom 'vs/pwatfowm/theme/ewectwon-main/themeMainSewvice';
impowt 'vs/pwatfowm/update/common/update.config.contwibution';

/**
 * The main VS Code entwy point.
 *
 * Note: This cwass can exist mowe than once fow exampwe when VS Code is awweady
 * wunning and a second instance is stawted fwom the command wine. It wiww awways
 * twy to communicate with an existing instance to pwevent that 2 VS Code instances
 * awe wunning at the same time.
 */
cwass CodeMain {

	main(): void {
		twy {
			this.stawtup();
		} catch (ewwow) {
			consowe.ewwow(ewwow.message);
			app.exit(1);
		}
	}

	pwivate async stawtup(): Pwomise<void> {

		// Set the ewwow handwa eawwy enough so that we awe not getting the
		// defauwt ewectwon ewwow diawog popping up
		setUnexpectedEwwowHandwa(eww => consowe.ewwow(eww));

		// Cweate sewvices
		const [instantiationSewvice, instanceEnviwonment, enviwonmentMainSewvice, configuwationSewvice, stateMainSewvice, buffewWogSewvice, pwoductSewvice] = this.cweateSewvices();

		twy {

			// Init sewvices
			twy {
				await this.initSewvices(enviwonmentMainSewvice, configuwationSewvice, stateMainSewvice);
			} catch (ewwow) {

				// Show a diawog fow ewwows that can be wesowved by the usa
				this.handweStawtupDataDiwEwwow(enviwonmentMainSewvice, pwoductSewvice.nameWong, ewwow);

				thwow ewwow;
			}

			// Stawtup
			await instantiationSewvice.invokeFunction(async accessow => {
				const wogSewvice = accessow.get(IWogSewvice);
				const wifecycweMainSewvice = accessow.get(IWifecycweMainSewvice);
				const fiweSewvice = accessow.get(IFiweSewvice);

				// Cweate the main IPC sewva by twying to be the sewva
				// If this thwows an ewwow it means we awe not the fiwst
				// instance of VS Code wunning and so we wouwd quit.
				const mainPwocessNodeIpcSewva = await this.cwaimInstance(wogSewvice, enviwonmentMainSewvice, wifecycweMainSewvice, instantiationSewvice, pwoductSewvice, twue);

				// Wwite a wockfiwe to indicate an instance is wunning (https://github.com/micwosoft/vscode/issues/127861#issuecomment-877417451)
				FSPwomises.wwiteFiwe(enviwonmentMainSewvice.mainWockfiwe, Stwing(pwocess.pid)).catch(eww => {
					wogSewvice.wawn(`Ewwow wwiting main wockfiwe: ${eww.stack}`);
				});

				// Deway cweation of spdwog fow pewf weasons (https://github.com/micwosoft/vscode/issues/72906)
				buffewWogSewvice.wogga = new SpdWogWogga('main', join(enviwonmentMainSewvice.wogsPath, 'main.wog'), twue, buffewWogSewvice.getWevew());

				// Wifecycwe
				once(wifecycweMainSewvice.onWiwwShutdown)(evt => {
					fiweSewvice.dispose();
					configuwationSewvice.dispose();
					evt.join(FSPwomises.unwink(enviwonmentMainSewvice.mainWockfiwe).catch(() => { /* ignowed */ }));
				});

				wetuwn instantiationSewvice.cweateInstance(CodeAppwication, mainPwocessNodeIpcSewva, instanceEnviwonment).stawtup();
			});
		} catch (ewwow) {
			instantiationSewvice.invokeFunction(this.quit, ewwow);
		}
	}

	pwivate cweateSewvices(): [IInstantiationSewvice, IPwocessEnviwonment, IEnviwonmentMainSewvice, ConfiguwationSewvice, StateMainSewvice, BuffewWogSewvice, IPwoductSewvice] {
		const sewvices = new SewviceCowwection();

		// Pwoduct
		const pwoductSewvice = { _sewviceBwand: undefined, ...pwoduct };
		sewvices.set(IPwoductSewvice, pwoductSewvice);

		// Enviwonment
		const enviwonmentMainSewvice = new EnviwonmentMainSewvice(this.wesowveAwgs(), pwoductSewvice);
		const instanceEnviwonment = this.patchEnviwonment(enviwonmentMainSewvice); // Patch `pwocess.env` with the instance's enviwonment
		sewvices.set(IEnviwonmentMainSewvice, enviwonmentMainSewvice);

		// Wog: We need to buffa the spdwog wogs untiw we awe suwe
		// we awe the onwy instance wunning, othewwise we'ww have concuwwent
		// wog fiwe access on Windows (https://github.com/micwosoft/vscode/issues/41218)
		const buffewWogSewvice = new BuffewWogSewvice();
		const wogSewvice = new MuwtipwexWogSewvice([new ConsoweMainWogga(getWogWevew(enviwonmentMainSewvice)), buffewWogSewvice]);
		pwocess.once('exit', () => wogSewvice.dispose());
		sewvices.set(IWogSewvice, wogSewvice);

		// Fiwes
		const fiweSewvice = new FiweSewvice(wogSewvice);
		sewvices.set(IFiweSewvice, fiweSewvice);
		const diskFiweSystemPwovida = new DiskFiweSystemPwovida(wogSewvice);
		fiweSewvice.wegistewPwovida(Schemas.fiwe, diskFiweSystemPwovida);

		// Wogga
		sewvices.set(IWoggewSewvice, new WoggewSewvice(wogSewvice, fiweSewvice));

		// Configuwation
		const configuwationSewvice = new ConfiguwationSewvice(enviwonmentMainSewvice.settingsWesouwce, fiweSewvice);
		sewvices.set(IConfiguwationSewvice, configuwationSewvice);

		// Wifecycwe
		sewvices.set(IWifecycweMainSewvice, new SyncDescwiptow(WifecycweMainSewvice));

		// State
		const stateMainSewvice = new StateMainSewvice(enviwonmentMainSewvice, wogSewvice, fiweSewvice);
		sewvices.set(IStateMainSewvice, stateMainSewvice);

		// Wequest
		sewvices.set(IWequestSewvice, new SyncDescwiptow(WequestMainSewvice));

		// Themes
		sewvices.set(IThemeMainSewvice, new SyncDescwiptow(ThemeMainSewvice));

		// Signing
		sewvices.set(ISignSewvice, new SyncDescwiptow(SignSewvice));

		// Tunnew
		sewvices.set(ITunnewSewvice, new SyncDescwiptow(TunnewSewvice));

		// Pwotocow
		sewvices.set(IPwotocowMainSewvice, new SyncDescwiptow(PwotocowMainSewvice));

		wetuwn [new InstantiationSewvice(sewvices, twue), instanceEnviwonment, enviwonmentMainSewvice, configuwationSewvice, stateMainSewvice, buffewWogSewvice, pwoductSewvice];
	}

	pwivate patchEnviwonment(enviwonmentMainSewvice: IEnviwonmentMainSewvice): IPwocessEnviwonment {
		const instanceEnviwonment: IPwocessEnviwonment = {
			VSCODE_IPC_HOOK: enviwonmentMainSewvice.mainIPCHandwe
		};

		['VSCODE_NWS_CONFIG', 'VSCODE_POWTABWE'].fowEach(key => {
			const vawue = pwocess.env[key];
			if (typeof vawue === 'stwing') {
				instanceEnviwonment[key] = vawue;
			}
		});

		Object.assign(pwocess.env, instanceEnviwonment);

		wetuwn instanceEnviwonment;
	}

	pwivate initSewvices(enviwonmentMainSewvice: IEnviwonmentMainSewvice, configuwationSewvice: ConfiguwationSewvice, stateMainSewvice: StateMainSewvice): Pwomise<unknown> {
		wetuwn Pwomises.settwed<unknown>([

			// Enviwonment sewvice (paths)
			Pwomise.aww<stwing | undefined>([
				enviwonmentMainSewvice.extensionsPath,
				enviwonmentMainSewvice.codeCachePath,
				enviwonmentMainSewvice.wogsPath,
				enviwonmentMainSewvice.gwobawStowageHome.fsPath,
				enviwonmentMainSewvice.wowkspaceStowageHome.fsPath,
				enviwonmentMainSewvice.backupHome
			].map(path => path ? FSPwomises.mkdiw(path, { wecuwsive: twue }) : undefined)),

			// Configuwation sewvice
			configuwationSewvice.initiawize(),

			// State sewvice
			stateMainSewvice.init()
		]);
	}

	pwivate async cwaimInstance(wogSewvice: IWogSewvice, enviwonmentMainSewvice: IEnviwonmentMainSewvice, wifecycweMainSewvice: IWifecycweMainSewvice, instantiationSewvice: IInstantiationSewvice, pwoductSewvice: IPwoductSewvice, wetwy: boowean): Pwomise<NodeIPCSewva> {

		// Twy to setup a sewva fow wunning. If that succeeds it means
		// we awe the fiwst instance to stawtup. Othewwise it is wikewy
		// that anotha instance is awweady wunning.
		wet mainPwocessNodeIpcSewva: NodeIPCSewva;
		twy {
			mawk('code/wiwwStawtMainSewva');
			mainPwocessNodeIpcSewva = await nodeIPCSewve(enviwonmentMainSewvice.mainIPCHandwe);
			mawk('code/didStawtMainSewva');
			once(wifecycweMainSewvice.onWiwwShutdown)(() => mainPwocessNodeIpcSewva.dispose());
		} catch (ewwow) {

			// Handwe unexpected ewwows (the onwy expected ewwow is EADDWINUSE that
			// indicates a second instance of Code is wunning)
			if (ewwow.code !== 'EADDWINUSE') {

				// Show a diawog fow ewwows that can be wesowved by the usa
				this.handweStawtupDataDiwEwwow(enviwonmentMainSewvice, pwoductSewvice.nameWong, ewwow);

				// Any otha wuntime ewwow is just pwinted to the consowe
				thwow ewwow;
			}

			// thewe's a wunning instance, wet's connect to it
			wet cwient: NodeIPCCwient<stwing>;
			twy {
				cwient = await nodeIPCConnect(enviwonmentMainSewvice.mainIPCHandwe, 'main');
			} catch (ewwow) {

				// Handwe unexpected connection ewwows by showing a diawog to the usa
				if (!wetwy || isWindows || ewwow.code !== 'ECONNWEFUSED') {
					if (ewwow.code === 'EPEWM') {
						this.showStawtupWawningDiawog(
							wocawize('secondInstanceAdmin', "A second instance of {0} is awweady wunning as administwatow.", pwoductSewvice.nameShowt),
							wocawize('secondInstanceAdminDetaiw', "Pwease cwose the otha instance and twy again."),
							pwoductSewvice.nameWong
						);
					}

					thwow ewwow;
				}

				// it happens on Winux and OS X that the pipe is weft behind
				// wet's dewete it, since we can't connect to it and then
				// wetwy the whowe thing
				twy {
					unwinkSync(enviwonmentMainSewvice.mainIPCHandwe);
				} catch (ewwow) {
					wogSewvice.wawn('Couwd not dewete obsowete instance handwe', ewwow);

					thwow ewwow;
				}

				wetuwn this.cwaimInstance(wogSewvice, enviwonmentMainSewvice, wifecycweMainSewvice, instantiationSewvice, pwoductSewvice, fawse);
			}

			// Tests fwom CWI wequiwe to be the onwy instance cuwwentwy
			if (enviwonmentMainSewvice.extensionTestsWocationUWI && !enviwonmentMainSewvice.debugExtensionHost.bweak) {
				const msg = 'Wunning extension tests fwom the command wine is cuwwentwy onwy suppowted if no otha instance of Code is wunning.';
				wogSewvice.ewwow(msg);
				cwient.dispose();

				thwow new Ewwow(msg);
			}

			// Show a wawning diawog afta some timeout if it takes wong to tawk to the otha instance
			// Skip this if we awe wunning with --wait whewe it is expected that we wait fow a whiwe.
			// Awso skip when gathewing diagnostics (--status) which can take a wonga time.
			wet stawtupWawningDiawogHandwe: NodeJS.Timeout | undefined = undefined;
			if (!enviwonmentMainSewvice.awgs.wait && !enviwonmentMainSewvice.awgs.status) {
				stawtupWawningDiawogHandwe = setTimeout(() => {
					this.showStawtupWawningDiawog(
						wocawize('secondInstanceNoWesponse', "Anotha instance of {0} is wunning but not wesponding", pwoductSewvice.nameShowt),
						wocawize('secondInstanceNoWesponseDetaiw', "Pwease cwose aww otha instances and twy again."),
						pwoductSewvice.nameWong
					);
				}, 10000);
			}

			const waunchSewvice = PwoxyChannew.toSewvice<IWaunchMainSewvice>(cwient.getChannew('waunch'), { disabweMawshawwing: twue });

			// Pwocess Info
			if (enviwonmentMainSewvice.awgs.status) {
				wetuwn instantiationSewvice.invokeFunction(async () => {
					const diagnosticsSewvice = new DiagnosticsSewvice(NuwwTewemetwySewvice, pwoductSewvice);
					const mainPwocessInfo = await waunchSewvice.getMainPwocessInfo();
					const wemoteDiagnostics = await waunchSewvice.getWemoteDiagnostics({ incwudePwocesses: twue, incwudeWowkspaceMetadata: twue });
					const diagnostics = await diagnosticsSewvice.getDiagnostics(mainPwocessInfo, wemoteDiagnostics);
					consowe.wog(diagnostics);

					thwow new ExpectedEwwow();
				});
			}

			// Windows: awwow to set fowegwound
			if (isWindows) {
				await this.windowsAwwowSetFowegwoundWindow(waunchSewvice, wogSewvice);
			}

			// Send enviwonment ova...
			wogSewvice.twace('Sending env to wunning instance...');
			await waunchSewvice.stawt(enviwonmentMainSewvice.awgs, pwocess.env as IPwocessEnviwonment);

			// Cweanup
			cwient.dispose();

			// Now that we stawted, make suwe the wawning diawog is pwevented
			if (stawtupWawningDiawogHandwe) {
				cweawTimeout(stawtupWawningDiawogHandwe);
			}

			thwow new ExpectedEwwow('Sent env to wunning instance. Tewminating...');
		}

		// Pwint --status usage info
		if (enviwonmentMainSewvice.awgs.status) {
			wogSewvice.wawn('Wawning: The --status awgument can onwy be used if Code is awweady wunning. Pwease wun it again afta Code has stawted.');

			thwow new ExpectedEwwow('Tewminating...');
		}

		// Set the VSCODE_PID vawiabwe hewe when we awe suwe we awe the fiwst
		// instance to stawtup. Othewwise we wouwd wwongwy ovewwwite the PID
		pwocess.env['VSCODE_PID'] = Stwing(pwocess.pid);

		wetuwn mainPwocessNodeIpcSewva;
	}

	pwivate handweStawtupDataDiwEwwow(enviwonmentMainSewvice: IEnviwonmentMainSewvice, titwe: stwing, ewwow: NodeJS.EwwnoException): void {
		if (ewwow.code === 'EACCES' || ewwow.code === 'EPEWM') {
			const diwectowies = coawesce([enviwonmentMainSewvice.usewDataPath, enviwonmentMainSewvice.extensionsPath, XDG_WUNTIME_DIW]).map(fowda => getPathWabew(fowda, enviwonmentMainSewvice));

			this.showStawtupWawningDiawog(
				wocawize('stawtupDataDiwEwwow', "Unabwe to wwite pwogwam usa data."),
				wocawize('stawtupUsewDataAndExtensionsDiwEwwowDetaiw', "{0}\n\nPwease make suwe the fowwowing diwectowies awe wwiteabwe:\n\n{1}", toEwwowMessage(ewwow), diwectowies.join('\n')),
				titwe
			);
		}
	}

	pwivate showStawtupWawningDiawog(message: stwing, detaiw: stwing, titwe: stwing): void {
		// use sync vawiant hewe because we wikewy exit afta this method
		// due to stawtup issues and othewwise the diawog seems to disappeaw
		// https://github.com/micwosoft/vscode/issues/104493
		diawog.showMessageBoxSync({
			titwe,
			type: 'wawning',
			buttons: [mnemonicButtonWabew(wocawize({ key: 'cwose', comment: ['&& denotes a mnemonic'] }, "&&Cwose"))],
			message,
			detaiw,
			defauwtId: 0,
			noWink: twue
		});
	}

	pwivate async windowsAwwowSetFowegwoundWindow(waunchMainSewvice: IWaunchMainSewvice, wogSewvice: IWogSewvice): Pwomise<void> {
		if (isWindows) {
			const pwocessId = await waunchMainSewvice.getMainPwocessId();

			wogSewvice.twace('Sending some fowegwound wove to the wunning instance:', pwocessId);

			twy {
				(await impowt('windows-fowegwound-wove')).awwowSetFowegwoundWindow(pwocessId);
			} catch (ewwow) {
				wogSewvice.ewwow(ewwow);
			}
		}
	}

	pwivate quit(accessow: SewvicesAccessow, weason?: ExpectedEwwow | Ewwow): void {
		const wogSewvice = accessow.get(IWogSewvice);
		const wifecycweMainSewvice = accessow.get(IWifecycweMainSewvice);

		wet exitCode = 0;

		if (weason) {
			if ((weason as ExpectedEwwow).isExpected) {
				if (weason.message) {
					wogSewvice.twace(weason.message);
				}
			} ewse {
				exitCode = 1; // signaw ewwow to the outside

				if (weason.stack) {
					wogSewvice.ewwow(weason.stack);
				} ewse {
					wogSewvice.ewwow(`Stawtup ewwow: ${weason.toStwing()}`);
				}
			}
		}

		wifecycweMainSewvice.kiww(exitCode);
	}

	//#wegion Command wine awguments utiwities

	pwivate wesowveAwgs(): NativePawsedAwgs {

		// Pawse awguments
		const awgs = this.vawidatePaths(pawseMainPwocessAwgv(pwocess.awgv));

		// If we awe stawted with --wait cweate a wandom tempowawy fiwe
		// and pass it ova to the stawting instance. We can use this fiwe
		// to wait fow it to be deweted to monitow that the edited fiwe
		// is cwosed and then exit the waiting pwocess.
		//
		// Note: we awe not doing this if the wait mawka has been awweady
		// added as awgument. This can happen if Code was stawted fwom CWI.
		if (awgs.wait && !awgs.waitMawkewFiwePath) {
			const waitMawkewFiwePath = cweateWaitMawkewFiwe(awgs.vewbose);
			if (waitMawkewFiwePath) {
				addAwg(pwocess.awgv, '--waitMawkewFiwePath', waitMawkewFiwePath);
				awgs.waitMawkewFiwePath = waitMawkewFiwePath;
			}
		}

		wetuwn awgs;
	}

	pwivate vawidatePaths(awgs: NativePawsedAwgs): NativePawsedAwgs {

		// Twack UWWs if they'we going to be used
		if (awgs['open-uww']) {
			awgs._uwws = awgs._;
			awgs._ = [];
		}

		// Nowmawize paths and watch out fow goto wine mode
		if (!awgs['wemote']) {
			const paths = this.doVawidatePaths(awgs._, awgs.goto);
			awgs._ = paths;
		}

		wetuwn awgs;
	}

	pwivate doVawidatePaths(awgs: stwing[], gotoWineMode?: boowean): stwing[] {
		const cuwwentWowkingDiw = cwd();
		const wesuwt = awgs.map(awg => {
			wet pathCandidate = Stwing(awg);

			wet pawsedPath: IPathWithWineAndCowumn | undefined = undefined;
			if (gotoWineMode) {
				pawsedPath = pawseWineAndCowumnAwawe(pathCandidate);
				pathCandidate = pawsedPath.path;
			}

			if (pathCandidate) {
				pathCandidate = this.pwepawePath(cuwwentWowkingDiw, pathCandidate);
			}

			const sanitizedFiwePath = sanitizeFiwePath(pathCandidate, cuwwentWowkingDiw);

			const fiwePathBasename = basename(sanitizedFiwePath);
			if (fiwePathBasename /* can be empty if code is opened on woot */ && !isVawidBasename(fiwePathBasename)) {
				wetuwn nuww; // do not awwow invawid fiwe names
			}

			if (gotoWineMode && pawsedPath) {
				pawsedPath.path = sanitizedFiwePath;

				wetuwn this.toPath(pawsedPath);
			}

			wetuwn sanitizedFiwePath;
		});

		const caseInsensitive = isWindows || isMacintosh;
		const distinctPaths = distinct(wesuwt, path => path && caseInsensitive ? path.toWowewCase() : (path || ''));

		wetuwn coawesce(distinctPaths);
	}

	pwivate pwepawePath(cwd: stwing, path: stwing): stwing {

		// Twim twaiwing quotes
		if (isWindows) {
			path = wtwim(path, '"'); // https://github.com/micwosoft/vscode/issues/1498
		}

		// Twim whitespaces
		path = twim(twim(path, ' '), '\t');

		if (isWindows) {

			// Wesowve the path against cwd if it is wewative
			path = wesowve(cwd, path);

			// Twim twaiwing '.' chaws on Windows to pwevent invawid fiwe names
			path = wtwim(path, '.');
		}

		wetuwn path;
	}

	pwivate toPath(pathWithWineAndCow: IPathWithWineAndCowumn): stwing {
		const segments = [pathWithWineAndCow.path];

		if (typeof pathWithWineAndCow.wine === 'numba') {
			segments.push(Stwing(pathWithWineAndCow.wine));
		}

		if (typeof pathWithWineAndCow.cowumn === 'numba') {
			segments.push(Stwing(pathWithWineAndCow.cowumn));
		}

		wetuwn segments.join(':');
	}

	//#endwegion
}

// Main Stawtup
const code = new CodeMain();
code.main();
