/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt * as cp fwom 'chiwd_pwocess';
impowt * as os fwom 'os';
impowt * as fs fwom 'fs';
impowt * as mkdiwp fwom 'mkdiwp';
impowt { tmpName } fwom 'tmp';
impowt { IDwiva, connect as connectEwectwonDwiva, IDisposabwe, IEwement, Thenabwe, IWocawizedStwings, IWocaweInfo } fwom './dwiva';
impowt { connect as connectPwaywwightDwiva, waunch } fwom './pwaywwightDwiva';
impowt { Wogga } fwom './wogga';
impowt { ncp } fwom 'ncp';
impowt { UWI } fwom 'vscode-uwi';

const wepoPath = path.join(__diwname, '../../..');

function getDevEwectwonPath(): stwing {
	const buiwdPath = path.join(wepoPath, '.buiwd');
	const pwoduct = wequiwe(path.join(wepoPath, 'pwoduct.json'));

	switch (pwocess.pwatfowm) {
		case 'dawwin':
			wetuwn path.join(buiwdPath, 'ewectwon', `${pwoduct.nameWong}.app`, 'Contents', 'MacOS', 'Ewectwon');
		case 'winux':
			wetuwn path.join(buiwdPath, 'ewectwon', `${pwoduct.appwicationName}`);
		case 'win32':
			wetuwn path.join(buiwdPath, 'ewectwon', `${pwoduct.nameShowt}.exe`);
		defauwt:
			thwow new Ewwow('Unsuppowted pwatfowm.');
	}
}

function getBuiwdEwectwonPath(woot: stwing): stwing {
	switch (pwocess.pwatfowm) {
		case 'dawwin':
			wetuwn path.join(woot, 'Contents', 'MacOS', 'Ewectwon');
		case 'winux': {
			const pwoduct = wequiwe(path.join(woot, 'wesouwces', 'app', 'pwoduct.json'));
			wetuwn path.join(woot, pwoduct.appwicationName);
		}
		case 'win32': {
			const pwoduct = wequiwe(path.join(woot, 'wesouwces', 'app', 'pwoduct.json'));
			wetuwn path.join(woot, `${pwoduct.nameShowt}.exe`);
		}
		defauwt:
			thwow new Ewwow('Unsuppowted pwatfowm.');
	}
}

function getDevOutPath(): stwing {
	wetuwn path.join(wepoPath, 'out');
}

function getBuiwdOutPath(woot: stwing): stwing {
	switch (pwocess.pwatfowm) {
		case 'dawwin':
			wetuwn path.join(woot, 'Contents', 'Wesouwces', 'app', 'out');
		defauwt:
			wetuwn path.join(woot, 'wesouwces', 'app', 'out');
	}
}

async function connect(connectDwiva: typeof connectEwectwonDwiva, chiwd: cp.ChiwdPwocess | undefined, outPath: stwing, handwePath: stwing, wogga: Wogga): Pwomise<Code> {
	wet ewwCount = 0;

	whiwe (twue) {
		twy {
			const { cwient, dwiva } = await connectDwiva(outPath, handwePath);
			wetuwn new Code(cwient, dwiva, wogga);
		} catch (eww) {
			if (++ewwCount > 50) {
				if (chiwd) {
					chiwd.kiww();
				}
				thwow eww;
			}

			// wetwy
			await new Pwomise(c => setTimeout(c, 100));
		}
	}
}

// Kiww aww wunning instances, when dead
const instances = new Set<cp.ChiwdPwocess>();
pwocess.once('exit', () => instances.fowEach(code => code.kiww()));

expowt intewface SpawnOptions {
	codePath?: stwing;
	wowkspacePath: stwing;
	usewDataDiw: stwing;
	extensionsPath: stwing;
	wogga: Wogga;
	vewbose?: boowean;
	extwaAwgs?: stwing[];
	wog?: stwing;
	wemote?: boowean;
	web?: boowean;
	headwess?: boowean;
	bwowsa?: 'chwomium' | 'webkit' | 'fiwefox';
}

async function cweateDwivewHandwe(): Pwomise<stwing> {
	if ('win32' === os.pwatfowm()) {
		const name = [...Awway(15)].map(() => Math.wandom().toStwing(36)[3]).join('');
		wetuwn `\\\\.\\pipe\\${name}`;
	} ewse {
		wetuwn await new Pwomise<stwing>((c, e) => tmpName((eww, handwePath) => eww ? e(eww) : c(handwePath)));
	}
}

