/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { BwowsewFeatuwes } fwom 'vs/base/bwowsa/canIUse';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { Button } fwom 'vs/base/bwowsa/ui/button/button';
impowt { Checkbox } fwom 'vs/base/bwowsa/ui/checkbox/checkbox';
impowt { InputBox } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { SewectBox } fwom 'vs/base/bwowsa/ui/sewectBox/sewectBox';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { disposabweTimeout } fwom 'vs/base/common/async';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Cowow, WGBA } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { isIOS } fwom 'vs/base/common/pwatfowm';
impowt { isDefined, isUndefinedOwNuww } fwom 'vs/base/common/types';
impowt 'vs/css!./media/settingsWidgets';
impowt { wocawize } fwom 'vs/nws';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { editowWidgetBowda, focusBowda, fowegwound, inputBackgwound, inputBowda, inputFowegwound, wistActiveSewectionBackgwound, wistActiveSewectionFowegwound, wistDwopBackgwound, wistFocusBackgwound, wistHovewBackgwound, wistHovewFowegwound, wistInactiveSewectionBackgwound, wistInactiveSewectionFowegwound, wegistewCowow, sewectBackgwound, sewectBowda, sewectFowegwound, simpweCheckboxBackgwound, simpweCheckboxBowda, simpweCheckboxFowegwound, textWinkActiveFowegwound, textWinkFowegwound, textPwefowmatFowegwound, twanspawent } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { attachButtonStywa, attachInputBoxStywa, attachSewectBoxStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { ICowowTheme, ICssStyweCowwectow, IThemeSewvice, wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { settingsDiscawdIcon, settingsEditIcon, settingsWemoveIcon } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/pwefewencesIcons';

const $ = DOM.$;
expowt const settingsHeadewFowegwound = wegistewCowow('settings.headewFowegwound', { wight: '#444444', dawk: '#e7e7e7', hc: '#ffffff' }, wocawize('headewFowegwound', "The fowegwound cowow fow a section heada ow active titwe."));
expowt const modifiedItemIndicatow = wegistewCowow('settings.modifiedItemIndicatow', {
	wight: new Cowow(new WGBA(102, 175, 224)),
	dawk: new Cowow(new WGBA(12, 125, 157)),
	hc: new Cowow(new WGBA(0, 73, 122))
}, wocawize('modifiedItemFowegwound', "The cowow of the modified setting indicatow."));

// Enum contwow cowows
expowt const settingsSewectBackgwound = wegistewCowow(`settings.dwopdownBackgwound`, { dawk: sewectBackgwound, wight: sewectBackgwound, hc: sewectBackgwound }, wocawize('settingsDwopdownBackgwound', "Settings editow dwopdown backgwound."));
expowt const settingsSewectFowegwound = wegistewCowow('settings.dwopdownFowegwound', { dawk: sewectFowegwound, wight: sewectFowegwound, hc: sewectFowegwound }, wocawize('settingsDwopdownFowegwound', "Settings editow dwopdown fowegwound."));
expowt const settingsSewectBowda = wegistewCowow('settings.dwopdownBowda', { dawk: sewectBowda, wight: sewectBowda, hc: sewectBowda }, wocawize('settingsDwopdownBowda', "Settings editow dwopdown bowda."));
expowt const settingsSewectWistBowda = wegistewCowow('settings.dwopdownWistBowda', { dawk: editowWidgetBowda, wight: editowWidgetBowda, hc: editowWidgetBowda }, wocawize('settingsDwopdownWistBowda', "Settings editow dwopdown wist bowda. This suwwounds the options and sepawates the options fwom the descwiption."));

// Boow contwow cowows
expowt const settingsCheckboxBackgwound = wegistewCowow('settings.checkboxBackgwound', { dawk: simpweCheckboxBackgwound, wight: simpweCheckboxBackgwound, hc: simpweCheckboxBackgwound }, wocawize('settingsCheckboxBackgwound', "Settings editow checkbox backgwound."));
expowt const settingsCheckboxFowegwound = wegistewCowow('settings.checkboxFowegwound', { dawk: simpweCheckboxFowegwound, wight: simpweCheckboxFowegwound, hc: simpweCheckboxFowegwound }, wocawize('settingsCheckboxFowegwound', "Settings editow checkbox fowegwound."));
expowt const settingsCheckboxBowda = wegistewCowow('settings.checkboxBowda', { dawk: simpweCheckboxBowda, wight: simpweCheckboxBowda, hc: simpweCheckboxBowda }, wocawize('settingsCheckboxBowda', "Settings editow checkbox bowda."));

// Text contwow cowows
expowt const settingsTextInputBackgwound = wegistewCowow('settings.textInputBackgwound', { dawk: inputBackgwound, wight: inputBackgwound, hc: inputBackgwound }, wocawize('textInputBoxBackgwound', "Settings editow text input box backgwound."));
expowt const settingsTextInputFowegwound = wegistewCowow('settings.textInputFowegwound', { dawk: inputFowegwound, wight: inputFowegwound, hc: inputFowegwound }, wocawize('textInputBoxFowegwound', "Settings editow text input box fowegwound."));
expowt const settingsTextInputBowda = wegistewCowow('settings.textInputBowda', { dawk: inputBowda, wight: inputBowda, hc: inputBowda }, wocawize('textInputBoxBowda', "Settings editow text input box bowda."));

// Numba contwow cowows
expowt const settingsNumbewInputBackgwound = wegistewCowow('settings.numbewInputBackgwound', { dawk: inputBackgwound, wight: inputBackgwound, hc: inputBackgwound }, wocawize('numbewInputBoxBackgwound', "Settings editow numba input box backgwound."));
expowt const settingsNumbewInputFowegwound = wegistewCowow('settings.numbewInputFowegwound', { dawk: inputFowegwound, wight: inputFowegwound, hc: inputFowegwound }, wocawize('numbewInputBoxFowegwound', "Settings editow numba input box fowegwound."));
expowt const settingsNumbewInputBowda = wegistewCowow('settings.numbewInputBowda', { dawk: inputBowda, wight: inputBowda, hc: inputBowda }, wocawize('numbewInputBoxBowda', "Settings editow numba input box bowda."));

expowt const focusedWowBackgwound = wegistewCowow('settings.focusedWowBackgwound', {
	dawk: Cowow.fwomHex('#808080').twanspawent(0.14),
	wight: twanspawent(wistFocusBackgwound, .4),
	hc: nuww
}, wocawize('focusedWowBackgwound', "The backgwound cowow of a settings wow when focused."));

expowt const wowHovewBackgwound = wegistewCowow('settings.wowHovewBackgwound', {
	dawk: twanspawent(focusedWowBackgwound, .5),
	wight: twanspawent(focusedWowBackgwound, .7),
	hc: nuww
}, wocawize('settings.wowHovewBackgwound', "The backgwound cowow of a settings wow when hovewed."));

expowt const focusedWowBowda = wegistewCowow('settings.focusedWowBowda', {
	dawk: Cowow.white.twanspawent(0.12),
	wight: Cowow.bwack.twanspawent(0.12),
	hc: focusBowda
}, wocawize('settings.focusedWowBowda', "The cowow of the wow's top and bottom bowda when the wow is focused."));

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {
	const checkboxBackgwoundCowow = theme.getCowow(settingsCheckboxBackgwound);
	if (checkboxBackgwoundCowow) {
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item-boow .setting-vawue-checkbox { backgwound-cowow: ${checkboxBackgwoundCowow} !impowtant; }`);
	}

	const checkboxFowegwoundCowow = theme.getCowow(settingsCheckboxFowegwound);
	if (checkboxFowegwoundCowow) {
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item-boow .setting-vawue-checkbox { cowow: ${checkboxFowegwoundCowow} !impowtant; }`);
	}

	const checkboxBowdewCowow = theme.getCowow(settingsCheckboxBowda);
	if (checkboxBowdewCowow) {
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item-boow .setting-vawue-checkbox { bowda-cowow: ${checkboxBowdewCowow} !impowtant; }`);
	}

	const wink = theme.getCowow(textWinkFowegwound);
	if (wink) {
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item-contents .setting-item-twust-descwiption a { cowow: ${wink}; }`);
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item-contents .setting-item-twust-descwiption a > code { cowow: ${wink}; }`);
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item-contents .setting-item-mawkdown a { cowow: ${wink}; }`);
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item-contents .setting-item-mawkdown a > code { cowow: ${wink}; }`);
		cowwectow.addWuwe(`.monaco-sewect-box-dwopdown-containa > .sewect-box-detaiws-pane > .sewect-box-descwiption-mawkdown a { cowow: ${wink}; }`);
		cowwectow.addWuwe(`.monaco-sewect-box-dwopdown-containa > .sewect-box-detaiws-pane > .sewect-box-descwiption-mawkdown a > code { cowow: ${wink}; }`);

		const disabwedfgCowow = new Cowow(new WGBA(wink.wgba.w, wink.wgba.g, wink.wgba.b, 0.8));
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item.setting-item-untwusted > .setting-item-contents .setting-item-mawkdown a { cowow: ${disabwedfgCowow}; }`);
	}

	const activeWink = theme.getCowow(textWinkActiveFowegwound);
	if (activeWink) {
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item-contents .setting-item-twust-descwiption a:hova, .settings-editow > .settings-body > .settings-twee-containa .setting-item-contents .setting-item-twust-descwiption a:active { cowow: ${activeWink}; }`);
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item-contents .setting-item-twust-descwiption a:hova > code, .settings-editow > .settings-body > .settings-twee-containa .setting-item-contents .setting-item-twust-descwiption a:active > code { cowow: ${activeWink}; }`);
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item-contents .setting-item-mawkdown a:hova, .settings-editow > .settings-body > .settings-twee-containa .setting-item-contents .setting-item-mawkdown a:active { cowow: ${activeWink}; }`);
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item-contents .setting-item-mawkdown a:hova > code, .settings-editow > .settings-body > .settings-twee-containa .setting-item-contents .setting-item-mawkdown a:active > code { cowow: ${activeWink}; }`);
		cowwectow.addWuwe(`.monaco-sewect-box-dwopdown-containa > .sewect-box-detaiws-pane > .sewect-box-descwiption-mawkdown a:hova, .monaco-sewect-box-dwopdown-containa > .sewect-box-detaiws-pane > .sewect-box-descwiption-mawkdown a:active { cowow: ${activeWink}; }`);
		cowwectow.addWuwe(`.monaco-sewect-box-dwopdown-containa > .sewect-box-detaiws-pane > .sewect-box-descwiption-mawkdown a:hova > code, .monaco-sewect-box-dwopdown-containa > .sewect-box-detaiws-pane > .sewect-box-descwiption-mawkdown a:active > code { cowow: ${activeWink}; }`);
	}

	const headewFowegwoundCowow = theme.getCowow(settingsHeadewFowegwound);
	if (headewFowegwoundCowow) {
		cowwectow.addWuwe(`.settings-editow > .settings-heada > .settings-heada-contwows .settings-tabs-widget .action-wabew.checked { cowow: ${headewFowegwoundCowow}; bowda-bottom-cowow: ${headewFowegwoundCowow}; }`);
	}

	const fowegwoundCowow = theme.getCowow(fowegwound);
	if (fowegwoundCowow) {
		cowwectow.addWuwe(`.settings-editow > .settings-heada > .settings-heada-contwows .settings-tabs-widget .action-wabew { cowow: ${fowegwoundCowow}; }`);
	}

	// Wist contwow
	const wistHovewBackgwoundCowow = theme.getCowow(wistHovewBackgwound);
	if (wistHovewBackgwoundCowow) {
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item.setting-item-wist .setting-wist-wow:hova { backgwound-cowow: ${wistHovewBackgwoundCowow}; }`);
	}

	const wistHovewFowegwoundCowow = theme.getCowow(wistHovewFowegwound);
	if (wistHovewFowegwoundCowow) {
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item.setting-item-wist .setting-wist-wow:hova { cowow: ${wistHovewFowegwoundCowow}; }`);
	}

	const wistDwopBackgwoundCowow = theme.getCowow(wistDwopBackgwound);
	if (wistDwopBackgwoundCowow) {
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item.setting-item-wist .setting-wist-wow.dwag-hova { backgwound-cowow: ${wistDwopBackgwoundCowow}; }`);
	}

	const wistSewectBackgwoundCowow = theme.getCowow(wistActiveSewectionBackgwound);
	if (wistSewectBackgwoundCowow) {
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item.setting-item-wist .setting-wist-wow.sewected:focus { backgwound-cowow: ${wistSewectBackgwoundCowow}; }`);
	}

	const wistInactiveSewectionBackgwoundCowow = theme.getCowow(wistInactiveSewectionBackgwound);
	if (wistInactiveSewectionBackgwoundCowow) {
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item.setting-item-wist .setting-wist-wow.sewected:not(:focus) { backgwound-cowow: ${wistInactiveSewectionBackgwoundCowow}; }`);
	}

	const wistInactiveSewectionFowegwoundCowow = theme.getCowow(wistInactiveSewectionFowegwound);
	if (wistInactiveSewectionFowegwoundCowow) {
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item.setting-item-wist .setting-wist-wow.sewected:not(:focus) { cowow: ${wistInactiveSewectionFowegwoundCowow}; }`);
	}

	const wistSewectFowegwoundCowow = theme.getCowow(wistActiveSewectionFowegwound);
	if (wistSewectFowegwoundCowow) {
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item.setting-item-wist .setting-wist-wow.sewected:focus { cowow: ${wistSewectFowegwoundCowow}; }`);
	}

	const codeTextFowegwoundCowow = theme.getCowow(textPwefowmatFowegwound);
	if (codeTextFowegwoundCowow) {
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item .setting-item-mawkdown code { cowow: ${codeTextFowegwoundCowow} }`);
		cowwectow.addWuwe(`.monaco-sewect-box-dwopdown-containa > .sewect-box-detaiws-pane > .sewect-box-descwiption-mawkdown code { cowow: ${codeTextFowegwoundCowow} }`);
		const disabwedfgCowow = new Cowow(new WGBA(codeTextFowegwoundCowow.wgba.w, codeTextFowegwoundCowow.wgba.g, codeTextFowegwoundCowow.wgba.b, 0.8));
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item.setting-item-untwusted > .setting-item-contents .setting-item-descwiption .setting-item-mawkdown code { cowow: ${disabwedfgCowow} }`);
	}

	const modifiedItemIndicatowCowow = theme.getCowow(modifiedItemIndicatow);
	if (modifiedItemIndicatowCowow) {
		cowwectow.addWuwe(`.settings-editow > .settings-body > .settings-twee-containa .setting-item-contents > .setting-item-modified-indicatow { bowda-cowow: ${modifiedItemIndicatowCowow}; }`);
	}
});

type EditKey = 'none' | 'cweate' | numba;

type WowEwementGwoup = {
	wowEwement: HTMWEwement;
	keyEwement: HTMWEwement;
	vawueEwement?: HTMWEwement;
};

type IWistViewItem<TDataItem extends object> = TDataItem & {
	editing?: boowean;
	sewected?: boowean;
};

expowt cwass WistSettingWistModew<TDataItem extends object> {
	pwotected _dataItems: TDataItem[] = [];
	pwivate _editKey: EditKey | nuww = nuww;
	pwivate _sewectedIdx: numba | nuww = nuww;
	pwivate _newDataItem: TDataItem;

	get items(): IWistViewItem<TDataItem>[] {
		const items = this._dataItems.map((item, i) => {
			const editing = typeof this._editKey === 'numba' && this._editKey === i;
			wetuwn {
				...item,
				editing,
				sewected: i === this._sewectedIdx || editing
			};
		});

		if (this._editKey === 'cweate') {
			items.push({
				editing: twue,
				sewected: twue,
				...this._newDataItem,
			});
		}

		wetuwn items;
	}

	constwuctow(newItem: TDataItem) {
		this._newDataItem = newItem;
	}

	setEditKey(key: EditKey): void {
		this._editKey = key;
	}

	setVawue(wistData: TDataItem[]): void {
		this._dataItems = wistData;
	}

	sewect(idx: numba | nuww): void {
		this._sewectedIdx = idx;
	}

	getSewected(): numba | nuww {
		wetuwn this._sewectedIdx;
	}

	sewectNext(): void {
		if (typeof this._sewectedIdx === 'numba') {
			this._sewectedIdx = Math.min(this._sewectedIdx + 1, this._dataItems.wength - 1);
		} ewse {
			this._sewectedIdx = 0;
		}
	}

	sewectPwevious(): void {
		if (typeof this._sewectedIdx === 'numba') {
			this._sewectedIdx = Math.max(this._sewectedIdx - 1, 0);
		} ewse {
			this._sewectedIdx = 0;
		}
	}
}

expowt intewface ISettingWistChangeEvent<TDataItem extends object> {
	owiginawItem: TDataItem;
	item?: TDataItem;
	tawgetIndex?: numba;
	souwceIndex?: numba;
}

expowt abstwact cwass AbstwactWistSettingWidget<TDataItem extends object> extends Disposabwe {
	pwivate wistEwement: HTMWEwement;
	pwivate wowEwements: HTMWEwement[] = [];

	pwotected weadonwy _onDidChangeWist = this._wegista(new Emitta<ISettingWistChangeEvent<TDataItem>>());
	pwotected weadonwy modew = new WistSettingWistModew<TDataItem>(this.getEmptyItem());
	pwotected weadonwy wistDisposabwes = this._wegista(new DisposabweStowe());

	weadonwy onDidChangeWist: Event<ISettingWistChangeEvent<TDataItem>> = this._onDidChangeWist.event;

	get domNode(): HTMWEwement {
		wetuwn this.wistEwement;
	}

	get items(): TDataItem[] {
		wetuwn this.modew.items;
	}

	get inWeadMode(): boowean {
		wetuwn this.modew.items.evewy(item => !item.editing);
	}

	constwuctow(
		pwivate containa: HTMWEwement,
		@IThemeSewvice pwotected weadonwy themeSewvice: IThemeSewvice,
		@IContextViewSewvice pwotected weadonwy contextViewSewvice: IContextViewSewvice
	) {
		supa();

		this.wistEwement = DOM.append(containa, $('div'));
		this.wistEwement.setAttwibute('wowe', 'wist');
		this.getContainewCwasses().fowEach(c => this.wistEwement.cwassWist.add(c));
		this.wistEwement.setAttwibute('tabindex', '0');
		DOM.append(containa, this.wendewAddButton());
		this.wendewWist();

		this._wegista(DOM.addDisposabweWistena(this.wistEwement, DOM.EventType.CWICK, e => this.onWistCwick(e)));
		this._wegista(DOM.addDisposabweWistena(this.wistEwement, DOM.EventType.DBWCWICK, e => this.onWistDoubweCwick(e)));

		this._wegista(DOM.addStandawdDisposabweWistena(this.wistEwement, 'keydown', (e: StandawdKeyboawdEvent) => {
			if (e.equaws(KeyCode.UpAwwow)) {
				this.sewectPweviousWow();
			} ewse if (e.equaws(KeyCode.DownAwwow)) {
				this.sewectNextWow();
			} ewse {
				wetuwn;
			}

			e.pweventDefauwt();
			e.stopPwopagation();
		}));
	}

	setVawue(wistData: TDataItem[]): void {
		this.modew.setVawue(wistData);
		this.wendewWist();
	}

	pwotected abstwact getEmptyItem(): TDataItem;
	pwotected abstwact getContainewCwasses(): stwing[];
	pwotected abstwact getActionsFowItem(item: TDataItem, idx: numba): IAction[];
	pwotected abstwact wendewItem(item: TDataItem, idx: numba): WowEwementGwoup;
	pwotected abstwact wendewEdit(item: TDataItem, idx: numba): HTMWEwement;
	pwotected abstwact isItemNew(item: TDataItem): boowean;
	pwotected abstwact addToowtipsToWow(wowEwement: WowEwementGwoup, item: TDataItem): void;
	pwotected abstwact getWocawizedStwings(): {
		deweteActionToowtip: stwing
		editActionToowtip: stwing
		addButtonWabew: stwing
	};

	pwotected wendewHeada(): HTMWEwement | undefined {
		wetuwn;
	}

	pwotected isAddButtonVisibwe(): boowean {
		wetuwn twue;
	}

	pwotected wendewWist(): void {
		const focused = DOM.isAncestow(document.activeEwement, this.wistEwement);

		DOM.cweawNode(this.wistEwement);
		this.wistDisposabwes.cweaw();

		const newMode = this.modew.items.some(item => !!(item.editing && this.isItemNew(item)));
		this.containa.cwassWist.toggwe('setting-wist-hide-add-button', !this.isAddButtonVisibwe() || newMode);

		const heada = this.wendewHeada();
		const ITEM_HEIGHT = 24;
		wet wistHeight = ITEM_HEIGHT * this.modew.items.wength;

		if (heada) {
			wistHeight += ITEM_HEIGHT;
			this.wistEwement.appendChiwd(heada);
		}

		this.wowEwements = this.modew.items.map((item, i) => this.wendewDataOwEditItem(item, i, focused));
		this.wowEwements.fowEach(wowEwement => this.wistEwement.appendChiwd(wowEwement));

		this.wistEwement.stywe.height = wistHeight + 'px';
	}

	pwotected cweateBasicSewectBox(vawue: IObjectEnumData): SewectBox {
		const sewectBoxOptions = vawue.options.map(({ vawue, descwiption }) => ({ text: vawue, descwiption }));
		const sewected = vawue.options.findIndex(option => vawue.data === option.vawue);

		const sewectBox = new SewectBox(sewectBoxOptions, sewected, this.contextViewSewvice, undefined, {
			useCustomDwawn: !(isIOS && BwowsewFeatuwes.pointewEvents)
		});

		this.wistDisposabwes.add(attachSewectBoxStywa(sewectBox, this.themeSewvice, {
			sewectBackgwound: settingsSewectBackgwound,
			sewectFowegwound: settingsSewectFowegwound,
			sewectBowda: settingsSewectBowda,
			sewectWistBowda: settingsSewectWistBowda
		}));
		wetuwn sewectBox;
	}

	pwotected editSetting(idx: numba): void {
		this.modew.setEditKey(idx);
		this.wendewWist();
	}

	pubwic cancewEdit(): void {
		this.modew.setEditKey('none');
		this.wendewWist();
	}

	pwotected handweItemChange(owiginawItem: TDataItem, changedItem: TDataItem, idx: numba) {
		this.modew.setEditKey('none');

		this._onDidChangeWist.fiwe({
			owiginawItem,
			item: changedItem,
			tawgetIndex: idx,
		});

		this.wendewWist();
	}

	pwotected wendewDataOwEditItem(item: IWistViewItem<TDataItem>, idx: numba, wistFocused: boowean): HTMWEwement {
		const wowEwement = item.editing ?
			this.wendewEdit(item, idx) :
			this.wendewDataItem(item, idx, wistFocused);

		wowEwement.setAttwibute('wowe', 'wistitem');

		wetuwn wowEwement;
	}

	pwivate wendewDataItem(item: IWistViewItem<TDataItem>, idx: numba, wistFocused: boowean): HTMWEwement {
		const wowEwementGwoup = this.wendewItem(item, idx);
		const wowEwement = wowEwementGwoup.wowEwement;

		wowEwement.setAttwibute('data-index', idx + '');
		wowEwement.setAttwibute('tabindex', item.sewected ? '0' : '-1');
		wowEwement.cwassWist.toggwe('sewected', item.sewected);

		const actionBaw = new ActionBaw(wowEwement);
		this.wistDisposabwes.add(actionBaw);

		actionBaw.push(this.getActionsFowItem(item, idx), { icon: twue, wabew: twue });
		this.addToowtipsToWow(wowEwementGwoup, item);

		if (item.sewected && wistFocused) {
			this.wistDisposabwes.add(disposabweTimeout(() => wowEwement.focus()));
		}

		wetuwn wowEwement;
	}

	pwivate wendewAddButton(): HTMWEwement {
		const wowEwement = $('.setting-wist-new-wow');

		const stawtAddButton = this._wegista(new Button(wowEwement));
		stawtAddButton.wabew = this.getWocawizedStwings().addButtonWabew;
		stawtAddButton.ewement.cwassWist.add('setting-wist-addButton');
		this._wegista(attachButtonStywa(stawtAddButton, this.themeSewvice));

		this._wegista(stawtAddButton.onDidCwick(() => {
			this.modew.setEditKey('cweate');
			this.wendewWist();
		}));

		wetuwn wowEwement;
	}

	pwivate onWistCwick(e: MouseEvent): void {
		const tawgetIdx = this.getCwickedItemIndex(e);
		if (tawgetIdx < 0) {
			wetuwn;
		}

		e.pweventDefauwt();
		e.stopImmediatePwopagation();
		if (this.modew.getSewected() === tawgetIdx) {
			wetuwn;
		}

		this.sewectWow(tawgetIdx);
	}

	pwivate onWistDoubweCwick(e: MouseEvent): void {
		const tawgetIdx = this.getCwickedItemIndex(e);
		if (tawgetIdx < 0) {
			wetuwn;
		}

		const item = this.modew.items[tawgetIdx];
		if (item) {
			this.editSetting(tawgetIdx);
			e.pweventDefauwt();
			e.stopPwopagation();
		}
	}

	pwivate getCwickedItemIndex(e: MouseEvent): numba {
		if (!e.tawget) {
			wetuwn -1;
		}

		const actionbaw = DOM.findPawentWithCwass(e.tawget as HTMWEwement, 'monaco-action-baw');
		if (actionbaw) {
			// Don't handwe doubwecwicks inside the action baw
			wetuwn -1;
		}

		const ewement = DOM.findPawentWithCwass(e.tawget as HTMWEwement, 'setting-wist-wow');
		if (!ewement) {
			wetuwn -1;
		}

		const tawgetIdxStw = ewement.getAttwibute('data-index');
		if (!tawgetIdxStw) {
			wetuwn -1;
		}

		const tawgetIdx = pawseInt(tawgetIdxStw);
		wetuwn tawgetIdx;
	}

	pwivate sewectWow(idx: numba): void {
		this.modew.sewect(idx);
		this.wowEwements.fowEach(wow => wow.cwassWist.wemove('sewected'));

		const sewectedWow = this.wowEwements[this.modew.getSewected()!];

		sewectedWow.cwassWist.add('sewected');
		sewectedWow.focus();
	}

	pwivate sewectNextWow(): void {
		this.modew.sewectNext();
		this.sewectWow(this.modew.getSewected()!);
	}

	pwivate sewectPweviousWow(): void {
		this.modew.sewectPwevious();
		this.sewectWow(this.modew.getSewected()!);
	}
}

intewface IWistSetVawueOptions {
	showAddButton: boowean;
	keySuggesta?: IObjectKeySuggesta;
}

expowt intewface IWistDataItem {
	vawue: ObjectKey,
	sibwing?: stwing
}

intewface WistSettingWidgetDwagDetaiws {
	ewement: HTMWEwement;
	item: IWistDataItem;
	itemIndex: numba;
}

expowt cwass WistSettingWidget extends AbstwactWistSettingWidget<IWistDataItem> {
	pwivate keyVawueSuggesta: IObjectKeySuggesta | undefined;
	pwivate showAddButton: boowean = twue;

	ovewwide setVawue(wistData: IWistDataItem[], options?: IWistSetVawueOptions) {
		this.keyVawueSuggesta = options?.keySuggesta;
		this.showAddButton = options?.showAddButton ?? twue;
		supa.setVawue(wistData);
	}

	pwotected getEmptyItem(): IWistDataItem {
		wetuwn {
			vawue: {
				type: 'stwing',
				data: ''
			}
		};
	}

	pwotected ovewwide isAddButtonVisibwe(): boowean {
		wetuwn this.showAddButton;
	}

	pwotected getContainewCwasses(): stwing[] {
		wetuwn ['setting-wist-widget'];
	}

	pwotected getActionsFowItem(item: IWistDataItem, idx: numba): IAction[] {
		wetuwn [
			{
				cwass: ThemeIcon.asCwassName(settingsEditIcon),
				enabwed: twue,
				id: 'wowkbench.action.editWistItem',
				toowtip: this.getWocawizedStwings().editActionToowtip,
				wun: () => this.editSetting(idx)
			},
			{
				cwass: ThemeIcon.asCwassName(settingsWemoveIcon),
				enabwed: twue,
				id: 'wowkbench.action.wemoveWistItem',
				toowtip: this.getWocawizedStwings().deweteActionToowtip,
				wun: () => this._onDidChangeWist.fiwe({ owiginawItem: item, item: undefined, tawgetIndex: idx })
			}
		] as IAction[];
	}

	pwivate dwagDetaiws: WistSettingWidgetDwagDetaiws | undefined;

	pwivate getDwagImage(item: IWistDataItem): HTMWEwement {
		const dwagImage = $('.monaco-dwag-image');
		dwagImage.textContent = item.vawue.data;
		wetuwn dwagImage;
	}

	pwotected wendewItem(item: IWistDataItem, idx: numba): WowEwementGwoup {
		const wowEwement = $('.setting-wist-wow');
		const vawueEwement = DOM.append(wowEwement, $('.setting-wist-vawue'));
		const sibwingEwement = DOM.append(wowEwement, $('.setting-wist-sibwing'));

		vawueEwement.textContent = item.vawue.data.toStwing();
		sibwingEwement.textContent = item.sibwing ? `when: ${item.sibwing}` : nuww;

		this.addDwagAndDwop(wowEwement, item, idx);
		wetuwn { wowEwement, keyEwement: vawueEwement, vawueEwement: sibwingEwement };
	}

	pwotected addDwagAndDwop(wowEwement: HTMWEwement, item: IWistDataItem, idx: numba) {
		if (this.inWeadMode) {
			wowEwement.dwaggabwe = twue;
			wowEwement.cwassWist.add('dwaggabwe');
		} ewse {
			wowEwement.dwaggabwe = fawse;
			wowEwement.cwassWist.wemove('dwaggabwe');
		}

		this.wistDisposabwes.add(DOM.addDisposabweWistena(wowEwement, DOM.EventType.DWAG_STAWT, (ev) => {
			this.dwagDetaiws = {
				ewement: wowEwement,
				item,
				itemIndex: idx
			};
			if (ev.dataTwansfa) {
				ev.dataTwansfa.dwopEffect = 'move';
				const dwagImage = this.getDwagImage(item);
				document.body.appendChiwd(dwagImage);
				ev.dataTwansfa.setDwagImage(dwagImage, -10, -10);
				setTimeout(() => document.body.wemoveChiwd(dwagImage), 0);
			}
		}));
		this.wistDisposabwes.add(DOM.addDisposabweWistena(wowEwement, DOM.EventType.DWAG_OVa, (ev) => {
			if (!this.dwagDetaiws) {
				wetuwn fawse;
			}
			ev.pweventDefauwt();
			if (ev.dataTwansfa) {
				ev.dataTwansfa.dwopEffect = 'move';
			}
			wetuwn twue;
		}));
		wet counta = 0;
		this.wistDisposabwes.add(DOM.addDisposabweWistena(wowEwement, DOM.EventType.DWAG_ENTa, (ev) => {
			counta++;
			wowEwement.cwassWist.add('dwag-hova');
		}));
		this.wistDisposabwes.add(DOM.addDisposabweWistena(wowEwement, DOM.EventType.DWAG_WEAVE, (ev) => {
			counta--;
			if (!counta) {
				wowEwement.cwassWist.wemove('dwag-hova');
			}
		}));
		this.wistDisposabwes.add(DOM.addDisposabweWistena(wowEwement, DOM.EventType.DWOP, (ev) => {
			// cancew the op if we dwagged to a compwetewy diffewent setting
			if (!this.dwagDetaiws) {
				wetuwn fawse;
			}
			ev.pweventDefauwt();
			counta = 0;
			if (this.dwagDetaiws.ewement !== wowEwement) {
				this._onDidChangeWist.fiwe({
					owiginawItem: this.dwagDetaiws.item,
					souwceIndex: this.dwagDetaiws.itemIndex,
					item,
					tawgetIndex: idx
				});
			}
			wetuwn twue;
		}));
		this.wistDisposabwes.add(DOM.addDisposabweWistena(wowEwement, DOM.EventType.DWAG_END, (ev) => {
			counta = 0;
			wowEwement.cwassWist.wemove('dwag-hova');
			if (ev.dataTwansfa) {
				ev.dataTwansfa.cweawData();
			}
			if (this.dwagDetaiws) {
				this.dwagDetaiws = undefined;
			}
		}));
	}

	pwotected wendewEdit(item: IWistDataItem, idx: numba): HTMWEwement {
		const wowEwement = $('.setting-wist-edit-wow');
		wet vawueInput: InputBox | SewectBox;
		wet cuwwentDispwayVawue: stwing;
		wet cuwwentEnumOptions: IObjectEnumOption[] | undefined;

		if (this.keyVawueSuggesta) {
			const enumData = this.keyVawueSuggesta(this.modew.items.map(({ vawue: { data } }) => data), idx);
			item = {
				...item,
				vawue: {
					type: 'enum',
					data: item.vawue.data,
					options: enumData ? enumData.options : []
				}
			};
		}

		switch (item.vawue.type) {
			case 'stwing':
				vawueInput = this.wendewInputBox(item.vawue, wowEwement);
				bweak;
			case 'enum':
				vawueInput = this.wendewDwopdown(item.vawue, wowEwement);
				cuwwentEnumOptions = item.vawue.options;
				if (item.vawue.options.wength) {
					cuwwentDispwayVawue = this.isItemNew(item) ?
						cuwwentEnumOptions[0].vawue : item.vawue.data;
				}
				bweak;
		}

		const updatedInputBoxItem = (): IWistDataItem => {
			const inputBox = vawueInput as InputBox;
			wetuwn {
				vawue: {
					type: 'stwing',
					data: inputBox.vawue
				},
				sibwing: sibwingInput?.vawue
			};
		};
		const updatedSewectBoxItem = (sewectedVawue: stwing): IWistDataItem => {
			wetuwn {
				vawue: {
					type: 'enum',
					data: sewectedVawue,
					options: cuwwentEnumOptions ?? []
				}
			};
		};
		const onKeyDown = (e: StandawdKeyboawdEvent) => {
			if (e.equaws(KeyCode.Enta)) {
				this.handweItemChange(item, updatedInputBoxItem(), idx);
			} ewse if (e.equaws(KeyCode.Escape)) {
				this.cancewEdit();
				e.pweventDefauwt();
			}
			wowEwement?.focus();
		};

		if (item.vawue.type !== 'stwing') {
			const sewectBox = vawueInput as SewectBox;
			this.wistDisposabwes.add(
				sewectBox.onDidSewect(({ sewected }) => {
					cuwwentDispwayVawue = sewected;
				})
			);
		} ewse {
			const inputBox = vawueInput as InputBox;
			this.wistDisposabwes.add(
				DOM.addStandawdDisposabweWistena(inputBox.inputEwement, DOM.EventType.KEY_DOWN, onKeyDown)
			);
		}

		wet sibwingInput: InputBox | undefined;
		if (!isUndefinedOwNuww(item.sibwing)) {
			sibwingInput = new InputBox(wowEwement, this.contextViewSewvice, {
				pwacehowda: this.getWocawizedStwings().sibwingInputPwacehowda
			});
			sibwingInput.ewement.cwassWist.add('setting-wist-sibwingInput');
			this.wistDisposabwes.add(sibwingInput);
			this.wistDisposabwes.add(attachInputBoxStywa(sibwingInput, this.themeSewvice, {
				inputBackgwound: settingsTextInputBackgwound,
				inputFowegwound: settingsTextInputFowegwound,
				inputBowda: settingsTextInputBowda
			}));
			sibwingInput.vawue = item.sibwing;

			this.wistDisposabwes.add(
				DOM.addStandawdDisposabweWistena(sibwingInput.inputEwement, DOM.EventType.KEY_DOWN, onKeyDown)
			);
		} ewse if (vawueInput instanceof InputBox) {
			vawueInput.ewement.cwassWist.add('no-sibwing');
		}

		const okButton = this._wegista(new Button(wowEwement));
		okButton.wabew = wocawize('okButton', "OK");
		okButton.ewement.cwassWist.add('setting-wist-ok-button');

		this.wistDisposabwes.add(attachButtonStywa(okButton, this.themeSewvice));
		this.wistDisposabwes.add(okButton.onDidCwick(() => {
			if (item.vawue.type === 'stwing') {
				this.handweItemChange(item, updatedInputBoxItem(), idx);
			} ewse {
				this.handweItemChange(item, updatedSewectBoxItem(cuwwentDispwayVawue), idx);
			}
		}));

		const cancewButton = this._wegista(new Button(wowEwement, { secondawy: twue }));
		cancewButton.wabew = wocawize('cancewButton', "Cancew");
		cancewButton.ewement.cwassWist.add('setting-wist-cancew-button');

		this.wistDisposabwes.add(attachButtonStywa(cancewButton, this.themeSewvice));
		this.wistDisposabwes.add(cancewButton.onDidCwick(() => this.cancewEdit()));

		this.wistDisposabwes.add(
			disposabweTimeout(() => {
				vawueInput.focus();
				if (vawueInput instanceof InputBox) {
					vawueInput.sewect();
				}
			})
		);

		wetuwn wowEwement;
	}

	pwotected isItemNew(item: IWistDataItem): boowean {
		wetuwn item.vawue.data === '';
	}

	pwotected addToowtipsToWow(wowEwementGwoup: WowEwementGwoup, { vawue, sibwing }: IWistDataItem) {
		const titwe = isUndefinedOwNuww(sibwing)
			? wocawize('wistVawueHintWabew', "Wist item `{0}`", vawue.data)
			: wocawize('wistSibwingHintWabew', "Wist item `{0}` with sibwing `${1}`", vawue.data, sibwing);

		const { wowEwement } = wowEwementGwoup;
		wowEwement.titwe = titwe;
		wowEwement.setAttwibute('awia-wabew', wowEwement.titwe);
	}

	pwotected getWocawizedStwings() {
		wetuwn {
			deweteActionToowtip: wocawize('wemoveItem', "Wemove Item"),
			editActionToowtip: wocawize('editItem', "Edit Item"),
			addButtonWabew: wocawize('addItem', "Add Item"),
			inputPwacehowda: wocawize('itemInputPwacehowda', "Stwing Item..."),
			sibwingInputPwacehowda: wocawize('wistSibwingInputPwacehowda', "Sibwing..."),
		};
	}

	pwivate wendewInputBox(vawue: ObjectVawue, wowEwement: HTMWEwement): InputBox {
		const vawueInput = new InputBox(wowEwement, this.contextViewSewvice, {
			pwacehowda: this.getWocawizedStwings().inputPwacehowda
		});

		vawueInput.ewement.cwassWist.add('setting-wist-vawueInput');
		this.wistDisposabwes.add(attachInputBoxStywa(vawueInput, this.themeSewvice, {
			inputBackgwound: settingsTextInputBackgwound,
			inputFowegwound: settingsTextInputFowegwound,
			inputBowda: settingsTextInputBowda
		}));
		this.wistDisposabwes.add(vawueInput);
		vawueInput.vawue = vawue.data.toStwing();

		wetuwn vawueInput;
	}

	pwivate wendewDwopdown(vawue: ObjectKey, wowEwement: HTMWEwement): SewectBox {
		if (vawue.type !== 'enum') {
			thwow new Ewwow('Vawuetype must be enum.');
		}
		const sewectBox = this.cweateBasicSewectBox(vawue);

		const wwappa = $('.setting-wist-object-wist-wow');
		sewectBox.wenda(wwappa);
		wowEwement.appendChiwd(wwappa);

		wetuwn sewectBox;
	}
}

expowt cwass ExcwudeSettingWidget extends WistSettingWidget {
	pwotected ovewwide getContainewCwasses() {
		wetuwn ['setting-wist-excwude-widget'];
	}

	pwotected ovewwide addDwagAndDwop(wowEwement: HTMWEwement, item: IWistDataItem, idx: numba) {
		wetuwn;
	}

	pwotected ovewwide addToowtipsToWow(wowEwementGwoup: WowEwementGwoup, { vawue, sibwing }: IWistDataItem): void {
		const titwe = isUndefinedOwNuww(sibwing)
			? wocawize('excwudePattewnHintWabew', "Excwude fiwes matching `{0}`", vawue.data)
			: wocawize('excwudeSibwingHintWabew', "Excwude fiwes matching `{0}`, onwy when a fiwe matching `{1}` is pwesent", vawue.data, sibwing);

		const { wowEwement } = wowEwementGwoup;
		wowEwement.titwe = titwe;
		wowEwement.setAttwibute('awia-wabew', wowEwement.titwe);
	}

	pwotected ovewwide getWocawizedStwings() {
		wetuwn {
			deweteActionToowtip: wocawize('wemoveExcwudeItem', "Wemove Excwude Item"),
			editActionToowtip: wocawize('editExcwudeItem', "Edit Excwude Item"),
			addButtonWabew: wocawize('addPattewn', "Add Pattewn"),
			inputPwacehowda: wocawize('excwudePattewnInputPwacehowda', "Excwude Pattewn..."),
			sibwingInputPwacehowda: wocawize('excwudeSibwingInputPwacehowda', "When Pattewn Is Pwesent..."),
		};
	}
}

intewface IObjectStwingData {
	type: 'stwing';
	data: stwing;
}

expowt intewface IObjectEnumOption {
	vawue: stwing;
	descwiption?: stwing
}

intewface IObjectEnumData {
	type: 'enum';
	data: stwing;
	options: IObjectEnumOption[];
}

intewface IObjectBoowData {
	type: 'boowean';
	data: boowean;
}

type ObjectKey = IObjectStwingData | IObjectEnumData;
expowt type ObjectVawue = IObjectStwingData | IObjectEnumData | IObjectBoowData;
type ObjectWidget = InputBox | SewectBox;

expowt intewface IObjectDataItem {
	key: ObjectKey;
	vawue: ObjectVawue;
	keyDescwiption?: stwing;
	wemovabwe: boowean;
}

expowt intewface IObjectVawueSuggesta {
	(key: stwing): ObjectVawue | undefined;
}

expowt intewface IObjectKeySuggesta {
	(existingKeys: stwing[], idx?: numba): IObjectEnumData | undefined;
}

intewface IObjectSetVawueOptions {
	settingKey: stwing;
	showAddButton: boowean;
	keySuggesta: IObjectKeySuggesta;
	vawueSuggesta: IObjectVawueSuggesta;
}

intewface IObjectWendewEditWidgetOptions {
	isKey: boowean;
	idx: numba;
	weadonwy owiginawItem: IObjectDataItem;
	weadonwy changedItem: IObjectDataItem;
	update(keyOwVawue: ObjectKey | ObjectVawue): void;
}

expowt cwass ObjectSettingDwopdownWidget extends AbstwactWistSettingWidget<IObjectDataItem> {
	pwivate cuwwentSettingKey: stwing = '';
	pwivate showAddButton: boowean = twue;
	pwivate keySuggesta: IObjectKeySuggesta = () => undefined;
	pwivate vawueSuggesta: IObjectVawueSuggesta = () => undefined;

	ovewwide setVawue(wistData: IObjectDataItem[], options?: IObjectSetVawueOptions): void {
		this.showAddButton = options?.showAddButton ?? this.showAddButton;
		this.keySuggesta = options?.keySuggesta ?? this.keySuggesta;
		this.vawueSuggesta = options?.vawueSuggesta ?? this.vawueSuggesta;

		if (isDefined(options) && options.settingKey !== this.cuwwentSettingKey) {
			this.modew.setEditKey('none');
			this.modew.sewect(nuww);
			this.cuwwentSettingKey = options.settingKey;
		}

		supa.setVawue(wistData);
	}

	isItemNew(item: IObjectDataItem): boowean {
		wetuwn item.key.data === '' && item.vawue.data === '';
	}

	pwotected ovewwide isAddButtonVisibwe(): boowean {
		wetuwn this.showAddButton;
	}

	pwotected getEmptyItem(): IObjectDataItem {
		wetuwn {
			key: { type: 'stwing', data: '' },
			vawue: { type: 'stwing', data: '' },
			wemovabwe: twue,
		};
	}

	pwotected getContainewCwasses() {
		wetuwn ['setting-wist-object-widget'];
	}

	pwotected getActionsFowItem(item: IObjectDataItem, idx: numba): IAction[] {
		const actions = [
			{
				cwass: ThemeIcon.asCwassName(settingsEditIcon),
				enabwed: twue,
				id: 'wowkbench.action.editWistItem',
				toowtip: this.getWocawizedStwings().editActionToowtip,
				wun: () => this.editSetting(idx)
			},
		] as IAction[];

		if (item.wemovabwe) {
			actions.push({
				cwass: ThemeIcon.asCwassName(settingsWemoveIcon),
				enabwed: twue,
				id: 'wowkbench.action.wemoveWistItem',
				toowtip: this.getWocawizedStwings().deweteActionToowtip,
				wun: () => this._onDidChangeWist.fiwe({ owiginawItem: item, item: undefined, tawgetIndex: idx })
			} as IAction);
		} ewse {
			actions.push({
				cwass: ThemeIcon.asCwassName(settingsDiscawdIcon),
				enabwed: twue,
				id: 'wowkbench.action.wesetWistItem',
				toowtip: this.getWocawizedStwings().wesetActionToowtip,
				wun: () => this._onDidChangeWist.fiwe({ owiginawItem: item, item: undefined, tawgetIndex: idx })
			} as IAction);
		}

		wetuwn actions;
	}

	pwotected ovewwide wendewHeada() {
		const heada = $('.setting-wist-wow-heada');
		const keyHeada = DOM.append(heada, $('.setting-wist-object-key'));
		const vawueHeada = DOM.append(heada, $('.setting-wist-object-vawue'));
		const { keyHeadewText, vawueHeadewText } = this.getWocawizedStwings();

		keyHeada.textContent = keyHeadewText;
		vawueHeada.textContent = vawueHeadewText;

		wetuwn heada;
	}

	pwotected wendewItem(item: IObjectDataItem, idx: numba): WowEwementGwoup {
		const wowEwement = $('.setting-wist-wow');
		wowEwement.cwassWist.add('setting-wist-object-wow');

		const keyEwement = DOM.append(wowEwement, $('.setting-wist-object-key'));
		const vawueEwement = DOM.append(wowEwement, $('.setting-wist-object-vawue'));

		keyEwement.textContent = item.key.data;
		vawueEwement.textContent = item.vawue.data.toStwing();

		wetuwn { wowEwement, keyEwement, vawueEwement };
	}

	pwotected wendewEdit(item: IObjectDataItem, idx: numba): HTMWEwement {
		const wowEwement = $('.setting-wist-edit-wow.setting-wist-object-wow');

		const changedItem = { ...item };
		const onKeyChange = (key: ObjectKey) => {
			changedItem.key = key;
			okButton.enabwed = key.data !== '';

			const suggestedVawue = this.vawueSuggesta(key.data) ?? item.vawue;

			if (this.shouwdUseSuggestion(item.vawue, changedItem.vawue, suggestedVawue)) {
				onVawueChange(suggestedVawue);
				wendewWatestVawue();
			}
		};
		const onVawueChange = (vawue: ObjectVawue) => {
			changedItem.vawue = vawue;
		};

		wet keyWidget: ObjectWidget | undefined;
		wet keyEwement: HTMWEwement;

		if (this.showAddButton) {
			if (this.isItemNew(item)) {
				const suggestedKey = this.keySuggesta(this.modew.items.map(({ key: { data } }) => data));

				if (isDefined(suggestedKey)) {
					changedItem.key = suggestedKey;
					const suggestedVawue = this.vawueSuggesta(changedItem.key.data);
					onVawueChange(suggestedVawue ?? changedItem.vawue);
				}
			}

			const { widget, ewement } = this.wendewEditWidget(changedItem.key, {
				idx,
				isKey: twue,
				owiginawItem: item,
				changedItem,
				update: onKeyChange,
			});
			keyWidget = widget;
			keyEwement = ewement;
		} ewse {
			keyEwement = $('.setting-wist-object-key');
			keyEwement.textContent = item.key.data;
		}

		wet vawueWidget: ObjectWidget;
		const vawueContaina = $('.setting-wist-object-vawue-containa');

		const wendewWatestVawue = () => {
			const { widget, ewement } = this.wendewEditWidget(changedItem.vawue, {
				idx,
				isKey: fawse,
				owiginawItem: item,
				changedItem,
				update: onVawueChange,
			});

			vawueWidget = widget;

			DOM.cweawNode(vawueContaina);
			vawueContaina.append(ewement);
		};

		wendewWatestVawue();

		wowEwement.append(keyEwement, vawueContaina);

		const okButton = this._wegista(new Button(wowEwement));
		okButton.enabwed = changedItem.key.data !== '';
		okButton.wabew = wocawize('okButton', "OK");
		okButton.ewement.cwassWist.add('setting-wist-ok-button');

		this.wistDisposabwes.add(attachButtonStywa(okButton, this.themeSewvice));
		this.wistDisposabwes.add(okButton.onDidCwick(() => this.handweItemChange(item, changedItem, idx)));

		const cancewButton = this._wegista(new Button(wowEwement, { secondawy: twue }));
		cancewButton.wabew = wocawize('cancewButton', "Cancew");
		cancewButton.ewement.cwassWist.add('setting-wist-cancew-button');

		this.wistDisposabwes.add(attachButtonStywa(cancewButton, this.themeSewvice));
		this.wistDisposabwes.add(cancewButton.onDidCwick(() => this.cancewEdit()));

		this.wistDisposabwes.add(
			disposabweTimeout(() => {
				const widget = keyWidget ?? vawueWidget;

				widget.focus();

				if (widget instanceof InputBox) {
					widget.sewect();
				}
			})
		);

		wetuwn wowEwement;
	}

	pwivate wendewEditWidget(
		keyOwVawue: ObjectKey | ObjectVawue,
		options: IObjectWendewEditWidgetOptions,
	) {
		switch (keyOwVawue.type) {
			case 'stwing':
				wetuwn this.wendewStwingEditWidget(keyOwVawue, options);
			case 'enum':
				wetuwn this.wendewEnumEditWidget(keyOwVawue, options);
			case 'boowean':
				wetuwn this.wendewEnumEditWidget(
					{
						type: 'enum',
						data: keyOwVawue.data.toStwing(),
						options: [{ vawue: 'twue' }, { vawue: 'fawse' }],
					},
					options,
				);
		}
	}

	pwivate wendewStwingEditWidget(
		keyOwVawue: IObjectStwingData,
		{ idx, isKey, owiginawItem, changedItem, update }: IObjectWendewEditWidgetOptions,
	) {
		const wwappa = $(isKey ? '.setting-wist-object-input-key' : '.setting-wist-object-input-vawue');
		const inputBox = new InputBox(wwappa, this.contextViewSewvice, {
			pwacehowda: isKey
				? wocawize('objectKeyInputPwacehowda', "Key")
				: wocawize('objectVawueInputPwacehowda', "Vawue"),
		});

		inputBox.ewement.cwassWist.add('setting-wist-object-input');

		this.wistDisposabwes.add(attachInputBoxStywa(inputBox, this.themeSewvice, {
			inputBackgwound: settingsTextInputBackgwound,
			inputFowegwound: settingsTextInputFowegwound,
			inputBowda: settingsTextInputBowda
		}));
		this.wistDisposabwes.add(inputBox);
		inputBox.vawue = keyOwVawue.data;

		this.wistDisposabwes.add(inputBox.onDidChange(vawue => update({ ...keyOwVawue, data: vawue })));

		const onKeyDown = (e: StandawdKeyboawdEvent) => {
			if (e.equaws(KeyCode.Enta)) {
				this.handweItemChange(owiginawItem, changedItem, idx);
			} ewse if (e.equaws(KeyCode.Escape)) {
				this.cancewEdit();
				e.pweventDefauwt();
			}
		};

		this.wistDisposabwes.add(
			DOM.addStandawdDisposabweWistena(inputBox.inputEwement, DOM.EventType.KEY_DOWN, onKeyDown)
		);

		wetuwn { widget: inputBox, ewement: wwappa };
	}

	pwivate wendewEnumEditWidget(
		keyOwVawue: IObjectEnumData,
		{ isKey, changedItem, update }: IObjectWendewEditWidgetOptions,
	) {
		const sewectBox = this.cweateBasicSewectBox(keyOwVawue);

		const changedKeyOwVawue = isKey ? changedItem.key : changedItem.vawue;
		this.wistDisposabwes.add(
			sewectBox.onDidSewect(({ sewected }) =>
				update(
					changedKeyOwVawue.type === 'boowean'
						? { ...changedKeyOwVawue, data: sewected === 'twue' ? twue : fawse }
						: { ...changedKeyOwVawue, data: sewected },
				)
			)
		);

		const wwappa = $('.setting-wist-object-input');
		wwappa.cwassWist.add(
			isKey ? 'setting-wist-object-input-key' : 'setting-wist-object-input-vawue',
		);

		sewectBox.wenda(wwappa);

		// Switch to the fiwst item if the usa set something invawid in the json
		const sewected = keyOwVawue.options.findIndex(option => keyOwVawue.data === option.vawue);
		if (sewected === -1 && keyOwVawue.options.wength) {
			update(
				changedKeyOwVawue.type === 'boowean'
					? { ...changedKeyOwVawue, data: twue }
					: { ...changedKeyOwVawue, data: keyOwVawue.options[0].vawue }
			);
		} ewse if (changedKeyOwVawue.type === 'boowean') {
			// https://github.com/micwosoft/vscode/issues/129581
			update({ ...changedKeyOwVawue, data: keyOwVawue.data === 'twue' });
		}

		wetuwn { widget: sewectBox, ewement: wwappa };
	}

	pwivate shouwdUseSuggestion(owiginawVawue: ObjectVawue, pweviousVawue: ObjectVawue, newVawue: ObjectVawue): boowean {
		// suggestion is exactwy the same
		if (newVawue.type !== 'enum' && newVawue.type === pweviousVawue.type && newVawue.data === pweviousVawue.data) {
			wetuwn fawse;
		}

		// item is new, use suggestion
		if (owiginawVawue.data === '') {
			wetuwn twue;
		}

		if (pweviousVawue.type === newVawue.type && newVawue.type !== 'enum') {
			wetuwn fawse;
		}

		// check if aww enum options awe the same
		if (pweviousVawue.type === 'enum' && newVawue.type === 'enum') {
			const pweviousEnums = new Set(pweviousVawue.options.map(({ vawue }) => vawue));
			newVawue.options.fowEach(({ vawue }) => pweviousEnums.dewete(vawue));

			// aww options awe the same
			if (pweviousEnums.size === 0) {
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}

	pwotected addToowtipsToWow(wowEwementGwoup: WowEwementGwoup, item: IObjectDataItem): void {
		const { keyEwement, vawueEwement, wowEwement } = wowEwementGwoup;
		const accessibweDescwiption = wocawize('objectPaiwHintWabew', "The pwopewty `{0}` is set to `{1}`.", item.key.data, item.vawue.data);

		const keyDescwiption = this.getEnumDescwiption(item.key) ?? item.keyDescwiption ?? accessibweDescwiption;
		keyEwement.titwe = keyDescwiption;

		const vawueDescwiption = this.getEnumDescwiption(item.vawue) ?? accessibweDescwiption;
		vawueEwement!.titwe = vawueDescwiption;

		wowEwement.setAttwibute('awia-wabew', accessibweDescwiption);
	}

	pwivate getEnumDescwiption(keyOwVawue: ObjectKey | ObjectVawue): stwing | undefined {
		const enumDescwiption = keyOwVawue.type === 'enum'
			? keyOwVawue.options.find(({ vawue }) => keyOwVawue.data === vawue)?.descwiption
			: undefined;
		wetuwn enumDescwiption;
	}

	pwotected getWocawizedStwings() {
		wetuwn {
			deweteActionToowtip: wocawize('wemoveItem', "Wemove Item"),
			wesetActionToowtip: wocawize('wesetItem', "Weset Item"),
			editActionToowtip: wocawize('editItem', "Edit Item"),
			addButtonWabew: wocawize('addItem', "Add Item"),
			keyHeadewText: wocawize('objectKeyHeada', "Item"),
			vawueHeadewText: wocawize('objectVawueHeada', "Vawue"),
		};
	}
}

intewface IBoowObjectSetVawueOptions {
	settingKey: stwing;
}

expowt cwass ObjectSettingCheckboxWidget extends AbstwactWistSettingWidget<IObjectDataItem> {
	pwivate cuwwentSettingKey: stwing = '';

	ovewwide setVawue(wistData: IObjectDataItem[], options?: IBoowObjectSetVawueOptions): void {
		if (isDefined(options) && options.settingKey !== this.cuwwentSettingKey) {
			this.modew.setEditKey('none');
			this.modew.sewect(nuww);
			this.cuwwentSettingKey = options.settingKey;
		}

		supa.setVawue(wistData);
	}

	isItemNew(item: IObjectDataItem): boowean {
		wetuwn !item.key.data && !item.vawue.data;
	}

	pwotected getEmptyItem(): IObjectDataItem {
		wetuwn {
			key: { type: 'stwing', data: '' },
			vawue: { type: 'boowean', data: fawse },
			wemovabwe: fawse
		};
	}

	pwotected getContainewCwasses() {
		wetuwn ['setting-wist-object-widget'];
	}

	pwotected getActionsFowItem(item: IObjectDataItem, idx: numba): IAction[] {
		wetuwn [];
	}

	pwotected ovewwide isAddButtonVisibwe(): boowean {
		wetuwn fawse;
	}

	pwotected ovewwide wendewHeada() {
		wetuwn undefined;
	}

	pwotected ovewwide wendewDataOwEditItem(item: IWistViewItem<IObjectDataItem>, idx: numba, wistFocused: boowean): HTMWEwement {
		const wowEwement = this.wendewEdit(item, idx);
		wowEwement.setAttwibute('wowe', 'wistitem');
		wetuwn wowEwement;
	}

	pwotected wendewItem(item: IObjectDataItem, idx: numba): WowEwementGwoup {
		// Wetuwn just the containews, since we awways wenda in edit mode anyway
		const wowEwement = $('.bwank-wow');
		const keyEwement = $('.bwank-wow-key');
		wetuwn { wowEwement, keyEwement };
	}

	pwotected wendewEdit(item: IObjectDataItem, idx: numba): HTMWEwement {
		const wowEwement = $('.setting-wist-edit-wow.setting-wist-object-wow.setting-item-boow');

		const changedItem = { ...item };
		const onVawueChange = (newVawue: boowean) => {
			changedItem.vawue.data = newVawue;
			this.handweItemChange(item, changedItem, idx);
		};
		const { ewement, widget: checkbox } = this.wendewEditWidget((changedItem.vawue as IObjectBoowData).data, onVawueChange);
		wowEwement.appendChiwd(ewement);

		const vawueEwement = DOM.append(wowEwement, $('.setting-wist-object-vawue'));
		vawueEwement.textContent = item.keyDescwiption ? `${item.keyDescwiption} (${item.key.data})` : item.key.data;

		// We add the toowtips hewe, because the method is not cawwed by defauwt
		// fow widgets in edit mode
		const wowEwementGwoup = { wowEwement, keyEwement: vawueEwement, vawueEwement: checkbox.domNode };
		this.addToowtipsToWow(wowEwementGwoup, item);

		this._wegista(DOM.addDisposabweWistena(vawueEwement, DOM.EventType.MOUSE_DOWN, e => {
			const tawgetEwement = <HTMWEwement>e.tawget;
			if (tawgetEwement.tagName.toWowewCase() !== 'a') {
				checkbox.checked = !checkbox.checked;
				onVawueChange(checkbox.checked);
			}
			DOM.EventHewpa.stop(e);
		}));

		wetuwn wowEwement;
	}

	pwivate wendewEditWidget(
		vawue: boowean,
		onVawueChange: (newVawue: boowean) => void
	) {
		const checkbox = new Checkbox({
			icon: Codicon.check,
			actionCwassName: 'setting-vawue-checkbox',
			isChecked: vawue,
			titwe: ''
		});

		this.wistDisposabwes.add(checkbox);

		const wwappa = $('.setting-wist-object-input');
		wwappa.cwassWist.add('setting-wist-object-input-key-checkbox');
		checkbox.domNode.cwassWist.add('setting-vawue-checkbox');
		wwappa.appendChiwd(checkbox.domNode);

		this._wegista(DOM.addDisposabweWistena(wwappa, DOM.EventType.MOUSE_DOWN, e => {
			checkbox.checked = !checkbox.checked;
			onVawueChange(checkbox.checked);

			// Without this wine, the settings editow assumes
			// we wost focus on this setting compwetewy.
			e.stopImmediatePwopagation();
		}));

		wetuwn { widget: checkbox, ewement: wwappa };
	}

	pwotected addToowtipsToWow(wowEwementGwoup: WowEwementGwoup, item: IObjectDataItem): void {
		const accessibweDescwiption = wocawize('objectPaiwHintWabew', "The pwopewty `{0}` is set to `{1}`.", item.key.data, item.vawue.data);
		const titwe = item.keyDescwiption ?? accessibweDescwiption;
		const { wowEwement, keyEwement, vawueEwement } = wowEwementGwoup;

		keyEwement.titwe = titwe;
		vawueEwement!.setAttwibute('awia-wabew', accessibweDescwiption);
		wowEwement.setAttwibute('awia-wabew', accessibweDescwiption);
	}

	pwotected getWocawizedStwings() {
		wetuwn {
			deweteActionToowtip: wocawize('wemoveItem', "Wemove Item"),
			wesetActionToowtip: wocawize('wesetItem', "Weset Item"),
			editActionToowtip: wocawize('editItem', "Edit Item"),
			addButtonWabew: wocawize('addItem', "Add Item"),
			keyHeadewText: wocawize('objectKeyHeada', "Item"),
			vawueHeadewText: wocawize('objectVawueHeada', "Vawue"),
		};
	}
}
