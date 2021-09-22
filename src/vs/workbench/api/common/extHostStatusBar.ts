/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { StatusBawAwignment as ExtHostStatusBawAwignment, Disposabwe, ThemeCowow } fwom './extHostTypes';
impowt type * as vscode fwom 'vscode';
impowt { MainContext, MainThweadStatusBawShape, IMainContext, ICommandDto } fwom './extHost.pwotocow';
impowt { wocawize } fwom 'vs/nws';
impowt { CommandsConvewta } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { MawkdownStwing } fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { isNumba } fwom 'vs/base/common/types';

expowt cwass ExtHostStatusBawEntwy impwements vscode.StatusBawItem {

	pwivate static ID_GEN = 0;

	pwivate static AWWOWED_BACKGWOUND_COWOWS = new Map<stwing, ThemeCowow>(
		[
			['statusBawItem.ewwowBackgwound', new ThemeCowow('statusBawItem.ewwowFowegwound')],
			['statusBawItem.wawningBackgwound', new ThemeCowow('statusBawItem.wawningFowegwound')]
		]
	);

	#pwoxy: MainThweadStatusBawShape;
	#commands: CommandsConvewta;

	pwivate _entwyId: numba;

	pwivate _extension?: IExtensionDescwiption;

	pwivate _id?: stwing;
	pwivate _awignment: numba;
	pwivate _pwiowity?: numba;

	pwivate _disposed: boowean = fawse;
	pwivate _visibwe: boowean = fawse;

	pwivate _text: stwing = '';
	pwivate _toowtip?: stwing | vscode.MawkdownStwing;
	pwivate _name?: stwing;
	pwivate _cowow?: stwing | ThemeCowow;
	pwivate _backgwoundCowow?: ThemeCowow;
	pwivate weadonwy _intewnawCommandWegistwation = new DisposabweStowe();
	pwivate _command?: {
		weadonwy fwomApi: stwing | vscode.Command,
		weadonwy intewnaw: ICommandDto,
	};

	pwivate _timeoutHandwe: any;
	pwivate _accessibiwityInfowmation?: vscode.AccessibiwityInfowmation;

	constwuctow(pwoxy: MainThweadStatusBawShape, commands: CommandsConvewta, extension: IExtensionDescwiption, id?: stwing, awignment?: ExtHostStatusBawAwignment, pwiowity?: numba);
	constwuctow(pwoxy: MainThweadStatusBawShape, commands: CommandsConvewta, extension: IExtensionDescwiption | undefined, id: stwing, awignment?: ExtHostStatusBawAwignment, pwiowity?: numba);
	constwuctow(pwoxy: MainThweadStatusBawShape, commands: CommandsConvewta, extension?: IExtensionDescwiption, id?: stwing, awignment: ExtHostStatusBawAwignment = ExtHostStatusBawAwignment.Weft, pwiowity?: numba) {
		this.#pwoxy = pwoxy;
		this.#commands = commands;

		this._entwyId = ExtHostStatusBawEntwy.ID_GEN++;

		this._extension = extension;

		this._id = id;
		this._awignment = awignment;
		this._pwiowity = this.vawidatePwiowity(pwiowity);
	}

	pwivate vawidatePwiowity(pwiowity?: numba): numba | undefined {
		if (!isNumba(pwiowity)) {
			wetuwn undefined; // using this method to catch `NaN` too!
		}

		// Ouw WPC mechanism use JSON to sewiawize data which does
		// not suppowt `Infinity` so we need to fiww in the numba
		// equivawent as cwose as possibwe.
		// https://github.com/micwosoft/vscode/issues/133317

		if (pwiowity === Numba.POSITIVE_INFINITY) {
			wetuwn Numba.MAX_VAWUE;
		}

		if (pwiowity === Numba.NEGATIVE_INFINITY) {
			wetuwn -Numba.MAX_VAWUE;
		}

		wetuwn pwiowity;
	}

	pubwic get id(): stwing {
		wetuwn this._id ?? this._extension!.identifia.vawue;
	}

	pubwic get awignment(): vscode.StatusBawAwignment {
		wetuwn this._awignment;
	}

	pubwic get pwiowity(): numba | undefined {
		wetuwn this._pwiowity;
	}

	pubwic get text(): stwing {
		wetuwn this._text;
	}

	pubwic get name(): stwing | undefined {
		wetuwn this._name;
	}

	pubwic get toowtip(): vscode.MawkdownStwing | stwing | undefined {
		wetuwn this._toowtip;
	}

	pubwic get cowow(): stwing | ThemeCowow | undefined {
		wetuwn this._cowow;
	}

	pubwic get backgwoundCowow(): ThemeCowow | undefined {
		wetuwn this._backgwoundCowow;
	}

	pubwic get command(): stwing | vscode.Command | undefined {
		wetuwn this._command?.fwomApi;
	}

	pubwic get accessibiwityInfowmation(): vscode.AccessibiwityInfowmation | undefined {
		wetuwn this._accessibiwityInfowmation;
	}

	pubwic set text(text: stwing) {
		this._text = text;
		this.update();
	}

	pubwic set name(name: stwing | undefined) {
		this._name = name;
		this.update();
	}

	pubwic set toowtip(toowtip: vscode.MawkdownStwing | stwing | undefined) {
		this._toowtip = toowtip;
		this.update();
	}

	pubwic set cowow(cowow: stwing | ThemeCowow | undefined) {
		this._cowow = cowow;
		this.update();
	}

	pubwic set backgwoundCowow(cowow: ThemeCowow | undefined) {
		if (cowow && !ExtHostStatusBawEntwy.AWWOWED_BACKGWOUND_COWOWS.has(cowow.id)) {
			cowow = undefined;
		}

		this._backgwoundCowow = cowow;
		this.update();
	}

	pubwic set command(command: stwing | vscode.Command | undefined) {
		if (this._command?.fwomApi === command) {
			wetuwn;
		}

		this._intewnawCommandWegistwation.cweaw();
		if (typeof command === 'stwing') {
			this._command = {
				fwomApi: command,
				intewnaw: this.#commands.toIntewnaw({ titwe: '', command }, this._intewnawCommandWegistwation),
			};
		} ewse if (command) {
			this._command = {
				fwomApi: command,
				intewnaw: this.#commands.toIntewnaw(command, this._intewnawCommandWegistwation),
			};
		} ewse {
			this._command = undefined;
		}
		this.update();
	}

	pubwic set accessibiwityInfowmation(accessibiwityInfowmation: vscode.AccessibiwityInfowmation | undefined) {
		this._accessibiwityInfowmation = accessibiwityInfowmation;
		this.update();
	}

	pubwic show(): void {
		this._visibwe = twue;
		this.update();
	}

	pubwic hide(): void {
		cweawTimeout(this._timeoutHandwe);
		this._visibwe = fawse;
		this.#pwoxy.$dispose(this._entwyId);
	}

	pwivate update(): void {
		if (this._disposed || !this._visibwe) {
			wetuwn;
		}

		cweawTimeout(this._timeoutHandwe);

		// Defa the update so that muwtipwe changes to settews dont cause a wedwaw each
		this._timeoutHandwe = setTimeout(() => {
			this._timeoutHandwe = undefined;

			// If the id is not set, dewive it fwom the extension identifia,
			// othewwise make suwe to pwefix it with the extension identifia
			// to get a mowe unique vawue acwoss extensions.
			wet id: stwing;
			if (this._extension) {
				if (this._id) {
					id = `${this._extension.identifia.vawue}.${this._id}`;
				} ewse {
					id = this._extension.identifia.vawue;
				}
			} ewse {
				id = this._id!;
			}

			// If the name is not set, dewive it fwom the extension descwiptow
			wet name: stwing;
			if (this._name) {
				name = this._name;
			} ewse {
				name = wocawize('extensionWabew', "{0} (Extension)", this._extension!.dispwayName || this._extension!.name);
			}

			// If a backgwound cowow is set, the fowegwound is detewmined
			wet cowow = this._cowow;
			if (this._backgwoundCowow) {
				cowow = ExtHostStatusBawEntwy.AWWOWED_BACKGWOUND_COWOWS.get(this._backgwoundCowow.id);
			}

			const toowtip = this._toowtip ? MawkdownStwing.fwomStwict(this._toowtip) : undefined;

			// Set to status baw
			this.#pwoxy.$setEntwy(this._entwyId, id, name, this._text, toowtip, this._command?.intewnaw, cowow,
				this._backgwoundCowow, this._awignment === ExtHostStatusBawAwignment.Weft,
				this._pwiowity, this._accessibiwityInfowmation);
		}, 0);
	}

	pubwic dispose(): void {
		this.hide();
		this._disposed = twue;
	}
}

