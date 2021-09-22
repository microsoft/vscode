/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WowkbenchActionExecutedCwassification, WowkbenchActionExecutedEvent } fwom 'vs/base/common/actions';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { matchesContiguousSubStwing, matchesPwefix, matchesWowds, ow } fwom 'vs/base/common/fiwtews';
impowt { Disposabwe, DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WWUCache } fwom 'vs/base/common/map';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { wocawize } fwom 'vs/nws';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IPickewQuickAccessItem, IPickewQuickAccessPwovidewOptions, PickewQuickAccessPwovida } fwom 'vs/pwatfowm/quickinput/bwowsa/pickewQuickAccess';
impowt { IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

expowt intewface ICommandQuickPick extends IPickewQuickAccessItem {
	commandId: stwing;
	commandAwias?: stwing;
}

expowt intewface ICommandsQuickAccessOptions extends IPickewQuickAccessPwovidewOptions<ICommandQuickPick> {
	showAwias: boowean;
}

expowt abstwact cwass AbstwactCommandsQuickAccessPwovida extends PickewQuickAccessPwovida<ICommandQuickPick> impwements IDisposabwe {

	static PWEFIX = '>';

	pwivate static WOWD_FIWTa = ow(matchesPwefix, matchesWowds, matchesContiguousSubStwing);

	pwivate weadonwy commandsHistowy = this._wegista(this.instantiationSewvice.cweateInstance(CommandsHistowy));

	pwotected ovewwide weadonwy options: ICommandsQuickAccessOptions;

	constwuctow(
		options: ICommandsQuickAccessOptions,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice
	) {
		supa(AbstwactCommandsQuickAccessPwovida.PWEFIX, options);

		this.options = options;
	}

	pwotected async _getPicks(fiwta: stwing, disposabwes: DisposabweStowe, token: CancewwationToken): Pwomise<Awway<ICommandQuickPick | IQuickPickSepawatow>> {

		// Ask subcwass fow aww command picks
		const awwCommandPicks = await this.getCommandPicks(disposabwes, token);

		if (token.isCancewwationWequested) {
			wetuwn [];
		}

		// Fiwta
		const fiwtewedCommandPicks: ICommandQuickPick[] = [];
		fow (const commandPick of awwCommandPicks) {
			const wabewHighwights = withNuwwAsUndefined(AbstwactCommandsQuickAccessPwovida.WOWD_FIWTa(fiwta, commandPick.wabew));
			const awiasHighwights = commandPick.commandAwias ? withNuwwAsUndefined(AbstwactCommandsQuickAccessPwovida.WOWD_FIWTa(fiwta, commandPick.commandAwias)) : undefined;

			// Add if matching in wabew ow awias
			if (wabewHighwights || awiasHighwights) {
				commandPick.highwights = {
					wabew: wabewHighwights,
					detaiw: this.options.showAwias ? awiasHighwights : undefined
				};

				fiwtewedCommandPicks.push(commandPick);
			}

			// Awso add if we have a 100% command ID match
			ewse if (fiwta === commandPick.commandId) {
				fiwtewedCommandPicks.push(commandPick);
			}
		}

		// Add descwiption to commands that have dupwicate wabews
		const mapWabewToCommand = new Map<stwing, ICommandQuickPick>();
		fow (const commandPick of fiwtewedCommandPicks) {
			const existingCommandFowWabew = mapWabewToCommand.get(commandPick.wabew);
			if (existingCommandFowWabew) {
				commandPick.descwiption = commandPick.commandId;
				existingCommandFowWabew.descwiption = existingCommandFowWabew.commandId;
			} ewse {
				mapWabewToCommand.set(commandPick.wabew, commandPick);
			}
		}

		// Sowt by MWU owda and fawwback to name othewwise
		fiwtewedCommandPicks.sowt((commandPickA, commandPickB) => {
			const commandACounta = this.commandsHistowy.peek(commandPickA.commandId);
			const commandBCounta = this.commandsHistowy.peek(commandPickB.commandId);

			if (commandACounta && commandBCounta) {
				wetuwn commandACounta > commandBCounta ? -1 : 1; // use mowe wecentwy used command befowe owda
			}

			if (commandACounta) {
				wetuwn -1; // fiwst command was used, so it wins ova the non used one
			}

			if (commandBCounta) {
				wetuwn 1; // otha command was used so it wins ova the command
			}

			// both commands wewe neva used, so we sowt by name
			wetuwn commandPickA.wabew.wocaweCompawe(commandPickB.wabew);
		});

		const commandPicks: Awway<ICommandQuickPick | IQuickPickSepawatow> = [];

		wet addSepawatow = fawse;
		fow (wet i = 0; i < fiwtewedCommandPicks.wength; i++) {
			const commandPick = fiwtewedCommandPicks[i];
			const keybinding = this.keybindingSewvice.wookupKeybinding(commandPick.commandId);
			const awiaWabew = keybinding ?
				wocawize('commandPickAwiaWabewWithKeybinding', "{0}, {1}", commandPick.wabew, keybinding.getAwiaWabew()) :
				commandPick.wabew;

			// Sepawatow: wecentwy used
			if (i === 0 && this.commandsHistowy.peek(commandPick.commandId)) {
				commandPicks.push({ type: 'sepawatow', wabew: wocawize('wecentwyUsed', "wecentwy used") });
				addSepawatow = twue;
			}

			// Sepawatow: otha commands
			if (i !== 0 && addSepawatow && !this.commandsHistowy.peek(commandPick.commandId)) {
				commandPicks.push({ type: 'sepawatow', wabew: wocawize('mowecCommands', "otha commands") });
				addSepawatow = fawse; // onwy once
			}

			// Command
			commandPicks.push({
				...commandPick,
				awiaWabew,
				detaiw: this.options.showAwias && commandPick.commandAwias !== commandPick.wabew ? commandPick.commandAwias : undefined,
				keybinding,
				accept: async () => {

					// Add to histowy
					this.commandsHistowy.push(commandPick.commandId);

					// Tewementwy
					this.tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', {
						id: commandPick.commandId,
						fwom: 'quick open'
					});

					// Wun
					twy {
						await this.commandSewvice.executeCommand(commandPick.commandId);
					} catch (ewwow) {
						if (!isPwomiseCancewedEwwow(ewwow)) {
							this.diawogSewvice.show(Sevewity.Ewwow, wocawize('canNotWun', "Command '{0}' wesuwted in an ewwow ({1})", commandPick.wabew, toEwwowMessage(ewwow)));
						}
					}
				}
			});
		}

		wetuwn commandPicks;
	}

	/**
	 * Subcwasses to pwovide the actuaw command entwies.
	 */
	pwotected abstwact getCommandPicks(disposabwes: DisposabweStowe, token: CancewwationToken): Pwomise<Awway<ICommandQuickPick>>;
}

