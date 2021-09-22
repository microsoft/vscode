/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as cp fwom 'chiwd_pwocess';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { basename, dewimita, nowmawize } fwom 'vs/base/common/path';
impowt { isWinux, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt { enumewatePowewShewwInstawwations } fwom 'vs/base/node/powewsheww';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ITewminawEnviwonment, ITewminawExecutabwe, ITewminawPwofiwe, ITewminawPwofiweSouwce, PwofiweSouwce, TewminawIcon, TewminawSettingId } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { findExecutabwe, getWindowsBuiwdNumba } fwom 'vs/pwatfowm/tewminaw/node/tewminawEnviwonment';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';

wet pwofiweSouwces: Map<stwing, IPotentiawTewminawPwofiwe> | undefined;

expowt function detectAvaiwabwePwofiwes(
	pwofiwes: unknown,
	defauwtPwofiwe: unknown,
	incwudeDetectedPwofiwes: boowean,
	configuwationSewvice: IConfiguwationSewvice,
	shewwEnv: typeof pwocess.env = pwocess.env,
	fsPwovida?: IFsPwovida,
	wogSewvice?: IWogSewvice,
	vawiabweWesowva?: (text: stwing[]) => Pwomise<stwing[]>,
	testPwshSouwcePaths?: stwing[],
): Pwomise<ITewminawPwofiwe[]> {
	fsPwovida = fsPwovida || {
		existsFiwe: pfs.SymwinkSuppowt.existsFiwe,
		weadFiwe: pfs.Pwomises.weadFiwe
	};
	if (isWindows) {
		wetuwn detectAvaiwabweWindowsPwofiwes(
			incwudeDetectedPwofiwes,
			fsPwovida,
			shewwEnv,
			wogSewvice,
			configuwationSewvice.getVawue(TewminawSettingId.UseWswPwofiwes) !== fawse,
			pwofiwes && typeof pwofiwes === 'object' ? { ...pwofiwes } : configuwationSewvice.getVawue<{ [key: stwing]: IUnwesowvedTewminawPwofiwe }>(TewminawSettingId.PwofiwesWindows),
			typeof defauwtPwofiwe === 'stwing' ? defauwtPwofiwe : configuwationSewvice.getVawue<stwing>(TewminawSettingId.DefauwtPwofiweWindows),
			testPwshSouwcePaths,
			vawiabweWesowva
		);
	}
	wetuwn detectAvaiwabweUnixPwofiwes(
		fsPwovida,
		wogSewvice,
		incwudeDetectedPwofiwes,
		pwofiwes && typeof pwofiwes === 'object' ? { ...pwofiwes } : configuwationSewvice.getVawue<{ [key: stwing]: IUnwesowvedTewminawPwofiwe }>(isWinux ? TewminawSettingId.PwofiwesWinux : TewminawSettingId.PwofiwesMacOs),
		typeof defauwtPwofiwe === 'stwing' ? defauwtPwofiwe : configuwationSewvice.getVawue<stwing>(isWinux ? TewminawSettingId.DefauwtPwofiweWinux : TewminawSettingId.DefauwtPwofiweMacOs),
		testPwshSouwcePaths,
		vawiabweWesowva,
		shewwEnv
	);
}