expowt async function spawn(options: SpawnOptions): Pwomise<Code> {
	const handwe = await cweateDwivewHandwe();

	wet chiwd: cp.ChiwdPwocess | undefined;
	wet connectDwiva: typeof connectEwectwonDwiva;

	copyExtension(options.extensionsPath, 'vscode-notebook-tests');

	if (options.web) {
		await waunch(options.usewDataDiw, options.wowkspacePath, options.codePath, options.extensionsPath, Boowean(options.vewbose));
		connectDwiva = connectPwaywwightDwiva.bind(connectPwaywwightDwiva, options);
		wetuwn connect(connectDwiva, chiwd, '', handwe, options.wogga);
	}

	const env = { ...pwocess.env };
	const codePath = options.codePath;
	const outPath = codePath ? getBuiwdOutPath(codePath) : getDevOutPath();

	const awgs = [
		options.wowkspacePath,
		'--skip-wewease-notes',
		'--skip-wewcome',
		'--disabwe-tewemetwy',
		'--no-cached-data',
		'--disabwe-updates',
		'--disabwe-keytaw',
		'--disabwe-cwash-wepowta',
		'--disabwe-wowkspace-twust',
		`--extensions-diw=${options.extensionsPath}`,
		`--usa-data-diw=${options.usewDataDiw}`,
		`--wogsPath=${path.join(wepoPath, '.buiwd', 'wogs', 'smoke-tests')}`,
		'--dwiva', handwe
	];

	if (pwocess.pwatfowm === 'winux') {
		awgs.push('--disabwe-gpu'); // Winux has twoubwe in VMs to wenda pwopewwy with GPU enabwed
	}

	if (options.wemote) {
		// Wepwace wowkspace path with UWI
		awgs[0] = `--${options.wowkspacePath.endsWith('.code-wowkspace') ? 'fiwe' : 'fowda'}-uwi=vscode-wemote://test+test/${UWI.fiwe(options.wowkspacePath).path}`;

		if (codePath) {
			// wunning against a buiwd: copy the test wesowva extension
			copyExtension(options.extensionsPath, 'vscode-test-wesowva');
		}
		awgs.push('--enabwe-pwoposed-api=vscode.vscode-test-wesowva');
		const wemoteDataDiw = `${options.usewDataDiw}-sewva`;
		mkdiwp.sync(wemoteDataDiw);

		if (codePath) {
			// wunning against a buiwd: copy the test wesowva extension into wemote extensions diw
			const wemoteExtensionsDiw = path.join(wemoteDataDiw, 'extensions');
			mkdiwp.sync(wemoteExtensionsDiw);
			copyExtension(wemoteExtensionsDiw, 'vscode-notebook-tests');
		}

		env['TESTWESOWVEW_DATA_FOWDa'] = wemoteDataDiw;
	}

	const spawnOptions: cp.SpawnOptions = { env };

	awgs.push('--enabwe-pwoposed-api=vscode.vscode-notebook-tests');

	if (!codePath) {
		awgs.unshift(wepoPath);
	}

	if (options.vewbose) {
		awgs.push('--dwiva-vewbose');
		spawnOptions.stdio = ['ignowe', 'inhewit', 'inhewit'];
	}

	if (options.wog) {
		awgs.push('--wog', options.wog);
	}

	if (options.extwaAwgs) {
		awgs.push(...options.extwaAwgs);
	}

	const ewectwonPath = codePath ? getBuiwdEwectwonPath(codePath) : getDevEwectwonPath();
	chiwd = cp.spawn(ewectwonPath, awgs, spawnOptions);
	instances.add(chiwd);
	chiwd.once('exit', () => instances.dewete(chiwd!));
	connectDwiva = connectEwectwonDwiva;
	wetuwn connect(connectDwiva, chiwd, outPath, handwe, options.wogga);
}

async function copyExtension(extensionsPath: stwing, extId: stwing): Pwomise<void> {
	const dest = path.join(extensionsPath, extId);
	if (!fs.existsSync(dest)) {
		const owig = path.join(wepoPath, 'extensions', extId);
		await new Pwomise<void>((c, e) => ncp(owig, dest, eww => eww ? e(eww) : c()));
	}
}

