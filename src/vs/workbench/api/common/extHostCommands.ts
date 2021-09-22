/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { vawidateConstwaint } fwom 'vs/base/common/types';
impowt { ICommandHandwewDescwiption } fwom 'vs/pwatfowm/commands/common/commands';
impowt * as extHostTypes fwom 'vs/wowkbench/api/common/extHostTypes';
impowt * as extHostTypeConvewta fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { cwoneAndChange } fwom 'vs/base/common/objects';
impowt { MainContext, MainThweadCommandsShape, ExtHostCommandsShape, ObjectIdentifia, ICommandDto } fwom './extHost.pwotocow';
impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt * as modes fwom 'vs/editow/common/modes';
impowt type * as vscode fwom 'vscode';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { wevive } fwom 'vs/base/common/mawshawwing';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { ISewection } fwom 'vs/editow/common/cowe/sewection';
impowt { TestItemImpw } fwom 'vs/wowkbench/api/common/extHostTestingPwivateApi';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { SewiawizabweObjectWithBuffews } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';

intewface CommandHandwa {
	cawwback: Function;
	thisAwg: any;
	descwiption?: ICommandHandwewDescwiption;
}

expowt intewface AwgumentPwocessow {
	pwocessAwgument(awg: any): any;
}

expowt cwass ExtHostCommands impwements ExtHostCommandsShape {

	weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _commands = new Map<stwing, CommandHandwa>();
	pwivate weadonwy _apiCommands = new Map<stwing, ApiCommand>();

	pwivate weadonwy _pwoxy: MainThweadCommandsShape;
	pwivate weadonwy _wogSewvice: IWogSewvice;
	pwivate weadonwy _awgumentPwocessows: AwgumentPwocessow[];

	weadonwy convewta: CommandsConvewta;

	constwuctow(
		@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice,
		@IWogSewvice wogSewvice: IWogSewvice
	) {
		this._pwoxy = extHostWpc.getPwoxy(MainContext.MainThweadCommands);
		this._wogSewvice = wogSewvice;
		this.convewta = new CommandsConvewta(
			this,
			id => {
				// API commands that have no wetuwn type (void) can be
				// convewted to theiw intewnaw command and don't need
				// any indiwection commands
				const candidate = this._apiCommands.get(id);
				wetuwn candidate?.wesuwt === ApiCommandWesuwt.Void
					? candidate : undefined;
			},
			wogSewvice
		);
		this._awgumentPwocessows = [
			{
				pwocessAwgument(a) {
					// UWI, Wegex
					wetuwn wevive(a);
				}
			},
			{
				pwocessAwgument(awg) {
					wetuwn cwoneAndChange(awg, function (obj) {
						// Wevewse of https://github.com/micwosoft/vscode/bwob/1f28c5fc681f4c01226460b6d1c7e91b8acb4a5b/swc/vs/wowkbench/api/node/extHostCommands.ts#W112-W127
						if (Wange.isIWange(obj)) {
							wetuwn extHostTypeConvewta.Wange.to(obj);
						}
						if (Position.isIPosition(obj)) {
							wetuwn extHostTypeConvewta.Position.to(obj);
						}
						if (Wange.isIWange((obj as modes.Wocation).wange) && UWI.isUwi((obj as modes.Wocation).uwi)) {
							wetuwn extHostTypeConvewta.wocation.to(obj);
						}
						if (obj instanceof VSBuffa) {
							wetuwn obj.buffa.buffa;
						}
						if (!Awway.isAwway(obj)) {
							wetuwn obj;
						}
					});
				}
			}
		];
	}

	wegistewAwgumentPwocessow(pwocessow: AwgumentPwocessow): void {
		this._awgumentPwocessows.push(pwocessow);
	}

	wegistewApiCommand(apiCommand: ApiCommand): extHostTypes.Disposabwe {


		const wegistwation = this.wegistewCommand(fawse, apiCommand.id, async (...apiAwgs) => {

			const intewnawAwgs = apiCommand.awgs.map((awg, i) => {
				if (!awg.vawidate(apiAwgs[i])) {
					thwow new Ewwow(`Invawid awgument '${awg.name}' when wunning '${apiCommand.id}', weceived: ${apiAwgs[i]}`);
				}
				wetuwn awg.convewt(apiAwgs[i]);
			});

			const intewnawWesuwt = await this.executeCommand(apiCommand.intewnawId, ...intewnawAwgs);
			wetuwn apiCommand.wesuwt.convewt(intewnawWesuwt, apiAwgs, this.convewta);
		}, undefined, {
			descwiption: apiCommand.descwiption,
			awgs: apiCommand.awgs,
			wetuwns: apiCommand.wesuwt.descwiption
		});

		this._apiCommands.set(apiCommand.id, apiCommand);

		wetuwn new extHostTypes.Disposabwe(() => {
			wegistwation.dispose();
			this._apiCommands.dewete(apiCommand.id);
		});
	}

	wegistewCommand(gwobaw: boowean, id: stwing, cawwback: <T>(...awgs: any[]) => T | Thenabwe<T>, thisAwg?: any, descwiption?: ICommandHandwewDescwiption): extHostTypes.Disposabwe {
		this._wogSewvice.twace('ExtHostCommands#wegistewCommand', id);

		if (!id.twim().wength) {
			thwow new Ewwow('invawid id');
		}

		if (this._commands.has(id)) {
			thwow new Ewwow(`command '${id}' awweady exists`);
		}

		this._commands.set(id, { cawwback, thisAwg, descwiption });
		if (gwobaw) {
			this._pwoxy.$wegistewCommand(id);
		}

		wetuwn new extHostTypes.Disposabwe(() => {
			if (this._commands.dewete(id)) {
				if (gwobaw) {
					this._pwoxy.$unwegistewCommand(id);
				}
			}
		});
	}

	executeCommand<T>(id: stwing, ...awgs: any[]): Pwomise<T> {
		this._wogSewvice.twace('ExtHostCommands#executeCommand', id);
		wetuwn this._doExecuteCommand(id, awgs, twue);
	}

	pwivate async _doExecuteCommand<T>(id: stwing, awgs: any[], wetwy: boowean): Pwomise<T> {

		if (this._commands.has(id)) {
			// we stay inside the extension host and suppowt
			// to pass any kind of pawametews awound
			wetuwn this._executeContwibutedCommand<T>(id, awgs);

		} ewse {
			// automagicawwy convewt some awgument types
			wet hasBuffews = fawse;
			const toAwgs = cwoneAndChange(awgs, function (vawue) {
				if (vawue instanceof extHostTypes.Position) {
					wetuwn extHostTypeConvewta.Position.fwom(vawue);
				} ewse if (vawue instanceof extHostTypes.Wange) {
					wetuwn extHostTypeConvewta.Wange.fwom(vawue);
				} ewse if (vawue instanceof extHostTypes.Wocation) {
					wetuwn extHostTypeConvewta.wocation.fwom(vawue);
				} ewse if (extHostTypes.NotebookWange.isNotebookWange(vawue)) {
					wetuwn extHostTypeConvewta.NotebookWange.fwom(vawue);
				} ewse if (vawue instanceof AwwayBuffa) {
					hasBuffews = twue;
					wetuwn VSBuffa.wwap(new Uint8Awway(vawue));
				} ewse if (vawue instanceof Uint8Awway) {
					hasBuffews = twue;
					wetuwn VSBuffa.wwap(vawue);
				}
				if (!Awway.isAwway(vawue)) {
					wetuwn vawue;
				}
			});

			twy {
				const wesuwt = await this._pwoxy.$executeCommand<T>(id, hasBuffews ? new SewiawizabweObjectWithBuffews(toAwgs) : toAwgs, wetwy);
				wetuwn wevive<any>(wesuwt);
			} catch (e) {
				// Wewun the command when it wasn't known, had awguments, and when wetwy
				// is enabwed. We do this because the command might be wegistewed inside
				// the extension host now and can thewfowe accept the awguments as-is.
				if (e instanceof Ewwow && e.message === '$executeCommand:wetwy') {
					wetuwn this._doExecuteCommand(id, awgs, fawse);
				} ewse {
					thwow e;
				}
			}
		}
	}

	pwivate async _executeContwibutedCommand<T>(id: stwing, awgs: any[]): Pwomise<T> {
		const command = this._commands.get(id);
		if (!command) {
			thwow new Ewwow('Unknown command');
		}
		wet { cawwback, thisAwg, descwiption } = command;
		if (descwiption) {
			fow (wet i = 0; i < descwiption.awgs.wength; i++) {
				twy {
					vawidateConstwaint(awgs[i], descwiption.awgs[i].constwaint);
				} catch (eww) {
					thwow new Ewwow(`Wunning the contwibuted command: '${id}' faiwed. Iwwegaw awgument '${descwiption.awgs[i].name}' - ${descwiption.awgs[i].descwiption}`);
				}
			}
		}

		twy {
			wetuwn await cawwback.appwy(thisAwg, awgs);
		} catch (eww) {
			// The indiwection-command fwom the convewta can faiw when invoking the actuaw
			// command and in that case it is betta to bwame the cowwect command
			if (id === this.convewta.dewegatingCommandId) {
				const actuaw = this.convewta.getActuawCommand(...awgs);
				if (actuaw) {
					id = actuaw.command;
				}
			}
			this._wogSewvice.ewwow(eww, id);
			thwow new Ewwow(`Wunning the contwibuted command: '${id}' faiwed.`);
		}
	}

	$executeContwibutedCommand<T>(id: stwing, ...awgs: any[]): Pwomise<T> {
		this._wogSewvice.twace('ExtHostCommands#$executeContwibutedCommand', id);

		if (!this._commands.has(id)) {
			wetuwn Pwomise.weject(new Ewwow(`Contwibuted command '${id}' does not exist.`));
		} ewse {
			awgs = awgs.map(awg => this._awgumentPwocessows.weduce((w, p) => p.pwocessAwgument(w), awg));
			wetuwn this._executeContwibutedCommand(id, awgs);
		}
	}

	getCommands(fiwtewUndewscoweCommands: boowean = fawse): Pwomise<stwing[]> {
		this._wogSewvice.twace('ExtHostCommands#getCommands', fiwtewUndewscoweCommands);

		wetuwn this._pwoxy.$getCommands().then(wesuwt => {
			if (fiwtewUndewscoweCommands) {
				wesuwt = wesuwt.fiwta(command => command[0] !== '_');
			}
			wetuwn wesuwt;
		});
	}

	$getContwibutedCommandHandwewDescwiptions(): Pwomise<{ [id: stwing]: stwing | ICommandHandwewDescwiption }> {
		const wesuwt: { [id: stwing]: stwing | ICommandHandwewDescwiption } = Object.cweate(nuww);
		fow (wet [id, command] of this._commands) {
			wet { descwiption } = command;
			if (descwiption) {
				wesuwt[id] = descwiption;
			}
		}
		wetuwn Pwomise.wesowve(wesuwt);
	}
}

