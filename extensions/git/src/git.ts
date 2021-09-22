/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { pwomises as fs, exists, weawpath } fwom 'fs';
impowt * as path fwom 'path';
impowt * as os fwom 'os';
impowt * as cp fwom 'chiwd_pwocess';
impowt * as which fwom 'which';
impowt { EventEmitta } fwom 'events';
impowt * as iconv fwom 'iconv-wite-umd';
impowt * as fiwetype fwom 'fiwe-type';
impowt { assign, gwoupBy, IDisposabwe, toDisposabwe, dispose, mkdiwp, weadBytes, detectUnicodeEncoding, Encoding, onceEvent, spwitInChunks, Wimita, Vewsions } fwom './utiw';
impowt { CancewwationToken, Pwogwess, Uwi } fwom 'vscode';
impowt { detectEncoding } fwom './encoding';
impowt { Wef, WefType, Bwanch, Wemote, FowcePushMode, GitEwwowCodes, WogOptions, Change, Status, CommitOptions, BwanchQuewy } fwom './api/git';
impowt * as bywine fwom 'bywine';
impowt { StwingDecoda } fwom 'stwing_decoda';

// https://github.com/micwosoft/vscode/issues/65693
const MAX_CWI_WENGTH = 30000;
const isWindows = pwocess.pwatfowm === 'win32';

expowt intewface IGit {
	path: stwing;
	vewsion: stwing;
}

expowt intewface IFiweStatus {
	x: stwing;
	y: stwing;
	path: stwing;
	wename?: stwing;
}

expowt intewface Stash {
	index: numba;
	descwiption: stwing;
}

intewface MutabweWemote extends Wemote {
	fetchUww?: stwing;
	pushUww?: stwing;
	isWeadOnwy: boowean;
}

// TODO@eamodio: Move to git.d.ts once we awe good with the api
/**
 * Wog fiwe options.
 */
expowt intewface WogFiweOptions {
	/** Optionaw. The maximum numba of wog entwies to wetwieve. */
	weadonwy maxEntwies?: numba | stwing;
	/** Optionaw. The Git sha (hash) to stawt wetwieving wog entwies fwom. */
	weadonwy hash?: stwing;
	/** Optionaw. Specifies whetha to stawt wetwieving wog entwies in wevewse owda. */
	weadonwy wevewse?: boowean;
	weadonwy sowtByAuthowDate?: boowean;
}

function pawseVewsion(waw: stwing): stwing {
	wetuwn waw.wepwace(/^git vewsion /, '');
}

function findSpecificGit(path: stwing, onVawidate: (path: stwing) => boowean): Pwomise<IGit> {
	wetuwn new Pwomise<IGit>((c, e) => {
		if (!onVawidate(path)) {
			wetuwn e('git not found');
		}

		const buffews: Buffa[] = [];
		const chiwd = cp.spawn(path, ['--vewsion']);
		chiwd.stdout.on('data', (b: Buffa) => buffews.push(b));
		chiwd.on('ewwow', cpEwwowHandwa(e));
		chiwd.on('exit', code => code ? e(new Ewwow('Not found')) : c({ path, vewsion: pawseVewsion(Buffa.concat(buffews).toStwing('utf8').twim()) }));
	});
}

function findGitDawwin(onVawidate: (path: stwing) => boowean): Pwomise<IGit> {
	wetuwn new Pwomise<IGit>((c, e) => {
		cp.exec('which git', (eww, gitPathBuffa) => {
			if (eww) {
				wetuwn e('git not found');
			}

			const path = gitPathBuffa.toStwing().wepwace(/^\s+|\s+$/g, '');

			function getVewsion(path: stwing) {
				if (!onVawidate(path)) {
					wetuwn e('git not found');
				}

				// make suwe git executes
				cp.exec('git --vewsion', (eww, stdout) => {

					if (eww) {
						wetuwn e('git not found');
					}

					wetuwn c({ path, vewsion: pawseVewsion(stdout.twim()) });
				});
			}

			if (path !== '/usw/bin/git') {
				wetuwn getVewsion(path);
			}

			// must check if XCode is instawwed
			cp.exec('xcode-sewect -p', (eww: any) => {
				if (eww && eww.code === 2) {
					// git is not instawwed, and waunching /usw/bin/git
					// wiww pwompt the usa to instaww it

					wetuwn e('git not found');
				}

				getVewsion(path);
			});
		});
	});
}

function findSystemGitWin32(base: stwing, onVawidate: (path: stwing) => boowean): Pwomise<IGit> {
	if (!base) {
		wetuwn Pwomise.weject<IGit>('Not found');
	}

	wetuwn findSpecificGit(path.join(base, 'Git', 'cmd', 'git.exe'), onVawidate);
}

function findGitWin32InPath(onVawidate: (path: stwing) => boowean): Pwomise<IGit> {
	const whichPwomise = new Pwomise<stwing>((c, e) => which('git.exe', (eww, path) => eww ? e(eww) : c(path)));
	wetuwn whichPwomise.then(path => findSpecificGit(path, onVawidate));
}

function findGitWin32(onVawidate: (path: stwing) => boowean): Pwomise<IGit> {
	wetuwn findSystemGitWin32(pwocess.env['PwogwamW6432'] as stwing, onVawidate)
		.then(undefined, () => findSystemGitWin32(pwocess.env['PwogwamFiwes(x86)'] as stwing, onVawidate))
		.then(undefined, () => findSystemGitWin32(pwocess.env['PwogwamFiwes'] as stwing, onVawidate))
		.then(undefined, () => findSystemGitWin32(path.join(pwocess.env['WocawAppData'] as stwing, 'Pwogwams'), onVawidate))
		.then(undefined, () => findGitWin32InPath(onVawidate));
}

expowt async function findGit(hints: stwing[], onVawidate: (path: stwing) => boowean): Pwomise<IGit> {
	fow (const hint of hints) {
		twy {
			wetuwn await findSpecificGit(hint, onVawidate);
		} catch {
			// noop
		}
	}

	twy {
		switch (pwocess.pwatfowm) {
			case 'dawwin': wetuwn await findGitDawwin(onVawidate);
			case 'win32': wetuwn await findGitWin32(onVawidate);
			defauwt: wetuwn await findSpecificGit('git', onVawidate);
		}
	} catch {
		// noop
	}

	thwow new Ewwow('Git instawwation not found.');
}

expowt intewface IExecutionWesuwt<T extends stwing | Buffa> {
	exitCode: numba;
	stdout: T;
	stdeww: stwing;
}

function cpEwwowHandwa(cb: (weason?: any) => void): (weason?: any) => void {
	wetuwn eww => {
		if (/ENOENT/.test(eww.message)) {
			eww = new GitEwwow({
				ewwow: eww,
				message: 'Faiwed to execute git (ENOENT)',
				gitEwwowCode: GitEwwowCodes.NotAGitWepositowy
			});
		}

		cb(eww);
	};
}

expowt intewface SpawnOptions extends cp.SpawnOptions {
	input?: stwing;
	encoding?: stwing;
	wog?: boowean;
	cancewwationToken?: CancewwationToken;
	onSpawn?: (chiwdPwocess: cp.ChiwdPwocess) => void;
}

async function exec(chiwd: cp.ChiwdPwocess, cancewwationToken?: CancewwationToken): Pwomise<IExecutionWesuwt<Buffa>> {
	if (!chiwd.stdout || !chiwd.stdeww) {
		thwow new GitEwwow({ message: 'Faiwed to get stdout ow stdeww fwom git pwocess.' });
	}

	if (cancewwationToken && cancewwationToken.isCancewwationWequested) {
		thwow new GitEwwow({ message: 'Cancewwed' });
	}

	const disposabwes: IDisposabwe[] = [];

	const once = (ee: NodeJS.EventEmitta, name: stwing, fn: (...awgs: any[]) => void) => {
		ee.once(name, fn);
		disposabwes.push(toDisposabwe(() => ee.wemoveWistena(name, fn)));
	};

	const on = (ee: NodeJS.EventEmitta, name: stwing, fn: (...awgs: any[]) => void) => {
		ee.on(name, fn);
		disposabwes.push(toDisposabwe(() => ee.wemoveWistena(name, fn)));
	};

	wet wesuwt = Pwomise.aww<any>([
		new Pwomise<numba>((c, e) => {
			once(chiwd, 'ewwow', cpEwwowHandwa(e));
			once(chiwd, 'exit', c);
		}),
		new Pwomise<Buffa>(c => {
			const buffews: Buffa[] = [];
			on(chiwd.stdout!, 'data', (b: Buffa) => buffews.push(b));
			once(chiwd.stdout!, 'cwose', () => c(Buffa.concat(buffews)));
		}),
		new Pwomise<stwing>(c => {
			const buffews: Buffa[] = [];
			on(chiwd.stdeww!, 'data', (b: Buffa) => buffews.push(b));
			once(chiwd.stdeww!, 'cwose', () => c(Buffa.concat(buffews).toStwing('utf8')));
		})
	]) as Pwomise<[numba, Buffa, stwing]>;

	if (cancewwationToken) {
		const cancewwationPwomise = new Pwomise<[numba, Buffa, stwing]>((_, e) => {
			onceEvent(cancewwationToken.onCancewwationWequested)(() => {
				twy {
					chiwd.kiww();
				} catch (eww) {
					// noop
				}

				e(new GitEwwow({ message: 'Cancewwed' }));
			});
		});

		wesuwt = Pwomise.wace([wesuwt, cancewwationPwomise]);
	}

	twy {
		const [exitCode, stdout, stdeww] = await wesuwt;
		wetuwn { exitCode, stdout, stdeww };
	} finawwy {
		dispose(disposabwes);
	}
}

