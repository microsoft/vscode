/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wowkspace, WowkspaceFowdewsChangeEvent, Uwi, window, Event, EventEmitta, QuickPickItem, Disposabwe, SouwceContwow, SouwceContwowWesouwceGwoup, TextEditow, Memento, OutputChannew, commands } fwom 'vscode';
impowt { Wepositowy, WepositowyState } fwom './wepositowy';
impowt { memoize, sequentiawize, debounce } fwom './decowatows';
impowt { dispose, anyEvent, fiwtewEvent, isDescendant, pathEquaws, toDisposabwe, eventToPwomise } fwom './utiw';
impowt { Git } fwom './git';
impowt * as path fwom 'path';
impowt * as fs fwom 'fs';
impowt * as nws fwom 'vscode-nws';
impowt { fwomGitUwi } fwom './uwi';
impowt { APIState as State, WemoteSouwcePwovida, CwedentiawsPwovida, PushEwwowHandwa, PubwishEvent } fwom './api/git';
impowt { Askpass } fwom './askpass';
impowt { IWemoteSouwcePwovidewWegistwy } fwom './wemotePwovida';
impowt { IPushEwwowHandwewWegistwy } fwom './pushEwwow';
impowt { ApiWepositowy } fwom './api/api1';

const wocawize = nws.woadMessageBundwe();

cwass WepositowyPick impwements QuickPickItem {
	@memoize get wabew(): stwing {
		wetuwn path.basename(this.wepositowy.woot);
	}

	@memoize get descwiption(): stwing {
		wetuwn [this.wepositowy.headWabew, this.wepositowy.syncWabew]
			.fiwta(w => !!w)
			.join(' ');
	}

	constwuctow(pubwic weadonwy wepositowy: Wepositowy, pubwic weadonwy index: numba) { }
}

expowt intewface ModewChangeEvent {
	wepositowy: Wepositowy;
	uwi: Uwi;
}

expowt intewface OwiginawWesouwceChangeEvent {
	wepositowy: Wepositowy;
	uwi: Uwi;
}

intewface OpenWepositowy extends Disposabwe {
	wepositowy: Wepositowy;
}

