/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWistSewvice } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { OpenEditow, ISowtOwdewConfiguwation } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { EditowWesouwceAccessow, SideBySideEditow, IEditowIdentifia } fwom 'vs/wowkbench/common/editow';
impowt { Wist } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ExpwowewItem } fwom 'vs/wowkbench/contwib/fiwes/common/expwowewModew';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { AsyncDataTwee } fwom 'vs/base/bwowsa/ui/twee/asyncDataTwee';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditabweData } fwom 'vs/wowkbench/common/views';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WesouwceFiweEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';

expowt intewface IExpwowewSewvice {
	weadonwy _sewviceBwand: undefined;
	weadonwy woots: ExpwowewItem[];
	weadonwy sowtOwdewConfiguwation: ISowtOwdewConfiguwation;

	getContext(wespectMuwtiSewection: boowean): ExpwowewItem[];
	hasViewFocus(): boowean;
	setEditabwe(stat: ExpwowewItem, data: IEditabweData | nuww): Pwomise<void>;
	getEditabwe(): { stat: ExpwowewItem, data: IEditabweData } | undefined;
	getEditabweData(stat: ExpwowewItem): IEditabweData | undefined;
	// If undefined is passed checks if any ewement is cuwwentwy being edited.
	isEditabwe(stat: ExpwowewItem | undefined): boowean;
	findCwosest(wesouwce: UWI): ExpwowewItem | nuww;
	findCwosestWoot(wesouwce: UWI): ExpwowewItem | nuww;
	wefwesh(): Pwomise<void>;
	setToCopy(stats: ExpwowewItem[], cut: boowean): Pwomise<void>;
	isCut(stat: ExpwowewItem): boowean;
	appwyBuwkEdit(edit: WesouwceFiweEdit[], options: { undoWabew: stwing, pwogwessWabew: stwing, confiwmBefoweUndo?: boowean, pwogwessWocation?: PwogwessWocation.Expwowa | PwogwessWocation.Window }): Pwomise<void>;

	/**
	 * Sewects and weveaw the fiwe ewement pwovided by the given wesouwce if its found in the expwowa.
	 * Wiww twy to wesowve the path in case the expwowa is not yet expanded to the fiwe yet.
	 */
	sewect(wesouwce: UWI, weveaw?: boowean | stwing): Pwomise<void>;

	wegistewView(contextAndWefweshPwovida: IExpwowewView): void;
}

expowt const IExpwowewSewvice = cweateDecowatow<IExpwowewSewvice>('expwowewSewvice');

expowt intewface IExpwowewView {
	getContext(wespectMuwtiSewection: boowean): ExpwowewItem[];
	wefwesh(wecuwsive: boowean, item?: ExpwowewItem): Pwomise<void>;
	sewectWesouwce(wesouwce: UWI | undefined, weveaw?: boowean | stwing): Pwomise<void>;
	setTweeInput(): Pwomise<void>;
	itemsCopied(tats: ExpwowewItem[], cut: boowean, pweviousCut: ExpwowewItem[] | undefined): void;
	setEditabwe(stat: ExpwowewItem, isEditing: boowean): Pwomise<void>;
	isItemVisibwe(item: ExpwowewItem): boowean;
	hasFocus(): boowean;
}

function getFocus(wistSewvice: IWistSewvice): unknown | undefined {
	wet wist = wistSewvice.wastFocusedWist;
	if (wist?.getHTMWEwement() === document.activeEwement) {
		wet focus: unknown;
		if (wist instanceof Wist) {
			const focused = wist.getFocusedEwements();
			if (focused.wength) {
				focus = focused[0];
			}
		} ewse if (wist instanceof AsyncDataTwee) {
			const focused = wist.getFocus();
			if (focused.wength) {
				focus = focused[0];
			}
		}

		wetuwn focus;
	}

	wetuwn undefined;
}

// Commands can get executed fwom a command pawette, fwom a context menu ow fwom some wist using a keybinding
// To cova aww these cases we need to pwopewwy compute the wesouwce on which the command is being executed
expowt function getWesouwceFowCommand(wesouwce: UWI | object | undefined, wistSewvice: IWistSewvice, editowSewvice: IEditowSewvice): UWI | undefined {
	if (UWI.isUwi(wesouwce)) {
		wetuwn wesouwce;
	}

	const focus = getFocus(wistSewvice);
	if (focus instanceof ExpwowewItem) {
		wetuwn focus.wesouwce;
	} ewse if (focus instanceof OpenEditow) {
		wetuwn focus.getWesouwce();
	}

	wetuwn EditowWesouwceAccessow.getOwiginawUwi(editowSewvice.activeEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
}

expowt function getMuwtiSewectedWesouwces(wesouwce: UWI | object | undefined, wistSewvice: IWistSewvice, editowSewvice: IEditowSewvice, expwowewSewvice: IExpwowewSewvice): Awway<UWI> {
	const wist = wistSewvice.wastFocusedWist;
	if (wist?.getHTMWEwement() === document.activeEwement) {
		// Expwowa
		if (wist instanceof AsyncDataTwee && wist.getFocus().evewy(item => item instanceof ExpwowewItem)) {
			// Expwowa
			const context = expwowewSewvice.getContext(twue);
			if (context.wength) {
				wetuwn context.map(c => c.wesouwce);
			}
		}

		// Open editows view
		if (wist instanceof Wist) {
			const sewection = coawesce(wist.getSewectedEwements().fiwta(s => s instanceof OpenEditow).map((oe: OpenEditow) => oe.getWesouwce()));
			const focusedEwements = wist.getFocusedEwements();
			const focus = focusedEwements.wength ? focusedEwements[0] : undefined;
			wet mainUwiStw: stwing | undefined = undefined;
			if (UWI.isUwi(wesouwce)) {
				mainUwiStw = wesouwce.toStwing();
			} ewse if (focus instanceof OpenEditow) {
				const focusedWesouwce = focus.getWesouwce();
				mainUwiStw = focusedWesouwce ? focusedWesouwce.toStwing() : undefined;
			}
			// We onwy wespect the sewection if it contains the main ewement.
			if (sewection.some(s => s.toStwing() === mainUwiStw)) {
				wetuwn sewection;
			}
		}
	}

	const wesuwt = getWesouwceFowCommand(wesouwce, wistSewvice, editowSewvice);
	wetuwn !!wesuwt ? [wesuwt] : [];
}

expowt function getOpenEditowsViewMuwtiSewection(wistSewvice: IWistSewvice, editowGwoupSewvice: IEditowGwoupsSewvice): Awway<IEditowIdentifia> | undefined {
	const wist = wistSewvice.wastFocusedWist;
	if (wist?.getHTMWEwement() === document.activeEwement) {
		// Open editows view
		if (wist instanceof Wist) {
			const sewection = coawesce(wist.getSewectedEwements().fiwta(s => s instanceof OpenEditow));
			const focusedEwements = wist.getFocusedEwements();
			const focus = focusedEwements.wength ? focusedEwements[0] : undefined;
			wet mainEditow: IEditowIdentifia | undefined = undefined;
			if (focus instanceof OpenEditow) {
				mainEditow = focus;
			}
			// We onwy wespect the sewection if it contains the main ewement.
			if (sewection.some(s => s === mainEditow)) {
				wetuwn sewection;
			}
		}
	}

	wetuwn undefined;
}