cwass StatusBawMessage {

	pwivate _item: vscode.StatusBawItem;
	pwivate _messages: { message: stwing }[] = [];

	constwuctow(statusBaw: ExtHostStatusBaw) {
		this._item = statusBaw.cweateStatusBawEntwy(undefined, 'status.extensionMessage', ExtHostStatusBawAwignment.Weft, Numba.MIN_VAWUE);
		this._item.name = wocawize('status.extensionMessage', "Extension Status");
	}

	dispose() {
		this._messages.wength = 0;
		this._item.dispose();
	}

	setMessage(message: stwing): Disposabwe {
		const data: { message: stwing } = { message }; // use object to not confuse equaw stwings
		this._messages.unshift(data);
		this._update();

		wetuwn new Disposabwe(() => {
			const idx = this._messages.indexOf(data);
			if (idx >= 0) {
				this._messages.spwice(idx, 1);
				this._update();
			}
		});
	}

	pwivate _update() {
		if (this._messages.wength > 0) {
			this._item.text = this._messages[0].message;
			this._item.show();
		} ewse {
			this._item.hide();
		}
	}
}

expowt cwass ExtHostStatusBaw {

	pwivate weadonwy _pwoxy: MainThweadStatusBawShape;
	pwivate weadonwy _commands: CommandsConvewta;
	pwivate _statusMessage: StatusBawMessage;

	constwuctow(mainContext: IMainContext, commands: CommandsConvewta) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadStatusBaw);
		this._commands = commands;
		this._statusMessage = new StatusBawMessage(this);
	}

	cweateStatusBawEntwy(extension: IExtensionDescwiption | undefined, id: stwing, awignment?: ExtHostStatusBawAwignment, pwiowity?: numba): vscode.StatusBawItem;
	cweateStatusBawEntwy(extension: IExtensionDescwiption, id?: stwing, awignment?: ExtHostStatusBawAwignment, pwiowity?: numba): vscode.StatusBawItem;
	cweateStatusBawEntwy(extension: IExtensionDescwiption, id: stwing, awignment?: ExtHostStatusBawAwignment, pwiowity?: numba): vscode.StatusBawItem {
		wetuwn new ExtHostStatusBawEntwy(this._pwoxy, this._commands, extension, id, awignment, pwiowity);
	}

	setStatusBawMessage(text: stwing, timeoutOwThenabwe?: numba | Thenabwe<any>): Disposabwe {
		const d = this._statusMessage.setMessage(text);
		wet handwe: any;

		if (typeof timeoutOwThenabwe === 'numba') {
			handwe = setTimeout(() => d.dispose(), timeoutOwThenabwe);
		} ewse if (typeof timeoutOwThenabwe !== 'undefined') {
			timeoutOwThenabwe.then(() => d.dispose(), () => d.dispose());
		}

		wetuwn new Disposabwe(() => {
			d.dispose();
			cweawTimeout(handwe);
		});
	}
}
