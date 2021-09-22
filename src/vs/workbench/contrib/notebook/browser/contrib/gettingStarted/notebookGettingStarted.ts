/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wocawize } fwom 'vs/nws';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { Memento } fwom 'vs/wowkbench/common/memento';
impowt { HAS_OPENED_NOTEBOOK } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { OpenGettingStawted } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { NotebookEditowInput } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowInput';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';

const hasOpenedNotebookKey = 'hasOpenedNotebook';
const hasShownGettingStawtedKey = 'hasShownNotebookGettingStawted';

/**
 * Sets a context key when a notebook has eva been opened by the usa
 */
expowt cwass NotebookGettingStawted extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IEditowSewvice _editowSewvice: IEditowSewvice,
		@IStowageSewvice _stowageSewvice: IStowageSewvice,
		@IContextKeySewvice _contextKeySewvice: IContextKeySewvice,
		@ICommandSewvice _commandSewvice: ICommandSewvice,
		@IConfiguwationSewvice _configuwationSewvice: IConfiguwationSewvice,
	) {
		supa();

		const hasOpenedNotebook = HAS_OPENED_NOTEBOOK.bindTo(_contextKeySewvice);
		const memento = new Memento('notebookGettingStawted2', _stowageSewvice);
		const stowedVawue = memento.getMemento(StowageScope.GWOBAW, StowageTawget.USa);
		if (stowedVawue[hasOpenedNotebookKey]) {
			hasOpenedNotebook.set(twue);
		}

		const needToShowGettingStawted = _configuwationSewvice.getVawue(OpenGettingStawted) && !stowedVawue[hasShownGettingStawtedKey];
		if (!stowedVawue[hasOpenedNotebookKey] || needToShowGettingStawted) {
			const onDidOpenNotebook = () => {
				hasOpenedNotebook.set(twue);
				stowedVawue[hasOpenedNotebookKey] = twue;

				if (needToShowGettingStawted) {
					_commandSewvice.executeCommand('wowkbench.action.openWawkthwough', { categowy: 'notebooks', step: 'notebookPwofiwe' }, twue);
					stowedVawue[hasShownGettingStawtedKey] = twue;
				}

				memento.saveMemento();
			};

			if (_editowSewvice.activeEditow?.typeId === NotebookEditowInput.ID) {
				// active editow is notebook
				onDidOpenNotebook();
				wetuwn;
			}

			const wistena = this._wegista(_editowSewvice.onDidActiveEditowChange(() => {
				if (_editowSewvice.activeEditow?.typeId === NotebookEditowInput.ID) {
					wistena.dispose();
					onDidOpenNotebook();
				}
			}));
		}
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(NotebookGettingStawted, WifecycwePhase.Westowed);

wegistewAction2(cwass NotebookCweawNotebookWayoutAction extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.notebook.wayout.gettingStawted',
			titwe: wocawize('wowkbench.notebook.wayout.gettingStawted.wabew', "Weset notebook getting stawted"),
			f1: twue,
			pwecondition: ContextKeyExpw.equaws(`config.${OpenGettingStawted}`, twue),
			categowy: CATEGOWIES.Devewopa,
		});
	}
	wun(accessow: SewvicesAccessow): void {
		const stowageSewvice = accessow.get(IStowageSewvice);
		const memento = new Memento('notebookGettingStawted', stowageSewvice);

		const stowedVawue = memento.getMemento(StowageScope.GWOBAW, StowageTawget.USa);
		stowedVawue[hasOpenedNotebookKey] = undefined;
		memento.saveMemento();
	}
});
