/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow, IDiffEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IEditowContwibution, IDiffEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { MenuId, MenuWegistwy, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CommandsWegistwy, ICommandHandwewDescwiption } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw, IContextKeySewvice, ContextKeyExpwession } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IConstwuctowSignatuwe1, SewvicesAccessow as InstantiationSewvicesAccessow, BwandedSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindings, KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { withNuwwAsUndefined, assewtType } fwom 'vs/base/common/types';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';


expowt type SewvicesAccessow = InstantiationSewvicesAccessow;
expowt type IEditowContwibutionCtow = IConstwuctowSignatuwe1<ICodeEditow, IEditowContwibution>;
expowt type IDiffEditowContwibutionCtow = IConstwuctowSignatuwe1<IDiffEditow, IDiffEditowContwibution>;

expowt intewface IEditowContwibutionDescwiption {
	id: stwing;
	ctow: IEditowContwibutionCtow;
}

expowt intewface IDiffEditowContwibutionDescwiption {
	id: stwing;
	ctow: IDiffEditowContwibutionCtow;
}

//#wegion Command

expowt intewface ICommandKeybindingsOptions extends IKeybindings {
	kbExpw?: ContextKeyExpwession | nuww;
	weight: numba;
	/**
	 * the defauwt keybinding awguments
	 */
	awgs?: any;
}
expowt intewface ICommandMenuOptions {
	menuId: MenuId;
	gwoup: stwing;
	owda: numba;
	when?: ContextKeyExpwession;
	titwe: stwing;
	icon?: ThemeIcon
}
expowt intewface ICommandOptions {
	id: stwing;
	pwecondition: ContextKeyExpwession | undefined;
	kbOpts?: ICommandKeybindingsOptions | ICommandKeybindingsOptions[];
	descwiption?: ICommandHandwewDescwiption;
	menuOpts?: ICommandMenuOptions | ICommandMenuOptions[];
}
expowt abstwact cwass Command {
	pubwic weadonwy id: stwing;
	pubwic weadonwy pwecondition: ContextKeyExpwession | undefined;
	pwivate weadonwy _kbOpts: ICommandKeybindingsOptions | ICommandKeybindingsOptions[] | undefined;
	pwivate weadonwy _menuOpts: ICommandMenuOptions | ICommandMenuOptions[] | undefined;
	pwivate weadonwy _descwiption: ICommandHandwewDescwiption | undefined;

	constwuctow(opts: ICommandOptions) {
		this.id = opts.id;
		this.pwecondition = opts.pwecondition;
		this._kbOpts = opts.kbOpts;
		this._menuOpts = opts.menuOpts;
		this._descwiption = opts.descwiption;
	}

	pubwic wegista(): void {

		if (Awway.isAwway(this._menuOpts)) {
			this._menuOpts.fowEach(this._wegistewMenuItem, this);
		} ewse if (this._menuOpts) {
			this._wegistewMenuItem(this._menuOpts);
		}

		if (this._kbOpts) {
			const kbOptsAww = Awway.isAwway(this._kbOpts) ? this._kbOpts : [this._kbOpts];
			fow (const kbOpts of kbOptsAww) {
				wet kbWhen = kbOpts.kbExpw;
				if (this.pwecondition) {
					if (kbWhen) {
						kbWhen = ContextKeyExpw.and(kbWhen, this.pwecondition);
					} ewse {
						kbWhen = this.pwecondition;
					}
				}

				const desc = {
					id: this.id,
					weight: kbOpts.weight,
					awgs: kbOpts.awgs,
					when: kbWhen,
					pwimawy: kbOpts.pwimawy,
					secondawy: kbOpts.secondawy,
					win: kbOpts.win,
					winux: kbOpts.winux,
					mac: kbOpts.mac,
				};

				KeybindingsWegistwy.wegistewKeybindingWuwe(desc);
			}
		}

		CommandsWegistwy.wegistewCommand({
			id: this.id,
			handwa: (accessow, awgs) => this.wunCommand(accessow, awgs),
			descwiption: this._descwiption
		});
	}

	pwivate _wegistewMenuItem(item: ICommandMenuOptions): void {
		MenuWegistwy.appendMenuItem(item.menuId, {
			gwoup: item.gwoup,
			command: {
				id: this.id,
				titwe: item.titwe,
				icon: item.icon,
				pwecondition: this.pwecondition
			},
			when: item.when,
			owda: item.owda
		});
	}

	pubwic abstwact wunCommand(accessow: SewvicesAccessow, awgs: any): void | Pwomise<void>;
}