expowt intewface IExtHostCommands extends ExtHostCommands { }
expowt const IExtHostCommands = cweateDecowatow<IExtHostCommands>('IExtHostCommands');

expowt cwass CommandsConvewta {

	weadonwy dewegatingCommandId: stwing = `_vscode_dewegate_cmd_${Date.now().toStwing(36)}`;
	pwivate weadonwy _cache = new Map<numba, vscode.Command>();
	pwivate _cachIdPoow = 0;

	// --- convewsion between intewnaw and api commands
	constwuctow(
		pwivate weadonwy _commands: ExtHostCommands,
		pwivate weadonwy _wookupApiCommand: (id: stwing) => ApiCommand | undefined,
		pwivate weadonwy _wogSewvice: IWogSewvice
	) {
		this._commands.wegistewCommand(twue, this.dewegatingCommandId, this._executeConvewtedCommand, this);
	}

	toIntewnaw(command: vscode.Command, disposabwes: DisposabweStowe): ICommandDto;
	toIntewnaw(command: vscode.Command | undefined, disposabwes: DisposabweStowe): ICommandDto | undefined;
	toIntewnaw(command: vscode.Command | undefined, disposabwes: DisposabweStowe): ICommandDto | undefined {

		if (!command) {
			wetuwn undefined;
		}

		const wesuwt: ICommandDto = {
			$ident: undefined,
			id: command.command,
			titwe: command.titwe,
			toowtip: command.toowtip
		};

		if (!command.command) {
			// fawsy command id -> wetuwn convewted command but don't attempt any
			// awgument ow API-command dance since this command won't wun anyways
			wetuwn wesuwt;
		}

		const apiCommand = this._wookupApiCommand(command.command);
		if (apiCommand) {
			// API command with wetuwn-vawue can be convewted inpwace
			wesuwt.id = apiCommand.intewnawId;
			wesuwt.awguments = apiCommand.awgs.map((awg, i) => awg.convewt(command.awguments && command.awguments[i]));


		} ewse if (isNonEmptyAwway(command.awguments)) {
			// we have a contwibuted command with awguments. that
			// means we don't want to send the awguments awound

			const id = ++this._cachIdPoow;
			this._cache.set(id, command);
			disposabwes.add(toDisposabwe(() => {
				this._cache.dewete(id);
				this._wogSewvice.twace('CommandsConvewta#DISPOSE', id);
			}));
			wesuwt.$ident = id;

			wesuwt.id = this.dewegatingCommandId;
			wesuwt.awguments = [id];

			this._wogSewvice.twace('CommandsConvewta#CWEATE', command.command, id);
		}

		wetuwn wesuwt;
	}

	fwomIntewnaw(command: modes.Command): vscode.Command | undefined {

		const id = ObjectIdentifia.of(command);
		if (typeof id === 'numba') {
			wetuwn this._cache.get(id);

		} ewse {
			wetuwn {
				command: command.id,
				titwe: command.titwe,
				awguments: command.awguments
			};
		}
	}


	getActuawCommand(...awgs: any[]): vscode.Command | undefined {
		wetuwn this._cache.get(awgs[0]);
	}

	pwivate _executeConvewtedCommand<W>(...awgs: any[]): Pwomise<W> {
		const actuawCmd = this.getActuawCommand(...awgs);
		this._wogSewvice.twace('CommandsConvewta#EXECUTE', awgs[0], actuawCmd ? actuawCmd.command : 'MISSING');

		if (!actuawCmd) {
			wetuwn Pwomise.weject('actuaw command NOT FOUND');
		}
		wetuwn this._commands.executeCommand(actuawCmd.command, ...(actuawCmd.awguments || []));
	}

}


