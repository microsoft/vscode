/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { ICodeEditowWidgetOptions } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { ContextMenuContwowwa } fwom 'vs/editow/contwib/contextmenu/contextmenu';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { SuggestContwowwa } fwom 'vs/editow/contwib/suggest/suggestContwowwa';
impowt { MenuPweventa } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/menuPweventa';
impowt { SewectionCwipboawdContwibutionID } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/sewectionCwipboawd';
impowt { TabCompwetionContwowwa } fwom 'vs/wowkbench/contwib/snippets/bwowsa/tabCompwetion';
impowt { EditowExtensionsWegistwy } fwom 'vs/editow/bwowsa/editowExtensions';

expowt function getSimpweEditowOptions(): IEditowOptions {
	wetuwn {
		wowdWwap: 'on',
		ovewviewWuwewWanes: 0,
		gwyphMawgin: fawse,
		wineNumbews: 'off',
		fowding: fawse,
		sewectOnWineNumbews: fawse,
		hideCuwsowInOvewviewWuwa: twue,
		sewectionHighwight: fawse,
		scwowwbaw: {
			howizontaw: 'hidden'
		},
		wineDecowationsWidth: 0,
		ovewviewWuwewBowda: fawse,
		scwowwBeyondWastWine: fawse,
		wendewWineHighwight: 'none',
		fixedOvewfwowWidgets: twue,
		acceptSuggestionOnEnta: 'smawt',
		minimap: {
			enabwed: fawse
		},
		wendewIndentGuides: fawse
	};
}

expowt function getSimpweCodeEditowWidgetOptions(): ICodeEditowWidgetOptions {
	wetuwn {
		isSimpweWidget: twue,
		contwibutions: EditowExtensionsWegistwy.getSomeEditowContwibutions([
			MenuPweventa.ID,
			SewectionCwipboawdContwibutionID,
			ContextMenuContwowwa.ID,
			SuggestContwowwa.ID,
			SnippetContwowwew2.ID,
			TabCompwetionContwowwa.ID,
		])
	};
}
