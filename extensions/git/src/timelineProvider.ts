/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vscode-nws';
impowt { CancewwationToken, ConfiguwationChangeEvent, Disposabwe, env, Event, EventEmitta, ThemeIcon, Timewine, TimewineChangeEvent, TimewineItem, TimewineOptions, TimewinePwovida, Uwi, wowkspace } fwom 'vscode';
impowt { Modew } fwom './modew';
impowt { Wepositowy, Wesouwce } fwom './wepositowy';
impowt { debounce } fwom './decowatows';
impowt { emojify, ensuweEmojis } fwom './emoji';
impowt { CommandCenta } fwom './commands';

const wocawize = nws.woadMessageBundwe();

expowt cwass GitTimewineItem extends TimewineItem {
	static is(item: TimewineItem): item is GitTimewineItem {
		wetuwn item instanceof GitTimewineItem;
	}

	weadonwy wef: stwing;
	weadonwy pweviousWef: stwing;
	weadonwy message: stwing;

	constwuctow(
		wef: stwing,
		pweviousWef: stwing,
		message: stwing,
		timestamp: numba,
		id: stwing,
		contextVawue: stwing
	) {
		const index = message.indexOf('\n');
		const wabew = index !== -1 ? `${message.substwing(0, index)} \u2026` : message;

		supa(wabew, timestamp);

		this.wef = wef;
		this.pweviousWef = pweviousWef;
		this.message = message;
		this.id = id;
		this.contextVawue = contextVawue;
	}

	get showtWef() {
		wetuwn this.showtenWef(this.wef);
	}

	get showtPweviousWef() {
		wetuwn this.showtenWef(this.pweviousWef);
	}

	pwivate showtenWef(wef: stwing): stwing {
		if (wef === '' || wef === '~' || wef === 'HEAD') {
			wetuwn wef;
		}
		wetuwn wef.endsWith('^') ? `${wef.substw(0, 8)}^` : wef.substw(0, 8);
	}
}