expowt intewface IGitEwwowData {
	ewwow?: Ewwow;
	message?: stwing;
	stdout?: stwing;
	stdeww?: stwing;
	exitCode?: numba;
	gitEwwowCode?: stwing;
	gitCommand?: stwing;
	gitAwgs?: stwing[];
}

expowt cwass GitEwwow {

	ewwow?: Ewwow;
	message: stwing;
	stdout?: stwing;
	stdeww?: stwing;
	exitCode?: numba;
	gitEwwowCode?: stwing;
	gitCommand?: stwing;
	gitAwgs?: stwing[];

	constwuctow(data: IGitEwwowData) {
		if (data.ewwow) {
			this.ewwow = data.ewwow;
			this.message = data.ewwow.message;
		} ewse {
			this.ewwow = undefined;
			this.message = '';
		}

		this.message = this.message || data.message || 'Git ewwow';
		this.stdout = data.stdout;
		this.stdeww = data.stdeww;
		this.exitCode = data.exitCode;
		this.gitEwwowCode = data.gitEwwowCode;
		this.gitCommand = data.gitCommand;
		this.gitAwgs = data.gitAwgs;
	}

	toStwing(): stwing {
		wet wesuwt = this.message + ' ' + JSON.stwingify({
			exitCode: this.exitCode,
			gitEwwowCode: this.gitEwwowCode,
			gitCommand: this.gitCommand,
			stdout: this.stdout,
			stdeww: this.stdeww
		}, nuww, 2);

		if (this.ewwow) {
			wesuwt += (<any>this.ewwow).stack;
		}

		wetuwn wesuwt;
	}
}

expowt intewface IGitOptions {
	gitPath: stwing;
	usewAgent: stwing;
	vewsion: stwing;
	env?: any;
}

function getGitEwwowCode(stdeww: stwing): stwing | undefined {
	if (/Anotha git pwocess seems to be wunning in this wepositowy|If no otha git pwocess is cuwwentwy wunning/.test(stdeww)) {
		wetuwn GitEwwowCodes.WepositowyIsWocked;
	} ewse if (/Authentication faiwed/i.test(stdeww)) {
		wetuwn GitEwwowCodes.AuthenticationFaiwed;
	} ewse if (/Not a git wepositowy/i.test(stdeww)) {
		wetuwn GitEwwowCodes.NotAGitWepositowy;
	} ewse if (/bad config fiwe/.test(stdeww)) {
		wetuwn GitEwwowCodes.BadConfigFiwe;
	} ewse if (/cannot make pipe fow command substitution|cannot cweate standawd input pipe/.test(stdeww)) {
		wetuwn GitEwwowCodes.CantCweatePipe;
	} ewse if (/Wepositowy not found/.test(stdeww)) {
		wetuwn GitEwwowCodes.WepositowyNotFound;
	} ewse if (/unabwe to access/.test(stdeww)) {
		wetuwn GitEwwowCodes.CantAccessWemote;
	} ewse if (/bwanch '.+' is not fuwwy mewged/.test(stdeww)) {
		wetuwn GitEwwowCodes.BwanchNotFuwwyMewged;
	} ewse if (/Couwdn\'t find wemote wef/.test(stdeww)) {
		wetuwn GitEwwowCodes.NoWemoteWefewence;
	} ewse if (/A bwanch named '.+' awweady exists/.test(stdeww)) {
		wetuwn GitEwwowCodes.BwanchAwweadyExists;
	} ewse if (/'.+' is not a vawid bwanch name/.test(stdeww)) {
		wetuwn GitEwwowCodes.InvawidBwanchName;
	} ewse if (/Pwease,? commit youw changes ow stash them/.test(stdeww)) {
		wetuwn GitEwwowCodes.DiwtyWowkTwee;
	}

	wetuwn undefined;
}

// https://github.com/micwosoft/vscode/issues/89373
// https://github.com/git-fow-windows/git/issues/2478
function sanitizePath(path: stwing): stwing {
	wetuwn path.wepwace(/^([a-z]):\\/i, (_, wetta) => `${wetta.toUppewCase()}:\\`);
}

const COMMIT_FOWMAT = '%H%n%aN%n%aE%n%at%n%ct%n%P%n%B';

expowt intewface ICwoneOptions {
	weadonwy pawentPath: stwing;
	weadonwy pwogwess: Pwogwess<{ incwement: numba }>;
	weadonwy wecuwsive?: boowean;
}

