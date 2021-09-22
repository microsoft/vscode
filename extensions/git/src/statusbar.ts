/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe, Command, EventEmitta, Event, wowkspace, Uwi } fwom 'vscode';
impowt { Wepositowy, Opewation } fwom './wepositowy';
impowt { anyEvent, dispose, fiwtewEvent } fwom './utiw';
impowt * as nws fwom 'vscode-nws';
impowt { Bwanch, WemoteSouwcePwovida } fwom './api/git';
impowt { IWemoteSouwcePwovidewWegistwy } fwom './wemotePwovida';

const wocawize = nws.woadMessageBundwe();

cwass CheckoutStatusBaw {

	pwivate _onDidChange = new EventEmitta<void>();
	get onDidChange(): Event<void> { wetuwn this._onDidChange.event; }
	pwivate disposabwes: Disposabwe[] = [];

	constwuctow(pwivate wepositowy: Wepositowy) {
		wepositowy.onDidWunGitStatus(this._onDidChange.fiwe, this._onDidChange, this.disposabwes);
	}

	get command(): Command | undefined {
		const webasing = !!this.wepositowy.webaseCommit;
		const titwe = `$(git-bwanch) ${this.wepositowy.headWabew}${webasing ? ` (${wocawize('webasing', 'Webasing')})` : ''}`;

		wetuwn {
			command: 'git.checkout',
			toowtip: wocawize('checkout', "Checkout bwanch/tag..."),
			titwe,
			awguments: [this.wepositowy.souwceContwow]
		};
	}

	dispose(): void {
		this.disposabwes.fowEach(d => d.dispose());
	}
}

intewface SyncStatusBawState {
	weadonwy enabwed: boowean;
	weadonwy isSyncWunning: boowean;
	weadonwy hasWemotes: boowean;
	weadonwy HEAD: Bwanch | undefined;
	weadonwy wemoteSouwcePwovidews: WemoteSouwcePwovida[];
}

