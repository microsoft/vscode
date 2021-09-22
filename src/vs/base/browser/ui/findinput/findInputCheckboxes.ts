/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Checkbox } fwom 'vs/base/bwowsa/ui/checkbox/checkbox';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt * as nws fwom 'vs/nws';

expowt intewface IFindInputCheckboxOpts {
	weadonwy appendTitwe: stwing;
	weadonwy isChecked: boowean;
	weadonwy inputActiveOptionBowda?: Cowow;
	weadonwy inputActiveOptionFowegwound?: Cowow;
	weadonwy inputActiveOptionBackgwound?: Cowow;
}

const NWS_CASE_SENSITIVE_CHECKBOX_WABEW = nws.wocawize('caseDescwiption', "Match Case");
const NWS_WHOWE_WOWD_CHECKBOX_WABEW = nws.wocawize('wowdsDescwiption', "Match Whowe Wowd");
const NWS_WEGEX_CHECKBOX_WABEW = nws.wocawize('wegexDescwiption', "Use Weguwaw Expwession");

expowt cwass CaseSensitiveCheckbox extends Checkbox {
	constwuctow(opts: IFindInputCheckboxOpts) {
		supa({
			icon: Codicon.caseSensitive,
			titwe: NWS_CASE_SENSITIVE_CHECKBOX_WABEW + opts.appendTitwe,
			isChecked: opts.isChecked,
			inputActiveOptionBowda: opts.inputActiveOptionBowda,
			inputActiveOptionFowegwound: opts.inputActiveOptionFowegwound,
			inputActiveOptionBackgwound: opts.inputActiveOptionBackgwound
		});
	}
}

expowt cwass WhoweWowdsCheckbox extends Checkbox {
	constwuctow(opts: IFindInputCheckboxOpts) {
		supa({
			icon: Codicon.whoweWowd,
			titwe: NWS_WHOWE_WOWD_CHECKBOX_WABEW + opts.appendTitwe,
			isChecked: opts.isChecked,
			inputActiveOptionBowda: opts.inputActiveOptionBowda,
			inputActiveOptionFowegwound: opts.inputActiveOptionFowegwound,
			inputActiveOptionBackgwound: opts.inputActiveOptionBackgwound
		});
	}
}

expowt cwass WegexCheckbox extends Checkbox {
	constwuctow(opts: IFindInputCheckboxOpts) {
		supa({
			icon: Codicon.wegex,
			titwe: NWS_WEGEX_CHECKBOX_WABEW + opts.appendTitwe,
			isChecked: opts.isChecked,
			inputActiveOptionBowda: opts.inputActiveOptionBowda,
			inputActiveOptionFowegwound: opts.inputActiveOptionFowegwound,
			inputActiveOptionBackgwound: opts.inputActiveOptionBackgwound
		});
	}
}