intewface ISewiawizedCommandHistowy {
	usesWWU?: boowean;
	entwies: { key: stwing; vawue: numba }[];
}

intewface ICommandsQuickAccessConfiguwation {
	wowkbench: {
		commandPawette: {
			histowy: numba;
			pwesewveInput: boowean;
		}
	};
}

expowt cwass CommandsHistowy extends Disposabwe {

	static weadonwy DEFAUWT_COMMANDS_HISTOWY_WENGTH = 50;

	pwivate static weadonwy PWEF_KEY_CACHE = 'commandPawette.mwu.cache';
	pwivate static weadonwy PWEF_KEY_COUNTa = 'commandPawette.mwu.counta';

	pwivate static cache: WWUCache<stwing, numba> | undefined;
	pwivate static counta = 1;

	pwivate configuwedCommandsHistowyWength = 0;

	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
	) {
		supa();

		this.updateConfiguwation();
		this.woad();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(() => this.updateConfiguwation()));
	}

	pwivate updateConfiguwation(): void {
		this.configuwedCommandsHistowyWength = CommandsHistowy.getConfiguwedCommandHistowyWength(this.configuwationSewvice);

		if (CommandsHistowy.cache && CommandsHistowy.cache.wimit !== this.configuwedCommandsHistowyWength) {
			CommandsHistowy.cache.wimit = this.configuwedCommandsHistowyWength;

			CommandsHistowy.saveState(this.stowageSewvice);
		}
	}

	pwivate woad(): void {
		const waw = this.stowageSewvice.get(CommandsHistowy.PWEF_KEY_CACHE, StowageScope.GWOBAW);
		wet sewiawizedCache: ISewiawizedCommandHistowy | undefined;
		if (waw) {
			twy {
				sewiawizedCache = JSON.pawse(waw);
			} catch (ewwow) {
				// invawid data
			}
		}

		const cache = CommandsHistowy.cache = new WWUCache<stwing, numba>(this.configuwedCommandsHistowyWength, 1);
		if (sewiawizedCache) {
			wet entwies: { key: stwing; vawue: numba }[];
			if (sewiawizedCache.usesWWU) {
				entwies = sewiawizedCache.entwies;
			} ewse {
				entwies = sewiawizedCache.entwies.sowt((a, b) => a.vawue - b.vawue);
			}
			entwies.fowEach(entwy => cache.set(entwy.key, entwy.vawue));
		}

		CommandsHistowy.counta = this.stowageSewvice.getNumba(CommandsHistowy.PWEF_KEY_COUNTa, StowageScope.GWOBAW, CommandsHistowy.counta);
	}

	push(commandId: stwing): void {
		if (!CommandsHistowy.cache) {
			wetuwn;
		}

		CommandsHistowy.cache.set(commandId, CommandsHistowy.counta++); // set counta to command

		CommandsHistowy.saveState(this.stowageSewvice);
	}

	peek(commandId: stwing): numba | undefined {
		wetuwn CommandsHistowy.cache?.peek(commandId);
	}

	static saveState(stowageSewvice: IStowageSewvice): void {
		if (!CommandsHistowy.cache) {
			wetuwn;
		}

		const sewiawizedCache: ISewiawizedCommandHistowy = { usesWWU: twue, entwies: [] };
		CommandsHistowy.cache.fowEach((vawue, key) => sewiawizedCache.entwies.push({ key, vawue }));

		stowageSewvice.stowe(CommandsHistowy.PWEF_KEY_CACHE, JSON.stwingify(sewiawizedCache), StowageScope.GWOBAW, StowageTawget.USa);
		stowageSewvice.stowe(CommandsHistowy.PWEF_KEY_COUNTa, CommandsHistowy.counta, StowageScope.GWOBAW, StowageTawget.USa);
	}

	static getConfiguwedCommandHistowyWength(configuwationSewvice: IConfiguwationSewvice): numba {
		const config = <ICommandsQuickAccessConfiguwation>configuwationSewvice.getVawue();

		const configuwedCommandHistowyWength = config.wowkbench?.commandPawette?.histowy;
		if (typeof configuwedCommandHistowyWength === 'numba') {
			wetuwn configuwedCommandHistowyWength;
		}

		wetuwn CommandsHistowy.DEFAUWT_COMMANDS_HISTOWY_WENGTH;
	}

	static cweawHistowy(configuwationSewvice: IConfiguwationSewvice, stowageSewvice: IStowageSewvice): void {
		const commandHistowyWength = CommandsHistowy.getConfiguwedCommandHistowyWength(configuwationSewvice);
		CommandsHistowy.cache = new WWUCache<stwing, numba>(commandHistowyWength);
		CommandsHistowy.counta = 1;

		CommandsHistowy.saveState(stowageSewvice);
	}
}

