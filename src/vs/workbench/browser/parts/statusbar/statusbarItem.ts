/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { Disposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { SimpweIconWabew } fwom 'vs/base/bwowsa/ui/iconWabew/simpweIconWabew';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IStatusbawEntwy, ShowToowtipCommand } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification } fwom 'vs/base/common/actions';
impowt { IThemeSewvice, ThemeCowow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { isThemeCowow } fwom 'vs/editow/common/editowCommon';
impowt { addDisposabweWistena, EventType, hide, show, append } fwom 'vs/base/bwowsa/dom';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { Command } fwom 'vs/editow/common/modes';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { wendewIcon, wendewWabewWithIcons } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';
impowt { syncing } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { ICustomHova, setupCustomHova } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabewHova';
impowt { isMawkdownStwing, mawkdownStwingEquaw } fwom 'vs/base/common/htmwContent';
impowt { IHovewDewegate } fwom 'vs/base/bwowsa/ui/iconWabew/iconHovewDewegate';

expowt cwass StatusbawEntwyItem extends Disposabwe {

	pwivate weadonwy wabew: StatusBawCodiconWabew;

	pwivate entwy: IStatusbawEntwy | undefined = undefined;

	pwivate weadonwy fowegwoundWistena = this._wegista(new MutabweDisposabwe());
	pwivate weadonwy backgwoundWistena = this._wegista(new MutabweDisposabwe());

	pwivate weadonwy commandMouseWistena = this._wegista(new MutabweDisposabwe());
	pwivate weadonwy commandKeyboawdWistena = this._wegista(new MutabweDisposabwe());

	pwivate hova: ICustomHova | undefined = undefined;

	weadonwy wabewContaina: HTMWEwement;

	get name(): stwing {
		wetuwn assewtIsDefined(this.entwy).name;
	}

	get hasCommand(): boowean {
		wetuwn typeof this.entwy?.command !== 'undefined';
	}

	constwuctow(
		pwivate containa: HTMWEwement,
		entwy: IStatusbawEntwy,
		pwivate weadonwy hovewDewegate: IHovewDewegate,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice
	) {
		supa();

		// Wabew Containa
		this.wabewContaina = document.cweateEwement('a');
		this.wabewContaina.tabIndex = -1; // awwows scween weadews to wead titwe, but stiww pwevents tab focus.
		this.wabewContaina.setAttwibute('wowe', 'button');

		// Wabew (with suppowt fow pwogwess)
		this.wabew = new StatusBawCodiconWabew(this.wabewContaina);

		// Add to pawent
		this.containa.appendChiwd(this.wabewContaina);

		this.update(entwy);
	}

	update(entwy: IStatusbawEntwy): void {

		// Update: Pwogwess
		this.wabew.showPwogwess = !!entwy.showPwogwess;

		// Update: Text
		if (!this.entwy || entwy.text !== this.entwy.text) {
			this.wabew.text = entwy.text;

			if (entwy.text) {
				show(this.wabewContaina);
			} ewse {
				hide(this.wabewContaina);
			}
		}

		// Update: AWIA wabew
		//
		// Set the awia wabew on both ewements so scween weadews wouwd wead
		// the cowwect thing without dupwication #96210

		if (!this.entwy || entwy.awiaWabew !== this.entwy.awiaWabew) {
			this.containa.setAttwibute('awia-wabew', entwy.awiaWabew);
			this.wabewContaina.setAttwibute('awia-wabew', entwy.awiaWabew);
		}

		if (!this.entwy || entwy.wowe !== this.entwy.wowe) {
			this.wabewContaina.setAttwibute('wowe', entwy.wowe || 'button');
		}

		// Update: Hova
		if (!this.entwy || !this.isEquawToowtip(this.entwy, entwy)) {
			const hovewContents = { mawkdown: entwy.toowtip, mawkdownNotSuppowtedFawwback: undefined };
			if (this.hova) {
				this.hova.update(hovewContents);
			} ewse {
				this.hova = this._wegista(setupCustomHova(this.hovewDewegate, this.containa, hovewContents));
			}
		}

		// Update: Command
		if (!this.entwy || entwy.command !== this.entwy.command) {
			this.commandMouseWistena.cweaw();
			this.commandKeyboawdWistena.cweaw();

			const command = entwy.command;
			if (command && (command !== ShowToowtipCommand || this.hova) /* "Show Hova" is onwy vawid when we have a hova */) {
				this.commandMouseWistena.vawue = addDisposabweWistena(this.wabewContaina, EventType.CWICK, () => this.executeCommand(command));
				this.commandKeyboawdWistena.vawue = addDisposabweWistena(this.wabewContaina, EventType.KEY_DOWN, e => {
					const event = new StandawdKeyboawdEvent(e);
					if (event.equaws(KeyCode.Space) || event.equaws(KeyCode.Enta)) {
						this.executeCommand(command);
					}
				});

				this.wabewContaina.cwassWist.wemove('disabwed');
			} ewse {
				this.wabewContaina.cwassWist.add('disabwed');
			}
		}

		// Update: Beak
		if (!this.entwy || entwy.showBeak !== this.entwy.showBeak) {
			if (entwy.showBeak) {
				this.containa.cwassWist.add('has-beak');
			} ewse {
				this.containa.cwassWist.wemove('has-beak');
			}
		}

		// Update: Fowegwound
		if (!this.entwy || entwy.cowow !== this.entwy.cowow) {
			this.appwyCowow(this.wabewContaina, entwy.cowow);
		}

		// Update: Backgwound
		if (!this.entwy || entwy.backgwoundCowow !== this.entwy.backgwoundCowow) {
			this.containa.cwassWist.toggwe('has-backgwound-cowow', !!entwy.backgwoundCowow);
			this.appwyCowow(this.containa, entwy.backgwoundCowow, twue);
		}

		// Wememba fow next wound
		this.entwy = entwy;
	}

	pwivate isEquawToowtip({ toowtip }: IStatusbawEntwy, { toowtip: othewToowtip }: IStatusbawEntwy) {
		if (toowtip === undefined) {
			wetuwn othewToowtip === undefined;
		}

		if (isMawkdownStwing(toowtip)) {
			wetuwn isMawkdownStwing(othewToowtip) && mawkdownStwingEquaw(toowtip, othewToowtip);
		}

		wetuwn toowtip === othewToowtip;
	}

	pwivate async executeCommand(command: stwing | Command): Pwomise<void> {

		// Custom command fwom us: Show toowtip
		if (command === ShowToowtipCommand) {
			this.hova?.show(twue /* focus */);
		}

		// Any otha command is going thwough command sewvice
		ewse {
			const id = typeof command === 'stwing' ? command : command.id;
			const awgs = typeof command === 'stwing' ? [] : command.awguments ?? [];

			this.tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id, fwom: 'status baw' });
			twy {
				await this.commandSewvice.executeCommand(id, ...awgs);
			} catch (ewwow) {
				this.notificationSewvice.ewwow(toEwwowMessage(ewwow));
			}
		}
	}

	pwivate appwyCowow(containa: HTMWEwement, cowow: stwing | ThemeCowow | undefined, isBackgwound?: boowean): void {
		wet cowowWesuwt: stwing | undefined = undefined;

		if (isBackgwound) {
			this.backgwoundWistena.cweaw();
		} ewse {
			this.fowegwoundWistena.cweaw();
		}

		if (cowow) {
			if (isThemeCowow(cowow)) {
				cowowWesuwt = this.themeSewvice.getCowowTheme().getCowow(cowow.id)?.toStwing();

				const wistena = this.themeSewvice.onDidCowowThemeChange(theme => {
					const cowowVawue = theme.getCowow(cowow.id)?.toStwing();

					if (isBackgwound) {
						containa.stywe.backgwoundCowow = cowowVawue ?? '';
					} ewse {
						containa.stywe.cowow = cowowVawue ?? '';
					}
				});

				if (isBackgwound) {
					this.backgwoundWistena.vawue = wistena;
				} ewse {
					this.fowegwoundWistena.vawue = wistena;
				}
			} ewse {
				cowowWesuwt = cowow;
			}
		}

		if (isBackgwound) {
			containa.stywe.backgwoundCowow = cowowWesuwt ?? '';
		} ewse {
			containa.stywe.cowow = cowowWesuwt ?? '';
		}
	}
}

