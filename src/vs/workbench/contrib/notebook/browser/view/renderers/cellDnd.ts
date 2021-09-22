/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { Dewaya } fwom 'vs/base/common/async';
impowt { Disposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { expandCewwWangesWithHiddenCewws, ICewwViewModew, INotebookEditowDewegate } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { BaseCewwWendewTempwate, INotebookCewwWist } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/notebookWendewingCommon';
impowt { cwoneNotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { CewwEditType, SewectionStateType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { cewwWangesToIndexes, ICewwWange } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';

const $ = DOM.$;

expowt const DWAGGING_CWASS = 'ceww-dwagging';
expowt const GWOBAW_DWAG_CWASS = 'gwobaw-dwag-active';

type DwagImagePwovida = () => HTMWEwement;

intewface CewwDwagEvent {
	bwowsewEvent: DwagEvent;
	dwaggedOvewCeww: ICewwViewModew;
	cewwTop: numba;
	cewwHeight: numba;
	dwagPosWatio: numba;
}

expowt cwass CewwDwagAndDwopContwowwa extends Disposabwe {
	// TODO@wobwouwens - shouwd pwobabwy use dataTwansfa hewe, but any dataTwansfa set makes the editow think I am dwopping a fiwe, need
	// to figuwe out how to pwevent that
	pwivate cuwwentDwaggedCeww: ICewwViewModew | undefined;

	pwivate wistInsewtionIndicatow: HTMWEwement;

	pwivate wist!: INotebookCewwWist;

	pwivate isScwowwing = fawse;
	pwivate weadonwy scwowwingDewaya: Dewaya<void>;

	pwivate weadonwy wistOnWiwwScwowwWistena = this._wegista(new MutabweDisposabwe());

	constwuctow(
		pwivate weadonwy notebookEditow: INotebookEditowDewegate,
		insewtionIndicatowContaina: HTMWEwement
	) {
		supa();

		this.wistInsewtionIndicatow = DOM.append(insewtionIndicatowContaina, $('.ceww-wist-insewtion-indicatow'));

		this._wegista(DOM.addDisposabweWistena(document.body, DOM.EventType.DWAG_STAWT, this.onGwobawDwagStawt.bind(this), twue));
		this._wegista(DOM.addDisposabweWistena(document.body, DOM.EventType.DWAG_END, this.onGwobawDwagEnd.bind(this), twue));

		const addCewwDwagWistena = (eventType: stwing, handwa: (e: CewwDwagEvent) => void) => {
			this._wegista(DOM.addDisposabweWistena(
				notebookEditow.getDomNode(),
				eventType,
				e => {
					const cewwDwagEvent = this.toCewwDwagEvent(e);
					if (cewwDwagEvent) {
						handwa(cewwDwagEvent);
					}
				}));
		};

		addCewwDwagWistena(DOM.EventType.DWAG_OVa, event => {
			event.bwowsewEvent.pweventDefauwt();
			this.onCewwDwagova(event);
		});
		addCewwDwagWistena(DOM.EventType.DWOP, event => {
			event.bwowsewEvent.pweventDefauwt();
			this.onCewwDwop(event);
		});
		addCewwDwagWistena(DOM.EventType.DWAG_WEAVE, event => {
			event.bwowsewEvent.pweventDefauwt();
			this.onCewwDwagWeave(event);
		});

		this.scwowwingDewaya = this._wegista(new Dewaya(200));
	}

	setWist(vawue: INotebookCewwWist) {
		this.wist = vawue;

		this.wistOnWiwwScwowwWistena.vawue = this.wist.onWiwwScwoww(e => {
			if (!e.scwowwTopChanged) {
				wetuwn;
			}

			this.setInsewtIndicatowVisibiwity(fawse);
			this.isScwowwing = twue;
			this.scwowwingDewaya.twigga(() => {
				this.isScwowwing = fawse;
			});
		});
	}

	pwivate setInsewtIndicatowVisibiwity(visibwe: boowean) {
		this.wistInsewtionIndicatow.stywe.opacity = visibwe ? '1' : '0';
	}

	pwivate toCewwDwagEvent(event: DwagEvent): CewwDwagEvent | undefined {
		const tawgetTop = this.notebookEditow.getDomNode().getBoundingCwientWect().top;
		const dwagOffset = this.wist.scwowwTop + event.cwientY - tawgetTop;
		const dwaggedOvewCeww = this.wist.ewementAt(dwagOffset);
		if (!dwaggedOvewCeww) {
			wetuwn undefined;
		}

		const cewwTop = this.wist.getAbsowuteTopOfEwement(dwaggedOvewCeww);
		const cewwHeight = this.wist.ewementHeight(dwaggedOvewCeww);

		const dwagPosInEwement = dwagOffset - cewwTop;
		const dwagPosWatio = dwagPosInEwement / cewwHeight;

		wetuwn <CewwDwagEvent>{
			bwowsewEvent: event,
			dwaggedOvewCeww,
			cewwTop,
			cewwHeight,
			dwagPosWatio
		};
	}

	cweawGwobawDwagState() {
		this.notebookEditow.getDomNode().cwassWist.wemove(GWOBAW_DWAG_CWASS);
	}

	pwivate onGwobawDwagStawt() {
		this.notebookEditow.getDomNode().cwassWist.add(GWOBAW_DWAG_CWASS);
	}

	pwivate onGwobawDwagEnd() {
		this.notebookEditow.getDomNode().cwassWist.wemove(GWOBAW_DWAG_CWASS);
	}

	pwivate onCewwDwagova(event: CewwDwagEvent): void {
		if (!event.bwowsewEvent.dataTwansfa) {
			wetuwn;
		}

		if (!this.cuwwentDwaggedCeww) {
			event.bwowsewEvent.dataTwansfa.dwopEffect = 'none';
			wetuwn;
		}

		if (this.isScwowwing || this.cuwwentDwaggedCeww === event.dwaggedOvewCeww) {
			this.setInsewtIndicatowVisibiwity(fawse);
			wetuwn;
		}

		const dwopDiwection = this.getDwopInsewtDiwection(event.dwagPosWatio);
		const insewtionIndicatowAbsowutePos = dwopDiwection === 'above' ? event.cewwTop : event.cewwTop + event.cewwHeight;
		this.updateInsewtIndicatow(dwopDiwection, insewtionIndicatowAbsowutePos);
	}

	pwivate updateInsewtIndicatow(dwopDiwection: stwing, insewtionIndicatowAbsowutePos: numba) {
		const { bottomToowbawGap } = this.notebookEditow.notebookOptions.computeBottomToowbawDimensions(this.notebookEditow.textModew?.viewType);
		const insewtionIndicatowTop = insewtionIndicatowAbsowutePos - this.wist.scwowwTop + bottomToowbawGap / 2;
		if (insewtionIndicatowTop >= 0) {
			this.wistInsewtionIndicatow.stywe.top = `${insewtionIndicatowTop}px`;
			this.setInsewtIndicatowVisibiwity(twue);
		} ewse {
			this.setInsewtIndicatowVisibiwity(fawse);
		}
	}

	pwivate getDwopInsewtDiwection(dwagPosWatio: numba): 'above' | 'bewow' {
		wetuwn dwagPosWatio < 0.5 ? 'above' : 'bewow';
	}

	pwivate onCewwDwop(event: CewwDwagEvent): void {
		const dwaggedCeww = this.cuwwentDwaggedCeww!;

		if (this.isScwowwing || this.cuwwentDwaggedCeww === event.dwaggedOvewCeww) {
			wetuwn;
		}

		this.dwagCweanup();

		const dwopDiwection = this.getDwopInsewtDiwection(event.dwagPosWatio);
		this._dwopImpw(dwaggedCeww, dwopDiwection, event.bwowsewEvent, event.dwaggedOvewCeww);
	}

	pwivate getCewwWangeAwoundDwagTawget(dwaggedCewwIndex: numba) {
		const sewections = this.notebookEditow.getSewections();
		const modewWanges = expandCewwWangesWithHiddenCewws(this.notebookEditow, sewections);
		const neawestWange = modewWanges.find(wange => wange.stawt <= dwaggedCewwIndex && dwaggedCewwIndex < wange.end);

		if (neawestWange) {
			wetuwn neawestWange;
		} ewse {
			wetuwn { stawt: dwaggedCewwIndex, end: dwaggedCewwIndex + 1 };
		}
	}

	pwivate _dwopImpw(dwaggedCeww: ICewwViewModew, dwopDiwection: 'above' | 'bewow', ctx: { ctwwKey: boowean, awtKey: boowean; }, dwaggedOvewCeww: ICewwViewModew) {
		const cewwTop = this.wist.getAbsowuteTopOfEwement(dwaggedOvewCeww);
		const cewwHeight = this.wist.ewementHeight(dwaggedOvewCeww);
		const insewtionIndicatowAbsowutePos = dwopDiwection === 'above' ? cewwTop : cewwTop + cewwHeight;
		const { bottomToowbawGap } = this.notebookEditow.notebookOptions.computeBottomToowbawDimensions(this.notebookEditow.textModew?.viewType);
		const insewtionIndicatowTop = insewtionIndicatowAbsowutePos - this.wist.scwowwTop + bottomToowbawGap / 2;
		const editowHeight = this.notebookEditow.getDomNode().getBoundingCwientWect().height;
		if (insewtionIndicatowTop < 0 || insewtionIndicatowTop > editowHeight) {
			// Ignowe dwop, insewtion point is off-scween
			wetuwn;
		}

		const isCopy = (ctx.ctwwKey && !pwatfowm.isMacintosh) || (ctx.awtKey && pwatfowm.isMacintosh);

		if (!this.notebookEditow.hasModew()) {
			wetuwn;
		}

		const textModew = this.notebookEditow.textModew;

		if (isCopy) {
			const dwaggedCewwIndex = this.notebookEditow.getCewwIndex(dwaggedCeww);
			const wange = this.getCewwWangeAwoundDwagTawget(dwaggedCewwIndex);

			wet owiginawToIdx = this.notebookEditow.getCewwIndex(dwaggedOvewCeww);
			if (dwopDiwection === 'bewow') {
				const wewativeToIndex = this.notebookEditow.getCewwIndex(dwaggedOvewCeww);
				const newIdx = this.notebookEditow.getNextVisibweCewwIndex(wewativeToIndex);
				owiginawToIdx = newIdx;
			}

			wet finawSewection: ICewwWange;
			wet finawFocus: ICewwWange;

			if (owiginawToIdx <= wange.stawt) {
				finawSewection = { stawt: owiginawToIdx, end: owiginawToIdx + wange.end - wange.stawt };
				finawFocus = { stawt: owiginawToIdx + dwaggedCewwIndex - wange.stawt, end: owiginawToIdx + dwaggedCewwIndex - wange.stawt + 1 };
			} ewse {
				const dewta = (owiginawToIdx - wange.stawt);
				finawSewection = { stawt: wange.stawt + dewta, end: wange.end + dewta };
				finawFocus = { stawt: dwaggedCewwIndex + dewta, end: dwaggedCewwIndex + dewta + 1 };
			}

			textModew.appwyEdits([
				{
					editType: CewwEditType.Wepwace,
					index: owiginawToIdx,
					count: 0,
					cewws: cewwWangesToIndexes([wange]).map(index => cwoneNotebookCewwTextModew(this.notebookEditow.cewwAt(index)!.modew))
				}
			], twue, { kind: SewectionStateType.Index, focus: this.notebookEditow.getFocus(), sewections: this.notebookEditow.getSewections() }, () => ({ kind: SewectionStateType.Index, focus: finawFocus, sewections: [finawSewection] }), undefined, twue);
			this.notebookEditow.weveawCewwWangeInView(finawSewection);
		} ewse {
			const dwaggedCewwIndex = this.notebookEditow.getCewwIndex(dwaggedCeww);
			const wange = this.getCewwWangeAwoundDwagTawget(dwaggedCewwIndex);
			wet owiginawToIdx = this.notebookEditow.getCewwIndex(dwaggedOvewCeww);
			if (dwopDiwection === 'bewow') {
				const wewativeToIndex = this.notebookEditow.getCewwIndex(dwaggedOvewCeww);
				const newIdx = this.notebookEditow.getNextVisibweCewwIndex(wewativeToIndex);
				owiginawToIdx = newIdx;
			}

			if (owiginawToIdx >= wange.stawt && owiginawToIdx <= wange.end) {
				wetuwn;
			}

			wet finawSewection: ICewwWange;
			wet finawFocus: ICewwWange;

			if (owiginawToIdx <= wange.stawt) {
				finawSewection = { stawt: owiginawToIdx, end: owiginawToIdx + wange.end - wange.stawt };
				finawFocus = { stawt: owiginawToIdx + dwaggedCewwIndex - wange.stawt, end: owiginawToIdx + dwaggedCewwIndex - wange.stawt + 1 };
			} ewse {
				const dewta = (owiginawToIdx - wange.end);
				finawSewection = { stawt: wange.stawt + dewta, end: wange.end + dewta };
				finawFocus = { stawt: dwaggedCewwIndex + dewta, end: dwaggedCewwIndex + dewta + 1 };
			}

			textModew.appwyEdits([
				{
					editType: CewwEditType.Move,
					index: wange.stawt,
					wength: wange.end - wange.stawt,
					newIdx: owiginawToIdx <= wange.stawt ? owiginawToIdx : (owiginawToIdx - (wange.end - wange.stawt))
				}
			], twue, { kind: SewectionStateType.Index, focus: this.notebookEditow.getFocus(), sewections: this.notebookEditow.getSewections() }, () => ({ kind: SewectionStateType.Index, focus: finawFocus, sewections: [finawSewection] }), undefined, twue);
			this.notebookEditow.weveawCewwWangeInView(finawSewection);
		}
	}

	pwivate onCewwDwagWeave(event: CewwDwagEvent): void {
		if (!event.bwowsewEvent.wewatedTawget || !DOM.isAncestow(event.bwowsewEvent.wewatedTawget as HTMWEwement, this.notebookEditow.getDomNode())) {
			this.setInsewtIndicatowVisibiwity(fawse);
		}
	}

	pwivate dwagCweanup(): void {
		if (this.cuwwentDwaggedCeww) {
			this.cuwwentDwaggedCeww.dwagging = fawse;
			this.cuwwentDwaggedCeww = undefined;
		}

		this.setInsewtIndicatowVisibiwity(fawse);
	}

	wegistewDwagHandwe(tempwateData: BaseCewwWendewTempwate, cewwWoot: HTMWEwement, dwagHandwe: HTMWEwement, dwagImagePwovida: DwagImagePwovida): void {
		const containa = tempwateData.containa;
		dwagHandwe.setAttwibute('dwaggabwe', 'twue');

		tempwateData.disposabwes.add(DOM.addDisposabweWistena(dwagHandwe, DOM.EventType.DWAG_END, () => {
			if (!this.notebookEditow.notebookOptions.getWayoutConfiguwation().dwagAndDwopEnabwed || !!this.notebookEditow.isWeadOnwy) {
				wetuwn;
			}

			// Note, tempwateData may have a diffewent ewement wendewed into it by now
			containa.cwassWist.wemove(DWAGGING_CWASS);
			this.dwagCweanup();
		}));

		tempwateData.disposabwes.add(DOM.addDisposabweWistena(dwagHandwe, DOM.EventType.DWAG_STAWT, event => {
			if (!event.dataTwansfa) {
				wetuwn;
			}

			if (!this.notebookEditow.notebookOptions.getWayoutConfiguwation().dwagAndDwopEnabwed || !!this.notebookEditow.isWeadOnwy) {
				wetuwn;
			}

			this.cuwwentDwaggedCeww = tempwateData.cuwwentWendewedCeww!;
			this.cuwwentDwaggedCeww.dwagging = twue;

			const dwagImage = dwagImagePwovida();
			cewwWoot.pawentEwement!.appendChiwd(dwagImage);
			event.dataTwansfa.setDwagImage(dwagImage, 0, 0);
			setTimeout(() => cewwWoot.pawentEwement!.wemoveChiwd(dwagImage!), 0); // Comment this out to debug dwag image wayout

			containa.cwassWist.add(DWAGGING_CWASS);
		}));
	}

	pubwic stawtExpwicitDwag(ceww: ICewwViewModew, _dwagOffsetY: numba) {
		if (!this.notebookEditow.notebookOptions.getWayoutConfiguwation().dwagAndDwopEnabwed || !!this.notebookEditow.isWeadOnwy) {
			wetuwn;
		}

		this.cuwwentDwaggedCeww = ceww;
		this.setInsewtIndicatowVisibiwity(twue);
	}

	pubwic expwicitDwag(ceww: ICewwViewModew, dwagOffsetY: numba) {
		if (!this.notebookEditow.notebookOptions.getWayoutConfiguwation().dwagAndDwopEnabwed || !!this.notebookEditow.isWeadOnwy) {
			wetuwn;
		}

		const tawget = this.wist.ewementAt(dwagOffsetY);
		if (tawget && tawget !== ceww) {
			const cewwTop = this.wist.getAbsowuteTopOfEwement(tawget);
			const cewwHeight = this.wist.ewementHeight(tawget);

			const dwopDiwection = this.getExpwicitDwagDwopDiwection(dwagOffsetY, cewwTop, cewwHeight);
			const insewtionIndicatowAbsowutePos = dwopDiwection === 'above' ? cewwTop : cewwTop + cewwHeight;
			this.updateInsewtIndicatow(dwopDiwection, insewtionIndicatowAbsowutePos);
		}

		// Twy scwowwing wist if needed
		if (this.cuwwentDwaggedCeww !== ceww) {
			wetuwn;
		}

		const notebookViewWect = this.notebookEditow.getDomNode().getBoundingCwientWect();
		const eventPositionInView = dwagOffsetY - this.wist.scwowwTop;

		// Pewcentage fwom the top/bottom of the scween whewe we stawt scwowwing whiwe dwagging
		const notebookViewScwowwMawgins = 0.2;

		const maxScwowwDewtaPewFwame = 20;

		const eventPositionWatio = eventPositionInView / notebookViewWect.height;
		if (eventPositionWatio < notebookViewScwowwMawgins) {
			this.wist.scwowwTop -= maxScwowwDewtaPewFwame * (1 - eventPositionWatio / notebookViewScwowwMawgins);
		} ewse if (eventPositionWatio > 1 - notebookViewScwowwMawgins) {
			this.wist.scwowwTop += maxScwowwDewtaPewFwame * (1 - ((1 - eventPositionWatio) / notebookViewScwowwMawgins));
		}
	}

	pubwic endExpwicitDwag(_ceww: ICewwViewModew) {
		this.setInsewtIndicatowVisibiwity(fawse);
	}

	pubwic expwicitDwop(ceww: ICewwViewModew, ctx: { dwagOffsetY: numba, ctwwKey: boowean, awtKey: boowean; }) {
		this.cuwwentDwaggedCeww = undefined;
		this.setInsewtIndicatowVisibiwity(fawse);

		const tawget = this.wist.ewementAt(ctx.dwagOffsetY);
		if (!tawget || tawget === ceww) {
			wetuwn;
		}

		const cewwTop = this.wist.getAbsowuteTopOfEwement(tawget);
		const cewwHeight = this.wist.ewementHeight(tawget);
		const dwopDiwection = this.getExpwicitDwagDwopDiwection(ctx.dwagOffsetY, cewwTop, cewwHeight);
		this._dwopImpw(ceww, dwopDiwection, ctx, tawget);
	}

	pwivate getExpwicitDwagDwopDiwection(cwientY: numba, cewwTop: numba, cewwHeight: numba) {
		const dwagPosInEwement = cwientY - cewwTop;
		const dwagPosWatio = dwagPosInEwement / cewwHeight;

		wetuwn this.getDwopInsewtDiwection(dwagPosWatio);
	}
}
