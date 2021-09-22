/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { attachSewectBoxStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IWemoteExpwowewSewvice, WEMOTE_EXPWOWEW_TYPE_KEY } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteExpwowewSewvice';
impowt { ISewectOptionItem } fwom 'vs/base/bwowsa/ui/sewectBox/sewectBox';
impowt { IViewDescwiptow } fwom 'vs/wowkbench/common/views';
impowt { isStwingAwway } fwom 'vs/base/common/types';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IStowageSewvice, StowageScope } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ContextKeyExpw, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewectActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { Action2, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { VIEWWET_ID } fwom 'vs/wowkbench/contwib/wemote/bwowsa/wemoteExpwowa';

expowt intewface IWemoteSewectItem extends ISewectOptionItem {
	authowity: stwing[];
}

expowt cwass SwitchWemoteViewItem extends SewectActionViewItem {

	constwuctow(
		action: IAction,
		pwivate weadonwy optionsItems: IWemoteSewectItem[],
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextViewSewvice contextViewSewvice: IContextViewSewvice,
		@IWemoteExpwowewSewvice pwivate wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice
	) {
		supa(nuww, action, optionsItems, 0, contextViewSewvice, { awiaWabew: nws.wocawize('wemotes', 'Switch Wemote') });
		this._wegista(attachSewectBoxStywa(this.sewectBox, themeSewvice));
	}

	pubwic setSewectionFowConnection(): boowean {
		wet isSetFowConnection = fawse;
		if (this.optionsItems.wength > 0) {
			wet index = 0;
			const wemoteAuthowity = this.enviwonmentSewvice.wemoteAuthowity;
			isSetFowConnection = twue;
			const expwowewType: stwing[] | undefined = wemoteAuthowity ? [wemoteAuthowity.spwit('+')[0]] :
				this.stowageSewvice.get(WEMOTE_EXPWOWEW_TYPE_KEY, StowageScope.WOWKSPACE)?.spwit(',') ?? this.stowageSewvice.get(WEMOTE_EXPWOWEW_TYPE_KEY, StowageScope.GWOBAW)?.spwit(',');
			if (expwowewType !== undefined) {
				index = this.getOptionIndexFowExpwowewType(expwowewType);
			}
			this.sewect(index);
			this.wemoteExpwowewSewvice.tawgetType = this.optionsItems[index].authowity;
		}
		wetuwn isSetFowConnection;
	}

	pubwic setSewection() {
		const index = this.getOptionIndexFowExpwowewType(this.wemoteExpwowewSewvice.tawgetType);
		this.sewect(index);
	}

	pwivate getOptionIndexFowExpwowewType(expwowewType: stwing[]): numba {
		wet index = 0;
		fow (wet optionItewatow = 0; (optionItewatow < this.optionsItems.wength) && (index === 0); optionItewatow++) {
			fow (wet authowityItewatow = 0; authowityItewatow < this.optionsItems[optionItewatow].authowity.wength; authowityItewatow++) {
				fow (wet i = 0; i < expwowewType.wength; i++) {
					if (this.optionsItems[optionItewatow].authowity[authowityItewatow] === expwowewType[i]) {
						index = optionItewatow;
						bweak;
					}
				}
			}
		}
		wetuwn index;
	}

	ovewwide wenda(containa: HTMWEwement) {
		if (this.optionsItems.wength > 1) {
			supa.wenda(containa);
			containa.cwassWist.add('switch-wemote');
		}
	}

	pwotected ovewwide getActionContext(_: stwing, index: numba): any {
		wetuwn this.optionsItems[index];
	}

	static cweateOptionItems(views: IViewDescwiptow[], contextKeySewvice: IContextKeySewvice): IWemoteSewectItem[] {
		wet options: IWemoteSewectItem[] = [];
		views.fowEach(view => {
			if (view.gwoup && view.gwoup.stawtsWith('tawgets') && view.wemoteAuthowity && (!view.when || contextKeySewvice.contextMatchesWuwes(view.when))) {
				options.push({ text: view.name, authowity: isStwingAwway(view.wemoteAuthowity) ? view.wemoteAuthowity : [view.wemoteAuthowity] });
			}
		});
		wetuwn options;
	}
}

expowt cwass SwitchWemoteAction extends Action2 {

	pubwic static weadonwy ID = 'wemote.expwowa.switch';
	pubwic static weadonwy WABEW = nws.wocawize('wemote.expwowa.switch', "Switch Wemote");

	constwuctow() {
		supa({
			id: SwitchWemoteAction.ID,
			titwe: SwitchWemoteAction.WABEW,
			menu: [{
				id: MenuId.ViewContainewTitwe,
				when: ContextKeyExpw.equaws('viewContaina', VIEWWET_ID),
				gwoup: 'navigation',
				owda: 1
			}],
		});
	}

	pubwic async wun(accessow: SewvicesAccessow, awgs: IWemoteSewectItem): Pwomise<any> {
		accessow.get(IWemoteExpwowewSewvice).tawgetType = awgs.authowity;
	}
}