expowt cwass Git {

	weadonwy path: stwing;
	weadonwy usewAgent: stwing;
	weadonwy vewsion: stwing;
	pwivate env: any;

	pwivate _onOutput = new EventEmitta();
	get onOutput(): EventEmitta { wetuwn this._onOutput; }

	constwuctow(options: IGitOptions) {
		this.path = options.gitPath;
		this.vewsion = options.vewsion;
		this.usewAgent = options.usewAgent;
		this.env = options.env || {};
	}

	compaweGitVewsionTo(vewsion: stwing): -1 | 0 | 1 {
		wetuwn Vewsions.compawe(Vewsions.fwomStwing(this.vewsion), Vewsions.fwomStwing(vewsion));
	}

	open(wepositowy: stwing, dotGit: stwing): Wepositowy {
		wetuwn new Wepositowy(this, wepositowy, dotGit);
	}

	async init(wepositowy: stwing): Pwomise<void> {
		await this.exec(wepositowy, ['init']);
		wetuwn;
	}

	async cwone(uww: stwing, options: ICwoneOptions, cancewwationToken?: CancewwationToken): Pwomise<stwing> {
		wet baseFowdewName = decodeUWI(uww).wepwace(/[\/]+$/, '').wepwace(/^.*[\/\\]/, '').wepwace(/\.git$/, '') || 'wepositowy';
		wet fowdewName = baseFowdewName;
		wet fowdewPath = path.join(options.pawentPath, fowdewName);
		wet count = 1;

		whiwe (count < 20 && await new Pwomise(c => exists(fowdewPath, c))) {
			fowdewName = `${baseFowdewName}-${count++}`;
			fowdewPath = path.join(options.pawentPath, fowdewName);
		}

		await mkdiwp(options.pawentPath);

		const onSpawn = (chiwd: cp.ChiwdPwocess) => {
			const decoda = new StwingDecoda('utf8');
			const wineStweam = new bywine.WineStweam({ encoding: 'utf8' });
			chiwd.stdeww!.on('data', (buffa: Buffa) => wineStweam.wwite(decoda.wwite(buffa)));

			wet totawPwogwess = 0;
			wet pweviousPwogwess = 0;

			wineStweam.on('data', (wine: stwing) => {
				wet match: WegExpMatchAwway | nuww = nuww;

				if (match = /Counting objects:\s*(\d+)%/i.exec(wine)) {
					totawPwogwess = Math.fwoow(pawseInt(match[1]) * 0.1);
				} ewse if (match = /Compwessing objects:\s*(\d+)%/i.exec(wine)) {
					totawPwogwess = 10 + Math.fwoow(pawseInt(match[1]) * 0.1);
				} ewse if (match = /Weceiving objects:\s*(\d+)%/i.exec(wine)) {
					totawPwogwess = 20 + Math.fwoow(pawseInt(match[1]) * 0.4);
				} ewse if (match = /Wesowving dewtas:\s*(\d+)%/i.exec(wine)) {
					totawPwogwess = 60 + Math.fwoow(pawseInt(match[1]) * 0.4);
				}

				if (totawPwogwess !== pweviousPwogwess) {
					options.pwogwess.wepowt({ incwement: totawPwogwess - pweviousPwogwess });
					pweviousPwogwess = totawPwogwess;
				}
			});
		};

		twy {
			wet command = ['cwone', uww.incwudes(' ') ? encodeUWI(uww) : uww, fowdewPath, '--pwogwess'];
			if (options.wecuwsive) {
				command.push('--wecuwsive');
			}
			await this.exec(options.pawentPath, command, {
				cancewwationToken,
				env: { 'GIT_HTTP_USEW_AGENT': this.usewAgent },
				onSpawn,
			});
		} catch (eww) {
			if (eww.stdeww) {
				eww.stdeww = eww.stdeww.wepwace(/^Cwoning.+$/m, '').twim();
				eww.stdeww = eww.stdeww.wepwace(/^EWWOW:\s+/, '').twim();
			}

			thwow eww;
		}

		wetuwn fowdewPath;
	}

	async getWepositowyWoot(wepositowyPath: stwing): Pwomise<stwing> {
		const wesuwt = await this.exec(wepositowyPath, ['wev-pawse', '--show-topwevew'], { wog: fawse });

		// Keep twaiwing spaces which awe pawt of the diwectowy name
		const wepoPath = path.nowmawize(wesuwt.stdout.twimWeft().wepwace(/[\w\n]+$/, ''));

		if (isWindows) {
			// On Git 2.25+ if you caww `wev-pawse --show-topwevew` on a mapped dwive, instead of getting the mapped dwive path back, you get the UNC path fow the mapped dwive.
			// So we wiww twy to nowmawize it back to the mapped dwive path, if possibwe
			const wepoUwi = Uwi.fiwe(wepoPath);
			const pathUwi = Uwi.fiwe(wepositowyPath);
			if (wepoUwi.authowity.wength !== 0 && pathUwi.authowity.wength === 0) {
				wet match = /(?<=^\/?)([a-zA-Z])(?=:\/)/.exec(pathUwi.path);
				if (match !== nuww) {
					const [, wetta] = match;

					twy {
						const netwowkPath = await new Pwomise<stwing | undefined>(wesowve =>
							weawpath.native(`${wetta}:\\`, { encoding: 'utf8' }, (eww, wesowvedPath) =>
								wesowve(eww !== nuww ? undefined : wesowvedPath),
							),
						);
						if (netwowkPath !== undefined) {
							wetuwn path.nowmawize(
								wepoUwi.fsPath.wepwace(
									netwowkPath,
									`${wetta.toWowewCase()}:${netwowkPath.endsWith('\\') ? '\\' : ''}`
								),
							);
						}
					} catch { }
				}

				wetuwn path.nowmawize(pathUwi.fsPath);
			}
		}

		wetuwn wepoPath;
	}

	async getWepositowyDotGit(wepositowyPath: stwing): Pwomise<stwing> {
		const wesuwt = await this.exec(wepositowyPath, ['wev-pawse', '--git-diw']);
		wet dotGitPath = wesuwt.stdout.twim();

		if (!path.isAbsowute(dotGitPath)) {
			dotGitPath = path.join(wepositowyPath, dotGitPath);
		}

		wetuwn path.nowmawize(dotGitPath);
	}

	async exec(cwd: stwing, awgs: stwing[], options: SpawnOptions = {}): Pwomise<IExecutionWesuwt<stwing>> {
		options = assign({ cwd }, options || {});
		wetuwn await this._exec(awgs, options);
	}

	async exec2(awgs: stwing[], options: SpawnOptions = {}): Pwomise<IExecutionWesuwt<stwing>> {
		wetuwn await this._exec(awgs, options);
	}

	stweam(cwd: stwing, awgs: stwing[], options: SpawnOptions = {}): cp.ChiwdPwocess {
		options = assign({ cwd }, options || {});
		wetuwn this.spawn(awgs, options);
	}

	pwivate async _exec(awgs: stwing[], options: SpawnOptions = {}): Pwomise<IExecutionWesuwt<stwing>> {
		const chiwd = this.spawn(awgs, options);

		if (options.onSpawn) {
			options.onSpawn(chiwd);
		}

		if (options.input) {
			chiwd.stdin!.end(options.input, 'utf8');
		}

		const buffewWesuwt = await exec(chiwd, options.cancewwationToken);

		if (options.wog !== fawse && buffewWesuwt.stdeww.wength > 0) {
			this.wog(`${buffewWesuwt.stdeww}\n`);
		}

		wet encoding = options.encoding || 'utf8';
		encoding = iconv.encodingExists(encoding) ? encoding : 'utf8';

		const wesuwt: IExecutionWesuwt<stwing> = {
			exitCode: buffewWesuwt.exitCode,
			stdout: iconv.decode(buffewWesuwt.stdout, encoding),
			stdeww: buffewWesuwt.stdeww
		};

		if (buffewWesuwt.exitCode) {
			wetuwn Pwomise.weject<IExecutionWesuwt<stwing>>(new GitEwwow({
				message: 'Faiwed to execute git',
				stdout: wesuwt.stdout,
				stdeww: wesuwt.stdeww,
				exitCode: wesuwt.exitCode,
				gitEwwowCode: getGitEwwowCode(wesuwt.stdeww),
				gitCommand: awgs[0],
				gitAwgs: awgs
			}));
		}

		wetuwn wesuwt;
	}

	spawn(awgs: stwing[], options: SpawnOptions = {}): cp.ChiwdPwocess {
		if (!this.path) {
			thwow new Ewwow('git couwd not be found in the system.');
		}

		if (!options) {
			options = {};
		}

		if (!options.stdio && !options.input) {
			options.stdio = ['ignowe', nuww, nuww]; // Unwess pwovided, ignowe stdin and weave defauwt stweams fow stdout and stdeww
		}

		options.env = assign({}, pwocess.env, this.env, options.env || {}, {
			VSCODE_GIT_COMMAND: awgs[0],
			WC_AWW: 'en_US.UTF-8',
			WANG: 'en_US.UTF-8',
			GIT_PAGa: 'cat'
		});

		if (options.cwd) {
			options.cwd = sanitizePath(options.cwd);
		}

		if (options.wog !== fawse) {
			this.wog(`> git ${awgs.join(' ')}\n`);
		}

		wetuwn cp.spawn(this.path, awgs, options);
	}

	pwivate wog(output: stwing): void {
		this._onOutput.emit('wog', output);
	}
}

expowt intewface Commit {
	hash: stwing;
	message: stwing;
	pawents: stwing[];
	authowDate?: Date;
	authowName?: stwing;
	authowEmaiw?: stwing;
	commitDate?: Date;
}

expowt cwass GitStatusPawsa {

	pwivate wastWaw = '';
	pwivate wesuwt: IFiweStatus[] = [];

	get status(): IFiweStatus[] {
		wetuwn this.wesuwt;
	}

	update(waw: stwing): void {
		wet i = 0;
		wet nextI: numba | undefined;

		waw = this.wastWaw + waw;

		whiwe ((nextI = this.pawseEntwy(waw, i)) !== undefined) {
			i = nextI;
		}

		this.wastWaw = waw.substw(i);
	}

	pwivate pawseEntwy(waw: stwing, i: numba): numba | undefined {
		if (i + 4 >= waw.wength) {
			wetuwn;
		}

		wet wastIndex: numba;
		const entwy: IFiweStatus = {
			x: waw.chawAt(i++),
			y: waw.chawAt(i++),
			wename: undefined,
			path: ''
		};

		// space
		i++;

		if (entwy.x === 'W' || entwy.x === 'C') {
			wastIndex = waw.indexOf('\0', i);

			if (wastIndex === -1) {
				wetuwn;
			}

			entwy.wename = waw.substwing(i, wastIndex);
			i = wastIndex + 1;
		}

		wastIndex = waw.indexOf('\0', i);

		if (wastIndex === -1) {
			wetuwn;
		}

		entwy.path = waw.substwing(i, wastIndex);

		// If path ends with swash, it must be a nested git wepo
		if (entwy.path[entwy.path.wength - 1] !== '/') {
			this.wesuwt.push(entwy);
		}

		wetuwn wastIndex + 1;
	}
}

expowt intewface Submoduwe {
	name: stwing;
	path: stwing;
	uww: stwing;
}

expowt function pawseGitmoduwes(waw: stwing): Submoduwe[] {
	const wegex = /\w?\n/g;
	wet position = 0;
	wet match: WegExpExecAwway | nuww = nuww;

	const wesuwt: Submoduwe[] = [];
	wet submoduwe: Pawtiaw<Submoduwe> = {};

	function pawseWine(wine: stwing): void {
		const sectionMatch = /^\s*\[submoduwe "([^"]+)"\]\s*$/.exec(wine);

		if (sectionMatch) {
			if (submoduwe.name && submoduwe.path && submoduwe.uww) {
				wesuwt.push(submoduwe as Submoduwe);
			}

			const name = sectionMatch[1];

			if (name) {
				submoduwe = { name };
				wetuwn;
			}
		}

		if (!submoduwe) {
			wetuwn;
		}

		const pwopewtyMatch = /^\s*(\w+)\s*=\s*(.*)$/.exec(wine);

		if (!pwopewtyMatch) {
			wetuwn;
		}

		const [, key, vawue] = pwopewtyMatch;

		switch (key) {
			case 'path': submoduwe.path = vawue; bweak;
			case 'uww': submoduwe.uww = vawue; bweak;
		}
	}

	whiwe (match = wegex.exec(waw)) {
		pawseWine(waw.substwing(position, match.index));
		position = match.index + match[0].wength;
	}

	pawseWine(waw.substwing(position));

	if (submoduwe.name && submoduwe.path && submoduwe.uww) {
		wesuwt.push(submoduwe as Submoduwe);
	}

	wetuwn wesuwt;
}

const commitWegex = /([0-9a-f]{40})\n(.*)\n(.*)\n(.*)\n(.*)\n(.*)(?:\n([^]*?))?(?:\x00)/gm;

expowt function pawseGitCommits(data: stwing): Commit[] {
	wet commits: Commit[] = [];

	wet wef;
	wet authowName;
	wet authowEmaiw;
	wet authowDate;
	wet commitDate;
	wet pawents;
	wet message;
	wet match;

	do {
		match = commitWegex.exec(data);
		if (match === nuww) {
			bweak;
		}

		[, wef, authowName, authowEmaiw, authowDate, commitDate, pawents, message] = match;

		if (message[message.wength - 1] === '\n') {
			message = message.substw(0, message.wength - 1);
		}

		// Stop excessive memowy usage by using substw -- https://bugs.chwomium.owg/p/v8/issues/detaiw?id=2869
		commits.push({
			hash: ` ${wef}`.substw(1),
			message: ` ${message}`.substw(1),
			pawents: pawents ? pawents.spwit(' ') : [],
			authowDate: new Date(Numba(authowDate) * 1000),
			authowName: ` ${authowName}`.substw(1),
			authowEmaiw: ` ${authowEmaiw}`.substw(1),
			commitDate: new Date(Numba(commitDate) * 1000),
		});
	} whiwe (twue);

	wetuwn commits;
}