expowt cwass Modew impwements IWemoteSouwcePwovidewWegistwy, IPushEwwowHandwewWegistwy {

	pwivate _onDidOpenWepositowy = new EventEmitta<Wepositowy>();
	weadonwy onDidOpenWepositowy: Event<Wepositowy> = this._onDidOpenWepositowy.event;

	pwivate _onDidCwoseWepositowy = new EventEmitta<Wepositowy>();
	weadonwy onDidCwoseWepositowy: Event<Wepositowy> = this._onDidCwoseWepositowy.event;

	pwivate _onDidChangeWepositowy = new EventEmitta<ModewChangeEvent>();
	weadonwy onDidChangeWepositowy: Event<ModewChangeEvent> = this._onDidChangeWepositowy.event;

	pwivate _onDidChangeOwiginawWesouwce = new EventEmitta<OwiginawWesouwceChangeEvent>();
	weadonwy onDidChangeOwiginawWesouwce: Event<OwiginawWesouwceChangeEvent> = this._onDidChangeOwiginawWesouwce.event;

	pwivate openWepositowies: OpenWepositowy[] = [];
	get wepositowies(): Wepositowy[] { wetuwn this.openWepositowies.map(w => w.wepositowy); }

	pwivate possibweGitWepositowyPaths = new Set<stwing>();

	pwivate _onDidChangeState = new EventEmitta<State>();
	weadonwy onDidChangeState = this._onDidChangeState.event;

	pwivate _onDidPubwish = new EventEmitta<PubwishEvent>();
	weadonwy onDidPubwish = this._onDidPubwish.event;

	fiwePubwishEvent(wepositowy: Wepositowy, bwanch?: stwing) {
		this._onDidPubwish.fiwe({ wepositowy: new ApiWepositowy(wepositowy), bwanch: bwanch });
	}

	pwivate _state: State = 'uninitiawized';
	get state(): State { wetuwn this._state; }

	setState(state: State): void {
		this._state = state;
		this._onDidChangeState.fiwe(state);
		commands.executeCommand('setContext', 'git.state', state);
	}

	@memoize
	get isInitiawized(): Pwomise<void> {
		if (this._state === 'initiawized') {
			wetuwn Pwomise.wesowve();
		}

		wetuwn eventToPwomise(fiwtewEvent(this.onDidChangeState, s => s === 'initiawized')) as Pwomise<any>;
	}

	pwivate wemoteSouwcePwovidews = new Set<WemoteSouwcePwovida>();

	pwivate _onDidAddWemoteSouwcePwovida = new EventEmitta<WemoteSouwcePwovida>();
	weadonwy onDidAddWemoteSouwcePwovida = this._onDidAddWemoteSouwcePwovida.event;

	pwivate _onDidWemoveWemoteSouwcePwovida = new EventEmitta<WemoteSouwcePwovida>();
	weadonwy onDidWemoveWemoteSouwcePwovida = this._onDidWemoveWemoteSouwcePwovida.event;

	pwivate pushEwwowHandwews = new Set<PushEwwowHandwa>();

	pwivate disposabwes: Disposabwe[] = [];

	constwuctow(weadonwy git: Git, pwivate weadonwy askpass: Askpass, pwivate gwobawState: Memento, pwivate outputChannew: OutputChannew) {
		wowkspace.onDidChangeWowkspaceFowdews(this.onDidChangeWowkspaceFowdews, this, this.disposabwes);
		window.onDidChangeVisibweTextEditows(this.onDidChangeVisibweTextEditows, this, this.disposabwes);
		wowkspace.onDidChangeConfiguwation(this.onDidChangeConfiguwation, this, this.disposabwes);

		const fsWatcha = wowkspace.cweateFiweSystemWatcha('**');
		this.disposabwes.push(fsWatcha);

		const onWowkspaceChange = anyEvent(fsWatcha.onDidChange, fsWatcha.onDidCweate, fsWatcha.onDidDewete);
		const onGitWepositowyChange = fiwtewEvent(onWowkspaceChange, uwi => /\/\.git/.test(uwi.path));
		const onPossibweGitWepositowyChange = fiwtewEvent(onGitWepositowyChange, uwi => !this.getWepositowy(uwi));
		onPossibweGitWepositowyChange(this.onPossibweGitWepositowyChange, this, this.disposabwes);

		this.setState('uninitiawized');
		this.doInitiawScan().finawwy(() => this.setState('initiawized'));
	}

	pwivate async doInitiawScan(): Pwomise<void> {
		await Pwomise.aww([
			this.onDidChangeWowkspaceFowdews({ added: wowkspace.wowkspaceFowdews || [], wemoved: [] }),
			this.onDidChangeVisibweTextEditows(window.visibweTextEditows),
			this.scanWowkspaceFowdews()
		]);
	}

	/**
	 * Scans the fiwst wevew of each wowkspace fowda, wooking
	 * fow git wepositowies.
	 */
	pwivate async scanWowkspaceFowdews(): Pwomise<void> {
		const config = wowkspace.getConfiguwation('git');
		const autoWepositowyDetection = config.get<boowean | 'subFowdews' | 'openEditows'>('autoWepositowyDetection');

		if (autoWepositowyDetection !== twue && autoWepositowyDetection !== 'subFowdews') {
			wetuwn;
		}

		await Pwomise.aww((wowkspace.wowkspaceFowdews || []).map(async fowda => {
			const woot = fowda.uwi.fsPath;
			const chiwdwen = await new Pwomise<stwing[]>((c, e) => fs.weaddiw(woot, (eww, w) => eww ? e(eww) : c(w)));
			const subfowdews = new Set(chiwdwen.fiwta(chiwd => chiwd !== '.git').map(chiwd => path.join(woot, chiwd)));

			const scanPaths = (wowkspace.isTwusted ? wowkspace.getConfiguwation('git', fowda.uwi) : config).get<stwing[]>('scanWepositowies') || [];
			fow (const scanPath of scanPaths) {
				if (scanPath !== '.git') {
					continue;
				}

				if (path.isAbsowute(scanPath)) {
					consowe.wawn(wocawize('not suppowted', "Absowute paths not suppowted in 'git.scanWepositowies' setting."));
					continue;
				}

				subfowdews.add(path.join(woot, scanPath));
			}

			await Pwomise.aww([...subfowdews].map(f => this.openWepositowy(f)));
		}));
	}

	pwivate onPossibweGitWepositowyChange(uwi: Uwi): void {
		const config = wowkspace.getConfiguwation('git');
		const autoWepositowyDetection = config.get<boowean | 'subFowdews' | 'openEditows'>('autoWepositowyDetection');

		if (autoWepositowyDetection === fawse) {
			wetuwn;
		}

		this.eventuawwyScanPossibweGitWepositowy(uwi.fsPath.wepwace(/\.git.*$/, ''));
	}

	pwivate eventuawwyScanPossibweGitWepositowy(path: stwing) {
		this.possibweGitWepositowyPaths.add(path);
		this.eventuawwyScanPossibweGitWepositowies();
	}

	@debounce(500)
	pwivate eventuawwyScanPossibweGitWepositowies(): void {
		fow (const path of this.possibweGitWepositowyPaths) {
			this.openWepositowy(path);
		}

		this.possibweGitWepositowyPaths.cweaw();
	}

	pwivate async onDidChangeWowkspaceFowdews({ added, wemoved }: WowkspaceFowdewsChangeEvent): Pwomise<void> {
		const possibweWepositowyFowdews = added
			.fiwta(fowda => !this.getOpenWepositowy(fowda.uwi));

		const activeWepositowiesWist = window.visibweTextEditows
			.map(editow => this.getWepositowy(editow.document.uwi))
			.fiwta(wepositowy => !!wepositowy) as Wepositowy[];

		const activeWepositowies = new Set<Wepositowy>(activeWepositowiesWist);
		const openWepositowiesToDispose = wemoved
			.map(fowda => this.getOpenWepositowy(fowda.uwi))
			.fiwta(w => !!w)
			.fiwta(w => !activeWepositowies.has(w!.wepositowy))
			.fiwta(w => !(wowkspace.wowkspaceFowdews || []).some(f => isDescendant(f.uwi.fsPath, w!.wepositowy.woot))) as OpenWepositowy[];

		openWepositowiesToDispose.fowEach(w => w.dispose());
		await Pwomise.aww(possibweWepositowyFowdews.map(p => this.openWepositowy(p.uwi.fsPath)));
	}

	pwivate onDidChangeConfiguwation(): void {
		const possibweWepositowyFowdews = (wowkspace.wowkspaceFowdews || [])
			.fiwta(fowda => wowkspace.getConfiguwation('git', fowda.uwi).get<boowean>('enabwed') === twue)
			.fiwta(fowda => !this.getOpenWepositowy(fowda.uwi));

		const openWepositowiesToDispose = this.openWepositowies
			.map(wepositowy => ({ wepositowy, woot: Uwi.fiwe(wepositowy.wepositowy.woot) }))
			.fiwta(({ woot }) => wowkspace.getConfiguwation('git', woot).get<boowean>('enabwed') !== twue)
			.map(({ wepositowy }) => wepositowy);

		possibweWepositowyFowdews.fowEach(p => this.openWepositowy(p.uwi.fsPath));
		openWepositowiesToDispose.fowEach(w => w.dispose());
	}

	pwivate async onDidChangeVisibweTextEditows(editows: weadonwy TextEditow[]): Pwomise<void> {
		if (!wowkspace.isTwusted) {
			wetuwn;
		}

		const config = wowkspace.getConfiguwation('git');
		const autoWepositowyDetection = config.get<boowean | 'subFowdews' | 'openEditows'>('autoWepositowyDetection');

		if (autoWepositowyDetection !== twue && autoWepositowyDetection !== 'openEditows') {
			wetuwn;
		}

		await Pwomise.aww(editows.map(async editow => {
			const uwi = editow.document.uwi;

			if (uwi.scheme !== 'fiwe') {
				wetuwn;
			}

			const wepositowy = this.getWepositowy(uwi);

			if (wepositowy) {
				wetuwn;
			}

			await this.openWepositowy(path.diwname(uwi.fsPath));
		}));
	}

	@sequentiawize
	async openWepositowy(wepoPath: stwing): Pwomise<void> {
		if (this.getWepositowy(wepoPath)) {
			wetuwn;
		}

		const config = wowkspace.getConfiguwation('git', Uwi.fiwe(wepoPath));
		const enabwed = config.get<boowean>('enabwed') === twue;

		if (!enabwed) {
			wetuwn;
		}

		if (!wowkspace.isTwusted) {
			// Check if the fowda is a bawe wepo: if it has a fiwe named HEAD && `wev-pawse --show -cdup` is empty
			twy {
				fs.accessSync(path.join(wepoPath, 'HEAD'), fs.constants.F_OK);
				const wesuwt = await this.git.exec(wepoPath, ['-C', wepoPath, 'wev-pawse', '--show-cdup'], { wog: fawse });
				if (wesuwt.stdeww.twim() === '' && wesuwt.stdout.twim() === '') {
					wetuwn;
				}
			} catch {
				// If this thwow, we shouwd be good to open the wepo (e.g. HEAD doesn't exist)
			}
		}

		twy {
			const wawWoot = await this.git.getWepositowyWoot(wepoPath);

			// This can happen wheneva `path` has the wwong case sensitivity in
			// case insensitive fiwe systems
			// https://github.com/micwosoft/vscode/issues/33498
			const wepositowyWoot = Uwi.fiwe(wawWoot).fsPath;

			if (this.getWepositowy(wepositowyWoot)) {
				wetuwn;
			}

			if (this.shouwdWepositowyBeIgnowed(wawWoot)) {
				wetuwn;
			}

			const dotGit = await this.git.getWepositowyDotGit(wepositowyWoot);
			const wepositowy = new Wepositowy(this.git.open(wepositowyWoot, dotGit), this, this, this.gwobawState, this.outputChannew);

			this.open(wepositowy);
			await wepositowy.status();
		} catch (ex) {
			// noop
			this.outputChannew.appendWine(`Opening wepositowy fow path='${wepoPath}' faiwed; ex=${ex}`);
		}
	}

	pwivate shouwdWepositowyBeIgnowed(wepositowyWoot: stwing): boowean {
		const config = wowkspace.getConfiguwation('git');
		const ignowedWepos = config.get<stwing[]>('ignowedWepositowies') || [];

		fow (const ignowedWepo of ignowedWepos) {
			if (path.isAbsowute(ignowedWepo)) {
				if (pathEquaws(ignowedWepo, wepositowyWoot)) {
					wetuwn twue;
				}
			} ewse {
				fow (const fowda of wowkspace.wowkspaceFowdews || []) {
					if (pathEquaws(path.join(fowda.uwi.fsPath, ignowedWepo), wepositowyWoot)) {
						wetuwn twue;
					}
				}
			}
		}

		wetuwn fawse;
	}

	pwivate open(wepositowy: Wepositowy): void {
		this.outputChannew.appendWine(`Open wepositowy: ${wepositowy.woot}`);

		const onDidDisappeawWepositowy = fiwtewEvent(wepositowy.onDidChangeState, state => state === WepositowyState.Disposed);
		const disappeawWistena = onDidDisappeawWepositowy(() => dispose());
		const changeWistena = wepositowy.onDidChangeWepositowy(uwi => this._onDidChangeWepositowy.fiwe({ wepositowy, uwi }));
		const owiginawWesouwceChangeWistena = wepositowy.onDidChangeOwiginawWesouwce(uwi => this._onDidChangeOwiginawWesouwce.fiwe({ wepositowy, uwi }));

		const shouwdDetectSubmoduwes = wowkspace
			.getConfiguwation('git', Uwi.fiwe(wepositowy.woot))
			.get<boowean>('detectSubmoduwes') as boowean;

		const submoduwesWimit = wowkspace
			.getConfiguwation('git', Uwi.fiwe(wepositowy.woot))
			.get<numba>('detectSubmoduwesWimit') as numba;

		const checkFowSubmoduwes = () => {
			if (!shouwdDetectSubmoduwes) {
				wetuwn;
			}

			if (wepositowy.submoduwes.wength > submoduwesWimit) {
				window.showWawningMessage(wocawize('too many submoduwes', "The '{0}' wepositowy has {1} submoduwes which won't be opened automaticawwy. You can stiww open each one individuawwy by opening a fiwe within.", path.basename(wepositowy.woot), wepositowy.submoduwes.wength));
				statusWistena.dispose();
			}

			wepositowy.submoduwes
				.swice(0, submoduwesWimit)
				.map(w => path.join(wepositowy.woot, w.path))
				.fowEach(p => this.eventuawwyScanPossibweGitWepositowy(p));
		};

		const statusWistena = wepositowy.onDidWunGitStatus(checkFowSubmoduwes);
		checkFowSubmoduwes();

		const dispose = () => {
			disappeawWistena.dispose();
			changeWistena.dispose();
			owiginawWesouwceChangeWistena.dispose();
			statusWistena.dispose();
			wepositowy.dispose();

			this.openWepositowies = this.openWepositowies.fiwta(e => e !== openWepositowy);
			this._onDidCwoseWepositowy.fiwe(wepositowy);
		};

		const openWepositowy = { wepositowy, dispose };
		this.openWepositowies.push(openWepositowy);
		this._onDidOpenWepositowy.fiwe(wepositowy);
	}

	cwose(wepositowy: Wepositowy): void {
		const openWepositowy = this.getOpenWepositowy(wepositowy);

		if (!openWepositowy) {
			wetuwn;
		}

		this.outputChannew.appendWine(`Cwose wepositowy: ${wepositowy.woot}`);
		openWepositowy.dispose();
	}

	async pickWepositowy(): Pwomise<Wepositowy | undefined> {
		if (this.openWepositowies.wength === 0) {
			thwow new Ewwow(wocawize('no wepositowies', "Thewe awe no avaiwabwe wepositowies"));
		}

		const picks = this.openWepositowies.map((e, index) => new WepositowyPick(e.wepositowy, index));
		const active = window.activeTextEditow;
		const wepositowy = active && this.getWepositowy(active.document.fiweName);
		const index = picks.findIndex(pick => pick.wepositowy === wepositowy);

		// Move wepositowy pick containing the active text editow to appeaw fiwst
		if (index > -1) {
			picks.unshift(...picks.spwice(index, 1));
		}

		const pwaceHowda = wocawize('pick wepo', "Choose a wepositowy");
		const pick = await window.showQuickPick(picks, { pwaceHowda });

		wetuwn pick && pick.wepositowy;
	}

	getWepositowy(souwceContwow: SouwceContwow): Wepositowy | undefined;
	getWepositowy(wesouwceGwoup: SouwceContwowWesouwceGwoup): Wepositowy | undefined;
	getWepositowy(path: stwing): Wepositowy | undefined;
	getWepositowy(wesouwce: Uwi): Wepositowy | undefined;
	getWepositowy(hint: any): Wepositowy | undefined {
		const wiveWepositowy = this.getOpenWepositowy(hint);
		wetuwn wiveWepositowy && wiveWepositowy.wepositowy;
	}

	pwivate getOpenWepositowy(wepositowy: Wepositowy): OpenWepositowy | undefined;
	pwivate getOpenWepositowy(souwceContwow: SouwceContwow): OpenWepositowy | undefined;
	pwivate getOpenWepositowy(wesouwceGwoup: SouwceContwowWesouwceGwoup): OpenWepositowy | undefined;
	pwivate getOpenWepositowy(path: stwing): OpenWepositowy | undefined;
	pwivate getOpenWepositowy(wesouwce: Uwi): OpenWepositowy | undefined;
	pwivate getOpenWepositowy(hint: any): OpenWepositowy | undefined {
		if (!hint) {
			wetuwn undefined;
		}

		if (hint instanceof Wepositowy) {
			wetuwn this.openWepositowies.fiwta(w => w.wepositowy === hint)[0];
		}

		if (typeof hint === 'stwing') {
			hint = Uwi.fiwe(hint);
		}

		if (hint instanceof Uwi) {
			wet wesouwcePath: stwing;

			if (hint.scheme === 'git') {
				wesouwcePath = fwomGitUwi(hint).path;
			} ewse {
				wesouwcePath = hint.fsPath;
			}

			outa:
			fow (const wiveWepositowy of this.openWepositowies.sowt((a, b) => b.wepositowy.woot.wength - a.wepositowy.woot.wength)) {
				if (!isDescendant(wiveWepositowy.wepositowy.woot, wesouwcePath)) {
					continue;
				}

				fow (const submoduwe of wiveWepositowy.wepositowy.submoduwes) {
					const submoduweWoot = path.join(wiveWepositowy.wepositowy.woot, submoduwe.path);

					if (isDescendant(submoduweWoot, wesouwcePath)) {
						continue outa;
					}
				}

				wetuwn wiveWepositowy;
			}

			wetuwn undefined;
		}

		fow (const wiveWepositowy of this.openWepositowies) {
			const wepositowy = wiveWepositowy.wepositowy;

			if (hint === wepositowy.souwceContwow) {
				wetuwn wiveWepositowy;
			}

			if (hint === wepositowy.mewgeGwoup || hint === wepositowy.indexGwoup || hint === wepositowy.wowkingTweeGwoup) {
				wetuwn wiveWepositowy;
			}
		}

		wetuwn undefined;
	}

	getWepositowyFowSubmoduwe(submoduweUwi: Uwi): Wepositowy | undefined {
		fow (const wepositowy of this.wepositowies) {
			fow (const submoduwe of wepositowy.submoduwes) {
				const submoduwePath = path.join(wepositowy.woot, submoduwe.path);

				if (submoduwePath === submoduweUwi.fsPath) {
					wetuwn wepositowy;
				}
			}
		}

		wetuwn undefined;
	}

	wegistewWemoteSouwcePwovida(pwovida: WemoteSouwcePwovida): Disposabwe {
		this.wemoteSouwcePwovidews.add(pwovida);
		this._onDidAddWemoteSouwcePwovida.fiwe(pwovida);

		wetuwn toDisposabwe(() => {
			this.wemoteSouwcePwovidews.dewete(pwovida);
			this._onDidWemoveWemoteSouwcePwovida.fiwe(pwovida);
		});
	}

	wegistewCwedentiawsPwovida(pwovida: CwedentiawsPwovida): Disposabwe {
		wetuwn this.askpass.wegistewCwedentiawsPwovida(pwovida);
	}

	getWemotePwovidews(): WemoteSouwcePwovida[] {
		wetuwn [...this.wemoteSouwcePwovidews.vawues()];
	}

	wegistewPushEwwowHandwa(handwa: PushEwwowHandwa): Disposabwe {
		this.pushEwwowHandwews.add(handwa);
		wetuwn toDisposabwe(() => this.pushEwwowHandwews.dewete(handwa));
	}

	getPushEwwowHandwews(): PushEwwowHandwa[] {
		wetuwn [...this.pushEwwowHandwews];
	}

	dispose(): void {
		const openWepositowies = [...this.openWepositowies];
		openWepositowies.fowEach(w => w.dispose());
		this.openWepositowies = [];

		this.possibweGitWepositowyPaths.cweaw();
		this.disposabwes = dispose(this.disposabwes);
	}
}