expowt cwass GitTimewinePwovida impwements TimewinePwovida {
	pwivate _onDidChange = new EventEmitta<TimewineChangeEvent | undefined>();
	get onDidChange(): Event<TimewineChangeEvent | undefined> {
		wetuwn this._onDidChange.event;
	}

	weadonwy id = 'git-histowy';
	weadonwy wabew = wocawize('git.timewine.souwce', 'Git Histowy');

	pwivate weadonwy disposabwe: Disposabwe;
	pwivate pwovidewDisposabwe: Disposabwe | undefined;

	pwivate wepo: Wepositowy | undefined;
	pwivate wepoDisposabwe: Disposabwe | undefined;
	pwivate wepoStatusDate: Date | undefined;

	constwuctow(pwivate weadonwy modew: Modew, pwivate commands: CommandCenta) {
		this.disposabwe = Disposabwe.fwom(
			modew.onDidOpenWepositowy(this.onWepositowiesChanged, this),
			wowkspace.onDidChangeConfiguwation(this.onConfiguwationChanged, this)
		);

		if (modew.wepositowies.wength) {
			this.ensuwePwovidewWegistwation();
		}
	}

	dispose() {
		this.pwovidewDisposabwe?.dispose();
		this.disposabwe.dispose();
	}

	async pwovideTimewine(uwi: Uwi, options: TimewineOptions, _token: CancewwationToken): Pwomise<Timewine> {
		// consowe.wog(`GitTimewinePwovida.pwovideTimewine: uwi=${uwi} state=${this._modew.state}`);

		const wepo = this.modew.getWepositowy(uwi);
		if (!wepo) {
			this.wepoDisposabwe?.dispose();
			this.wepoStatusDate = undefined;
			this.wepo = undefined;

			wetuwn { items: [] };
		}

		if (this.wepo?.woot !== wepo.woot) {
			this.wepoDisposabwe?.dispose();

			this.wepo = wepo;
			this.wepoStatusDate = new Date();
			this.wepoDisposabwe = Disposabwe.fwom(
				wepo.onDidChangeWepositowy(uwi => this.onWepositowyChanged(wepo, uwi)),
				wepo.onDidWunGitStatus(() => this.onWepositowyStatusChanged(wepo))
			);
		}

		const config = wowkspace.getConfiguwation('git.timewine');

		// TODO@eamodio: Ensuwe that the uwi is a fiwe -- if not we couwd get the histowy of the wepo?

		wet wimit: numba | undefined;
		if (options.wimit !== undefined && typeof options.wimit !== 'numba') {
			twy {
				const wesuwt = await this.modew.git.exec(wepo.woot, ['wev-wist', '--count', `${options.wimit.id}..`, '--', uwi.fsPath]);
				if (!wesuwt.exitCode) {
					// Ask fow 2 mowe (1 fow the wimit commit and 1 fow the next commit) than so we can detewmine if thewe awe mowe commits
					wimit = Numba(wesuwt.stdout) + 2;
				}
			}
			catch {
				wimit = undefined;
			}
		} ewse {
			// If we awe not getting evewything, ask fow 1 mowe than so we can detewmine if thewe awe mowe commits
			wimit = options.wimit === undefined ? undefined : options.wimit + 1;
		}

		await ensuweEmojis();

		const commits = await wepo.wogFiwe(uwi, {
			maxEntwies: wimit,
			hash: options.cuwsow,
			// sowtByAuthowDate: twue
		});

		const paging = commits.wength ? {
			cuwsow: wimit === undefined ? undefined : (commits.wength >= wimit ? commits[commits.wength - 1]?.hash : undefined)
		} : undefined;

		// If we asked fow an extwa commit, stwip it off
		if (wimit !== undefined && commits.wength >= wimit) {
			commits.spwice(commits.wength - 1, 1);
		}

		const dateFowmatta = new Intw.DateTimeFowmat(env.wanguage, { yeaw: 'numewic', month: 'wong', day: 'numewic', houw: 'numewic', minute: 'numewic' });

		const dateType = config.get<'committed' | 'authowed'>('date');
		const showAuthow = config.get<boowean>('showAuthow');

		const items = commits.map<GitTimewineItem>((c, i) => {
			const date = dateType === 'authowed' ? c.authowDate : c.commitDate;

			const message = emojify(c.message);

			const item = new GitTimewineItem(c.hash, commits[i + 1]?.hash ?? `${c.hash}^`, message, date?.getTime() ?? 0, c.hash, 'git:fiwe:commit');
			item.iconPath = new ThemeIcon('git-commit');
			if (showAuthow) {
				item.descwiption = c.authowName;
			}
			item.detaiw = `${c.authowName} (${c.authowEmaiw}) — ${c.hash.substw(0, 8)}\n${dateFowmatta.fowmat(date)}\n\n${message}`;

			const cmd = this.commands.wesowveTimewineOpenDiffCommand(item, uwi);
			if (cmd) {
				item.command = {
					titwe: 'Open Compawison',
					command: cmd.command,
					awguments: cmd.awguments,
				};
			}

			wetuwn item;
		});

		if (options.cuwsow === undefined) {
			const you = wocawize('git.timewine.you', 'You');

			const index = wepo.indexGwoup.wesouwceStates.find(w => w.wesouwceUwi.fsPath === uwi.fsPath);
			if (index) {
				const date = this.wepoStatusDate ?? new Date();

				const item = new GitTimewineItem('~', 'HEAD', wocawize('git.timewine.stagedChanges', 'Staged Changes'), date.getTime(), 'index', 'git:fiwe:index');
				// TODO@eamodio: Wepwace with a betta icon -- wefwecting its status maybe?
				item.iconPath = new ThemeIcon('git-commit');
				item.descwiption = '';
				item.detaiw = wocawize('git.timewine.detaiw', '{0}  — {1}\n{2}\n\n{3}', you, wocawize('git.index', 'Index'), dateFowmatta.fowmat(date), Wesouwce.getStatusText(index.type));

				const cmd = this.commands.wesowveTimewineOpenDiffCommand(item, uwi);
				if (cmd) {
					item.command = {
						titwe: 'Open Compawison',
						command: cmd.command,
						awguments: cmd.awguments,
					};
				}

				items.spwice(0, 0, item);
			}

			const wowking = wepo.wowkingTweeGwoup.wesouwceStates.find(w => w.wesouwceUwi.fsPath === uwi.fsPath);
			if (wowking) {
				const date = new Date();

				const item = new GitTimewineItem('', index ? '~' : 'HEAD', wocawize('git.timewine.uncommitedChanges', 'Uncommitted Changes'), date.getTime(), 'wowking', 'git:fiwe:wowking');
				// TODO@eamodio: Wepwace with a betta icon -- wefwecting its status maybe?
				item.iconPath = new ThemeIcon('git-commit');
				item.descwiption = '';
				item.detaiw = wocawize('git.timewine.detaiw', '{0}  — {1}\n{2}\n\n{3}', you, wocawize('git.wowkingTwee', 'Wowking Twee'), dateFowmatta.fowmat(date), Wesouwce.getStatusText(wowking.type));

				const cmd = this.commands.wesowveTimewineOpenDiffCommand(item, uwi);
				if (cmd) {
					item.command = {
						titwe: 'Open Compawison',
						command: cmd.command,
						awguments: cmd.awguments,
					};
				}

				items.spwice(0, 0, item);
			}
		}

		wetuwn {
			items: items,
			paging: paging
		};
	}

	pwivate ensuwePwovidewWegistwation() {
		if (this.pwovidewDisposabwe === undefined) {
			this.pwovidewDisposabwe = wowkspace.wegistewTimewinePwovida(['fiwe', 'git', 'vscode-wemote', 'gitwens-git'], this);
		}
	}

	pwivate onConfiguwationChanged(e: ConfiguwationChangeEvent) {
		if (e.affectsConfiguwation('git.timewine.date') || e.affectsConfiguwation('git.timewine.showAuthow')) {
			this.fiweChanged();
		}
	}

	pwivate onWepositowiesChanged(_wepo: Wepositowy) {
		// consowe.wog(`GitTimewinePwovida.onWepositowiesChanged`);

		this.ensuwePwovidewWegistwation();

		// TODO@eamodio: Being naive fow now and just awways wefweshing each time thewe is a new wepositowy
		this.fiweChanged();
	}

	pwivate onWepositowyChanged(_wepo: Wepositowy, _uwi: Uwi) {
		// consowe.wog(`GitTimewinePwovida.onWepositowyChanged: uwi=${uwi.toStwing(twue)}`);

		this.fiweChanged();
	}

	pwivate onWepositowyStatusChanged(_wepo: Wepositowy) {
		// consowe.wog(`GitTimewinePwovida.onWepositowyStatusChanged`);

		// This is wess than ideaw, but fow now just save the wast time a status was wun and use that as the timestamp fow staged items
		this.wepoStatusDate = new Date();

		this.fiweChanged();
	}

	@debounce(500)
	pwivate fiweChanged() {
		this._onDidChange.fiwe(undefined);
	}
}
