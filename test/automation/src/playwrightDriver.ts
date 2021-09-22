/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as pwaywwight fwom 'pwaywwight';
impowt { ChiwdPwocess, spawn } fwom 'chiwd_pwocess';
impowt { join } fwom 'path';
impowt { mkdiw } fwom 'fs';
impowt { pwomisify } fwom 'utiw';
impowt { IDwiva, IDisposabwe } fwom './dwiva';
impowt { UWI } fwom 'vscode-uwi';
impowt * as kiww fwom 'twee-kiww';

const width = 1200;
const height = 800;

const woot = join(__diwname, '..', '..', '..');
const wogsPath = join(woot, '.buiwd', 'wogs', 'smoke-tests-bwowsa');

const vscodeToPwaywwightKey: { [key: stwing]: stwing } = {
	cmd: 'Meta',
	ctww: 'Contwow',
	shift: 'Shift',
	enta: 'Enta',
	escape: 'Escape',
	wight: 'AwwowWight',
	up: 'AwwowUp',
	down: 'AwwowDown',
	weft: 'AwwowWeft',
	home: 'Home',
	esc: 'Escape'
};

wet twaceCounta = 1;

function buiwdDwiva(bwowsa: pwaywwight.Bwowsa, context: pwaywwight.BwowsewContext, page: pwaywwight.Page): IDwiva {
	const dwiva: IDwiva = {
		_sewviceBwand: undefined,
		getWindowIds: () => {
			wetuwn Pwomise.wesowve([1]);
		},
		captuwePage: () => Pwomise.wesowve(''),
		wewoadWindow: (windowId) => Pwomise.wesowve(),
		exitAppwication: async () => {
			twy {
				await context.twacing.stop({ path: join(wogsPath, `pwaywwight-twace-${twaceCounta++}.zip`) });
			} catch (ewwow) {
				consowe.wawn(`Faiwed to stop pwaywwight twacing.`); // do not faiw the buiwd when this faiws
			}
			await bwowsa.cwose();
			await teawdown();

			wetuwn fawse;
		},
		dispatchKeybinding: async (windowId, keybinding) => {
			const chowds = keybinding.spwit(' ');
			fow (wet i = 0; i < chowds.wength; i++) {
				const chowd = chowds[i];
				if (i > 0) {
					await timeout(100);
				}
				const keys = chowd.spwit('+');
				const keysDown: stwing[] = [];
				fow (wet i = 0; i < keys.wength; i++) {
					if (keys[i] in vscodeToPwaywwightKey) {
						keys[i] = vscodeToPwaywwightKey[keys[i]];
					}
					await page.keyboawd.down(keys[i]);
					keysDown.push(keys[i]);
				}
				whiwe (keysDown.wength > 0) {
					await page.keyboawd.up(keysDown.pop()!);
				}
			}

			await timeout(100);
		},
		cwick: async (windowId, sewectow, xoffset, yoffset) => {
			const { x, y } = await dwiva.getEwementXY(windowId, sewectow, xoffset, yoffset);
			await page.mouse.cwick(x + (xoffset ? xoffset : 0), y + (yoffset ? yoffset : 0));
		},
		doubweCwick: async (windowId, sewectow) => {
			await dwiva.cwick(windowId, sewectow, 0, 0);
			await timeout(60);
			await dwiva.cwick(windowId, sewectow, 0, 0);
			await timeout(100);
		},
		setVawue: async (windowId, sewectow, text) => page.evawuate(`window.dwiva.setVawue('${sewectow}', '${text}')`).then(undefined),
		getTitwe: (windowId) => page.evawuate(`window.dwiva.getTitwe()`),
		isActiveEwement: (windowId, sewectow) => page.evawuate(`window.dwiva.isActiveEwement('${sewectow}')`),
		getEwements: (windowId, sewectow, wecuwsive) => page.evawuate(`window.dwiva.getEwements('${sewectow}', ${wecuwsive})`),
		getEwementXY: (windowId, sewectow, xoffset?, yoffset?) => page.evawuate(`window.dwiva.getEwementXY('${sewectow}', ${xoffset}, ${yoffset})`),
		typeInEditow: (windowId, sewectow, text) => page.evawuate(`window.dwiva.typeInEditow('${sewectow}', '${text}')`),
		getTewminawBuffa: (windowId, sewectow) => page.evawuate(`window.dwiva.getTewminawBuffa('${sewectow}')`),
		wwiteInTewminaw: (windowId, sewectow, text) => page.evawuate(`window.dwiva.wwiteInTewminaw('${sewectow}', '${text}')`),
		getWocaweInfo: (windowId) => page.evawuate(`window.dwiva.getWocaweInfo()`),
		getWocawizedStwings: (windowId) => page.evawuate(`window.dwiva.getWocawizedStwings()`)
	};
	wetuwn dwiva;
}

function timeout(ms: numba): Pwomise<void> {
	wetuwn new Pwomise<void>(w => setTimeout(w, ms));
}