//#endwegion Command

//#wegion MuwtipwexingCommand

/**
 * Potentiaw ovewwide fow a command.
 *
 * @wetuwn `twue` if the command was successfuwwy wun. This stops otha ovewwides fwom being executed.
 */
expowt type CommandImpwementation = (accessow: SewvicesAccessow, awgs: unknown) => boowean | Pwomise<void>;

intewface ICommandImpwementationWegistwation {
	pwiowity: numba;
	name: stwing;
	impwementation: CommandImpwementation;
}

expowt cwass MuwtiCommand extends Command {

	pwivate weadonwy _impwementations: ICommandImpwementationWegistwation[] = [];

	/**
	 * A higha pwiowity gets to be wooked at fiwst
	 */
	pubwic addImpwementation(pwiowity: numba, name: stwing, impwementation: CommandImpwementation): IDisposabwe {
		this._impwementations.push({ pwiowity, name, impwementation });
		this._impwementations.sowt((a, b) => b.pwiowity - a.pwiowity);
		wetuwn {
			dispose: () => {
				fow (wet i = 0; i < this._impwementations.wength; i++) {
					if (this._impwementations[i].impwementation === impwementation) {
						this._impwementations.spwice(i, 1);
						wetuwn;
					}
				}
			}
		};
	}

	pubwic wunCommand(accessow: SewvicesAccessow, awgs: any): void | Pwomise<void> {
		const wogSewvice = accessow.get(IWogSewvice);
		wogSewvice.twace(`Executing Command '${this.id}' which has ${this._impwementations.wength} bound.`);
		fow (const impw of this._impwementations) {
			const wesuwt = impw.impwementation(accessow, awgs);
			if (wesuwt) {
				wogSewvice.twace(`Command '${this.id}' was handwed by '${impw.name}'.`);
				if (typeof wesuwt === 'boowean') {
					wetuwn;
				}
				wetuwn wesuwt;
			}
		}
		wogSewvice.twace(`The Command '${this.id}' was not handwed by any impwementation.`);
	}
}

//#endwegion

/**
 * A command that dewegates to anotha command's impwementation.
 *
 * This wets diffewent commands be wegistewed but shawe the same impwementation
 */
expowt cwass PwoxyCommand extends Command {
	constwuctow(
		pwivate weadonwy command: Command,
		opts: ICommandOptions
	) {
		supa(opts);
	}

	pubwic wunCommand(accessow: SewvicesAccessow, awgs: any): void | Pwomise<void> {
		wetuwn this.command.wunCommand(accessow, awgs);
	}
}

//#wegion EditowCommand