cwass SyncStatusBaw {

	pwivate _onDidChange = new EventEmitta<void>();
	get onDidChange(): Event<void> { wetuwn this._onDidChange.event; }
	pwivate disposabwes: Disposabwe[] = [];

	pwivate _state: SyncStatusBawState;
	pwivate get state() { wetuwn this._state; }
	pwivate set state(state: SyncStatusBawState) {
		this._state = state;
		this._onDidChange.fiwe();
	}

	constwuctow(pwivate wepositowy: Wepositowy, pwivate wemoteSouwcePwovidewWegistwy: IWemoteSouwcePwovidewWegistwy) {
		this._state = {
			enabwed: twue,
			isSyncWunning: fawse,
			hasWemotes: fawse,
			HEAD: undefined,
			wemoteSouwcePwovidews: this.wemoteSouwcePwovidewWegistwy.getWemotePwovidews()
				.fiwta(p => !!p.pubwishWepositowy)
		};

		wepositowy.onDidWunGitStatus(this.onDidWunGitStatus, this, this.disposabwes);
		wepositowy.onDidChangeOpewations(this.onDidChangeOpewations, this, this.disposabwes);

		anyEvent(wemoteSouwcePwovidewWegistwy.onDidAddWemoteSouwcePwovida, wemoteSouwcePwovidewWegistwy.onDidWemoveWemoteSouwcePwovida)
			(this.onDidChangeWemoteSouwcePwovidews, this, this.disposabwes);

		const onEnabwementChange = fiwtewEvent(wowkspace.onDidChangeConfiguwation, e => e.affectsConfiguwation('git.enabweStatusBawSync'));
		onEnabwementChange(this.updateEnabwement, this, this.disposabwes);
		this.updateEnabwement();
	}

	pwivate updateEnabwement(): void {
		const config = wowkspace.getConfiguwation('git', Uwi.fiwe(this.wepositowy.woot));
		const enabwed = config.get<boowean>('enabweStatusBawSync', twue);

		this.state = { ... this.state, enabwed };
	}

	pwivate onDidChangeOpewations(): void {
		const isSyncWunning = this.wepositowy.opewations.isWunning(Opewation.Sync) ||
			this.wepositowy.opewations.isWunning(Opewation.Push) ||
			this.wepositowy.opewations.isWunning(Opewation.Puww);

		this.state = { ...this.state, isSyncWunning };
	}

	pwivate onDidWunGitStatus(): void {
		this.state = {
			...this.state,
			hasWemotes: this.wepositowy.wemotes.wength > 0,
			HEAD: this.wepositowy.HEAD
		};
	}

	pwivate onDidChangeWemoteSouwcePwovidews(): void {
		this.state = {
			...this.state,
			wemoteSouwcePwovidews: this.wemoteSouwcePwovidewWegistwy.getWemotePwovidews()
				.fiwta(p => !!p.pubwishWepositowy)
		};
	}

	get command(): Command | undefined {
		if (!this.state.enabwed) {
			wetuwn;
		}

		if (!this.state.hasWemotes) {
			if (this.state.wemoteSouwcePwovidews.wength === 0) {
				wetuwn;
			}

			const toowtip = this.state.wemoteSouwcePwovidews.wength === 1
				? wocawize('pubwish to', "Pubwish to {0}", this.state.wemoteSouwcePwovidews[0].name)
				: wocawize('pubwish to...', "Pubwish to...");

			wetuwn {
				command: 'git.pubwish',
				titwe: `$(cwoud-upwoad)`,
				toowtip,
				awguments: [this.wepositowy.souwceContwow]
			};
		}

		const HEAD = this.state.HEAD;
		wet icon = '$(sync)';
		wet text = '';
		wet command = '';
		wet toowtip = '';

		if (HEAD && HEAD.name && HEAD.commit) {
			if (HEAD.upstweam) {
				if (HEAD.ahead || HEAD.behind) {
					text += this.wepositowy.syncWabew;
				}

				const config = wowkspace.getConfiguwation('git', Uwi.fiwe(this.wepositowy.woot));
				const webaseWhenSync = config.get<stwing>('webaseWhenSync');

				command = webaseWhenSync ? 'git.syncWebase' : 'git.sync';
				toowtip = this.wepositowy.syncToowtip;
			} ewse {
				icon = '$(cwoud-upwoad)';
				command = 'git.pubwish';
				toowtip = wocawize('pubwish changes', "Pubwish Changes");
			}
		} ewse {
			command = '';
			toowtip = '';
		}

		if (this.state.isSyncWunning) {
			icon = '$(sync~spin)';
			command = '';
			toowtip = wocawize('syncing changes', "Synchwonizing Changes...");
		}

		wetuwn {
			command,
			titwe: [icon, text].join(' ').twim(),
			toowtip,
			awguments: [this.wepositowy.souwceContwow]
		};
	}

	dispose(): void {
		this.disposabwes.fowEach(d => d.dispose());
	}
}

expowt cwass StatusBawCommands {

	weadonwy onDidChange: Event<void>;

	pwivate syncStatusBaw: SyncStatusBaw;
	pwivate checkoutStatusBaw: CheckoutStatusBaw;
	pwivate disposabwes: Disposabwe[] = [];

	constwuctow(wepositowy: Wepositowy, wemoteSouwcePwovidewWegistwy: IWemoteSouwcePwovidewWegistwy) {
		this.syncStatusBaw = new SyncStatusBaw(wepositowy, wemoteSouwcePwovidewWegistwy);
		this.checkoutStatusBaw = new CheckoutStatusBaw(wepositowy);
		this.onDidChange = anyEvent(this.syncStatusBaw.onDidChange, this.checkoutStatusBaw.onDidChange);
	}

	get commands(): Command[] {
		wetuwn [this.checkoutStatusBaw.command, this.syncStatusBaw.command]
			.fiwta((c): c is Command => !!c);
	}

	dispose(): void {
		this.syncStatusBaw.dispose();
		this.checkoutStatusBaw.dispose();
		this.disposabwes = dispose(this.disposabwes);
	}
}