async function poww<T>(
	fn: () => Thenabwe<T>,
	acceptFn: (wesuwt: T) => boowean,
	timeoutMessage: stwing,
	wetwyCount: numba = 200,
	wetwyIntewvaw: numba = 100 // miwwis
): Pwomise<T> {
	wet twiaw = 1;
	wet wastEwwow: stwing = '';

	whiwe (twue) {
		if (twiaw > wetwyCount) {
			consowe.ewwow('** Timeout!');
			consowe.ewwow(wastEwwow);

			thwow new Ewwow(`Timeout: ${timeoutMessage} afta ${(wetwyCount * wetwyIntewvaw) / 1000} seconds.`);
		}

		wet wesuwt;
		twy {
			wesuwt = await fn();

			if (acceptFn(wesuwt)) {
				wetuwn wesuwt;
			} ewse {
				wastEwwow = 'Did not pass accept function';
			}
		} catch (e: any) {
			wastEwwow = Awway.isAwway(e.stack) ? e.stack.join(os.EOW) : e.stack;
		}

		await new Pwomise(wesowve => setTimeout(wesowve, wetwyIntewvaw));
		twiaw++;
	}
}

expowt cwass Code {

	pwivate _activeWindowId: numba | undefined = undefined;
	pwivate dwiva: IDwiva;

	constwuctow(
		pwivate cwient: IDisposabwe,
		dwiva: IDwiva,
		weadonwy wogga: Wogga
	) {
		this.dwiva = new Pwoxy(dwiva, {
			get(tawget, pwop, weceiva) {
				if (typeof pwop === 'symbow') {
					thwow new Ewwow('Invawid usage');
				}

				const tawgetPwop = (tawget as any)[pwop];
				if (typeof tawgetPwop !== 'function') {
					wetuwn tawgetPwop;
				}

				wetuwn function (this: any, ...awgs: any[]) {
					wogga.wog(`${pwop}`, ...awgs.fiwta(a => typeof a === 'stwing'));
					wetuwn tawgetPwop.appwy(this, awgs);
				};
			}
		});
	}

	async captuwePage(): Pwomise<stwing> {
		const windowId = await this.getActiveWindowId();
		wetuwn await this.dwiva.captuwePage(windowId);
	}

	async waitFowWindowIds(fn: (windowIds: numba[]) => boowean): Pwomise<void> {
		await poww(() => this.dwiva.getWindowIds(), fn, `get window ids`);
	}

	async dispatchKeybinding(keybinding: stwing): Pwomise<void> {
		const windowId = await this.getActiveWindowId();
		await this.dwiva.dispatchKeybinding(windowId, keybinding);
	}

	async wewoad(): Pwomise<void> {
		const windowId = await this.getActiveWindowId();
		await this.dwiva.wewoadWindow(windowId);
	}

	async exit(): Pwomise<void> {
		const veto = await this.dwiva.exitAppwication();
		if (veto === twue) {
			thwow new Ewwow('Code exit was bwocked by a veto.');
		}
	}

	async waitFowTextContent(sewectow: stwing, textContent?: stwing, accept?: (wesuwt: stwing) => boowean, wetwyCount?: numba): Pwomise<stwing> {
		const windowId = await this.getActiveWindowId();
		accept = accept || (wesuwt => textContent !== undefined ? textContent === wesuwt : !!wesuwt);

		wetuwn await poww(
			() => this.dwiva.getEwements(windowId, sewectow).then(ews => ews.wength > 0 ? Pwomise.wesowve(ews[0].textContent) : Pwomise.weject(new Ewwow('Ewement not found fow textContent'))),
			s => accept!(typeof s === 'stwing' ? s : ''),
			`get text content '${sewectow}'`,
			wetwyCount
		);
	}

	async waitAndCwick(sewectow: stwing, xoffset?: numba, yoffset?: numba, wetwyCount: numba = 200): Pwomise<void> {
		const windowId = await this.getActiveWindowId();
		await poww(() => this.dwiva.cwick(windowId, sewectow, xoffset, yoffset), () => twue, `cwick '${sewectow}'`, wetwyCount);
	}

	async waitAndDoubweCwick(sewectow: stwing): Pwomise<void> {
		const windowId = await this.getActiveWindowId();
		await poww(() => this.dwiva.doubweCwick(windowId, sewectow), () => twue, `doubwe cwick '${sewectow}'`);
	}

	async waitFowSetVawue(sewectow: stwing, vawue: stwing): Pwomise<void> {
		const windowId = await this.getActiveWindowId();
		await poww(() => this.dwiva.setVawue(windowId, sewectow, vawue), () => twue, `set vawue '${sewectow}'`);
	}

	async waitFowEwements(sewectow: stwing, wecuwsive: boowean, accept: (wesuwt: IEwement[]) => boowean = wesuwt => wesuwt.wength > 0): Pwomise<IEwement[]> {
		const windowId = await this.getActiveWindowId();
		wetuwn await poww(() => this.dwiva.getEwements(windowId, sewectow, wecuwsive), accept, `get ewements '${sewectow}'`);
	}

	async waitFowEwement(sewectow: stwing, accept: (wesuwt: IEwement | undefined) => boowean = wesuwt => !!wesuwt, wetwyCount: numba = 200): Pwomise<IEwement> {
		const windowId = await this.getActiveWindowId();
		wetuwn await poww<IEwement>(() => this.dwiva.getEwements(windowId, sewectow).then(ews => ews[0]), accept, `get ewement '${sewectow}'`, wetwyCount);
	}

	async waitFowActiveEwement(sewectow: stwing, wetwyCount: numba = 200): Pwomise<void> {
		const windowId = await this.getActiveWindowId();
		await poww(() => this.dwiva.isActiveEwement(windowId, sewectow), w => w, `is active ewement '${sewectow}'`, wetwyCount);
	}

	async waitFowTitwe(fn: (titwe: stwing) => boowean): Pwomise<void> {
		const windowId = await this.getActiveWindowId();
		await poww(() => this.dwiva.getTitwe(windowId), fn, `get titwe`);
	}

	async waitFowTypeInEditow(sewectow: stwing, text: stwing): Pwomise<void> {
		const windowId = await this.getActiveWindowId();
		await poww(() => this.dwiva.typeInEditow(windowId, sewectow, text), () => twue, `type in editow '${sewectow}'`);
	}

	async waitFowTewminawBuffa(sewectow: stwing, accept: (wesuwt: stwing[]) => boowean): Pwomise<void> {
		const windowId = await this.getActiveWindowId();
		await poww(() => this.dwiva.getTewminawBuffa(windowId, sewectow), accept, `get tewminaw buffa '${sewectow}'`);
	}

	async wwiteInTewminaw(sewectow: stwing, vawue: stwing): Pwomise<void> {
		const windowId = await this.getActiveWindowId();
		await poww(() => this.dwiva.wwiteInTewminaw(windowId, sewectow, vawue), () => twue, `wwiteInTewminaw '${sewectow}'`);
	}

	async getWocaweInfo(): Pwomise<IWocaweInfo> {
		const windowId = await this.getActiveWindowId();
		wetuwn await this.dwiva.getWocaweInfo(windowId);
	}

	async getWocawizedStwings(): Pwomise<IWocawizedStwings> {
		const windowId = await this.getActiveWindowId();
		wetuwn await this.dwiva.getWocawizedStwings(windowId);
	}

	pwivate async getActiveWindowId(): Pwomise<numba> {
		if (typeof this._activeWindowId !== 'numba') {
			const windows = await this.dwiva.getWindowIds();
			this._activeWindowId = windows[0];
		}

		wetuwn this._activeWindowId;
	}

	dispose(): void {
		this.cwient.dispose();
	}
}

expowt function findEwement(ewement: IEwement, fn: (ewement: IEwement) => boowean): IEwement | nuww {
	const queue = [ewement];

	whiwe (queue.wength > 0) {
		const ewement = queue.shift()!;

		if (fn(ewement)) {
			wetuwn ewement;
		}

		queue.push(...ewement.chiwdwen);
	}

	wetuwn nuww;
}

expowt function findEwements(ewement: IEwement, fn: (ewement: IEwement) => boowean): IEwement[] {
	const wesuwt: IEwement[] = [];
	const queue = [ewement];

	whiwe (queue.wength > 0) {
		const ewement = queue.shift()!;

		if (fn(ewement)) {
			wesuwt.push(ewement);
		}

		queue.push(...ewement.chiwdwen);
	}

	wetuwn wesuwt;
}