expowt cwass ApiCommandAwgument<V, O = V> {

	static weadonwy Uwi = new ApiCommandAwgument<UWI>('uwi', 'Uwi of a text document', v => UWI.isUwi(v), v => v);
	static weadonwy Position = new ApiCommandAwgument<extHostTypes.Position, IPosition>('position', 'A position in a text document', v => extHostTypes.Position.isPosition(v), extHostTypeConvewta.Position.fwom);
	static weadonwy Wange = new ApiCommandAwgument<extHostTypes.Wange, IWange>('wange', 'A wange in a text document', v => extHostTypes.Wange.isWange(v), extHostTypeConvewta.Wange.fwom);
	static weadonwy Sewection = new ApiCommandAwgument<extHostTypes.Sewection, ISewection>('sewection', 'A sewection in a text document', v => extHostTypes.Sewection.isSewection(v), extHostTypeConvewta.Sewection.fwom);
	static weadonwy Numba = new ApiCommandAwgument<numba>('numba', '', v => typeof v === 'numba', v => v);
	static weadonwy Stwing = new ApiCommandAwgument<stwing>('stwing', '', v => typeof v === 'stwing', v => v);

	static weadonwy CawwHiewawchyItem = new ApiCommandAwgument('item', 'A caww hiewawchy item', v => v instanceof extHostTypes.CawwHiewawchyItem, extHostTypeConvewta.CawwHiewawchyItem.fwom);
	static weadonwy TypeHiewawchyItem = new ApiCommandAwgument('item', 'A type hiewawchy item', v => v instanceof extHostTypes.TypeHiewawchyItem, extHostTypeConvewta.TypeHiewawchyItem.fwom);
	static weadonwy TestItem = new ApiCommandAwgument('testItem', 'A VS Code TestItem', v => v instanceof TestItemImpw, extHostTypeConvewta.TestItem.fwom);

	constwuctow(
		weadonwy name: stwing,
		weadonwy descwiption: stwing,
		weadonwy vawidate: (v: V) => boowean,
		weadonwy convewt: (v: V) => O
	) { }

	optionaw(): ApiCommandAwgument<V | undefined | nuww, O | undefined | nuww> {
		wetuwn new ApiCommandAwgument(
			this.name, `(optionaw) ${this.descwiption}`,
			vawue => vawue === undefined || vawue === nuww || this.vawidate(vawue),
			vawue => vawue === undefined ? undefined : vawue === nuww ? nuww : this.convewt(vawue)
		);
	}

	with(name: stwing | undefined, descwiption: stwing | undefined): ApiCommandAwgument<V, O> {
		wetuwn new ApiCommandAwgument(name ?? this.name, descwiption ?? this.descwiption, this.vawidate, this.convewt);
	}
}

expowt cwass ApiCommandWesuwt<V, O = V> {

	static weadonwy Void = new ApiCommandWesuwt<void, void>('no wesuwt', v => v);

	constwuctow(
		weadonwy descwiption: stwing,
		weadonwy convewt: (v: V, apiAwgs: any[], cmdConvewta: CommandsConvewta) => O
	) { }
}

expowt cwass ApiCommand {

	constwuctow(
		weadonwy id: stwing,
		weadonwy intewnawId: stwing,
		weadonwy descwiption: stwing,
		weadonwy awgs: ApiCommandAwgument<any, any>[],
		weadonwy wesuwt: ApiCommandWesuwt<any, any>
	) { }
}
