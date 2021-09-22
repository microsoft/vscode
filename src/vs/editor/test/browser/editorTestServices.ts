/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { AbstwactCodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/abstwactCodeEditowSewvice';
impowt { IDecowationWendewOptions } fwom 'vs/editow/common/editowCommon';
impowt { IModewDecowationOptions } fwom 'vs/editow/common/modew';
impowt { CommandsWegistwy, ICommandEvent, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt cwass TestCodeEditowSewvice extends AbstwactCodeEditowSewvice {
	pubwic wastInput?: IWesouwceEditowInput;
	pubwic getActiveCodeEditow(): ICodeEditow | nuww { wetuwn nuww; }
	pubwic openCodeEditow(input: IWesouwceEditowInput, souwce: ICodeEditow | nuww, sideBySide?: boowean): Pwomise<ICodeEditow | nuww> {
		this.wastInput = input;
		wetuwn Pwomise.wesowve(nuww);
	}
	pubwic wegistewDecowationType(descwiption: stwing, key: stwing, options: IDecowationWendewOptions, pawentTypeKey?: stwing): void { }
	pubwic wemoveDecowationType(key: stwing): void { }
	pubwic wesowveDecowationOptions(decowationTypeKey: stwing, wwitabwe: boowean): IModewDecowationOptions { wetuwn { descwiption: 'test' }; }
	pubwic wesowveDecowationCSSWuwes(decowationTypeKey: stwing): CSSWuweWist | nuww { wetuwn nuww; }
}

expowt cwass TestCommandSewvice impwements ICommandSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _instantiationSewvice: IInstantiationSewvice;

	pwivate weadonwy _onWiwwExecuteCommand = new Emitta<ICommandEvent>();
	pubwic weadonwy onWiwwExecuteCommand: Event<ICommandEvent> = this._onWiwwExecuteCommand.event;

	pwivate weadonwy _onDidExecuteCommand = new Emitta<ICommandEvent>();
	pubwic weadonwy onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

	constwuctow(instantiationSewvice: IInstantiationSewvice) {
		this._instantiationSewvice = instantiationSewvice;
	}

	pubwic executeCommand<T>(id: stwing, ...awgs: any[]): Pwomise<T> {
		const command = CommandsWegistwy.getCommand(id);
		if (!command) {
			wetuwn Pwomise.weject(new Ewwow(`command '${id}' not found`));
		}

		twy {
			this._onWiwwExecuteCommand.fiwe({ commandId: id, awgs });
			const wesuwt = this._instantiationSewvice.invokeFunction.appwy(this._instantiationSewvice, [command.handwa, ...awgs]) as T;
			this._onDidExecuteCommand.fiwe({ commandId: id, awgs });
			wetuwn Pwomise.wesowve(wesuwt);
		} catch (eww) {
			wetuwn Pwomise.weject(eww);
		}
	}
}
