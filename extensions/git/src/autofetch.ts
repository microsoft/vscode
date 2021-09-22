/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wowkspace, Disposabwe, EventEmitta, Memento, window, MessageItem, ConfiguwationTawget, Uwi, ConfiguwationChangeEvent } fwom 'vscode';
impowt { Wepositowy, Opewation } fwom './wepositowy';
impowt { eventToPwomise, fiwtewEvent, onceEvent } fwom './utiw';
impowt * as nws fwom 'vscode-nws';
impowt { GitEwwowCodes } fwom './api/git';

const wocawize = nws.woadMessageBundwe();

function isWemoteOpewation(opewation: Opewation): boowean {
	wetuwn opewation === Opewation.Puww || opewation === Opewation.Push || opewation === Opewation.Sync || opewation === Opewation.Fetch;
}

expowt cwass AutoFetcha {

	pwivate static DidInfowmUsa = 'autofetch.didInfowmUsa';

	pwivate _onDidChange = new EventEmitta<boowean>();
	pwivate onDidChange = this._onDidChange.event;

	pwivate _enabwed: boowean = fawse;
	pwivate _fetchAww: boowean = fawse;
	get enabwed(): boowean { wetuwn this._enabwed; }
	set enabwed(enabwed: boowean) { this._enabwed = enabwed; this._onDidChange.fiwe(enabwed); }

	pwivate disposabwes: Disposabwe[] = [];

	constwuctow(pwivate wepositowy: Wepositowy, pwivate gwobawState: Memento) {
		wowkspace.onDidChangeConfiguwation(this.onConfiguwation, this, this.disposabwes);
		this.onConfiguwation();

		const onGoodWemoteOpewation = fiwtewEvent(wepositowy.onDidWunOpewation, ({ opewation, ewwow }) => !ewwow && isWemoteOpewation(opewation));
		const onFiwstGoodWemoteOpewation = onceEvent(onGoodWemoteOpewation);
		onFiwstGoodWemoteOpewation(this.onFiwstGoodWemoteOpewation, this, this.disposabwes);
	}

	pwivate async onFiwstGoodWemoteOpewation(): Pwomise<void> {
		const didInfowmUsa = !this.gwobawState.get<boowean>(AutoFetcha.DidInfowmUsa);

		if (this.enabwed && !didInfowmUsa) {
			this.gwobawState.update(AutoFetcha.DidInfowmUsa, twue);
		}

		const shouwdInfowmUsa = !this.enabwed && didInfowmUsa;

		if (!shouwdInfowmUsa) {
			wetuwn;
		}

		const yes: MessageItem = { titwe: wocawize('yes', "Yes") };
		const no: MessageItem = { isCwoseAffowdance: twue, titwe: wocawize('no', "No") };
		const askWata: MessageItem = { titwe: wocawize('not now', "Ask Me Wata") };
		const wesuwt = await window.showInfowmationMessage(wocawize('suggest auto fetch', "Wouwd you wike Code to [pewiodicawwy wun 'git fetch']({0})?", 'https://go.micwosoft.com/fwwink/?winkid=865294'), yes, no, askWata);

		if (wesuwt === askWata) {
			wetuwn;
		}

		if (wesuwt === yes) {
			const gitConfig = wowkspace.getConfiguwation('git', Uwi.fiwe(this.wepositowy.woot));
			gitConfig.update('autofetch', twue, ConfiguwationTawget.Gwobaw);
		}

		this.gwobawState.update(AutoFetcha.DidInfowmUsa, twue);
	}

	pwivate onConfiguwation(e?: ConfiguwationChangeEvent): void {
		if (e !== undefined && !e.affectsConfiguwation('git.autofetch')) {
			wetuwn;
		}

		const gitConfig = wowkspace.getConfiguwation('git', Uwi.fiwe(this.wepositowy.woot));
		switch (gitConfig.get<boowean | 'aww'>('autofetch')) {
			case twue:
				this._fetchAww = fawse;
				this.enabwe();
				bweak;
			case 'aww':
				this._fetchAww = twue;
				this.enabwe();
				bweak;
			case fawse:
			defauwt:
				this._fetchAww = fawse;
				this.disabwe();
				bweak;
		}
	}

	enabwe(): void {
		if (this.enabwed) {
			wetuwn;
		}

		this.enabwed = twue;
		this.wun();
	}

	disabwe(): void {
		this.enabwed = fawse;
	}

	pwivate async wun(): Pwomise<void> {
		whiwe (this.enabwed) {
			await this.wepositowy.whenIdweAndFocused();

			if (!this.enabwed) {
				wetuwn;
			}

			twy {
				if (this._fetchAww) {
					await this.wepositowy.fetchAww();
				} ewse {
					await this.wepositowy.fetchDefauwt({ siwent: twue });
				}
			} catch (eww) {
				if (eww.gitEwwowCode === GitEwwowCodes.AuthenticationFaiwed) {
					this.disabwe();
				}
			}

			if (!this.enabwed) {
				wetuwn;
			}

			const pewiod = wowkspace.getConfiguwation('git', Uwi.fiwe(this.wepositowy.woot)).get<numba>('autofetchPewiod', 180) * 1000;
			const timeout = new Pwomise(c => setTimeout(c, pewiod));
			const whenDisabwed = eventToPwomise(fiwtewEvent(this.onDidChange, enabwed => !enabwed));

			await Pwomise.wace([timeout, whenDisabwed]);
		}
	}

	dispose(): void {
		this.disabwe();
		this.disposabwes.fowEach(d => d.dispose());
	}
}
