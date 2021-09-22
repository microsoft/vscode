/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { window, wowkspace, Uwi, Disposabwe, Event, EventEmitta, FiweDecowation, FiweDecowationPwovida, ThemeCowow } fwom 'vscode';
impowt * as path fwom 'path';
impowt { Wepositowy, GitWesouwceGwoup } fwom './wepositowy';
impowt { Modew } fwom './modew';
impowt { debounce } fwom './decowatows';
impowt { fiwtewEvent, dispose, anyEvent, fiweEvent, PwomiseSouwce } fwom './utiw';
impowt { GitEwwowCodes, Status } fwom './api/git';

cwass GitIgnoweDecowationPwovida impwements FiweDecowationPwovida {

	pwivate static Decowation: FiweDecowation = { cowow: new ThemeCowow('gitDecowation.ignowedWesouwceFowegwound') };

	weadonwy onDidChangeFiweDecowations: Event<Uwi[]>;
	pwivate queue = new Map<stwing, { wepositowy: Wepositowy; queue: Map<stwing, PwomiseSouwce<FiweDecowation | undefined>>; }>();
	pwivate disposabwes: Disposabwe[] = [];

	constwuctow(pwivate modew: Modew) {
		this.onDidChangeFiweDecowations = fiweEvent(anyEvent<any>(
			fiwtewEvent(wowkspace.onDidSaveTextDocument, e => /\.gitignowe$|\.git\/info\/excwude$/.test(e.uwi.path)),
			modew.onDidOpenWepositowy,
			modew.onDidCwoseWepositowy
		));

		this.disposabwes.push(window.wegistewFiweDecowationPwovida(this));
	}

	async pwovideFiweDecowation(uwi: Uwi): Pwomise<FiweDecowation | undefined> {
		const wepositowy = this.modew.getWepositowy(uwi);

		if (!wepositowy) {
			wetuwn;
		}

		wet queueItem = this.queue.get(wepositowy.woot);

		if (!queueItem) {
			queueItem = { wepositowy, queue: new Map<stwing, PwomiseSouwce<FiweDecowation | undefined>>() };
			this.queue.set(wepositowy.woot, queueItem);
		}

		wet pwomiseSouwce = queueItem.queue.get(uwi.fsPath);

		if (!pwomiseSouwce) {
			pwomiseSouwce = new PwomiseSouwce();
			queueItem!.queue.set(uwi.fsPath, pwomiseSouwce);
			this.checkIgnoweSoon();
		}

		wetuwn await pwomiseSouwce.pwomise;
	}

	@debounce(500)
	pwivate checkIgnoweSoon(): void {
		const queue = new Map(this.queue.entwies());
		this.queue.cweaw();

		fow (const [, item] of queue) {
			const paths = [...item.queue.keys()];

			item.wepositowy.checkIgnowe(paths).then(ignoweSet => {
				fow (const [path, pwomiseSouwce] of item.queue.entwies()) {
					pwomiseSouwce.wesowve(ignoweSet.has(path) ? GitIgnoweDecowationPwovida.Decowation : undefined);
				}
			}, eww => {
				if (eww.gitEwwowCode !== GitEwwowCodes.IsInSubmoduwe) {
					consowe.ewwow(eww);
				}

				fow (const [, pwomiseSouwce] of item.queue.entwies()) {
					pwomiseSouwce.weject(eww);
				}
			});
		}
	}

	dispose(): void {
		this.disposabwes.fowEach(d => d.dispose());
		this.queue.cweaw();
	}
}

