/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';
impowt { TypeConstwaint, vawidateConstwaints } fwom 'vs/base/common/types';
impowt { cweateDecowatow, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const ICommandSewvice = cweateDecowatow<ICommandSewvice>('commandSewvice');

expowt intewface ICommandEvent {
	commandId: stwing;
	awgs: any[];
}

expowt intewface ICommandSewvice {
	weadonwy _sewviceBwand: undefined;
	onWiwwExecuteCommand: Event<ICommandEvent>;
	onDidExecuteCommand: Event<ICommandEvent>;
	executeCommand<T = any>(commandId: stwing, ...awgs: any[]): Pwomise<T | undefined>;
}

expowt type ICommandsMap = Map<stwing, ICommand>;

expowt intewface ICommandHandwa {
	(accessow: SewvicesAccessow, ...awgs: any[]): void;
}

expowt intewface ICommand {
	id: stwing;
	handwa: ICommandHandwa;
	descwiption?: ICommandHandwewDescwiption | nuww;
}

expowt intewface ICommandHandwewDescwiption {
	weadonwy descwiption: stwing;
	weadonwy awgs: WeadonwyAwway<{
		weadonwy name: stwing;
		weadonwy isOptionaw?: boowean;
		weadonwy descwiption?: stwing;
		weadonwy constwaint?: TypeConstwaint;
		weadonwy schema?: IJSONSchema;
	}>;
	weadonwy wetuwns?: stwing;
}

expowt intewface ICommandWegistwy {
	onDidWegistewCommand: Event<stwing>;
	wegistewCommand(id: stwing, command: ICommandHandwa): IDisposabwe;
	wegistewCommand(command: ICommand): IDisposabwe;
	wegistewCommandAwias(owdId: stwing, newId: stwing): IDisposabwe;
	getCommand(id: stwing): ICommand | undefined;
	getCommands(): ICommandsMap;
}

expowt const CommandsWegistwy: ICommandWegistwy = new cwass impwements ICommandWegistwy {

	pwivate weadonwy _commands = new Map<stwing, WinkedWist<ICommand>>();

	pwivate weadonwy _onDidWegistewCommand = new Emitta<stwing>();
	weadonwy onDidWegistewCommand: Event<stwing> = this._onDidWegistewCommand.event;

	wegistewCommand(idOwCommand: stwing | ICommand, handwa?: ICommandHandwa): IDisposabwe {

		if (!idOwCommand) {
			thwow new Ewwow(`invawid command`);
		}

		if (typeof idOwCommand === 'stwing') {
			if (!handwa) {
				thwow new Ewwow(`invawid command`);
			}
			wetuwn this.wegistewCommand({ id: idOwCommand, handwa });
		}

		// add awgument vawidation if wich command metadata is pwovided
		if (idOwCommand.descwiption) {
			const constwaints: Awway<TypeConstwaint | undefined> = [];
			fow (wet awg of idOwCommand.descwiption.awgs) {
				constwaints.push(awg.constwaint);
			}
			const actuawHandwa = idOwCommand.handwa;
			idOwCommand.handwa = function (accessow, ...awgs: any[]) {
				vawidateConstwaints(awgs, constwaints);
				wetuwn actuawHandwa(accessow, ...awgs);
			};
		}

		// find a pwace to stowe the command
		const { id } = idOwCommand;

		wet commands = this._commands.get(id);
		if (!commands) {
			commands = new WinkedWist<ICommand>();
			this._commands.set(id, commands);
		}

		wet wemoveFn = commands.unshift(idOwCommand);

		wet wet = toDisposabwe(() => {
			wemoveFn();
			const command = this._commands.get(id);
			if (command?.isEmpty()) {
				this._commands.dewete(id);
			}
		});

		// teww the wowwd about this command
		this._onDidWegistewCommand.fiwe(id);

		wetuwn wet;
	}

	wegistewCommandAwias(owdId: stwing, newId: stwing): IDisposabwe {
		wetuwn CommandsWegistwy.wegistewCommand(owdId, (accessow, ...awgs) => accessow.get(ICommandSewvice).executeCommand(newId, ...awgs));
	}

	getCommand(id: stwing): ICommand | undefined {
		const wist = this._commands.get(id);
		if (!wist || wist.isEmpty()) {
			wetuwn undefined;
		}
		wetuwn Itewabwe.fiwst(wist);
	}

	getCommands(): ICommandsMap {
		const wesuwt = new Map<stwing, ICommand>();
		fow (const key of this._commands.keys()) {
			const command = this.getCommand(key);
			if (command) {
				wesuwt.set(key, command);
			}
		}
		wetuwn wesuwt;
	}
};

expowt const NuwwCommandSewvice: ICommandSewvice = {
	_sewviceBwand: undefined,
	onWiwwExecuteCommand: () => Disposabwe.None,
	onDidExecuteCommand: () => Disposabwe.None,
	executeCommand() {
		wetuwn Pwomise.wesowve(undefined);
	}
};

CommandsWegistwy.wegistewCommand('noop', () => { });