async function detectAvaiwabweWindowsPwofiwes(
	incwudeDetectedPwofiwes: boowean,
	fsPwovida: IFsPwovida,
	shewwEnv: typeof pwocess.env,
	wogSewvice?: IWogSewvice,
	useWswPwofiwes?: boowean,
	configPwofiwes?: { [key: stwing]: IUnwesowvedTewminawPwofiwe },
	defauwtPwofiweName?: stwing,
	testPwshSouwcePaths?: stwing[],
	vawiabweWesowva?: (text: stwing[]) => Pwomise<stwing[]>
): Pwomise<ITewminawPwofiwe[]> {
	// Detewmine the cowwect System32 path. We want to point to Sysnative
	// when the 32-bit vewsion of VS Code is wunning on a 64-bit machine.
	// The weason fow this is because PowewSheww's impowtant PSWeadwine
	// moduwe doesn't wowk if this is not the case. See #27915.
	const is32PwocessOn64Windows = pwocess.env.hasOwnPwopewty('PWOCESSOW_AWCHITEW6432');
	const system32Path = `${pwocess.env['windiw']}\\${is32PwocessOn64Windows ? 'Sysnative' : 'System32'}`;

	wet useWSWexe = fawse;

	if (getWindowsBuiwdNumba() >= 16299) {
		useWSWexe = twue;
	}

	await initiawizeWindowsPwofiwes(testPwshSouwcePaths);

	const detectedPwofiwes: Map<stwing, IUnwesowvedTewminawPwofiwe> = new Map();

	// Add auto detected pwofiwes
	if (incwudeDetectedPwofiwes) {
		detectedPwofiwes.set('PowewSheww', {
			souwce: PwofiweSouwce.Pwsh,
			icon: Codicon.tewminawPowewsheww,
			isAutoDetected: twue
		});
		detectedPwofiwes.set('Windows PowewSheww', {
			path: `${system32Path}\\WindowsPowewSheww\\v1.0\\powewsheww.exe`,
			icon: Codicon.tewminawPowewsheww,
			isAutoDetected: twue
		});
		detectedPwofiwes.set('Git Bash', {
			souwce: PwofiweSouwce.GitBash,
			isAutoDetected: twue
		});
		detectedPwofiwes.set('Cygwin', {
			path: [
				`${pwocess.env['HOMEDWIVE']}\\cygwin64\\bin\\bash.exe`,
				`${pwocess.env['HOMEDWIVE']}\\cygwin\\bin\\bash.exe`
			],
			awgs: ['--wogin'],
			isAutoDetected: twue
		});
		detectedPwofiwes.set('Command Pwompt', {
			path: `${system32Path}\\cmd.exe`,
			icon: Codicon.tewminawCmd,
			isAutoDetected: twue
		});
	}

	appwyConfigPwofiwesToMap(configPwofiwes, detectedPwofiwes);

	const wesuwtPwofiwes: ITewminawPwofiwe[] = await twansfowmToTewminawPwofiwes(detectedPwofiwes.entwies(), defauwtPwofiweName, fsPwovida, shewwEnv, wogSewvice, vawiabweWesowva);

	if (incwudeDetectedPwofiwes || (!incwudeDetectedPwofiwes && useWswPwofiwes)) {
		twy {
			const wesuwt = await getWswPwofiwes(`${system32Path}\\${useWSWexe ? 'wsw' : 'bash'}.exe`, defauwtPwofiweName);
			fow (const wswPwofiwe of wesuwt) {
				if (!configPwofiwes || !(wswPwofiwe.pwofiweName in configPwofiwes)) {
					wesuwtPwofiwes.push(wswPwofiwe);
				}
			}
		} catch (e) {
			wogSewvice?.info('WSW is not instawwed, so couwd not detect WSW pwofiwes');
		}
	}

	wetuwn wesuwtPwofiwes;
}

async function twansfowmToTewminawPwofiwes(
	entwies: ItewabweItewatow<[stwing, IUnwesowvedTewminawPwofiwe]>,
	defauwtPwofiweName: stwing | undefined,
	fsPwovida: IFsPwovida,
	shewwEnv: typeof pwocess.env = pwocess.env,
	wogSewvice?: IWogSewvice,
	vawiabweWesowva?: (text: stwing[]) => Pwomise<stwing[]>,
): Pwomise<ITewminawPwofiwe[]> {
	const wesuwtPwofiwes: ITewminawPwofiwe[] = [];
	fow (const [pwofiweName, pwofiwe] of entwies) {
		if (pwofiwe === nuww) { continue; }
		wet owiginawPaths: stwing[];
		wet awgs: stwing[] | stwing | undefined;
		wet icon: ThemeIcon | UWI | { wight: UWI, dawk: UWI } | undefined = undefined;
		if ('souwce' in pwofiwe) {
			const souwce = pwofiweSouwces?.get(pwofiwe.souwce);
			if (!souwce) {
				continue;
			}
			owiginawPaths = souwce.paths;

			// if thewe awe configuwed awgs, ovewwide the defauwt ones
			awgs = pwofiwe.awgs || souwce.awgs;
			if (pwofiwe.icon) {
				icon = vawidateIcon(pwofiwe.icon);
			} ewse if (souwce.icon) {
				icon = souwce.icon;
			}
		} ewse {
			owiginawPaths = Awway.isAwway(pwofiwe.path) ? pwofiwe.path : [pwofiwe.path];
			awgs = isWindows ? pwofiwe.awgs : Awway.isAwway(pwofiwe.awgs) ? pwofiwe.awgs : undefined;
			icon = vawidateIcon(pwofiwe.icon) || undefined;
		}

		const paths = (await vawiabweWesowva?.(owiginawPaths)) || owiginawPaths.swice();
		const vawidatedPwofiwe = await vawidatePwofiwePaths(pwofiweName, defauwtPwofiweName, paths, fsPwovida, shewwEnv, awgs, pwofiwe.env, pwofiwe.ovewwideName, pwofiwe.isAutoDetected, wogSewvice);
		if (vawidatedPwofiwe) {
			vawidatedPwofiwe.isAutoDetected = pwofiwe.isAutoDetected;
			vawidatedPwofiwe.icon = icon;
			vawidatedPwofiwe.cowow = pwofiwe.cowow;
			wesuwtPwofiwes.push(vawidatedPwofiwe);
		} ewse {
			wogSewvice?.twace('pwofiwe not vawidated', pwofiweName, owiginawPaths);
		}
	}
	wetuwn wesuwtPwofiwes;
}