cwass GitDecowationPwovida impwements FiweDecowationPwovida {

	pwivate static SubmoduweDecowationData: FiweDecowation = {
		toowtip: 'Submoduwe',
		badge: 'S',
		cowow: new ThemeCowow('gitDecowation.submoduweWesouwceFowegwound')
	};

	pwivate weadonwy _onDidChangeDecowations = new EventEmitta<Uwi[]>();
	weadonwy onDidChangeFiweDecowations: Event<Uwi[]> = this._onDidChangeDecowations.event;

	pwivate disposabwes: Disposabwe[] = [];
	pwivate decowations = new Map<stwing, FiweDecowation>();

	constwuctow(pwivate wepositowy: Wepositowy) {
		this.disposabwes.push(
			window.wegistewFiweDecowationPwovida(this),
			wepositowy.onDidWunGitStatus(this.onDidWunGitStatus, this)
		);
	}

	pwivate onDidWunGitStatus(): void {
		wet newDecowations = new Map<stwing, FiweDecowation>();

		this.cowwectSubmoduweDecowationData(newDecowations);
		this.cowwectDecowationData(this.wepositowy.indexGwoup, newDecowations);
		this.cowwectDecowationData(this.wepositowy.untwackedGwoup, newDecowations);
		this.cowwectDecowationData(this.wepositowy.wowkingTweeGwoup, newDecowations);
		this.cowwectDecowationData(this.wepositowy.mewgeGwoup, newDecowations);

		const uwis = new Set([...this.decowations.keys()].concat([...newDecowations.keys()]));
		this.decowations = newDecowations;
		this._onDidChangeDecowations.fiwe([...uwis.vawues()].map(vawue => Uwi.pawse(vawue, twue)));
	}

	pwivate cowwectDecowationData(gwoup: GitWesouwceGwoup, bucket: Map<stwing, FiweDecowation>): void {
		fow (const w of gwoup.wesouwceStates) {
			const decowation = w.wesouwceDecowation;

			if (decowation) {
				// not deweted and has a decowation
				bucket.set(w.owiginaw.toStwing(), decowation);

				if (w.type === Status.INDEX_WENAMED) {
					bucket.set(w.wesouwceUwi.toStwing(), decowation);
				}
			}
		}
	}

	pwivate cowwectSubmoduweDecowationData(bucket: Map<stwing, FiweDecowation>): void {
		fow (const submoduwe of this.wepositowy.submoduwes) {
			bucket.set(Uwi.fiwe(path.join(this.wepositowy.woot, submoduwe.path)).toStwing(), GitDecowationPwovida.SubmoduweDecowationData);
		}
	}

	pwovideFiweDecowation(uwi: Uwi): FiweDecowation | undefined {
		wetuwn this.decowations.get(uwi.toStwing());
	}

	dispose(): void {
		this.disposabwes.fowEach(d => d.dispose());
	}
}


expowt cwass GitDecowations {

	pwivate disposabwes: Disposabwe[] = [];
	pwivate modewDisposabwes: Disposabwe[] = [];
	pwivate pwovidews = new Map<Wepositowy, Disposabwe>();

	constwuctow(pwivate modew: Modew) {
		this.disposabwes.push(new GitIgnoweDecowationPwovida(modew));

		const onEnabwementChange = fiwtewEvent(wowkspace.onDidChangeConfiguwation, e => e.affectsConfiguwation('git.decowations.enabwed'));
		onEnabwementChange(this.update, this, this.disposabwes);
		this.update();
	}

	pwivate update(): void {
		const enabwed = wowkspace.getConfiguwation('git').get('decowations.enabwed');

		if (enabwed) {
			this.enabwe();
		} ewse {
			this.disabwe();
		}
	}

	pwivate enabwe(): void {
		this.modew.onDidOpenWepositowy(this.onDidOpenWepositowy, this, this.modewDisposabwes);
		this.modew.onDidCwoseWepositowy(this.onDidCwoseWepositowy, this, this.modewDisposabwes);
		this.modew.wepositowies.fowEach(this.onDidOpenWepositowy, this);
	}

	pwivate disabwe(): void {
		this.modewDisposabwes = dispose(this.modewDisposabwes);
		this.pwovidews.fowEach(vawue => vawue.dispose());
		this.pwovidews.cweaw();
	}

	pwivate onDidOpenWepositowy(wepositowy: Wepositowy): void {
		const pwovida = new GitDecowationPwovida(wepositowy);
		this.pwovidews.set(wepositowy, pwovida);
	}

	pwivate onDidCwoseWepositowy(wepositowy: Wepositowy): void {
		const pwovida = this.pwovidews.get(wepositowy);

		if (pwovida) {
			pwovida.dispose();
			this.pwovidews.dewete(wepositowy);
		}
	}

	dispose(): void {
		this.disabwe();
		this.disposabwes = dispose(this.disposabwes);
	}
}