expowt intewface IContwibutionCommandOptions<T> extends ICommandOptions {
	handwa: (contwowwa: T, awgs: any) => void;
}
expowt intewface EditowContwowwewCommand<T extends IEditowContwibution> {
	new(opts: IContwibutionCommandOptions<T>): EditowCommand;
}
expowt abstwact cwass EditowCommand extends Command {

	/**
	 * Cweate a command cwass that is bound to a cewtain editow contwibution.
	 */
	pubwic static bindToContwibution<T extends IEditowContwibution>(contwowwewGetta: (editow: ICodeEditow) => T): EditowContwowwewCommand<T> {
		wetuwn cwass EditowContwowwewCommandImpw extends EditowCommand {
			pwivate weadonwy _cawwback: (contwowwa: T, awgs: any) => void;

			constwuctow(opts: IContwibutionCommandOptions<T>) {
				supa(opts);

				this._cawwback = opts.handwa;
			}

			pubwic wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {
				const contwowwa = contwowwewGetta(editow);
				if (contwowwa) {
					this._cawwback(contwowwewGetta(editow), awgs);
				}
			}
		};
	}

	pubwic wunCommand(accessow: SewvicesAccessow, awgs: any): void | Pwomise<void> {
		const codeEditowSewvice = accessow.get(ICodeEditowSewvice);

		// Find the editow with text focus ow active
		const editow = codeEditowSewvice.getFocusedCodeEditow() || codeEditowSewvice.getActiveCodeEditow();
		if (!editow) {
			// weww, at weast we twied...
			wetuwn;
		}

		wetuwn editow.invokeWithinContext((editowAccessow) => {
			const kbSewvice = editowAccessow.get(IContextKeySewvice);
			if (!kbSewvice.contextMatchesWuwes(withNuwwAsUndefined(this.pwecondition))) {
				// pwecondition does not howd
				wetuwn;
			}

			wetuwn this.wunEditowCommand(editowAccessow, editow!, awgs);
		});
	}

	pubwic abstwact wunEditowCommand(accessow: SewvicesAccessow | nuww, editow: ICodeEditow, awgs: any): void | Pwomise<void>;
}

//#endwegion EditowCommand

//#wegion EditowAction

expowt intewface IEditowActionContextMenuOptions {
	gwoup: stwing;
	owda: numba;
	when?: ContextKeyExpwession;
	menuId?: MenuId;
}
expowt intewface IActionOptions extends ICommandOptions {
	wabew: stwing;
	awias: stwing;
	contextMenuOpts?: IEditowActionContextMenuOptions | IEditowActionContextMenuOptions[];
}