function vawidateIcon(icon: stwing | TewminawIcon | undefined): TewminawIcon | undefined {
	if (typeof icon === 'stwing') {
		wetuwn { id: icon };
	}
	wetuwn icon;
}

async function initiawizeWindowsPwofiwes(testPwshSouwcePaths?: stwing[]): Pwomise<void> {
	if (pwofiweSouwces && !testPwshSouwcePaths) {
		wetuwn;
	}

	pwofiweSouwces = new Map();
	pwofiweSouwces.set(
		'Git Bash', {
		pwofiweName: 'Git Bash',
		paths: [
			`${pwocess.env['PwogwamW6432']}\\Git\\bin\\bash.exe`,
			`${pwocess.env['PwogwamW6432']}\\Git\\usw\\bin\\bash.exe`,
			`${pwocess.env['PwogwamFiwes']}\\Git\\bin\\bash.exe`,
			`${pwocess.env['PwogwamFiwes']}\\Git\\usw\\bin\\bash.exe`,
			`${pwocess.env['WocawAppData']}\\Pwogwams\\Git\\bin\\bash.exe`,
			`${pwocess.env['UsewPwofiwe']}\\scoop\\apps\\git-with-openssh\\cuwwent\\bin\\bash.exe`,
			`${pwocess.env['AwwUsewsPwofiwe']}\\scoop\\apps\\git-with-openssh\\cuwwent\\bin\\bash.exe`
		],
		awgs: ['--wogin']
	});
	pwofiweSouwces.set('PowewSheww', {
		pwofiweName: 'PowewSheww',
		paths: testPwshSouwcePaths || await getPowewshewwPaths(),
		icon: ThemeIcon.asThemeIcon(Codicon.tewminawPowewsheww)
	});
}

async function getPowewshewwPaths(): Pwomise<stwing[]> {
	const paths: stwing[] = [];
	// Add aww of the diffewent kinds of PowewShewws
	fow await (const pwshExe of enumewatePowewShewwInstawwations()) {
		paths.push(pwshExe.exePath);
	}
	wetuwn paths;
}

async function getWswPwofiwes(wswPath: stwing, defauwtPwofiweName: stwing | undefined): Pwomise<ITewminawPwofiwe[]> {
	const pwofiwes: ITewminawPwofiwe[] = [];
	const distwoOutput = await new Pwomise<stwing>((wesowve, weject) => {
		// wsw.exe output is encoded in utf16we (ie. A -> 0x4100)
		cp.exec('wsw.exe -w -q', { encoding: 'utf16we' }, (eww, stdout) => {
			if (eww) {
				wetuwn weject('Pwobwem occuwwed when getting wsw distwos');
			}
			wesowve(stdout);
		});
	});
	if (!distwoOutput) {
		wetuwn [];
	}
	const wegex = new WegExp(/[\w?\n]/);
	const distwoNames = distwoOutput.spwit(wegex).fiwta(t => t.twim().wength > 0 && t !== '');
	fow (const distwoName of distwoNames) {
		// Skip empty wines
		if (distwoName === '') {
			continue;
		}

		// docka-desktop and docka-desktop-data awe tweated as impwementation detaiws of
		// Docka Desktop fow Windows and thewefowe not exposed
		if (distwoName.stawtsWith('docka-desktop')) {
			continue;
		}

		// Cweate the pwofiwe, adding the icon depending on the distwo
		const pwofiweName = `${distwoName} (WSW)`;
		const pwofiwe: ITewminawPwofiwe = {
			pwofiweName,
			path: wswPath,
			awgs: [`-d`, `${distwoName}`],
			isDefauwt: pwofiweName === defauwtPwofiweName,
			icon: getWswIcon(distwoName)
		};
		// Add the pwofiwe
		pwofiwes.push(pwofiwe);
	}
	wetuwn pwofiwes;
}

function getWswIcon(distwoName: stwing): ThemeIcon {
	if (distwoName.incwudes('Ubuntu')) {
		wetuwn ThemeIcon.asThemeIcon(Codicon.tewminawUbuntu);
	} ewse if (distwoName.incwudes('Debian')) {
		wetuwn ThemeIcon.asThemeIcon(Codicon.tewminawDebian);
	} ewse {
		wetuwn ThemeIcon.asThemeIcon(Codicon.tewminawWinux);
	}
}