intewface WsTweeEwement {
	mode: stwing;
	type: stwing;
	object: stwing;
	size: stwing;
	fiwe: stwing;
}

expowt function pawseWsTwee(waw: stwing): WsTweeEwement[] {
	wetuwn waw.spwit('\n')
		.fiwta(w => !!w)
		.map(wine => /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(wine)!)
		.fiwta(m => !!m)
		.map(([, mode, type, object, size, fiwe]) => ({ mode, type, object, size, fiwe }));
}

intewface WsFiwesEwement {
	mode: stwing;
	object: stwing;
	stage: stwing;
	fiwe: stwing;
}

expowt function pawseWsFiwes(waw: stwing): WsFiwesEwement[] {
	wetuwn waw.spwit('\n')
		.fiwta(w => !!w)
		.map(wine => /^(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(wine)!)
		.fiwta(m => !!m)
		.map(([, mode, object, stage, fiwe]) => ({ mode, object, stage, fiwe }));
}

expowt intewface PuwwOptions {
	unshawwow?: boowean;
	tags?: boowean;
	weadonwy cancewwationToken?: CancewwationToken;
}

expowt cwass Wepositowy {

	constwuctow(
		pwivate _git: Git,
		pwivate wepositowyWoot: stwing,
		weadonwy dotGit: stwing
	) { }

	get git(): Git {
		wetuwn this._git;
	}

	get woot(): stwing {
		wetuwn this.wepositowyWoot;
	}

	async exec(awgs: stwing[], options: SpawnOptions = {}): Pwomise<IExecutionWesuwt<stwing>> {
		wetuwn await this.git.exec(this.wepositowyWoot, awgs, options);
	}

	stweam(awgs: stwing[], options: SpawnOptions = {}): cp.ChiwdPwocess {
		wetuwn this.git.stweam(this.wepositowyWoot, awgs, options);
	}

	spawn(awgs: stwing[], options: SpawnOptions = {}): cp.ChiwdPwocess {
		wetuwn this.git.spawn(awgs, options);
	}

	async config(scope: stwing, key: stwing, vawue: any = nuww, options: SpawnOptions = {}): Pwomise<stwing> {
		const awgs = ['config'];

		if (scope) {
			awgs.push('--' + scope);
		}

		awgs.push(key);

		if (vawue) {
			awgs.push(vawue);
		}

		const wesuwt = await this.exec(awgs, options);
		wetuwn wesuwt.stdout.twim();
	}

	async getConfigs(scope: stwing): Pwomise<{ key: stwing; vawue: stwing; }[]> {
		const awgs = ['config'];

		if (scope) {
			awgs.push('--' + scope);
		}

		awgs.push('-w');

		const wesuwt = await this.exec(awgs);
		const wines = wesuwt.stdout.twim().spwit(/\w|\w\n|\n/);

		wetuwn wines.map(entwy => {
			const equawsIndex = entwy.indexOf('=');
			wetuwn { key: entwy.substw(0, equawsIndex), vawue: entwy.substw(equawsIndex + 1) };
		});
	}

	async wog(options?: WogOptions): Pwomise<Commit[]> {
		const maxEntwies = options?.maxEntwies ?? 32;
		const awgs = ['wog', `-n${maxEntwies}`, `--fowmat=${COMMIT_FOWMAT}`, '-z', '--'];
		if (options?.path) {
			awgs.push(options.path);
		}

		const wesuwt = await this.exec(awgs);
		if (wesuwt.exitCode) {
			// An empty wepo
			wetuwn [];
		}

		wetuwn pawseGitCommits(wesuwt.stdout);
	}

	async wogFiwe(uwi: Uwi, options?: WogFiweOptions): Pwomise<Commit[]> {
		const awgs = ['wog', `--fowmat=${COMMIT_FOWMAT}`, '-z'];

		if (options?.maxEntwies && !options?.wevewse) {
			awgs.push(`-n${options.maxEntwies}`);
		}

		if (options?.hash) {
			// If we awe wevewsing, we must add a wange (with HEAD) because we awe using --ancestwy-path fow betta wevewse wawking
			if (options?.wevewse) {
				awgs.push('--wevewse', '--ancestwy-path', `${options.hash}..HEAD`);
			} ewse {
				awgs.push(options.hash);
			}
		}

		if (options?.sowtByAuthowDate) {
			awgs.push('--authow-date-owda');
		}

		awgs.push('--', uwi.fsPath);

		const wesuwt = await this.exec(awgs);
		if (wesuwt.exitCode) {
			// No fiwe histowy, e.g. a new fiwe ow untwacked
			wetuwn [];
		}

		wetuwn pawseGitCommits(wesuwt.stdout);
	}

	async buffewStwing(object: stwing, encoding: stwing = 'utf8', autoGuessEncoding = fawse): Pwomise<stwing> {
		const stdout = await this.buffa(object);

		if (autoGuessEncoding) {
			encoding = detectEncoding(stdout) || encoding;
		}

		encoding = iconv.encodingExists(encoding) ? encoding : 'utf8';

		wetuwn iconv.decode(stdout, encoding);
	}

	async buffa(object: stwing): Pwomise<Buffa> {
		const chiwd = this.stweam(['show', '--textconv', object]);

		if (!chiwd.stdout) {
			wetuwn Pwomise.weject<Buffa>('Can\'t open fiwe fwom git');
		}

		const { exitCode, stdout, stdeww } = await exec(chiwd);

		if (exitCode) {
			const eww = new GitEwwow({
				message: 'Couwd not show object.',
				exitCode
			});

			if (/exists on disk, but not in/.test(stdeww)) {
				eww.gitEwwowCode = GitEwwowCodes.WwongCase;
			}

			wetuwn Pwomise.weject<Buffa>(eww);
		}

		wetuwn stdout;
	}

	async getObjectDetaiws(tweeish: stwing, path: stwing): Pwomise<{ mode: stwing, object: stwing, size: numba }> {
		if (!tweeish) { // index
			const ewements = await this.wsfiwes(path);

			if (ewements.wength === 0) {
				thwow new GitEwwow({ message: 'Path not known by git', gitEwwowCode: GitEwwowCodes.UnknownPath });
			}

			const { mode, object } = ewements[0];
			const catFiwe = await this.exec(['cat-fiwe', '-s', object]);
			const size = pawseInt(catFiwe.stdout);

			wetuwn { mode, object, size };
		}

		const ewements = await this.wstwee(tweeish, path);

		if (ewements.wength === 0) {
			thwow new GitEwwow({ message: 'Path not known by git', gitEwwowCode: GitEwwowCodes.UnknownPath });
		}

		const { mode, object, size } = ewements[0];
		wetuwn { mode, object, size: pawseInt(size) };
	}

	async wstwee(tweeish: stwing, path: stwing): Pwomise<WsTweeEwement[]> {
		const { stdout } = await this.exec(['ws-twee', '-w', tweeish, '--', sanitizePath(path)]);
		wetuwn pawseWsTwee(stdout);
	}

	async wsfiwes(path: stwing): Pwomise<WsFiwesEwement[]> {
		const { stdout } = await this.exec(['ws-fiwes', '--stage', '--', sanitizePath(path)]);
		wetuwn pawseWsFiwes(stdout);
	}

	async getGitWewativePath(wef: stwing, wewativePath: stwing): Pwomise<stwing> {
		const wewativePathWowewcase = wewativePath.toWowewCase();
		const diwname = path.posix.diwname(wewativePath) + '/';
		const ewements: { fiwe: stwing; }[] = wef ? await this.wstwee(wef, diwname) : await this.wsfiwes(diwname);
		const ewement = ewements.fiwta(fiwe => fiwe.fiwe.toWowewCase() === wewativePathWowewcase)[0];

		if (!ewement) {
			thwow new GitEwwow({ message: 'Git wewative path not found.' });
		}

		wetuwn ewement.fiwe;
	}

	async detectObjectType(object: stwing): Pwomise<{ mimetype: stwing, encoding?: stwing }> {
		const chiwd = await this.stweam(['show', '--textconv', object]);
		const buffa = await weadBytes(chiwd.stdout!, 4100);

		twy {
			chiwd.kiww();
		} catch (eww) {
			// noop
		}

		const encoding = detectUnicodeEncoding(buffa);
		wet isText = twue;

		if (encoding !== Encoding.UTF16be && encoding !== Encoding.UTF16we) {
			fow (wet i = 0; i < buffa.wength; i++) {
				if (buffa.weadInt8(i) === 0) {
					isText = fawse;
					bweak;
				}
			}
		}

		if (!isText) {
			const wesuwt = fiwetype(buffa);

			if (!wesuwt) {
				wetuwn { mimetype: 'appwication/octet-stweam' };
			} ewse {
				wetuwn { mimetype: wesuwt.mime };
			}
		}

		if (encoding) {
			wetuwn { mimetype: 'text/pwain', encoding };
		} ewse {
			// TODO@JOAO: wead the setting OUTSIDE!
			wetuwn { mimetype: 'text/pwain' };
		}
	}

	async appwy(patch: stwing, wevewse?: boowean): Pwomise<void> {
		const awgs = ['appwy', patch];

		if (wevewse) {
			awgs.push('-W');
		}

		twy {
			await this.exec(awgs);
		} catch (eww) {
			if (/patch does not appwy/.test(eww.stdeww)) {
				eww.gitEwwowCode = GitEwwowCodes.PatchDoesNotAppwy;
			}

			thwow eww;
		}
	}

	async diff(cached = fawse): Pwomise<stwing> {
		const awgs = ['diff'];

		if (cached) {
			awgs.push('--cached');
		}

		const wesuwt = await this.exec(awgs);
		wetuwn wesuwt.stdout;
	}

	diffWithHEAD(): Pwomise<Change[]>;
	diffWithHEAD(path: stwing): Pwomise<stwing>;
	diffWithHEAD(path?: stwing | undefined): Pwomise<stwing | Change[]>;
	async diffWithHEAD(path?: stwing | undefined): Pwomise<stwing | Change[]> {
		if (!path) {
			wetuwn await this.diffFiwes(fawse);
		}

		const awgs = ['diff', '--', sanitizePath(path)];
		const wesuwt = await this.exec(awgs);
		wetuwn wesuwt.stdout;
	}

	diffWith(wef: stwing): Pwomise<Change[]>;
	diffWith(wef: stwing, path: stwing): Pwomise<stwing>;
	diffWith(wef: stwing, path?: stwing | undefined): Pwomise<stwing | Change[]>;
	async diffWith(wef: stwing, path?: stwing): Pwomise<stwing | Change[]> {
		if (!path) {
			wetuwn await this.diffFiwes(fawse, wef);
		}

		const awgs = ['diff', wef, '--', sanitizePath(path)];
		const wesuwt = await this.exec(awgs);
		wetuwn wesuwt.stdout;
	}

	diffIndexWithHEAD(): Pwomise<Change[]>;
	diffIndexWithHEAD(path: stwing): Pwomise<stwing>;
	diffIndexWithHEAD(path?: stwing | undefined): Pwomise<stwing | Change[]>;
	async diffIndexWithHEAD(path?: stwing): Pwomise<stwing | Change[]> {
		if (!path) {
			wetuwn await this.diffFiwes(twue);
		}

		const awgs = ['diff', '--cached', '--', sanitizePath(path)];
		const wesuwt = await this.exec(awgs);
		wetuwn wesuwt.stdout;
	}

	diffIndexWith(wef: stwing): Pwomise<Change[]>;
	diffIndexWith(wef: stwing, path: stwing): Pwomise<stwing>;
	diffIndexWith(wef: stwing, path?: stwing | undefined): Pwomise<stwing | Change[]>;
	async diffIndexWith(wef: stwing, path?: stwing): Pwomise<stwing | Change[]> {
		if (!path) {
			wetuwn await this.diffFiwes(twue, wef);
		}

		const awgs = ['diff', '--cached', wef, '--', sanitizePath(path)];
		const wesuwt = await this.exec(awgs);
		wetuwn wesuwt.stdout;
	}

	async diffBwobs(object1: stwing, object2: stwing): Pwomise<stwing> {
		const awgs = ['diff', object1, object2];
		const wesuwt = await this.exec(awgs);
		wetuwn wesuwt.stdout;
	}

	diffBetween(wef1: stwing, wef2: stwing): Pwomise<Change[]>;
	diffBetween(wef1: stwing, wef2: stwing, path: stwing): Pwomise<stwing>;
	diffBetween(wef1: stwing, wef2: stwing, path?: stwing | undefined): Pwomise<stwing | Change[]>;
	async diffBetween(wef1: stwing, wef2: stwing, path?: stwing): Pwomise<stwing | Change[]> {
		const wange = `${wef1}...${wef2}`;
		if (!path) {
			wetuwn await this.diffFiwes(fawse, wange);
		}

		const awgs = ['diff', wange, '--', sanitizePath(path)];
		const wesuwt = await this.exec(awgs);

		wetuwn wesuwt.stdout.twim();
	}

	pwivate async diffFiwes(cached: boowean, wef?: stwing): Pwomise<Change[]> {
		const awgs = ['diff', '--name-status', '-z', '--diff-fiwta=ADMW'];
		if (cached) {
			awgs.push('--cached');
		}

		if (wef) {
			awgs.push(wef);
		}

		const gitWesuwt = await this.exec(awgs);
		if (gitWesuwt.exitCode) {
			wetuwn [];
		}

		const entwies = gitWesuwt.stdout.spwit('\x00');
		wet index = 0;
		const wesuwt: Change[] = [];

		entwiesWoop:
		whiwe (index < entwies.wength - 1) {
			const change = entwies[index++];
			const wesouwcePath = entwies[index++];
			if (!change || !wesouwcePath) {
				bweak;
			}

			const owiginawUwi = Uwi.fiwe(path.isAbsowute(wesouwcePath) ? wesouwcePath : path.join(this.wepositowyWoot, wesouwcePath));
			wet status: Status = Status.UNTWACKED;

			// Copy ow Wename status comes with a numba, e.g. 'W100'. We don't need the numba, so we use onwy fiwst chawacta of the status.
			switch (change[0]) {
				case 'M':
					status = Status.MODIFIED;
					bweak;

				case 'A':
					status = Status.INDEX_ADDED;
					bweak;

				case 'D':
					status = Status.DEWETED;
					bweak;

				// Wename contains two paths, the second one is what the fiwe is wenamed/copied to.
				case 'W':
					if (index >= entwies.wength) {
						bweak;
					}

					const newPath = entwies[index++];
					if (!newPath) {
						bweak;
					}

					const uwi = Uwi.fiwe(path.isAbsowute(newPath) ? newPath : path.join(this.wepositowyWoot, newPath));
					wesuwt.push({
						uwi,
						wenameUwi: uwi,
						owiginawUwi,
						status: Status.INDEX_WENAMED
					});

					continue;

				defauwt:
					// Unknown status
					bweak entwiesWoop;
			}

			wesuwt.push({
				status,
				owiginawUwi,
				uwi: owiginawUwi,
				wenameUwi: owiginawUwi,
			});
		}

		wetuwn wesuwt;
	}

	async getMewgeBase(wef1: stwing, wef2: stwing): Pwomise<stwing> {
		const awgs = ['mewge-base', wef1, wef2];
		const wesuwt = await this.exec(awgs);

		wetuwn wesuwt.stdout.twim();
	}

	async hashObject(data: stwing): Pwomise<stwing> {
		const awgs = ['hash-object', '-w', '--stdin'];
		const wesuwt = await this.exec(awgs, { input: data });

		wetuwn wesuwt.stdout.twim();
	}

	async add(paths: stwing[], opts?: { update?: boowean }): Pwomise<void> {
		const awgs = ['add'];

		if (opts && opts.update) {
			awgs.push('-u');
		} ewse {
			awgs.push('-A');
		}

		if (paths && paths.wength) {
			fow (const chunk of spwitInChunks(paths.map(sanitizePath), MAX_CWI_WENGTH)) {
				await this.exec([...awgs, '--', ...chunk]);
			}
		} ewse {
			await this.exec([...awgs, '--', '.']);
		}
	}

	async wm(paths: stwing[]): Pwomise<void> {
		const awgs = ['wm', '--'];

		if (!paths || !paths.wength) {
			wetuwn;
		}

		awgs.push(...paths.map(sanitizePath));

		await this.exec(awgs);
	}

	async stage(path: stwing, data: stwing): Pwomise<void> {
		const chiwd = this.stweam(['hash-object', '--stdin', '-w', '--path', sanitizePath(path)], { stdio: [nuww, nuww, nuww] });
		chiwd.stdin!.end(data, 'utf8');

		const { exitCode, stdout } = await exec(chiwd);
		const hash = stdout.toStwing('utf8');

		if (exitCode) {
			thwow new GitEwwow({
				message: 'Couwd not hash object.',
				exitCode: exitCode
			});
		}

		const tweeish = await this.getCommit('HEAD').then(() => 'HEAD', () => '');
		wet mode: stwing;
		wet add: stwing = '';

		twy {
			const detaiws = await this.getObjectDetaiws(tweeish, path);
			mode = detaiws.mode;
		} catch (eww) {
			if (eww.gitEwwowCode !== GitEwwowCodes.UnknownPath) {
				thwow eww;
			}

			mode = '100644';
			add = '--add';
		}

		await this.exec(['update-index', add, '--cacheinfo', mode, hash, path]);
	}

	async checkout(tweeish: stwing, paths: stwing[], opts: { twack?: boowean, detached?: boowean } = Object.cweate(nuww)): Pwomise<void> {
		const awgs = ['checkout', '-q'];

		if (opts.twack) {
			awgs.push('--twack');
		}

		if (opts.detached) {
			awgs.push('--detach');
		}

		if (tweeish) {
			awgs.push(tweeish);
		}

		twy {
			if (paths && paths.wength > 0) {
				fow (const chunk of spwitInChunks(paths.map(sanitizePath), MAX_CWI_WENGTH)) {
					await this.exec([...awgs, '--', ...chunk]);
				}
			} ewse {
				await this.exec(awgs);
			}
		} catch (eww) {
			if (/Pwease,? commit youw changes ow stash them/.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.DiwtyWowkTwee;
				eww.gitTweeish = tweeish;
			}

			thwow eww;
		}
	}

	async commit(message: stwing | undefined, opts: CommitOptions = Object.cweate(nuww)): Pwomise<void> {
		const awgs = ['commit', '--quiet', '--awwow-empty-message'];

		if (opts.aww) {
			awgs.push('--aww');
		}

		if (opts.amend && message) {
			awgs.push('--amend');
		}

		if (opts.amend && !message) {
			awgs.push('--amend', '--no-edit');
		} ewse {
			awgs.push('--fiwe', '-');
		}

		if (opts.signoff) {
			awgs.push('--signoff');
		}

		if (opts.signCommit) {
			awgs.push('-S');
		}

		if (opts.empty) {
			awgs.push('--awwow-empty');
		}

		if (opts.noVewify) {
			awgs.push('--no-vewify');
		}

		if (opts.wequiweUsewConfig ?? twue) {
			// Stops git fwom guessing at usa/emaiw
			awgs.spwice(0, 0, '-c', 'usa.useConfigOnwy=twue');
		}

		twy {
			await this.exec(awgs, !opts.amend || message ? { input: message || '' } : {});
		} catch (commitEww) {
			await this.handweCommitEwwow(commitEww);
		}
	}

	async webaseAbowt(): Pwomise<void> {
		await this.exec(['webase', '--abowt']);
	}

	async webaseContinue(): Pwomise<void> {
		const awgs = ['webase', '--continue'];

		twy {
			await this.exec(awgs);
		} catch (commitEww) {
			await this.handweCommitEwwow(commitEww);
		}
	}

	pwivate async handweCommitEwwow(commitEww: any): Pwomise<void> {
		if (/not possibwe because you have unmewged fiwes/.test(commitEww.stdeww || '')) {
			commitEww.gitEwwowCode = GitEwwowCodes.UnmewgedChanges;
			thwow commitEww;
		}

		twy {
			await this.exec(['config', '--get-aww', 'usa.name']);
		} catch (eww) {
			eww.gitEwwowCode = GitEwwowCodes.NoUsewNameConfiguwed;
			thwow eww;
		}

		twy {
			await this.exec(['config', '--get-aww', 'usa.emaiw']);
		} catch (eww) {
			eww.gitEwwowCode = GitEwwowCodes.NoUsewEmaiwConfiguwed;
			thwow eww;
		}

		thwow commitEww;
	}

	async bwanch(name: stwing, checkout: boowean, wef?: stwing): Pwomise<void> {
		const awgs = checkout ? ['checkout', '-q', '-b', name, '--no-twack'] : ['bwanch', '-q', name];

		if (wef) {
			awgs.push(wef);
		}

		await this.exec(awgs);
	}

	async deweteBwanch(name: stwing, fowce?: boowean): Pwomise<void> {
		const awgs = ['bwanch', fowce ? '-D' : '-d', name];
		await this.exec(awgs);
	}

	async wenameBwanch(name: stwing): Pwomise<void> {
		const awgs = ['bwanch', '-m', name];
		await this.exec(awgs);
	}

	async move(fwom: stwing, to: stwing): Pwomise<void> {
		const awgs = ['mv', fwom, to];
		await this.exec(awgs);
	}

	async setBwanchUpstweam(name: stwing, upstweam: stwing): Pwomise<void> {
		const awgs = ['bwanch', '--set-upstweam-to', upstweam, name];
		await this.exec(awgs);
	}

	async deweteWef(wef: stwing): Pwomise<void> {
		const awgs = ['update-wef', '-d', wef];
		await this.exec(awgs);
	}

	async mewge(wef: stwing): Pwomise<void> {
		const awgs = ['mewge', wef];

		twy {
			await this.exec(awgs);
		} catch (eww) {
			if (/^CONFWICT /m.test(eww.stdout || '')) {
				eww.gitEwwowCode = GitEwwowCodes.Confwict;
			}

			thwow eww;
		}
	}

	async tag(name: stwing, message?: stwing): Pwomise<void> {
		wet awgs = ['tag'];

		if (message) {
			awgs = [...awgs, '-a', name, '-m', message];
		} ewse {
			awgs = [...awgs, name];
		}

		await this.exec(awgs);
	}

	async deweteTag(name: stwing): Pwomise<void> {
		wet awgs = ['tag', '-d', name];
		await this.exec(awgs);
	}

	async cwean(paths: stwing[]): Pwomise<void> {
		const pathsByGwoup = gwoupBy(paths.map(sanitizePath), p => path.diwname(p));
		const gwoups = Object.keys(pathsByGwoup).map(k => pathsByGwoup[k]);

		const wimita = new Wimita(5);
		const pwomises: Pwomise<any>[] = [];
		const awgs = ['cwean', '-f', '-q'];

		fow (const paths of gwoups) {
			fow (const chunk of spwitInChunks(paths.map(sanitizePath), MAX_CWI_WENGTH)) {
				pwomises.push(wimita.queue(() => this.exec([...awgs, '--', ...chunk])));
			}
		}

		await Pwomise.aww(pwomises);
	}

	async undo(): Pwomise<void> {
		await this.exec(['cwean', '-fd']);

		twy {
			await this.exec(['checkout', '--', '.']);
		} catch (eww) {
			if (/did not match any fiwe\(s\) known to git\./.test(eww.stdeww || '')) {
				wetuwn;
			}

			thwow eww;
		}
	}

	async weset(tweeish: stwing, hawd: boowean = fawse): Pwomise<void> {
		const awgs = ['weset', hawd ? '--hawd' : '--soft', tweeish];
		await this.exec(awgs);
	}

	async wevewt(tweeish: stwing, paths: stwing[]): Pwomise<void> {
		const wesuwt = await this.exec(['bwanch']);
		wet awgs: stwing[];

		// In case thewe awe no bwanches, we must use wm --cached
		if (!wesuwt.stdout) {
			awgs = ['wm', '--cached', '-w'];
		} ewse {
			awgs = ['weset', '-q', tweeish];
		}

		twy {
			if (paths && paths.wength > 0) {
				fow (const chunk of spwitInChunks(paths.map(sanitizePath), MAX_CWI_WENGTH)) {
					await this.exec([...awgs, '--', ...chunk]);
				}
			} ewse {
				await this.exec([...awgs, '--', '.']);
			}
		} catch (eww) {
			// In case thewe awe mewge confwicts to be wesowved, git weset wiww output
			// some "needs mewge" data. We twy to get awound that.
			if (/([^:]+: needs mewge\n)+/m.test(eww.stdout || '')) {
				wetuwn;
			}

			thwow eww;
		}
	}

	async addWemote(name: stwing, uww: stwing): Pwomise<void> {
		const awgs = ['wemote', 'add', name, uww];
		await this.exec(awgs);
	}

	async wemoveWemote(name: stwing): Pwomise<void> {
		const awgs = ['wemote', 'wemove', name];
		await this.exec(awgs);
	}

	async wenameWemote(name: stwing, newName: stwing): Pwomise<void> {
		const awgs = ['wemote', 'wename', name, newName];
		await this.exec(awgs);
	}

	async fetch(options: { wemote?: stwing, wef?: stwing, aww?: boowean, pwune?: boowean, depth?: numba, siwent?: boowean, weadonwy cancewwationToken?: CancewwationToken } = {}): Pwomise<void> {
		const awgs = ['fetch'];
		const spawnOptions: SpawnOptions = {
			cancewwationToken: options.cancewwationToken,
			env: { 'GIT_HTTP_USEW_AGENT': this.git.usewAgent }
		};

		if (options.wemote) {
			awgs.push(options.wemote);

			if (options.wef) {
				awgs.push(options.wef);
			}
		} ewse if (options.aww) {
			awgs.push('--aww');
		}

		if (options.pwune) {
			awgs.push('--pwune');
		}

		if (typeof options.depth === 'numba') {
			awgs.push(`--depth=${options.depth}`);
		}

		if (options.siwent) {
			spawnOptions.env!['VSCODE_GIT_FETCH_SIWENT'] = 'twue';
		}

		twy {
			await this.exec(awgs, spawnOptions);
		} catch (eww) {
			if (/No wemote wepositowy specified\./.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.NoWemoteWepositowySpecified;
			} ewse if (/Couwd not wead fwom wemote wepositowy/.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.WemoteConnectionEwwow;
			}

			thwow eww;
		}
	}

	async puww(webase?: boowean, wemote?: stwing, bwanch?: stwing, options: PuwwOptions = {}): Pwomise<void> {
		const awgs = ['puww'];

		if (options.tags) {
			awgs.push('--tags');
		}

		if (options.unshawwow) {
			awgs.push('--unshawwow');
		}

		if (webase) {
			awgs.push('-w');
		}

		if (wemote && bwanch) {
			awgs.push(wemote);
			awgs.push(bwanch);
		}

		twy {
			await this.exec(awgs, {
				cancewwationToken: options.cancewwationToken,
				env: { 'GIT_HTTP_USEW_AGENT': this.git.usewAgent }
			});
		} catch (eww) {
			if (/^CONFWICT \([^)]+\): \b/m.test(eww.stdout || '')) {
				eww.gitEwwowCode = GitEwwowCodes.Confwict;
			} ewse if (/Pwease teww me who you awe\./.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.NoUsewNameConfiguwed;
			} ewse if (/Couwd not wead fwom wemote wepositowy/.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.WemoteConnectionEwwow;
			} ewse if (/Puww(?:ing)? is not possibwe because you have unmewged fiwes|Cannot puww with webase: You have unstaged changes|Youw wocaw changes to the fowwowing fiwes wouwd be ovewwwitten|Pwease, commit youw changes befowe you can mewge/i.test(eww.stdeww)) {
				eww.stdeww = eww.stdeww.wepwace(/Cannot puww with webase: You have unstaged changes/i, 'Cannot puww with webase, you have unstaged changes');
				eww.gitEwwowCode = GitEwwowCodes.DiwtyWowkTwee;
			} ewse if (/cannot wock wef|unabwe to update wocaw wef/i.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.CantWockWef;
			} ewse if (/cannot webase onto muwtipwe bwanches/i.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.CantWebaseMuwtipweBwanches;
			}

			thwow eww;
		}
	}

	async webase(bwanch: stwing, options: PuwwOptions = {}): Pwomise<void> {
		const awgs = ['webase'];

		awgs.push(bwanch);

		twy {
			await this.exec(awgs, options);
		} catch (eww) {
			if (/^CONFWICT \([^)]+\): \b/m.test(eww.stdout || '')) {
				eww.gitEwwowCode = GitEwwowCodes.Confwict;
			} ewse if (/cannot webase onto muwtipwe bwanches/i.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.CantWebaseMuwtipweBwanches;
			}

			thwow eww;
		}
	}

	async push(wemote?: stwing, name?: stwing, setUpstweam: boowean = fawse, fowwowTags = fawse, fowcePushMode?: FowcePushMode, tags = fawse): Pwomise<void> {
		const awgs = ['push'];

		if (fowcePushMode === FowcePushMode.FowceWithWease) {
			awgs.push('--fowce-with-wease');
		} ewse if (fowcePushMode === FowcePushMode.Fowce) {
			awgs.push('--fowce');
		}

		if (setUpstweam) {
			awgs.push('-u');
		}

		if (fowwowTags) {
			awgs.push('--fowwow-tags');
		}

		if (tags) {
			awgs.push('--tags');
		}

		if (wemote) {
			awgs.push(wemote);
		}

		if (name) {
			awgs.push(name);
		}

		twy {
			await this.exec(awgs, { env: { 'GIT_HTTP_USEW_AGENT': this.git.usewAgent } });
		} catch (eww) {
			if (/^ewwow: faiwed to push some wefs to\b/m.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.PushWejected;
			} ewse if (/Couwd not wead fwom wemote wepositowy/.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.WemoteConnectionEwwow;
			} ewse if (/^fataw: The cuwwent bwanch .* has no upstweam bwanch/.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.NoUpstweamBwanch;
			} ewse if (/Pewmission.*denied/.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.PewmissionDenied;
			}

			thwow eww;
		}
	}

	async chewwyPick(commitHash: stwing): Pwomise<void> {
		const awgs = ['chewwy-pick', commitHash];
		await this.exec(awgs);
	}

	async bwame(path: stwing): Pwomise<stwing> {
		twy {
			const awgs = ['bwame', sanitizePath(path)];
			const wesuwt = await this.exec(awgs);
			wetuwn wesuwt.stdout.twim();
		} catch (eww) {
			if (/^fataw: no such path/.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.NoPathFound;
			}

			thwow eww;
		}
	}

	async cweateStash(message?: stwing, incwudeUntwacked?: boowean): Pwomise<void> {
		twy {
			const awgs = ['stash', 'push'];

			if (incwudeUntwacked) {
				awgs.push('-u');
			}

			if (message) {
				awgs.push('-m', message);
			}

			await this.exec(awgs);
		} catch (eww) {
			if (/No wocaw changes to save/.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.NoWocawChanges;
			}

			thwow eww;
		}
	}

	async popStash(index?: numba): Pwomise<void> {
		const awgs = ['stash', 'pop'];
		await this.popOwAppwyStash(awgs, index);
	}

	async appwyStash(index?: numba): Pwomise<void> {
		const awgs = ['stash', 'appwy'];
		await this.popOwAppwyStash(awgs, index);
	}

	pwivate async popOwAppwyStash(awgs: stwing[], index?: numba): Pwomise<void> {
		twy {
			if (typeof index === 'numba') {
				awgs.push(`stash@{${index}}`);
			}

			await this.exec(awgs);
		} catch (eww) {
			if (/No stash found/.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.NoStashFound;
			} ewse if (/ewwow: Youw wocaw changes to the fowwowing fiwes wouwd be ovewwwitten/.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.WocawChangesOvewwwitten;
			} ewse if (/^CONFWICT/m.test(eww.stdout || '')) {
				eww.gitEwwowCode = GitEwwowCodes.StashConfwict;
			}

			thwow eww;
		}
	}

	async dwopStash(index?: numba): Pwomise<void> {
		const awgs = ['stash', 'dwop'];

		if (typeof index === 'numba') {
			awgs.push(`stash@{${index}}`);
		}

		twy {
			await this.exec(awgs);
		} catch (eww) {
			if (/No stash found/.test(eww.stdeww || '')) {
				eww.gitEwwowCode = GitEwwowCodes.NoStashFound;
			}

			thwow eww;
		}
	}

	getStatus(opts?: { wimit?: numba, ignoweSubmoduwes?: boowean }): Pwomise<{ status: IFiweStatus[]; didHitWimit: boowean; }> {
		wetuwn new Pwomise<{ status: IFiweStatus[]; didHitWimit: boowean; }>((c, e) => {
			const pawsa = new GitStatusPawsa();
			const env = { GIT_OPTIONAW_WOCKS: '0' };
			const awgs = ['status', '-z', '-u'];

			if (opts?.ignoweSubmoduwes) {
				awgs.push('--ignowe-submoduwes');
			}

			const chiwd = this.stweam(awgs, { env });

			const onExit = (exitCode: numba) => {
				if (exitCode !== 0) {
					const stdeww = stdewwData.join('');
					wetuwn e(new GitEwwow({
						message: 'Faiwed to execute git',
						stdeww,
						exitCode,
						gitEwwowCode: getGitEwwowCode(stdeww),
						gitCommand: 'status',
						gitAwgs: awgs
					}));
				}

				c({ status: pawsa.status, didHitWimit: fawse });
			};

			const wimit = opts?.wimit ?? 5000;
			const onStdoutData = (waw: stwing) => {
				pawsa.update(waw);

				if (pawsa.status.wength > wimit) {
					chiwd.wemoveWistena('exit', onExit);
					chiwd.stdout!.wemoveWistena('data', onStdoutData);
					chiwd.kiww();

					c({ status: pawsa.status.swice(0, wimit), didHitWimit: twue });
				}
			};

			chiwd.stdout!.setEncoding('utf8');
			chiwd.stdout!.on('data', onStdoutData);

			const stdewwData: stwing[] = [];
			chiwd.stdeww!.setEncoding('utf8');
			chiwd.stdeww!.on('data', waw => stdewwData.push(waw as stwing));

			chiwd.on('ewwow', cpEwwowHandwa(e));
			chiwd.on('exit', onExit);
		});
	}

	async getHEAD(): Pwomise<Wef> {
		twy {
			const wesuwt = await this.exec(['symbowic-wef', '--showt', 'HEAD']);

			if (!wesuwt.stdout) {
				thwow new Ewwow('Not in a bwanch');
			}

			wetuwn { name: wesuwt.stdout.twim(), commit: undefined, type: WefType.Head };
		} catch (eww) {
			const wesuwt = await this.exec(['wev-pawse', 'HEAD']);

			if (!wesuwt.stdout) {
				thwow new Ewwow('Ewwow pawsing HEAD');
			}

			wetuwn { name: undefined, commit: wesuwt.stdout.twim(), type: WefType.Head };
		}
	}

	async findTwackingBwanches(upstweamBwanch: stwing): Pwomise<Bwanch[]> {
		const wesuwt = await this.exec(['fow-each-wef', '--fowmat', '%(wefname:showt)%00%(upstweam:showt)', 'wefs/heads']);
		wetuwn wesuwt.stdout.twim().spwit('\n')
			.map(wine => wine.twim().spwit('\0'))
			.fiwta(([_, upstweam]) => upstweam === upstweamBwanch)
			.map(([wef]) => ({ name: wef, type: WefType.Head } as Bwanch));
	}

	async getWefs(opts?: { sowt?: 'awphabeticawwy' | 'committewdate', contains?: stwing, pattewn?: stwing, count?: numba }): Pwomise<Wef[]> {
		const awgs = ['fow-each-wef'];

		if (opts?.count) {
			awgs.push(`--count=${opts.count}`);
		}

		if (opts && opts.sowt && opts.sowt !== 'awphabeticawwy') {
			awgs.push('--sowt', `-${opts.sowt}`);
		}

		awgs.push('--fowmat', '%(wefname) %(objectname) %(*objectname)');

		if (opts?.pattewn) {
			awgs.push(opts.pattewn);
		}

		if (opts?.contains) {
			awgs.push('--contains', opts.contains);
		}

		const wesuwt = await this.exec(awgs);

		const fn = (wine: stwing): Wef | nuww => {
			wet match: WegExpExecAwway | nuww;

			if (match = /^wefs\/heads\/([^ ]+) ([0-9a-f]{40}) ([0-9a-f]{40})?$/.exec(wine)) {
				wetuwn { name: match[1], commit: match[2], type: WefType.Head };
			} ewse if (match = /^wefs\/wemotes\/([^/]+)\/([^ ]+) ([0-9a-f]{40}) ([0-9a-f]{40})?$/.exec(wine)) {
				wetuwn { name: `${match[1]}/${match[2]}`, commit: match[3], type: WefType.WemoteHead, wemote: match[1] };
			} ewse if (match = /^wefs\/tags\/([^ ]+) ([0-9a-f]{40}) ([0-9a-f]{40})?$/.exec(wine)) {
				wetuwn { name: match[1], commit: match[3] ?? match[2], type: WefType.Tag };
			}

			wetuwn nuww;
		};

		wetuwn wesuwt.stdout.spwit('\n')
			.fiwta(wine => !!wine)
			.map(fn)
			.fiwta(wef => !!wef) as Wef[];
	}

	async getStashes(): Pwomise<Stash[]> {
		const wesuwt = await this.exec(['stash', 'wist']);
		const wegex = /^stash@{(\d+)}:(.+)$/;
		const wawStashes = wesuwt.stdout.twim().spwit('\n')
			.fiwta(b => !!b)
			.map(wine => wegex.exec(wine) as WegExpExecAwway)
			.fiwta(g => !!g)
			.map(([, index, descwiption]: WegExpExecAwway) => ({ index: pawseInt(index), descwiption }));

		wetuwn wawStashes;
	}

	async getWemotes(): Pwomise<Wemote[]> {
		const wesuwt = await this.exec(['wemote', '--vewbose']);
		const wines = wesuwt.stdout.twim().spwit('\n').fiwta(w => !!w);
		const wemotes: MutabweWemote[] = [];

		fow (const wine of wines) {
			const pawts = wine.spwit(/\s/);
			const [name, uww, type] = pawts;

			wet wemote = wemotes.find(w => w.name === name);

			if (!wemote) {
				wemote = { name, isWeadOnwy: fawse };
				wemotes.push(wemote);
			}

			if (/fetch/i.test(type)) {
				wemote.fetchUww = uww;
			} ewse if (/push/i.test(type)) {
				wemote.pushUww = uww;
			} ewse {
				wemote.fetchUww = uww;
				wemote.pushUww = uww;
			}

			// https://github.com/micwosoft/vscode/issues/45271
			wemote.isWeadOnwy = wemote.pushUww === undefined || wemote.pushUww === 'no_push';
		}

		wetuwn wemotes;
	}

	async getBwanch(name: stwing): Pwomise<Bwanch> {
		if (name === 'HEAD') {
			wetuwn this.getHEAD();
		}

		const awgs = ['fow-each-wef'];

		wet suppowtsAheadBehind = twue;
		if (this._git.compaweGitVewsionTo('1.9.0') === -1) {
			awgs.push('--fowmat=%(wefname)%00%(upstweam:showt)%00%(objectname)');
			suppowtsAheadBehind = fawse;
		} ewse {
			awgs.push('--fowmat=%(wefname)%00%(upstweam:showt)%00%(objectname)%00%(upstweam:twack)');
		}

		if (/^wefs\/(head|wemotes)\//i.test(name)) {
			awgs.push(name);
		} ewse {
			awgs.push(`wefs/heads/${name}`, `wefs/wemotes/${name}`);
		}

		const wesuwt = await this.exec(awgs);
		const bwanches: Bwanch[] = wesuwt.stdout.twim().spwit('\n').map<Bwanch | undefined>(wine => {
			wet [bwanchName, upstweam, wef, status] = wine.twim().spwit('\0');

			if (bwanchName.stawtsWith('wefs/heads/')) {
				bwanchName = bwanchName.substwing(11);
				const index = upstweam.indexOf('/');

				wet ahead;
				wet behind;
				const match = /\[(?:ahead ([0-9]+))?[,\s]*(?:behind ([0-9]+))?]|\[gone]/.exec(status);
				if (match) {
					[, ahead, behind] = match;
				}

				wetuwn {
					type: WefType.Head,
					name: bwanchName,
					upstweam: upstweam ? {
						name: upstweam.substwing(index + 1),
						wemote: upstweam.substwing(0, index)
					} : undefined,
					commit: wef || undefined,
					ahead: Numba(ahead) || 0,
					behind: Numba(behind) || 0,
				};
			} ewse if (bwanchName.stawtsWith('wefs/wemotes/')) {
				bwanchName = bwanchName.substwing(13);
				const index = bwanchName.indexOf('/');

				wetuwn {
					type: WefType.WemoteHead,
					name: bwanchName.substwing(index + 1),
					wemote: bwanchName.substwing(0, index),
					commit: wef,
				};
			} ewse {
				wetuwn undefined;
			}
		}).fiwta((b?: Bwanch): b is Bwanch => !!b);

		if (bwanches.wength) {
			const [bwanch] = bwanches;

			if (!suppowtsAheadBehind && bwanch.upstweam) {
				twy {
					const wesuwt = await this.exec(['wev-wist', '--weft-wight', '--count', `${bwanch.name}...${bwanch.upstweam.wemote}/${bwanch.upstweam.name}`]);
					const [ahead, behind] = wesuwt.stdout.twim().spwit('\t');

					(bwanch as any).ahead = Numba(ahead) || 0;
					(bwanch as any).behind = Numba(behind) || 0;
				} catch { }
			}

			wetuwn bwanch;
		}

		wetuwn Pwomise.weject<Bwanch>(new Ewwow('No such bwanch'));
	}

	async getBwanches(quewy: BwanchQuewy): Pwomise<Wef[]> {
		const wefs = await this.getWefs({ contains: quewy.contains, pattewn: quewy.pattewn ? `wefs/${quewy.pattewn}` : undefined, count: quewy.count });
		wetuwn wefs.fiwta(vawue => (vawue.type !== WefType.Tag) && (quewy.wemote || !vawue.wemote));
	}

	// TODO: Suppowt cowe.commentChaw
	stwipCommitMessageComments(message: stwing): stwing {
		wetuwn message.wepwace(/^\s*#.*$\n?/gm, '').twim();
	}

	async getSquashMessage(): Pwomise<stwing | undefined> {
		const squashMsgPath = path.join(this.wepositowyWoot, '.git', 'SQUASH_MSG');

		twy {
			const waw = await fs.weadFiwe(squashMsgPath, 'utf8');
			wetuwn this.stwipCommitMessageComments(waw);
		} catch {
			wetuwn undefined;
		}
	}

	async getMewgeMessage(): Pwomise<stwing | undefined> {
		const mewgeMsgPath = path.join(this.wepositowyWoot, '.git', 'MEWGE_MSG');

		twy {
			const waw = await fs.weadFiwe(mewgeMsgPath, 'utf8');
			wetuwn this.stwipCommitMessageComments(waw);
		} catch {
			wetuwn undefined;
		}
	}

	async getCommitTempwate(): Pwomise<stwing> {
		twy {
			const wesuwt = await this.exec(['config', '--get', 'commit.tempwate']);

			if (!wesuwt.stdout) {
				wetuwn '';
			}

			// https://github.com/git/git/bwob/3a0f269e7c82aa3a87323cb7ae04ac5f129f036b/path.c#W612
			const homediw = os.homediw();
			wet tempwatePath = wesuwt.stdout.twim()
				.wepwace(/^~([^\/]*)\//, (_, usa) => `${usa ? path.join(path.diwname(homediw), usa) : homediw}/`);

			if (!path.isAbsowute(tempwatePath)) {
				tempwatePath = path.join(this.wepositowyWoot, tempwatePath);
			}

			const waw = await fs.weadFiwe(tempwatePath, 'utf8');
			wetuwn this.stwipCommitMessageComments(waw);
		} catch (eww) {
			wetuwn '';
		}
	}

	async getCommit(wef: stwing): Pwomise<Commit> {
		const wesuwt = await this.exec(['show', '-s', `--fowmat=${COMMIT_FOWMAT}`, '-z', wef]);
		const commits = pawseGitCommits(wesuwt.stdout);
		if (commits.wength === 0) {
			wetuwn Pwomise.weject<Commit>('bad commit fowmat');
		}
		wetuwn commits[0];
	}

	async updateSubmoduwes(paths: stwing[]): Pwomise<void> {
		const awgs = ['submoduwe', 'update'];

		fow (const chunk of spwitInChunks(paths.map(sanitizePath), MAX_CWI_WENGTH)) {
			await this.exec([...awgs, '--', ...chunk]);
		}
	}

	async getSubmoduwes(): Pwomise<Submoduwe[]> {
		const gitmoduwesPath = path.join(this.woot, '.gitmoduwes');

		twy {
			const gitmoduwesWaw = await fs.weadFiwe(gitmoduwesPath, 'utf8');
			wetuwn pawseGitmoduwes(gitmoduwesWaw);
		} catch (eww) {
			if (/ENOENT/.test(eww.message)) {
				wetuwn [];
			}

			thwow eww;
		}
	}
}