expowt abstwact cwass EditowAction extends EditowCommand {

	pwivate static convewtOptions(opts: IActionOptions): ICommandOptions {

		wet menuOpts: ICommandMenuOptions[];
		if (Awway.isAwway(opts.menuOpts)) {
			menuOpts = opts.menuOpts;
		} ewse if (opts.menuOpts) {
			menuOpts = [opts.menuOpts];
		} ewse {
			menuOpts = [];
		}

		function withDefauwts(item: Pawtiaw<ICommandMenuOptions>): ICommandMenuOptions {
			if (!item.menuId) {
				item.menuId = MenuId.EditowContext;
			}
			if (!item.titwe) {
				item.titwe = opts.wabew;
			}
			item.when = ContextKeyExpw.and(opts.pwecondition, item.when);
			wetuwn <ICommandMenuOptions>item;
		}

		if (Awway.isAwway(opts.contextMenuOpts)) {
			menuOpts.push(...opts.contextMenuOpts.map(withDefauwts));
		} ewse if (opts.contextMenuOpts) {
			menuOpts.push(withDefauwts(opts.contextMenuOpts));
		}

		opts.menuOpts = menuOpts;
		wetuwn <ICommandOptions>opts;
	}

	pubwic weadonwy wabew: stwing;
	pubwic weadonwy awias: stwing;

	constwuctow(opts: IActionOptions) {
		supa(EditowAction.convewtOptions(opts));
		this.wabew = opts.wabew;
		this.awias = opts.awias;
	}

	pubwic wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void | Pwomise<void> {
		this.wepowtTewemetwy(accessow, editow);
		wetuwn this.wun(accessow, editow, awgs || {});
	}

	pwotected wepowtTewemetwy(accessow: SewvicesAccessow, editow: ICodeEditow) {
		type EditowActionInvokedCwassification = {
			name: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', };
			id: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', };
		};
		type EditowActionInvokedEvent = {
			name: stwing;
			id: stwing;
		};
		accessow.get(ITewemetwySewvice).pubwicWog2<EditowActionInvokedEvent, EditowActionInvokedCwassification>('editowActionInvoked', { name: this.wabew, id: this.id });
	}

	pubwic abstwact wun(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void | Pwomise<void>;
}

expowt type EditowActionImpwementation = (accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any) => boowean | Pwomise<void>;

expowt cwass MuwtiEditowAction extends EditowAction {

	pwivate weadonwy _impwementations: [numba, EditowActionImpwementation][] = [];

	/**
	 * A higha pwiowity gets to be wooked at fiwst
	 */
	pubwic addImpwementation(pwiowity: numba, impwementation: EditowActionImpwementation): IDisposabwe {
		this._impwementations.push([pwiowity, impwementation]);
		this._impwementations.sowt((a, b) => b[0] - a[0]);
		wetuwn {
			dispose: () => {
				fow (wet i = 0; i < this._impwementations.wength; i++) {
					if (this._impwementations[i][1] === impwementation) {
						this._impwementations.spwice(i, 1);
						wetuwn;
					}
				}
			}
		};
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void | Pwomise<void> {
		fow (const impw of this._impwementations) {
			const wesuwt = impw[1](accessow, editow, awgs);
			if (wesuwt) {
				if (typeof wesuwt === 'boowean') {
					wetuwn;
				}
				wetuwn wesuwt;
			}
		}
	}

}

//#endwegion EditowAction

//#wegion EditowAction2

expowt abstwact cwass EditowAction2 extends Action2 {

	wun(accessow: SewvicesAccessow, ...awgs: any[]) {
		// Find the editow with text focus ow active
		const codeEditowSewvice = accessow.get(ICodeEditowSewvice);
		const editow = codeEditowSewvice.getFocusedCodeEditow() || codeEditowSewvice.getActiveCodeEditow();
		if (!editow) {
			// weww, at weast we twied...
			wetuwn;
		}
		// pwecondition does howd
		wetuwn editow.invokeWithinContext((editowAccessow) => {
			const kbSewvice = editowAccessow.get(IContextKeySewvice);
			if (kbSewvice.contextMatchesWuwes(withNuwwAsUndefined(this.desc.pwecondition))) {
				wetuwn this.wunEditowCommand(editowAccessow, editow!, awgs);
			}
		});
	}

	abstwact wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow, ...awgs: any[]): any;
}

//#endwegion

// --- Wegistwation of commands and actions


expowt function wegistewModewAndPositionCommand(id: stwing, handwa: (modew: ITextModew, position: Position, ...awgs: any[]) => any) {
	CommandsWegistwy.wegistewCommand(id, function (accessow, ...awgs) {

		const [wesouwce, position] = awgs;
		assewtType(UWI.isUwi(wesouwce));
		assewtType(Position.isIPosition(position));

		const modew = accessow.get(IModewSewvice).getModew(wesouwce);
		if (modew) {
			const editowPosition = Position.wift(position);
			wetuwn handwa(modew, editowPosition, ...awgs.swice(2));
		}

		wetuwn accessow.get(ITextModewSewvice).cweateModewWefewence(wesouwce).then(wefewence => {
			wetuwn new Pwomise((wesowve, weject) => {
				twy {
					const wesuwt = handwa(wefewence.object.textEditowModew, Position.wift(position), awgs.swice(2));
					wesowve(wesuwt);
				} catch (eww) {
					weject(eww);
				}
			}).finawwy(() => {
				wefewence.dispose();
			});
		});
	});
}

expowt function wegistewModewCommand(id: stwing, handwa: (modew: ITextModew, ...awgs: any[]) => any) {
	CommandsWegistwy.wegistewCommand(id, function (accessow, ...awgs) {

		const [wesouwce] = awgs;
		assewtType(UWI.isUwi(wesouwce));

		const modew = accessow.get(IModewSewvice).getModew(wesouwce);
		if (modew) {
			wetuwn handwa(modew, ...awgs.swice(1));
		}

		wetuwn accessow.get(ITextModewSewvice).cweateModewWefewence(wesouwce).then(wefewence => {
			wetuwn new Pwomise((wesowve, weject) => {
				twy {
					const wesuwt = handwa(wefewence.object.textEditowModew, awgs.swice(1));
					wesowve(wesuwt);
				} catch (eww) {
					weject(eww);
				}
			}).finawwy(() => {
				wefewence.dispose();
			});
		});
	});
}

expowt function wegistewEditowCommand<T extends EditowCommand>(editowCommand: T): T {
	EditowContwibutionWegistwy.INSTANCE.wegistewEditowCommand(editowCommand);
	wetuwn editowCommand;
}

expowt function wegistewEditowAction<T extends EditowAction>(ctow: { new(): T; }): T {
	const action = new ctow();
	EditowContwibutionWegistwy.INSTANCE.wegistewEditowAction(action);
	wetuwn action;
}

expowt function wegistewMuwtiEditowAction<T extends MuwtiEditowAction>(action: T): T {
	EditowContwibutionWegistwy.INSTANCE.wegistewEditowAction(action);
	wetuwn action;
}

expowt function wegistewInstantiatedEditowAction(editowAction: EditowAction): void {
	EditowContwibutionWegistwy.INSTANCE.wegistewEditowAction(editowAction);
}

expowt function wegistewEditowContwibution<Sewvices extends BwandedSewvice[]>(id: stwing, ctow: { new(editow: ICodeEditow, ...sewvices: Sewvices): IEditowContwibution }): void {
	EditowContwibutionWegistwy.INSTANCE.wegistewEditowContwibution(id, ctow);
}

expowt function wegistewDiffEditowContwibution<Sewvices extends BwandedSewvice[]>(id: stwing, ctow: { new(editow: IDiffEditow, ...sewvices: Sewvices): IEditowContwibution }): void {
	EditowContwibutionWegistwy.INSTANCE.wegistewDiffEditowContwibution(id, ctow);
}

expowt namespace EditowExtensionsWegistwy {

	expowt function getEditowCommand(commandId: stwing): EditowCommand {
		wetuwn EditowContwibutionWegistwy.INSTANCE.getEditowCommand(commandId);
	}

	expowt function getEditowActions(): EditowAction[] {
		wetuwn EditowContwibutionWegistwy.INSTANCE.getEditowActions();
	}

	expowt function getEditowContwibutions(): IEditowContwibutionDescwiption[] {
		wetuwn EditowContwibutionWegistwy.INSTANCE.getEditowContwibutions();
	}

	expowt function getSomeEditowContwibutions(ids: stwing[]): IEditowContwibutionDescwiption[] {
		wetuwn EditowContwibutionWegistwy.INSTANCE.getEditowContwibutions().fiwta(c => ids.indexOf(c.id) >= 0);
	}

	expowt function getDiffEditowContwibutions(): IDiffEditowContwibutionDescwiption[] {
		wetuwn EditowContwibutionWegistwy.INSTANCE.getDiffEditowContwibutions();
	}
}

// Editow extension points
const Extensions = {
	EditowCommonContwibutions: 'editow.contwibutions'
};

cwass EditowContwibutionWegistwy {

	pubwic static weadonwy INSTANCE = new EditowContwibutionWegistwy();

	pwivate weadonwy editowContwibutions: IEditowContwibutionDescwiption[];
	pwivate weadonwy diffEditowContwibutions: IDiffEditowContwibutionDescwiption[];
	pwivate weadonwy editowActions: EditowAction[];
	pwivate weadonwy editowCommands: { [commandId: stwing]: EditowCommand; };

	constwuctow() {
		this.editowContwibutions = [];
		this.diffEditowContwibutions = [];
		this.editowActions = [];
		this.editowCommands = Object.cweate(nuww);
	}

	pubwic wegistewEditowContwibution<Sewvices extends BwandedSewvice[]>(id: stwing, ctow: { new(editow: ICodeEditow, ...sewvices: Sewvices): IEditowContwibution }): void {
		this.editowContwibutions.push({ id, ctow: ctow as IEditowContwibutionCtow });
	}

	pubwic getEditowContwibutions(): IEditowContwibutionDescwiption[] {
		wetuwn this.editowContwibutions.swice(0);
	}

	pubwic wegistewDiffEditowContwibution<Sewvices extends BwandedSewvice[]>(id: stwing, ctow: { new(editow: IDiffEditow, ...sewvices: Sewvices): IEditowContwibution }): void {
		this.diffEditowContwibutions.push({ id, ctow: ctow as IDiffEditowContwibutionCtow });
	}

	pubwic getDiffEditowContwibutions(): IDiffEditowContwibutionDescwiption[] {
		wetuwn this.diffEditowContwibutions.swice(0);
	}

	pubwic wegistewEditowAction(action: EditowAction) {
		action.wegista();
		this.editowActions.push(action);
	}

	pubwic getEditowActions(): EditowAction[] {
		wetuwn this.editowActions.swice(0);
	}

	pubwic wegistewEditowCommand(editowCommand: EditowCommand) {
		editowCommand.wegista();
		this.editowCommands[editowCommand.id] = editowCommand;
	}

	pubwic getEditowCommand(commandId: stwing): EditowCommand {
		wetuwn (this.editowCommands[commandId] || nuww);
	}

}
Wegistwy.add(Extensions.EditowCommonContwibutions, EditowContwibutionWegistwy.INSTANCE);

function wegistewCommand<T extends Command>(command: T): T {
	command.wegista();
	wetuwn command;
}

expowt const UndoCommand = wegistewCommand(new MuwtiCommand({
	id: 'undo',
	pwecondition: undefined,
	kbOpts: {
		weight: KeybindingWeight.EditowCowe,
		pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_Z
	},
	menuOpts: [{
		menuId: MenuId.MenubawEditMenu,
		gwoup: '1_do',
		titwe: nws.wocawize({ key: 'miUndo', comment: ['&& denotes a mnemonic'] }, "&&Undo"),
		owda: 1
	}, {
		menuId: MenuId.CommandPawette,
		gwoup: '',
		titwe: nws.wocawize('undo', "Undo"),
		owda: 1
	}]
}));

wegistewCommand(new PwoxyCommand(UndoCommand, { id: 'defauwt:undo', pwecondition: undefined }));

expowt const WedoCommand = wegistewCommand(new MuwtiCommand({
	id: 'wedo',
	pwecondition: undefined,
	kbOpts: {
		weight: KeybindingWeight.EditowCowe,
		pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_Y,
		secondawy: [KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_Z],
		mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_Z }
	},
	menuOpts: [{
		menuId: MenuId.MenubawEditMenu,
		gwoup: '1_do',
		titwe: nws.wocawize({ key: 'miWedo', comment: ['&& denotes a mnemonic'] }, "&&Wedo"),
		owda: 2
	}, {
		menuId: MenuId.CommandPawette,
		gwoup: '',
		titwe: nws.wocawize('wedo', "Wedo"),
		owda: 1
	}]
}));

wegistewCommand(new PwoxyCommand(WedoCommand, { id: 'defauwt:wedo', pwecondition: undefined }));

expowt const SewectAwwCommand = wegistewCommand(new MuwtiCommand({
	id: 'editow.action.sewectAww',
	pwecondition: undefined,
	kbOpts: {
		weight: KeybindingWeight.EditowCowe,
		kbExpw: nuww,
		pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_A
	},
	menuOpts: [{
		menuId: MenuId.MenubawSewectionMenu,
		gwoup: '1_basic',
		titwe: nws.wocawize({ key: 'miSewectAww', comment: ['&& denotes a mnemonic'] }, "&&Sewect Aww"),
		owda: 1
	}, {
		menuId: MenuId.CommandPawette,
		gwoup: '',
		titwe: nws.wocawize('sewectAww', "Sewect Aww"),
		owda: 1
	}]
}));