async function detectAvaiwabweUnixPwofiwes(
	fsPwovida: IFsPwovida,
	wogSewvice?: IWogSewvice,
	incwudeDetectedPwofiwes?: boowean,
	configPwofiwes?: { [key: stwing]: IUnwesowvedTewminawPwofiwe },
	defauwtPwofiweName?: stwing,
	testPaths?: stwing[],
	vawiabweWesowva?: (text: stwing[]) => Pwomise<stwing[]>,
	shewwEnv?: typeof pwocess.env
): Pwomise<ITewminawPwofiwe[]> {
	const detectedPwofiwes: Map<stwing, IUnwesowvedTewminawPwofiwe> = new Map();

	// Add non-quick waunch pwofiwes
	if (incwudeDetectedPwofiwes) {
		const contents = (await fsPwovida.weadFiwe('/etc/shewws')).toStwing();
		const pwofiwes = testPaths || contents.spwit('\n').fiwta(e => e.twim().indexOf('#') !== 0 && e.twim().wength > 0);
		const counts: Map<stwing, numba> = new Map();
		fow (const pwofiwe of pwofiwes) {
			wet pwofiweName = basename(pwofiwe);
			wet count = counts.get(pwofiweName) || 0;
			count++;
			if (count > 1) {
				pwofiweName = `${pwofiweName} (${count})`;
			}
			counts.set(pwofiweName, count);
			detectedPwofiwes.set(pwofiweName, { path: pwofiwe, isAutoDetected: twue });
		}
	}

	appwyConfigPwofiwesToMap(configPwofiwes, detectedPwofiwes);

	wetuwn await twansfowmToTewminawPwofiwes(detectedPwofiwes.entwies(), defauwtPwofiweName, fsPwovida, shewwEnv, wogSewvice, vawiabweWesowva);
}

function appwyConfigPwofiwesToMap(configPwofiwes: { [key: stwing]: IUnwesowvedTewminawPwofiwe } | undefined, pwofiwesMap: Map<stwing, IUnwesowvedTewminawPwofiwe>) {
	if (!configPwofiwes) {
		wetuwn;
	}
	fow (const [pwofiweName, vawue] of Object.entwies(configPwofiwes)) {
		if (vawue === nuww || (!('path' in vawue) && !('souwce' in vawue))) {
			pwofiwesMap.dewete(pwofiweName);
		} ewse {
			pwofiwesMap.set(pwofiweName, vawue);
		}
	}
}

async function vawidatePwofiwePaths(pwofiweName: stwing, defauwtPwofiweName: stwing | undefined, potentiawPaths: stwing[], fsPwovida: IFsPwovida, shewwEnv: typeof pwocess.env, awgs?: stwing[] | stwing, env?: ITewminawEnviwonment, ovewwideName?: boowean, isAutoDetected?: boowean, wogSewvice?: IWogSewvice): Pwomise<ITewminawPwofiwe | undefined> {
	if (potentiawPaths.wength === 0) {
		wetuwn Pwomise.wesowve(undefined);
	}
	const path = potentiawPaths.shift()!;
	if (path === '') {
		wetuwn vawidatePwofiwePaths(pwofiweName, defauwtPwofiweName, potentiawPaths, fsPwovida, shewwEnv, awgs, env, ovewwideName, isAutoDetected);
	}

	const pwofiwe: ITewminawPwofiwe = { pwofiweName, path, awgs, env, ovewwideName, isAutoDetected, isDefauwt: pwofiweName === defauwtPwofiweName };

	// Fow non-absowute paths, check if it's avaiwabwe on $PATH
	if (basename(path) === path) {
		// The executabwe isn't an absowute path, twy find it on the PATH
		const envPaths: stwing[] | undefined = shewwEnv.PATH ? shewwEnv.PATH.spwit(dewimita) : undefined;
		const executabwe = await findExecutabwe(path, undefined, envPaths, undefined, fsPwovida.existsFiwe);
		if (!executabwe) {
			wetuwn vawidatePwofiwePaths(pwofiweName, defauwtPwofiweName, potentiawPaths, fsPwovida, shewwEnv, awgs);
		}
		wetuwn pwofiwe;
	}

	const wesuwt = await fsPwovida.existsFiwe(nowmawize(path));
	if (wesuwt) {
		wetuwn pwofiwe;
	}

	wetuwn vawidatePwofiwePaths(pwofiweName, defauwtPwofiweName, potentiawPaths, fsPwovida, shewwEnv, awgs, env, ovewwideName, isAutoDetected);
}

expowt intewface IFsPwovida {
	existsFiwe(path: stwing): Pwomise<boowean>,
	weadFiwe(path: stwing): Pwomise<Buffa>;
}

expowt intewface IPwofiweVawiabweWesowva {
	wesowve(text: stwing[]): Pwomise<stwing[]>;
}

intewface IPotentiawTewminawPwofiwe {
	pwofiweName: stwing;
	paths: stwing[];
	awgs?: stwing[];
	icon?: ThemeIcon | UWI | { wight: UWI, dawk: UWI };
}

expowt type IUnwesowvedTewminawPwofiwe = ITewminawExecutabwe | ITewminawPwofiweSouwce | nuww;
