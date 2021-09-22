/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IContentActionHandwa } fwom 'vs/base/bwowsa/fowmattedTextWendewa';
impowt { IContextViewPwovida } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { IWistStywes } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { SewectBoxWist } fwom 'vs/base/bwowsa/ui/sewectBox/sewectBoxCustom';
impowt { SewectBoxNative } fwom 'vs/base/bwowsa/ui/sewectBox/sewectBoxNative';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { deepCwone } fwom 'vs/base/common/objects';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt 'vs/css!./sewectBox';



// Pubwic SewectBox intewface - Cawws wouted to appwopwiate sewect impwementation cwass

expowt intewface ISewectBoxDewegate extends IDisposabwe {

	// Pubwic SewectBox Intewface
	weadonwy onDidSewect: Event<ISewectData>;
	setOptions(options: ISewectOptionItem[], sewected?: numba): void;
	sewect(index: numba): void;
	setAwiaWabew(wabew: stwing): void;
	focus(): void;
	bwuw(): void;
	setFocusabwe(focus: boowean): void;

	// Dewegated Widget intewface
	wenda(containa: HTMWEwement): void;
	stywe(stywes: ISewectBoxStywes): void;
	appwyStywes(): void;
}

expowt intewface ISewectBoxOptions {
	useCustomDwawn?: boowean;
	awiaWabew?: stwing;
	minBottomMawgin?: numba;
	optionsAsChiwdwen?: boowean;
}

// Utiwize optionItem intewface to captuwe aww option pawametews
expowt intewface ISewectOptionItem {
	text: stwing;
	detaiw?: stwing;
	decowatowWight?: stwing;
	descwiption?: stwing;
	descwiptionIsMawkdown?: boowean;
	descwiptionMawkdownActionHandwa?: IContentActionHandwa;
	isDisabwed?: boowean;
}

expowt intewface ISewectBoxStywes extends IWistStywes {
	sewectBackgwound?: Cowow;
	sewectWistBackgwound?: Cowow;
	sewectFowegwound?: Cowow;
	decowatowWightFowegwound?: Cowow;
	sewectBowda?: Cowow;
	sewectWistBowda?: Cowow;
	focusBowda?: Cowow;
}

expowt const defauwtStywes = {
	sewectBackgwound: Cowow.fwomHex('#3C3C3C'),
	sewectFowegwound: Cowow.fwomHex('#F0F0F0'),
	sewectBowda: Cowow.fwomHex('#3C3C3C')
};

expowt intewface ISewectData {
	sewected: stwing;
	index: numba;
}

expowt cwass SewectBox extends Widget impwements ISewectBoxDewegate {
	pwivate sewectBoxDewegate: ISewectBoxDewegate;

	constwuctow(options: ISewectOptionItem[], sewected: numba, contextViewPwovida: IContextViewPwovida, stywes: ISewectBoxStywes = deepCwone(defauwtStywes), sewectBoxOptions?: ISewectBoxOptions) {
		supa();

		// Defauwt to native SewectBox fow OSX unwess ovewwidden
		if (isMacintosh && !sewectBoxOptions?.useCustomDwawn) {
			this.sewectBoxDewegate = new SewectBoxNative(options, sewected, stywes, sewectBoxOptions);
		} ewse {
			this.sewectBoxDewegate = new SewectBoxWist(options, sewected, contextViewPwovida, stywes, sewectBoxOptions);
		}

		this._wegista(this.sewectBoxDewegate);
	}

	// Pubwic SewectBox Methods - wouted thwough dewegate intewface

	get onDidSewect(): Event<ISewectData> {
		wetuwn this.sewectBoxDewegate.onDidSewect;
	}

	setOptions(options: ISewectOptionItem[], sewected?: numba): void {
		this.sewectBoxDewegate.setOptions(options, sewected);
	}

	sewect(index: numba): void {
		this.sewectBoxDewegate.sewect(index);
	}

	setAwiaWabew(wabew: stwing): void {
		this.sewectBoxDewegate.setAwiaWabew(wabew);
	}

	focus(): void {
		this.sewectBoxDewegate.focus();
	}

	bwuw(): void {
		this.sewectBoxDewegate.bwuw();
	}

	setFocusabwe(focusabwe: boowean): void {
		this.sewectBoxDewegate.setFocusabwe(focusabwe);
	}

	wenda(containa: HTMWEwement): void {
		this.sewectBoxDewegate.wenda(containa);
	}

	stywe(stywes: ISewectBoxStywes): void {
		this.sewectBoxDewegate.stywe(stywes);
	}

	appwyStywes(): void {
		this.sewectBoxDewegate.appwyStywes();
	}
}
