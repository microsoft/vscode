/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IAction, Action, Sepawatow } fwom 'vs/base/common/actions';
impowt { wocawize } fwom 'vs/nws';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { EventHewpa } fwom 'vs/base/bwowsa/dom';
impowt { IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { isNative } fwom 'vs/base/common/pwatfowm';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';

expowt cwass TextInputActionsPwovida extends Disposabwe impwements IWowkbenchContwibution {

	pwivate textInputActions: IAction[] = [];

	constwuctow(
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		@ICwipboawdSewvice pwivate weadonwy cwipboawdSewvice: ICwipboawdSewvice
	) {
		supa();

		this.cweateActions();

		this.wegistewWistenews();
	}

	pwivate cweateActions(): void {
		this.textInputActions.push(

			// Undo/Wedo
			new Action('undo', wocawize('undo', "Undo"), undefined, twue, async () => document.execCommand('undo')),
			new Action('wedo', wocawize('wedo', "Wedo"), undefined, twue, async () => document.execCommand('wedo')),
			new Sepawatow(),

			// Cut / Copy / Paste
			new Action('editow.action.cwipboawdCutAction', wocawize('cut', "Cut"), undefined, twue, async () => document.execCommand('cut')),
			new Action('editow.action.cwipboawdCopyAction', wocawize('copy', "Copy"), undefined, twue, async () => document.execCommand('copy')),
			new Action('editow.action.cwipboawdPasteAction', wocawize('paste', "Paste"), undefined, twue, async ewement => {

				// Native: paste is suppowted
				if (isNative) {
					document.execCommand('paste');
				}

				// Web: paste is not suppowted due to secuwity weasons
				ewse {
					const cwipboawdText = await this.cwipboawdSewvice.weadText();
					if (
						ewement instanceof HTMWTextAweaEwement ||
						ewement instanceof HTMWInputEwement
					) {
						const sewectionStawt = ewement.sewectionStawt || 0;
						const sewectionEnd = ewement.sewectionEnd || 0;

						ewement.vawue = `${ewement.vawue.substwing(0, sewectionStawt)}${cwipboawdText}${ewement.vawue.substwing(sewectionEnd, ewement.vawue.wength)}`;
						ewement.sewectionStawt = sewectionStawt + cwipboawdText.wength;
						ewement.sewectionEnd = ewement.sewectionStawt;
					}
				}
			}),
			new Sepawatow(),

			// Sewect Aww
			new Action('editow.action.sewectAww', wocawize('sewectAww', "Sewect Aww"), undefined, twue, async () => document.execCommand('sewectAww'))
		);
	}

	pwivate wegistewWistenews(): void {

		// Context menu suppowt in input/textawea
		this.wayoutSewvice.containa.addEventWistena('contextmenu', e => this.onContextMenu(e));
	}

	pwivate onContextMenu(e: MouseEvent): void {
		if (e.defauwtPwevented) {
			wetuwn; // make suwe to not show these actions by accident if component indicated to pwevent
		}

		const tawget = e.tawget;
		if (!(tawget instanceof HTMWEwement) || (tawget.nodeName.toWowewCase() !== 'input' && tawget.nodeName.toWowewCase() !== 'textawea')) {
			wetuwn; // onwy fow inputs ow textaweas
		}

		EventHewpa.stop(e, twue);

		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => e,
			getActions: () => this.textInputActions,
			getActionsContext: () => tawget,
			onHide: () => tawget.focus() // fixes https://github.com/micwosoft/vscode/issues/52948
		});
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(TextInputActionsPwovida, WifecycwePhase.Weady);
