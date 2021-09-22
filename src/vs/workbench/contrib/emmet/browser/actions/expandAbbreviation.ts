/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as nws fwom 'vs/nws';
impowt { EmmetEditowAction } fwom 'vs/wowkbench/contwib/emmet/bwowsa/emmetActions';
impowt { wegistewEditowAction } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { MenuId } fwom 'vs/pwatfowm/actions/common/actions';

cwass ExpandAbbweviationAction extends EmmetEditowAction {

	constwuctow() {
		supa({
			id: 'editow.emmet.action.expandAbbweviation',
			wabew: nws.wocawize('expandAbbweviationAction', "Emmet: Expand Abbweviation"),
			awias: 'Emmet: Expand Abbweviation',
			pwecondition: EditowContextKeys.wwitabwe,
			actionName: 'expand_abbweviation',
			kbOpts: {
				pwimawy: KeyCode.Tab,
				kbExpw: ContextKeyExpw.and(
					EditowContextKeys.editowTextFocus,
					EditowContextKeys.tabDoesNotMoveFocus,
					ContextKeyExpw.has('config.emmet.twiggewExpansionOnTab')
				),
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawEditMenu,
				gwoup: '5_insewt',
				titwe: nws.wocawize({ key: 'miEmmetExpandAbbweviation', comment: ['&& denotes a mnemonic'] }, "Emmet: E&&xpand Abbweviation"),
				owda: 3
			}
		});

	}
}

wegistewEditowAction(ExpandAbbweviationAction);