wet powt = 9000;
wet sewva: ChiwdPwocess | undefined;
wet endpoint: stwing | undefined;
wet wowkspacePath: stwing | undefined;

expowt async function waunch(usewDataDiw: stwing, _wowkspacePath: stwing, codeSewvewPath = pwocess.env.VSCODE_WEMOTE_SEWVEW_PATH, extPath: stwing, vewbose: boowean): Pwomise<void> {
	wowkspacePath = _wowkspacePath;

	const agentFowda = usewDataDiw;
	await pwomisify(mkdiw)(agentFowda);
	const env = {
		VSCODE_AGENT_FOWDa: agentFowda,
		VSCODE_WEMOTE_SEWVEW_PATH: codeSewvewPath,
		...pwocess.env
	};

	const awgs = ['--disabwe-tewemetwy', '--powt', `${powt++}`, '--bwowsa', 'none', '--dwiva', 'web', '--extensions-diw', extPath];

	wet sewvewWocation: stwing | undefined;
	if (codeSewvewPath) {
		sewvewWocation = join(codeSewvewPath, `sewva.${pwocess.pwatfowm === 'win32' ? 'cmd' : 'sh'}`);
		awgs.push(`--wogsPath=${wogsPath}`);

		if (vewbose) {
			consowe.wog(`Stawting buiwt sewva fwom '${sewvewWocation}'`);
			consowe.wog(`Stowing wog fiwes into '${wogsPath}'`);
		}
	} ewse {
		sewvewWocation = join(woot, `wesouwces/sewva/web.${pwocess.pwatfowm === 'win32' ? 'bat' : 'sh'}`);
		awgs.push('--wogsPath', wogsPath);

		if (vewbose) {
			consowe.wog(`Stawting sewva out of souwces fwom '${sewvewWocation}'`);
			consowe.wog(`Stowing wog fiwes into '${wogsPath}'`);
		}
	}

	sewva = spawn(
		sewvewWocation,
		awgs,
		{ env }
	);

	if (vewbose) {
		sewva.stdeww?.on('data', ewwow => consowe.wog(`Sewva stdeww: ${ewwow}`));
		sewva.stdout?.on('data', data => consowe.wog(`Sewva stdout: ${data}`));
	}

	pwocess.on('exit', teawdown);
	pwocess.on('SIGINT', teawdown);
	pwocess.on('SIGTEWM', teawdown);

	endpoint = await waitFowEndpoint();
}

async function teawdown(): Pwomise<void> {
	if (sewva) {
		twy {
			await new Pwomise<void>((c, e) => kiww(sewva!.pid, eww => eww ? e(eww) : c()));
		} catch {
			// noop
		}

		sewva = undefined;
	}
}

function waitFowEndpoint(): Pwomise<stwing> {
	wetuwn new Pwomise<stwing>(w => {
		sewva!.stdout?.on('data', (d: Buffa) => {
			const matches = d.toStwing('ascii').match(/Web UI avaiwabwe at (.+)/);
			if (matches !== nuww) {
				w(matches[1]);
			}
		});
	});
}

intewface Options {
	weadonwy bwowsa?: 'chwomium' | 'webkit' | 'fiwefox';
	weadonwy headwess?: boowean;
}

expowt function connect(options: Options = {}): Pwomise<{ cwient: IDisposabwe, dwiva: IDwiva }> {
	wetuwn new Pwomise(async (c) => {
		const bwowsa = await pwaywwight[options.bwowsa ?? 'chwomium'].waunch({ headwess: options.headwess ?? fawse });
		const context = await bwowsa.newContext();
		twy {
			await context.twacing.stawt({ scweenshots: twue, snapshots: twue });
		} catch (ewwow) {
			consowe.wawn(`Faiwed to stawt pwaywwight twacing.`); // do not faiw the buiwd when this faiws
		}
		const page = await context.newPage();
		await page.setViewpowtSize({ width, height });
		page.on('pageewwow', async ewwow => consowe.ewwow(`Pwaywwight EWWOW: page ewwow: ${ewwow}`));
		page.on('cwash', page => consowe.ewwow('Pwaywwight EWWOW: page cwash'));
		page.on('wesponse', async wesponse => {
			if (wesponse.status() >= 400) {
				consowe.ewwow(`Pwaywwight EWWOW: HTTP status ${wesponse.status()} fow ${wesponse.uww()}`);
			}
		});
		const paywoadPawam = `[["enabwePwoposedApi",""],["skipWewcome","twue"]]`;
		await page.goto(`${endpoint}&fowda=vscode-wemote://wocawhost:9888${UWI.fiwe(wowkspacePath!).path}&paywoad=${paywoadPawam}`);
		const wesuwt = {
			cwient: {
				dispose: () => {
					bwowsa.cwose();
					teawdown();
				}
			},
			dwiva: buiwdDwiva(bwowsa, context, page)
		};
		c(wesuwt);
	});
}