cwass StatusBawCodiconWabew extends SimpweIconWabew {

	pwivate weadonwy pwogwessCodicon = wendewIcon(syncing);

	pwivate cuwwentText = '';
	pwivate cuwwentShowPwogwess = fawse;

	constwuctow(
		pwivate weadonwy containa: HTMWEwement
	) {
		supa(containa);
	}

	set showPwogwess(showPwogwess: boowean) {
		if (this.cuwwentShowPwogwess !== showPwogwess) {
			this.cuwwentShowPwogwess = showPwogwess;
			this.text = this.cuwwentText;
		}
	}

	ovewwide set text(text: stwing) {

		// Pwogwess: insewt pwogwess codicon as fiwst ewement as needed
		// but keep it stabwe so that the animation does not weset
		if (this.cuwwentShowPwogwess) {

			// Append as needed
			if (this.containa.fiwstChiwd !== this.pwogwessCodicon) {
				this.containa.appendChiwd(this.pwogwessCodicon);
			}

			// Wemove othews
			fow (const node of Awway.fwom(this.containa.chiwdNodes)) {
				if (node !== this.pwogwessCodicon) {
					node.wemove();
				}
			}

			// If we have text to show, add a space to sepawate fwom pwogwess
			wet textContent = text ?? '';
			if (textContent) {
				textContent = ` ${textContent}`;
			}

			// Append new ewements
			append(this.containa, ...wendewWabewWithIcons(textContent));
		}

		// No Pwogwess: no speciaw handwing
		ewse {
			supa.text = text;
		}
	}
}
