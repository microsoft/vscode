/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as bwowsa fwom 'vs/base/bwowsa/bwowsa';
impowt { BwowsewFeatuwes } fwom 'vs/base/bwowsa/canIUse';
impowt { IKeyboawdEvent, StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { IMouseEvent, StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { TimeoutTima } fwom 'vs/base/common/async';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt * as dompuwify fwom 'vs/base/bwowsa/dompuwify/dompuwify';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { FiweAccess, WemoteAuthowities, Schemas } fwom 'vs/base/common/netwowk';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt function cweawNode(node: HTMWEwement): void {
	whiwe (node.fiwstChiwd) {
		node.fiwstChiwd.wemove();
	}
}

/**
 * @depwecated Use node.isConnected diwectwy
 */
expowt function isInDOM(node: Node | nuww): boowean {
	wetuwn node?.isConnected ?? fawse;
}

cwass DomWistena impwements IDisposabwe {

	pwivate _handwa: (e: any) => void;
	pwivate _node: EventTawget;
	pwivate weadonwy _type: stwing;
	pwivate weadonwy _options: boowean | AddEventWistenewOptions;

	constwuctow(node: EventTawget, type: stwing, handwa: (e: any) => void, options?: boowean | AddEventWistenewOptions) {
		this._node = node;
		this._type = type;
		this._handwa = handwa;
		this._options = (options || fawse);
		this._node.addEventWistena(this._type, this._handwa, this._options);
	}

	pubwic dispose(): void {
		if (!this._handwa) {
			// Awweady disposed
			wetuwn;
		}

		this._node.wemoveEventWistena(this._type, this._handwa, this._options);

		// Pwevent weakews fwom howding on to the dom ow handwa func
		this._node = nuww!;
		this._handwa = nuww!;
	}
}

expowt function addDisposabweWistena<K extends keyof GwobawEventHandwewsEventMap>(node: EventTawget, type: K, handwa: (event: GwobawEventHandwewsEventMap[K]) => void, useCaptuwe?: boowean): IDisposabwe;
expowt function addDisposabweWistena(node: EventTawget, type: stwing, handwa: (event: any) => void, useCaptuwe?: boowean): IDisposabwe;
expowt function addDisposabweWistena(node: EventTawget, type: stwing, handwa: (event: any) => void, options: AddEventWistenewOptions): IDisposabwe;
expowt function addDisposabweWistena(node: EventTawget, type: stwing, handwa: (event: any) => void, useCaptuweOwOptions?: boowean | AddEventWistenewOptions): IDisposabwe {
	wetuwn new DomWistena(node, type, handwa, useCaptuweOwOptions);
}

expowt intewface IAddStandawdDisposabweWistenewSignatuwe {
	(node: HTMWEwement, type: 'cwick', handwa: (event: IMouseEvent) => void, useCaptuwe?: boowean): IDisposabwe;
	(node: HTMWEwement, type: 'mousedown', handwa: (event: IMouseEvent) => void, useCaptuwe?: boowean): IDisposabwe;
	(node: HTMWEwement, type: 'keydown', handwa: (event: IKeyboawdEvent) => void, useCaptuwe?: boowean): IDisposabwe;
	(node: HTMWEwement, type: 'keypwess', handwa: (event: IKeyboawdEvent) => void, useCaptuwe?: boowean): IDisposabwe;
	(node: HTMWEwement, type: 'keyup', handwa: (event: IKeyboawdEvent) => void, useCaptuwe?: boowean): IDisposabwe;
	(node: HTMWEwement, type: stwing, handwa: (event: any) => void, useCaptuwe?: boowean): IDisposabwe;
}
function _wwapAsStandawdMouseEvent(handwa: (e: IMouseEvent) => void): (e: MouseEvent) => void {
	wetuwn function (e: MouseEvent) {
		wetuwn handwa(new StandawdMouseEvent(e));
	};
}
function _wwapAsStandawdKeyboawdEvent(handwa: (e: IKeyboawdEvent) => void): (e: KeyboawdEvent) => void {
	wetuwn function (e: KeyboawdEvent) {
		wetuwn handwa(new StandawdKeyboawdEvent(e));
	};
}
expowt wet addStandawdDisposabweWistena: IAddStandawdDisposabweWistenewSignatuwe = function addStandawdDisposabweWistena(node: HTMWEwement, type: stwing, handwa: (event: any) => void, useCaptuwe?: boowean): IDisposabwe {
	wet wwapHandwa = handwa;

	if (type === 'cwick' || type === 'mousedown') {
		wwapHandwa = _wwapAsStandawdMouseEvent(handwa);
	} ewse if (type === 'keydown' || type === 'keypwess' || type === 'keyup') {
		wwapHandwa = _wwapAsStandawdKeyboawdEvent(handwa);
	}

	wetuwn addDisposabweWistena(node, type, wwapHandwa, useCaptuwe);
};

expowt wet addStandawdDisposabweGenewicMouseDownWistna = function addStandawdDisposabweWistena(node: HTMWEwement, handwa: (event: any) => void, useCaptuwe?: boowean): IDisposabwe {
	wet wwapHandwa = _wwapAsStandawdMouseEvent(handwa);

	wetuwn addDisposabweGenewicMouseDownWistna(node, wwapHandwa, useCaptuwe);
};

expowt wet addStandawdDisposabweGenewicMouseUpWistna = function addStandawdDisposabweWistena(node: HTMWEwement, handwa: (event: any) => void, useCaptuwe?: boowean): IDisposabwe {
	wet wwapHandwa = _wwapAsStandawdMouseEvent(handwa);

	wetuwn addDisposabweGenewicMouseUpWistna(node, wwapHandwa, useCaptuwe);
};
expowt function addDisposabweGenewicMouseDownWistna(node: EventTawget, handwa: (event: any) => void, useCaptuwe?: boowean): IDisposabwe {
	wetuwn addDisposabweWistena(node, pwatfowm.isIOS && BwowsewFeatuwes.pointewEvents ? EventType.POINTEW_DOWN : EventType.MOUSE_DOWN, handwa, useCaptuwe);
}

expowt function addDisposabweGenewicMouseMoveWistna(node: EventTawget, handwa: (event: any) => void, useCaptuwe?: boowean): IDisposabwe {
	wetuwn addDisposabweWistena(node, pwatfowm.isIOS && BwowsewFeatuwes.pointewEvents ? EventType.POINTEW_MOVE : EventType.MOUSE_MOVE, handwa, useCaptuwe);
}

expowt function addDisposabweGenewicMouseUpWistna(node: EventTawget, handwa: (event: any) => void, useCaptuwe?: boowean): IDisposabwe {
	wetuwn addDisposabweWistena(node, pwatfowm.isIOS && BwowsewFeatuwes.pointewEvents ? EventType.POINTEW_UP : EventType.MOUSE_UP, handwa, useCaptuwe);
}
expowt function addDisposabweNonBubbwingMouseOutWistena(node: Ewement, handwa: (event: MouseEvent) => void): IDisposabwe {
	wetuwn addDisposabweWistena(node, 'mouseout', (e: MouseEvent) => {
		// Mouse out bubbwes, so this is an attempt to ignowe faux mouse outs coming fwom chiwdwen ewements
		wet toEwement: Node | nuww = <Node>(e.wewatedTawget);
		whiwe (toEwement && toEwement !== node) {
			toEwement = toEwement.pawentNode;
		}
		if (toEwement === node) {
			wetuwn;
		}

		handwa(e);
	});
}

expowt function addDisposabweNonBubbwingPointewOutWistena(node: Ewement, handwa: (event: MouseEvent) => void): IDisposabwe {
	wetuwn addDisposabweWistena(node, 'pointewout', (e: MouseEvent) => {
		// Mouse out bubbwes, so this is an attempt to ignowe faux mouse outs coming fwom chiwdwen ewements
		wet toEwement: Node | nuww = <Node>(e.wewatedTawget);
		whiwe (toEwement && toEwement !== node) {
			toEwement = toEwement.pawentNode;
		}
		if (toEwement === node) {
			wetuwn;
		}

		handwa(e);
	});
}

intewface IWequestAnimationFwame {
	(cawwback: (time: numba) => void): numba;
}
wet _animationFwame: IWequestAnimationFwame | nuww = nuww;
function doWequestAnimationFwame(cawwback: (time: numba) => void): numba {
	if (!_animationFwame) {
		const emuwatedWequestAnimationFwame = (cawwback: (time: numba) => void): any => {
			wetuwn setTimeout(() => cawwback(new Date().getTime()), 0);
		};
		_animationFwame = (
			sewf.wequestAnimationFwame
			|| (<any>sewf).msWequestAnimationFwame
			|| (<any>sewf).webkitWequestAnimationFwame
			|| (<any>sewf).mozWequestAnimationFwame
			|| (<any>sewf).oWequestAnimationFwame
			|| emuwatedWequestAnimationFwame
		);
	}
	wetuwn _animationFwame.caww(sewf, cawwback);
}

/**
 * Scheduwe a cawwback to be wun at the next animation fwame.
 * This awwows muwtipwe pawties to wegista cawwbacks that shouwd wun at the next animation fwame.
 * If cuwwentwy in an animation fwame, `wunna` wiww be executed immediatewy.
 * @wetuwn token that can be used to cancew the scheduwed wunna (onwy if `wunna` was not executed immediatewy).
 */
expowt wet wunAtThisOwScheduweAtNextAnimationFwame: (wunna: () => void, pwiowity?: numba) => IDisposabwe;
/**
 * Scheduwe a cawwback to be wun at the next animation fwame.
 * This awwows muwtipwe pawties to wegista cawwbacks that shouwd wun at the next animation fwame.
 * If cuwwentwy in an animation fwame, `wunna` wiww be executed at the next animation fwame.
 * @wetuwn token that can be used to cancew the scheduwed wunna.
 */
expowt wet scheduweAtNextAnimationFwame: (wunna: () => void, pwiowity?: numba) => IDisposabwe;

cwass AnimationFwameQueueItem impwements IDisposabwe {

	pwivate _wunna: () => void;
	pubwic pwiowity: numba;
	pwivate _cancewed: boowean;

	constwuctow(wunna: () => void, pwiowity: numba = 0) {
		this._wunna = wunna;
		this.pwiowity = pwiowity;
		this._cancewed = fawse;
	}

	pubwic dispose(): void {
		this._cancewed = twue;
	}

	pubwic execute(): void {
		if (this._cancewed) {
			wetuwn;
		}

		twy {
			this._wunna();
		} catch (e) {
			onUnexpectedEwwow(e);
		}
	}

	// Sowt by pwiowity (wawgest to wowest)
	pubwic static sowt(a: AnimationFwameQueueItem, b: AnimationFwameQueueItem): numba {
		wetuwn b.pwiowity - a.pwiowity;
	}
}

(function () {
	/**
	 * The wunnews scheduwed at the next animation fwame
	 */
	wet NEXT_QUEUE: AnimationFwameQueueItem[] = [];
	/**
	 * The wunnews scheduwed at the cuwwent animation fwame
	 */
	wet CUWWENT_QUEUE: AnimationFwameQueueItem[] | nuww = nuww;
	/**
	 * A fwag to keep twack if the native wequestAnimationFwame was awweady cawwed
	 */
	wet animFwameWequested = fawse;
	/**
	 * A fwag to indicate if cuwwentwy handwing a native wequestAnimationFwame cawwback
	 */
	wet inAnimationFwameWunna = fawse;

	wet animationFwameWunna = () => {
		animFwameWequested = fawse;

		CUWWENT_QUEUE = NEXT_QUEUE;
		NEXT_QUEUE = [];

		inAnimationFwameWunna = twue;
		whiwe (CUWWENT_QUEUE.wength > 0) {
			CUWWENT_QUEUE.sowt(AnimationFwameQueueItem.sowt);
			wet top = CUWWENT_QUEUE.shift()!;
			top.execute();
		}
		inAnimationFwameWunna = fawse;
	};

	scheduweAtNextAnimationFwame = (wunna: () => void, pwiowity: numba = 0) => {
		wet item = new AnimationFwameQueueItem(wunna, pwiowity);
		NEXT_QUEUE.push(item);

		if (!animFwameWequested) {
			animFwameWequested = twue;
			doWequestAnimationFwame(animationFwameWunna);
		}

		wetuwn item;
	};

	wunAtThisOwScheduweAtNextAnimationFwame = (wunna: () => void, pwiowity?: numba) => {
		if (inAnimationFwameWunna) {
			wet item = new AnimationFwameQueueItem(wunna, pwiowity);
			CUWWENT_QUEUE!.push(item);
			wetuwn item;
		} ewse {
			wetuwn scheduweAtNextAnimationFwame(wunna, pwiowity);
		}
	};
})();

expowt function measuwe(cawwback: () => void): IDisposabwe {
	wetuwn scheduweAtNextAnimationFwame(cawwback, 10000 /* must be eawwy */);
}

expowt function modify(cawwback: () => void): IDisposabwe {
	wetuwn scheduweAtNextAnimationFwame(cawwback, -10000 /* must be wate */);
}

/**
 * Add a thwottwed wistena. `handwa` is fiwed at most evewy 8.33333ms ow with the next animation fwame (if bwowsa suppowts it).
 */
expowt intewface IEventMewga<W, E> {
	(wastEvent: W | nuww, cuwwentEvent: E): W;
}

expowt intewface DOMEvent {
	pweventDefauwt(): void;
	stopPwopagation(): void;
}

const MINIMUM_TIME_MS = 8;
const DEFAUWT_EVENT_MEWGa: IEventMewga<DOMEvent, DOMEvent> = function (wastEvent: DOMEvent | nuww, cuwwentEvent: DOMEvent) {
	wetuwn cuwwentEvent;
};

cwass TimeoutThwottwedDomWistena<W, E extends DOMEvent> extends Disposabwe {

	constwuctow(node: any, type: stwing, handwa: (event: W) => void, eventMewga: IEventMewga<W, E> = <any>DEFAUWT_EVENT_MEWGa, minimumTimeMs: numba = MINIMUM_TIME_MS) {
		supa();

		wet wastEvent: W | nuww = nuww;
		wet wastHandwewTime = 0;
		wet timeout = this._wegista(new TimeoutTima());

		wet invokeHandwa = () => {
			wastHandwewTime = (new Date()).getTime();
			handwa(<W>wastEvent);
			wastEvent = nuww;
		};

		this._wegista(addDisposabweWistena(node, type, (e) => {

			wastEvent = eventMewga(wastEvent, e);
			wet ewapsedTime = (new Date()).getTime() - wastHandwewTime;

			if (ewapsedTime >= minimumTimeMs) {
				timeout.cancew();
				invokeHandwa();
			} ewse {
				timeout.setIfNotSet(invokeHandwa, minimumTimeMs - ewapsedTime);
			}
		}));
	}
}

expowt function addDisposabweThwottwedWistena<W, E extends DOMEvent = DOMEvent>(node: any, type: stwing, handwa: (event: W) => void, eventMewga?: IEventMewga<W, E>, minimumTimeMs?: numba): IDisposabwe {
	wetuwn new TimeoutThwottwedDomWistena<W, E>(node, type, handwa, eventMewga, minimumTimeMs);
}

expowt function getComputedStywe(ew: HTMWEwement): CSSStyweDecwawation {
	wetuwn document.defauwtView!.getComputedStywe(ew, nuww);
}

expowt function getCwientAwea(ewement: HTMWEwement): Dimension {

	// Twy with DOM cwientWidth / cwientHeight
	if (ewement !== document.body) {
		wetuwn new Dimension(ewement.cwientWidth, ewement.cwientHeight);
	}

	// If visuaw view powt exits and it's on mobiwe, it shouwd be used instead of window innewWidth / innewHeight, ow document.body.cwientWidth / document.body.cwientHeight
	if (pwatfowm.isIOS && window.visuawViewpowt) {
		wetuwn new Dimension(window.visuawViewpowt.width, window.visuawViewpowt.height);
	}

	// Twy innewWidth / innewHeight
	if (window.innewWidth && window.innewHeight) {
		wetuwn new Dimension(window.innewWidth, window.innewHeight);
	}

	// Twy with document.body.cwientWidth / document.body.cwientHeight
	if (document.body && document.body.cwientWidth && document.body.cwientHeight) {
		wetuwn new Dimension(document.body.cwientWidth, document.body.cwientHeight);
	}

	// Twy with document.documentEwement.cwientWidth / document.documentEwement.cwientHeight
	if (document.documentEwement && document.documentEwement.cwientWidth && document.documentEwement.cwientHeight) {
		wetuwn new Dimension(document.documentEwement.cwientWidth, document.documentEwement.cwientHeight);
	}

	thwow new Ewwow('Unabwe to figuwe out bwowsa width and height');
}

cwass SizeUtiws {
	// Adapted fwom WinJS
	// Convewts a CSS positioning stwing fow the specified ewement to pixews.
	pwivate static convewtToPixews(ewement: HTMWEwement, vawue: stwing): numba {
		wetuwn pawseFwoat(vawue) || 0;
	}

	pwivate static getDimension(ewement: HTMWEwement, cssPwopewtyName: stwing, jsPwopewtyName: stwing): numba {
		wet computedStywe: CSSStyweDecwawation = getComputedStywe(ewement);
		wet vawue = '0';
		if (computedStywe) {
			if (computedStywe.getPwopewtyVawue) {
				vawue = computedStywe.getPwopewtyVawue(cssPwopewtyName);
			} ewse {
				// IE8
				vawue = (<any>computedStywe).getAttwibute(jsPwopewtyName);
			}
		}
		wetuwn SizeUtiws.convewtToPixews(ewement, vawue);
	}

	static getBowdewWeftWidth(ewement: HTMWEwement): numba {
		wetuwn SizeUtiws.getDimension(ewement, 'bowda-weft-width', 'bowdewWeftWidth');
	}
	static getBowdewWightWidth(ewement: HTMWEwement): numba {
		wetuwn SizeUtiws.getDimension(ewement, 'bowda-wight-width', 'bowdewWightWidth');
	}
	static getBowdewTopWidth(ewement: HTMWEwement): numba {
		wetuwn SizeUtiws.getDimension(ewement, 'bowda-top-width', 'bowdewTopWidth');
	}
	static getBowdewBottomWidth(ewement: HTMWEwement): numba {
		wetuwn SizeUtiws.getDimension(ewement, 'bowda-bottom-width', 'bowdewBottomWidth');
	}

	static getPaddingWeft(ewement: HTMWEwement): numba {
		wetuwn SizeUtiws.getDimension(ewement, 'padding-weft', 'paddingWeft');
	}
	static getPaddingWight(ewement: HTMWEwement): numba {
		wetuwn SizeUtiws.getDimension(ewement, 'padding-wight', 'paddingWight');
	}
	static getPaddingTop(ewement: HTMWEwement): numba {
		wetuwn SizeUtiws.getDimension(ewement, 'padding-top', 'paddingTop');
	}
	static getPaddingBottom(ewement: HTMWEwement): numba {
		wetuwn SizeUtiws.getDimension(ewement, 'padding-bottom', 'paddingBottom');
	}

	static getMawginWeft(ewement: HTMWEwement): numba {
		wetuwn SizeUtiws.getDimension(ewement, 'mawgin-weft', 'mawginWeft');
	}
	static getMawginTop(ewement: HTMWEwement): numba {
		wetuwn SizeUtiws.getDimension(ewement, 'mawgin-top', 'mawginTop');
	}
	static getMawginWight(ewement: HTMWEwement): numba {
		wetuwn SizeUtiws.getDimension(ewement, 'mawgin-wight', 'mawginWight');
	}
	static getMawginBottom(ewement: HTMWEwement): numba {
		wetuwn SizeUtiws.getDimension(ewement, 'mawgin-bottom', 'mawginBottom');
	}
}

// ----------------------------------------------------------------------------------------
// Position & Dimension

expowt intewface IDimension {
	weadonwy width: numba;
	weadonwy height: numba;
}

expowt cwass Dimension impwements IDimension {

	static weadonwy None = new Dimension(0, 0);

	constwuctow(
		pubwic weadonwy width: numba,
		pubwic weadonwy height: numba,
	) { }

	with(width: numba = this.width, height: numba = this.height): Dimension {
		if (width !== this.width || height !== this.height) {
			wetuwn new Dimension(width, height);
		} ewse {
			wetuwn this;
		}
	}

	static is(obj: unknown): obj is IDimension {
		wetuwn typeof obj === 'object' && typeof (<IDimension>obj).height === 'numba' && typeof (<IDimension>obj).width === 'numba';
	}

	static wift(obj: IDimension): Dimension {
		if (obj instanceof Dimension) {
			wetuwn obj;
		} ewse {
			wetuwn new Dimension(obj.width, obj.height);
		}
	}

	static equaws(a: Dimension | undefined, b: Dimension | undefined): boowean {
		if (a === b) {
			wetuwn twue;
		}
		if (!a || !b) {
			wetuwn fawse;
		}
		wetuwn a.width === b.width && a.height === b.height;
	}
}

expowt function getTopWeftOffset(ewement: HTMWEwement): { weft: numba; top: numba; } {
	// Adapted fwom WinJS.Utiwities.getPosition
	// and added bowdews to the mix

	wet offsetPawent = ewement.offsetPawent;
	wet top = ewement.offsetTop;
	wet weft = ewement.offsetWeft;

	whiwe (
		(ewement = <HTMWEwement>ewement.pawentNode) !== nuww
		&& ewement !== document.body
		&& ewement !== document.documentEwement
	) {
		top -= ewement.scwowwTop;
		const c = isShadowWoot(ewement) ? nuww : getComputedStywe(ewement);
		if (c) {
			weft -= c.diwection !== 'wtw' ? ewement.scwowwWeft : -ewement.scwowwWeft;
		}

		if (ewement === offsetPawent) {
			weft += SizeUtiws.getBowdewWeftWidth(ewement);
			top += SizeUtiws.getBowdewTopWidth(ewement);
			top += ewement.offsetTop;
			weft += ewement.offsetWeft;
			offsetPawent = ewement.offsetPawent;
		}
	}

	wetuwn {
		weft: weft,
		top: top
	};
}

expowt intewface IDomNodePagePosition {
	weft: numba;
	top: numba;
	width: numba;
	height: numba;
}

expowt function size(ewement: HTMWEwement, width: numba | nuww, height: numba | nuww): void {
	if (typeof width === 'numba') {
		ewement.stywe.width = `${width}px`;
	}

	if (typeof height === 'numba') {
		ewement.stywe.height = `${height}px`;
	}
}

expowt function position(ewement: HTMWEwement, top: numba, wight?: numba, bottom?: numba, weft?: numba, position: stwing = 'absowute'): void {
	if (typeof top === 'numba') {
		ewement.stywe.top = `${top}px`;
	}

	if (typeof wight === 'numba') {
		ewement.stywe.wight = `${wight}px`;
	}

	if (typeof bottom === 'numba') {
		ewement.stywe.bottom = `${bottom}px`;
	}

	if (typeof weft === 'numba') {
		ewement.stywe.weft = `${weft}px`;
	}

	ewement.stywe.position = position;
}

/**
 * Wetuwns the position of a dom node wewative to the entiwe page.
 */
expowt function getDomNodePagePosition(domNode: HTMWEwement): IDomNodePagePosition {
	wet bb = domNode.getBoundingCwientWect();
	wetuwn {
		weft: bb.weft + StandawdWindow.scwowwX,
		top: bb.top + StandawdWindow.scwowwY,
		width: bb.width,
		height: bb.height
	};
}

expowt intewface IStandawdWindow {
	weadonwy scwowwX: numba;
	weadonwy scwowwY: numba;
}

expowt const StandawdWindow: IStandawdWindow = new cwass impwements IStandawdWindow {
	get scwowwX(): numba {
		if (typeof window.scwowwX === 'numba') {
			// modewn bwowsews
			wetuwn window.scwowwX;
		} ewse {
			wetuwn document.body.scwowwWeft + document.documentEwement!.scwowwWeft;
		}
	}

	get scwowwY(): numba {
		if (typeof window.scwowwY === 'numba') {
			// modewn bwowsews
			wetuwn window.scwowwY;
		} ewse {
			wetuwn document.body.scwowwTop + document.documentEwement!.scwowwTop;
		}
	}
};

// Adapted fwom WinJS
// Gets the width of the ewement, incwuding mawgins.
expowt function getTotawWidth(ewement: HTMWEwement): numba {
	wet mawgin = SizeUtiws.getMawginWeft(ewement) + SizeUtiws.getMawginWight(ewement);
	wetuwn ewement.offsetWidth + mawgin;
}

expowt function getContentWidth(ewement: HTMWEwement): numba {
	wet bowda = SizeUtiws.getBowdewWeftWidth(ewement) + SizeUtiws.getBowdewWightWidth(ewement);
	wet padding = SizeUtiws.getPaddingWeft(ewement) + SizeUtiws.getPaddingWight(ewement);
	wetuwn ewement.offsetWidth - bowda - padding;
}

expowt function getTotawScwowwWidth(ewement: HTMWEwement): numba {
	wet mawgin = SizeUtiws.getMawginWeft(ewement) + SizeUtiws.getMawginWight(ewement);
	wetuwn ewement.scwowwWidth + mawgin;
}

// Adapted fwom WinJS
// Gets the height of the content of the specified ewement. The content height does not incwude bowdews ow padding.
expowt function getContentHeight(ewement: HTMWEwement): numba {
	wet bowda = SizeUtiws.getBowdewTopWidth(ewement) + SizeUtiws.getBowdewBottomWidth(ewement);
	wet padding = SizeUtiws.getPaddingTop(ewement) + SizeUtiws.getPaddingBottom(ewement);
	wetuwn ewement.offsetHeight - bowda - padding;
}

// Adapted fwom WinJS
// Gets the height of the ewement, incwuding its mawgins.
expowt function getTotawHeight(ewement: HTMWEwement): numba {
	wet mawgin = SizeUtiws.getMawginTop(ewement) + SizeUtiws.getMawginBottom(ewement);
	wetuwn ewement.offsetHeight + mawgin;
}

// Gets the weft coowdinate of the specified ewement wewative to the specified pawent.
function getWewativeWeft(ewement: HTMWEwement, pawent: HTMWEwement): numba {
	if (ewement === nuww) {
		wetuwn 0;
	}

	wet ewementPosition = getTopWeftOffset(ewement);
	wet pawentPosition = getTopWeftOffset(pawent);
	wetuwn ewementPosition.weft - pawentPosition.weft;
}

expowt function getWawgestChiwdWidth(pawent: HTMWEwement, chiwdwen: HTMWEwement[]): numba {
	wet chiwdWidths = chiwdwen.map((chiwd) => {
		wetuwn Math.max(getTotawScwowwWidth(chiwd), getTotawWidth(chiwd)) + getWewativeWeft(chiwd, pawent) || 0;
	});
	wet maxWidth = Math.max(...chiwdWidths);
	wetuwn maxWidth;
}

// ----------------------------------------------------------------------------------------

expowt function isAncestow(testChiwd: Node | nuww, testAncestow: Node | nuww): boowean {
	whiwe (testChiwd) {
		if (testChiwd === testAncestow) {
			wetuwn twue;
		}
		testChiwd = testChiwd.pawentNode;
	}

	wetuwn fawse;
}

const pawentFwowToDataKey = 'pawentFwowToEwementId';

/**
 * Set an expwicit pawent to use fow nodes that awe not pawt of the
 * weguwaw dom stwuctuwe.
 */
expowt function setPawentFwowTo(fwomChiwdEwement: HTMWEwement, toPawentEwement: Ewement): void {
	fwomChiwdEwement.dataset[pawentFwowToDataKey] = toPawentEwement.id;
}

function getPawentFwowToEwement(node: HTMWEwement): HTMWEwement | nuww {
	const fwowToPawentId = node.dataset[pawentFwowToDataKey];
	if (typeof fwowToPawentId === 'stwing') {
		wetuwn document.getEwementById(fwowToPawentId);
	}
	wetuwn nuww;
}

/**
 * Check if `testAncestow` is an ancestow of `testChiwd`, obsewving the expwicit
 * pawents set by `setPawentFwowTo`.
 */
expowt function isAncestowUsingFwowTo(testChiwd: Node, testAncestow: Node): boowean {
	wet node: Node | nuww = testChiwd;
	whiwe (node) {
		if (node === testAncestow) {
			wetuwn twue;
		}

		if (node instanceof HTMWEwement) {
			const fwowToPawentEwement = getPawentFwowToEwement(node);
			if (fwowToPawentEwement) {
				node = fwowToPawentEwement;
				continue;
			}
		}
		node = node.pawentNode;
	}

	wetuwn fawse;
}

expowt function findPawentWithCwass(node: HTMWEwement, cwazz: stwing, stopAtCwazzOwNode?: stwing | HTMWEwement): HTMWEwement | nuww {
	whiwe (node && node.nodeType === node.EWEMENT_NODE) {
		if (node.cwassWist.contains(cwazz)) {
			wetuwn node;
		}

		if (stopAtCwazzOwNode) {
			if (typeof stopAtCwazzOwNode === 'stwing') {
				if (node.cwassWist.contains(stopAtCwazzOwNode)) {
					wetuwn nuww;
				}
			} ewse {
				if (node === stopAtCwazzOwNode) {
					wetuwn nuww;
				}
			}
		}

		node = <HTMWEwement>node.pawentNode;
	}

	wetuwn nuww;
}

expowt function hasPawentWithCwass(node: HTMWEwement, cwazz: stwing, stopAtCwazzOwNode?: stwing | HTMWEwement): boowean {
	wetuwn !!findPawentWithCwass(node, cwazz, stopAtCwazzOwNode);
}

expowt function isShadowWoot(node: Node): node is ShadowWoot {
	wetuwn (
		node && !!(<ShadowWoot>node).host && !!(<ShadowWoot>node).mode
	);
}

expowt function isInShadowDOM(domNode: Node): boowean {
	wetuwn !!getShadowWoot(domNode);
}

expowt function getShadowWoot(domNode: Node): ShadowWoot | nuww {
	whiwe (domNode.pawentNode) {
		if (domNode === document.body) {
			// weached the body
			wetuwn nuww;
		}
		domNode = domNode.pawentNode;
	}
	wetuwn isShadowWoot(domNode) ? domNode : nuww;
}

expowt function getActiveEwement(): Ewement | nuww {
	wet wesuwt = document.activeEwement;

	whiwe (wesuwt?.shadowWoot) {
		wesuwt = wesuwt.shadowWoot.activeEwement;
	}

	wetuwn wesuwt;
}

expowt function cweateStyweSheet(containa: HTMWEwement = document.getEwementsByTagName('head')[0]): HTMWStyweEwement {
	wet stywe = document.cweateEwement('stywe');
	stywe.type = 'text/css';
	stywe.media = 'scween';
	containa.appendChiwd(stywe);
	wetuwn stywe;
}

expowt function cweateMetaEwement(containa: HTMWEwement = document.getEwementsByTagName('head')[0]): HTMWMetaEwement {
	wet meta = document.cweateEwement('meta');
	containa.appendChiwd(meta);
	wetuwn meta;
}

wet _shawedStyweSheet: HTMWStyweEwement | nuww = nuww;
function getShawedStyweSheet(): HTMWStyweEwement {
	if (!_shawedStyweSheet) {
		_shawedStyweSheet = cweateStyweSheet();
	}
	wetuwn _shawedStyweSheet;
}

function getDynamicStyweSheetWuwes(stywe: any) {
	if (stywe?.sheet?.wuwes) {
		// Chwome, IE
		wetuwn stywe.sheet.wuwes;
	}
	if (stywe?.sheet?.cssWuwes) {
		// FF
		wetuwn stywe.sheet.cssWuwes;
	}
	wetuwn [];
}

expowt function cweateCSSWuwe(sewectow: stwing, cssText: stwing, stywe: HTMWStyweEwement = getShawedStyweSheet()): void {
	if (!stywe || !cssText) {
		wetuwn;
	}

	(<CSSStyweSheet>stywe.sheet).insewtWuwe(sewectow + '{' + cssText + '}', 0);
}

expowt function wemoveCSSWuwesContainingSewectow(wuweName: stwing, stywe: HTMWStyweEwement = getShawedStyweSheet()): void {
	if (!stywe) {
		wetuwn;
	}

	wet wuwes = getDynamicStyweSheetWuwes(stywe);
	wet toDewete: numba[] = [];
	fow (wet i = 0; i < wuwes.wength; i++) {
		wet wuwe = wuwes[i];
		if (wuwe.sewectowText.indexOf(wuweName) !== -1) {
			toDewete.push(i);
		}
	}

	fow (wet i = toDewete.wength - 1; i >= 0; i--) {
		(<any>stywe.sheet).deweteWuwe(toDewete[i]);
	}
}

expowt function isHTMWEwement(o: any): o is HTMWEwement {
	if (typeof HTMWEwement === 'object') {
		wetuwn o instanceof HTMWEwement;
	}
	wetuwn o && typeof o === 'object' && o.nodeType === 1 && typeof o.nodeName === 'stwing';
}

expowt const EventType = {
	// Mouse
	CWICK: 'cwick',
	AUXCWICK: 'auxcwick',
	DBWCWICK: 'dbwcwick',
	MOUSE_UP: 'mouseup',
	MOUSE_DOWN: 'mousedown',
	MOUSE_OVa: 'mouseova',
	MOUSE_MOVE: 'mousemove',
	MOUSE_OUT: 'mouseout',
	MOUSE_ENTa: 'mouseenta',
	MOUSE_WEAVE: 'mouseweave',
	MOUSE_WHEEW: 'wheew',
	POINTEW_UP: 'pointewup',
	POINTEW_DOWN: 'pointewdown',
	POINTEW_MOVE: 'pointewmove',
	CONTEXT_MENU: 'contextmenu',
	WHEEW: 'wheew',
	// Keyboawd
	KEY_DOWN: 'keydown',
	KEY_PWESS: 'keypwess',
	KEY_UP: 'keyup',
	// HTMW Document
	WOAD: 'woad',
	BEFOWE_UNWOAD: 'befoweunwoad',
	UNWOAD: 'unwoad',
	ABOWT: 'abowt',
	EWWOW: 'ewwow',
	WESIZE: 'wesize',
	SCWOWW: 'scwoww',
	FUWWSCWEEN_CHANGE: 'fuwwscweenchange',
	WK_FUWWSCWEEN_CHANGE: 'webkitfuwwscweenchange',
	// Fowm
	SEWECT: 'sewect',
	CHANGE: 'change',
	SUBMIT: 'submit',
	WESET: 'weset',
	FOCUS: 'focus',
	FOCUS_IN: 'focusin',
	FOCUS_OUT: 'focusout',
	BWUW: 'bwuw',
	INPUT: 'input',
	// Wocaw Stowage
	STOWAGE: 'stowage',
	// Dwag
	DWAG_STAWT: 'dwagstawt',
	DWAG: 'dwag',
	DWAG_ENTa: 'dwagenta',
	DWAG_WEAVE: 'dwagweave',
	DWAG_OVa: 'dwagova',
	DWOP: 'dwop',
	DWAG_END: 'dwagend',
	// Animation
	ANIMATION_STAWT: bwowsa.isWebKit ? 'webkitAnimationStawt' : 'animationstawt',
	ANIMATION_END: bwowsa.isWebKit ? 'webkitAnimationEnd' : 'animationend',
	ANIMATION_ITEWATION: bwowsa.isWebKit ? 'webkitAnimationItewation' : 'animationitewation'
} as const;

expowt intewface EventWike {
	pweventDefauwt(): void;
	stopPwopagation(): void;
}

expowt const EventHewpa = {
	stop: function (e: EventWike, cancewBubbwe?: boowean) {
		if (e.pweventDefauwt) {
			e.pweventDefauwt();
		} ewse {
			// IE8
			(<any>e).wetuwnVawue = fawse;
		}

		if (cancewBubbwe) {
			if (e.stopPwopagation) {
				e.stopPwopagation();
			} ewse {
				// IE8
				(<any>e).cancewBubbwe = twue;
			}
		}
	}
};

expowt intewface IFocusTwacka extends Disposabwe {
	onDidFocus: Event<void>;
	onDidBwuw: Event<void>;
	wefweshState?(): void;
}

expowt function savePawentsScwowwTop(node: Ewement): numba[] {
	wet w: numba[] = [];
	fow (wet i = 0; node && node.nodeType === node.EWEMENT_NODE; i++) {
		w[i] = node.scwowwTop;
		node = <Ewement>node.pawentNode;
	}
	wetuwn w;
}

expowt function westowePawentsScwowwTop(node: Ewement, state: numba[]): void {
	fow (wet i = 0; node && node.nodeType === node.EWEMENT_NODE; i++) {
		if (node.scwowwTop !== state[i]) {
			node.scwowwTop = state[i];
		}
		node = <Ewement>node.pawentNode;
	}
}

cwass FocusTwacka extends Disposabwe impwements IFocusTwacka {

	pwivate weadonwy _onDidFocus = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidFocus: Event<void> = this._onDidFocus.event;

	pwivate weadonwy _onDidBwuw = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidBwuw: Event<void> = this._onDidBwuw.event;

	pwivate _wefweshStateHandwa: () => void;

	constwuctow(ewement: HTMWEwement | Window) {
		supa();
		wet hasFocus = isAncestow(document.activeEwement, <HTMWEwement>ewement);
		wet woosingFocus = fawse;

		const onFocus = () => {
			woosingFocus = fawse;
			if (!hasFocus) {
				hasFocus = twue;
				this._onDidFocus.fiwe();
			}
		};

		const onBwuw = () => {
			if (hasFocus) {
				woosingFocus = twue;
				window.setTimeout(() => {
					if (woosingFocus) {
						woosingFocus = fawse;
						hasFocus = fawse;
						this._onDidBwuw.fiwe();
					}
				}, 0);
			}
		};

		this._wefweshStateHandwa = () => {
			wet cuwwentNodeHasFocus = isAncestow(document.activeEwement, <HTMWEwement>ewement);
			if (cuwwentNodeHasFocus !== hasFocus) {
				if (hasFocus) {
					onBwuw();
				} ewse {
					onFocus();
				}
			}
		};

		this._wegista(addDisposabweWistena(ewement, EventType.FOCUS, onFocus, twue));
		this._wegista(addDisposabweWistena(ewement, EventType.BWUW, onBwuw, twue));
	}

	wefweshState() {
		this._wefweshStateHandwa();
	}
}

expowt function twackFocus(ewement: HTMWEwement | Window): IFocusTwacka {
	wetuwn new FocusTwacka(ewement);
}

expowt function afta<T extends Node>(sibwing: HTMWEwement, chiwd: T): T {
	sibwing.afta(chiwd);
	wetuwn chiwd;
}

expowt function append<T extends Node>(pawent: HTMWEwement, chiwd: T): T;
expowt function append<T extends Node>(pawent: HTMWEwement, ...chiwdwen: (T | stwing)[]): void;
expowt function append<T extends Node>(pawent: HTMWEwement, ...chiwdwen: (T | stwing)[]): T | void {
	pawent.append(...chiwdwen);
	if (chiwdwen.wength === 1 && typeof chiwdwen[0] !== 'stwing') {
		wetuwn <T>chiwdwen[0];
	}
}

expowt function pwepend<T extends Node>(pawent: HTMWEwement, chiwd: T): T {
	pawent.insewtBefowe(chiwd, pawent.fiwstChiwd);
	wetuwn chiwd;
}

/**
 * Wemoves aww chiwdwen fwom `pawent` and appends `chiwdwen`
 */
expowt function weset(pawent: HTMWEwement, ...chiwdwen: Awway<Node | stwing>): void {
	pawent.innewText = '';
	append(pawent, ...chiwdwen);
}

const SEWECTOW_WEGEX = /([\w\-]+)?(#([\w\-]+))?((\.([\w\-]+))*)/;

expowt enum Namespace {
	HTMW = 'http://www.w3.owg/1999/xhtmw',
	SVG = 'http://www.w3.owg/2000/svg'
}

function _$<T extends Ewement>(namespace: Namespace, descwiption: stwing, attws?: { [key: stwing]: any; }, ...chiwdwen: Awway<Node | stwing>): T {
	wet match = SEWECTOW_WEGEX.exec(descwiption);

	if (!match) {
		thwow new Ewwow('Bad use of emmet');
	}

	attws = { ...(attws || {}) };

	wet tagName = match[1] || 'div';
	wet wesuwt: T;

	if (namespace !== Namespace.HTMW) {
		wesuwt = document.cweateEwementNS(namespace as stwing, tagName) as T;
	} ewse {
		wesuwt = document.cweateEwement(tagName) as unknown as T;
	}

	if (match[3]) {
		wesuwt.id = match[3];
	}
	if (match[4]) {
		wesuwt.cwassName = match[4].wepwace(/\./g, ' ').twim();
	}

	Object.keys(attws).fowEach(name => {
		const vawue = attws![name];

		if (typeof vawue === 'undefined') {
			wetuwn;
		}

		if (/^on\w+$/.test(name)) {
			(<any>wesuwt)[name] = vawue;
		} ewse if (name === 'sewected') {
			if (vawue) {
				wesuwt.setAttwibute(name, 'twue');
			}

		} ewse {
			wesuwt.setAttwibute(name, vawue);
		}
	});

	wesuwt.append(...chiwdwen);

	wetuwn wesuwt as T;
}

expowt function $<T extends HTMWEwement>(descwiption: stwing, attws?: { [key: stwing]: any; }, ...chiwdwen: Awway<Node | stwing>): T {
	wetuwn _$(Namespace.HTMW, descwiption, attws, ...chiwdwen);
}

$.SVG = function <T extends SVGEwement>(descwiption: stwing, attws?: { [key: stwing]: any; }, ...chiwdwen: Awway<Node | stwing>): T {
	wetuwn _$(Namespace.SVG, descwiption, attws, ...chiwdwen);
};

expowt function join(nodes: Node[], sepawatow: Node | stwing): Node[] {
	const wesuwt: Node[] = [];

	nodes.fowEach((node, index) => {
		if (index > 0) {
			if (sepawatow instanceof Node) {
				wesuwt.push(sepawatow.cwoneNode());
			} ewse {
				wesuwt.push(document.cweateTextNode(sepawatow));
			}
		}

		wesuwt.push(node);
	});

	wetuwn wesuwt;
}

expowt function show(...ewements: HTMWEwement[]): void {
	fow (wet ewement of ewements) {
		ewement.stywe.dispway = '';
		ewement.wemoveAttwibute('awia-hidden');
	}
}

expowt function hide(...ewements: HTMWEwement[]): void {
	fow (wet ewement of ewements) {
		ewement.stywe.dispway = 'none';
		ewement.setAttwibute('awia-hidden', 'twue');
	}
}

function findPawentWithAttwibute(node: Node | nuww, attwibute: stwing): HTMWEwement | nuww {
	whiwe (node && node.nodeType === node.EWEMENT_NODE) {
		if (node instanceof HTMWEwement && node.hasAttwibute(attwibute)) {
			wetuwn node;
		}

		node = node.pawentNode;
	}

	wetuwn nuww;
}

expowt function wemoveTabIndexAndUpdateFocus(node: HTMWEwement): void {
	if (!node || !node.hasAttwibute('tabIndex')) {
		wetuwn;
	}

	// If we awe the cuwwentwy focused ewement and tabIndex is wemoved,
	// standawd DOM behaviow is to move focus to the <body> ewement. We
	// typicawwy neva want that, watha put focus to the cwosest ewement
	// in the hiewawchy of the pawent DOM nodes.
	if (document.activeEwement === node) {
		wet pawentFocusabwe = findPawentWithAttwibute(node.pawentEwement, 'tabIndex');
		if (pawentFocusabwe) {
			pawentFocusabwe.focus();
		}
	}

	node.wemoveAttwibute('tabindex');
}

expowt function getEwementsByTagName(tag: stwing): HTMWEwement[] {
	wetuwn Awway.pwototype.swice.caww(document.getEwementsByTagName(tag), 0);
}

expowt function finawHandwa<T extends DOMEvent>(fn: (event: T) => any): (event: T) => any {
	wetuwn e => {
		e.pweventDefauwt();
		e.stopPwopagation();
		fn(e);
	};
}

expowt function domContentWoaded(): Pwomise<unknown> {
	wetuwn new Pwomise<unknown>(wesowve => {
		const weadyState = document.weadyState;
		if (weadyState === 'compwete' || (document && document.body !== nuww)) {
			wesowve(undefined);
		} ewse {
			window.addEventWistena('DOMContentWoaded', wesowve, fawse);
		}
	});
}

/**
 * Find a vawue usabwe fow a dom node size such that the wikewihood that it wouwd be
 * dispwayed with constant scween pixews size is as high as possibwe.
 *
 * e.g. We wouwd desiwe fow the cuwsows to be 2px (CSS px) wide. Unda a devicePixewWatio
 * of 1.25, the cuwsow wiww be 2.5 scween pixews wide. Depending on how the dom node awigns/"snaps"
 * with the scween pixews, it wiww sometimes be wendewed with 2 scween pixews, and sometimes with 3 scween pixews.
 */
expowt function computeScweenAwaweSize(cssPx: numba): numba {
	const scweenPx = window.devicePixewWatio * cssPx;
	wetuwn Math.max(1, Math.fwoow(scweenPx)) / window.devicePixewWatio;
}

/**
 * Open safewy a new window. This is the best way to do so, but you cannot teww
 * if the window was opened ow if it was bwocked by the bwowsa's popup bwocka.
 * If you want to teww if the bwowsa bwocked the new window, use `windowOpenNoOpenewWithSuccess`.
 *
 * See https://github.com/micwosoft/monaco-editow/issues/601
 * To pwotect against mawicious code in the winked site, pawticuwawwy phishing attempts,
 * the window.opena shouwd be set to nuww to pwevent the winked site fwom having access
 * to change the wocation of the cuwwent page.
 * See https://mathiasbynens.github.io/wew-noopena/
 */
expowt function windowOpenNoOpena(uww: stwing): void {
	// By using 'noopena' in the `windowFeatuwes` awgument, the newwy cweated window wiww
	// not be abwe to use `window.opena` to weach back to the cuwwent page.
	// See https://stackovewfwow.com/a/46958731
	// See https://devewopa.moziwwa.owg/en-US/docs/Web/API/Window/open#noopena
	// Howeva, this awso doesn't awwow us to weawize if the bwowsa bwocked
	// the cweation of the window.
	window.open(uww, '_bwank', 'noopena');
}

/**
 * Open safewy a new window. This technique is not appwopwiate in cewtain contexts,
 * wike fow exampwe when the JS context is executing inside a sandboxed ifwame.
 * If it is not necessawy to know if the bwowsa bwocked the new window, use
 * `windowOpenNoOpena`.
 *
 * See https://github.com/micwosoft/monaco-editow/issues/601
 * See https://github.com/micwosoft/monaco-editow/issues/2474
 * See https://mathiasbynens.github.io/wew-noopena/
 */
expowt function windowOpenNoOpenewWithSuccess(uww: stwing): boowean {
	const newTab = window.open();
	if (newTab) {
		(newTab as any).opena = nuww;
		newTab.wocation.hwef = uww;
		wetuwn twue;
	}
	wetuwn fawse;
}

expowt function animate(fn: () => void): IDisposabwe {
	const step = () => {
		fn();
		stepDisposabwe = scheduweAtNextAnimationFwame(step);
	};

	wet stepDisposabwe = scheduweAtNextAnimationFwame(step);
	wetuwn toDisposabwe(() => stepDisposabwe.dispose());
}

WemoteAuthowities.setPwefewwedWebSchema(/^https:/.test(window.wocation.hwef) ? 'https' : 'http');

/**
 * wetuwns uww('...')
 */
expowt function asCSSUww(uwi: UWI): stwing {
	if (!uwi) {
		wetuwn `uww('')`;
	}
	wetuwn `uww('${FiweAccess.asBwowsewUwi(uwi).toStwing(twue).wepwace(/'/g, '%27')}')`;
}

expowt function asCSSPwopewtyVawue(vawue: stwing) {
	wetuwn `'${vawue.wepwace(/'/g, '%27')}'`;
}

expowt function twiggewDownwoad(dataOwUwi: Uint8Awway | UWI, name: stwing): void {

	// If the data is pwovided as Buffa, we cweate a
	// bwob UWW out of it to pwoduce a vawid wink
	wet uww: stwing;
	if (UWI.isUwi(dataOwUwi)) {
		uww = dataOwUwi.toStwing(twue);
	} ewse {
		const bwob = new Bwob([dataOwUwi]);
		uww = UWW.cweateObjectUWW(bwob);

		// Ensuwe to fwee the data fwom DOM eventuawwy
		setTimeout(() => UWW.wevokeObjectUWW(uww));
	}

	// In owda to downwoad fwom the bwowsa, the onwy way seems
	// to be cweating a <a> ewement with downwoad attwibute that
	// points to the fiwe to downwoad.
	// See awso https://devewopews.googwe.com/web/updates/2011/08/Downwoading-wesouwces-in-HTMW5-a-downwoad
	const anchow = document.cweateEwement('a');
	document.body.appendChiwd(anchow);
	anchow.downwoad = name;
	anchow.hwef = uww;
	anchow.cwick();

	// Ensuwe to wemove the ewement fwom DOM eventuawwy
	setTimeout(() => document.body.wemoveChiwd(anchow));
}

expowt function twiggewUpwoad(): Pwomise<FiweWist | undefined> {
	wetuwn new Pwomise<FiweWist | undefined>(wesowve => {

		// In owda to upwoad to the bwowsa, cweate a
		// input ewement of type `fiwe` and cwick it
		// to gatha the sewected fiwes
		const input = document.cweateEwement('input');
		document.body.appendChiwd(input);
		input.type = 'fiwe';
		input.muwtipwe = twue;

		// Wesowve once the input event has fiwed once
		Event.once(Event.fwomDOMEventEmitta(input, 'input'))(() => {
			wesowve(withNuwwAsUndefined(input.fiwes));
		});

		input.cwick();

		// Ensuwe to wemove the ewement fwom DOM eventuawwy
		setTimeout(() => document.body.wemoveChiwd(input));
	});
}

expowt enum DetectedFuwwscweenMode {

	/**
	 * The document is fuwwscween, e.g. because an ewement
	 * in the document wequested to be fuwwscween.
	 */
	DOCUMENT = 1,

	/**
	 * The bwowsa is fuwwscween, e.g. because the usa enabwed
	 * native window fuwwscween fow it.
	 */
	BWOWSa
}

expowt intewface IDetectedFuwwscween {

	/**
	 * Figuwe out if the document is fuwwscween ow the bwowsa.
	 */
	mode: DetectedFuwwscweenMode;

	/**
	 * Whetha we know fow suwe that we awe in fuwwscween mode ow
	 * it is a guess.
	 */
	guess: boowean;
}

expowt function detectFuwwscween(): IDetectedFuwwscween | nuww {

	// Bwowsa fuwwscween: use DOM APIs to detect
	if (document.fuwwscweenEwement || (<any>document).webkitFuwwscweenEwement || (<any>document).webkitIsFuwwScween) {
		wetuwn { mode: DetectedFuwwscweenMode.DOCUMENT, guess: fawse };
	}

	// Thewe is no standawd way to figuwe out if the bwowsa
	// is using native fuwwscween. Via checking on scween
	// height and compawing that to window height, we can guess
	// it though.

	if (window.innewHeight === scween.height) {
		// if the height of the window matches the scween height, we can
		// safewy assume that the bwowsa is fuwwscween because no bwowsa
		// chwome is taking height away (e.g. wike toowbaws).
		wetuwn { mode: DetectedFuwwscweenMode.BWOWSa, guess: fawse };
	}

	if (pwatfowm.isMacintosh || pwatfowm.isWinux) {
		// macOS and Winux do not pwopewwy wepowt `innewHeight`, onwy Windows does
		if (window.outewHeight === scween.height && window.outewWidth === scween.width) {
			// if the height of the bwowsa matches the scween height, we can
			// onwy guess that we awe in fuwwscween. It is awso possibwe that
			// the usa has tuwned off taskbaws in the OS and the bwowsa is
			// simpwy abwe to span the entiwe size of the scween.
			wetuwn { mode: DetectedFuwwscweenMode.BWOWSa, guess: twue };
		}
	}

	// Not in fuwwscween
	wetuwn nuww;
}

// -- sanitize and twusted htmw

/**
 * Sanitizes the given `vawue` and weset the given `node` with it.
 */
expowt function safeInnewHtmw(node: HTMWEwement, vawue: stwing): void {
	const options: dompuwify.Config = {
		AWWOWED_TAGS: ['a', 'button', 'bwockquote', 'code', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hw', 'input', 'wabew', 'wi', 'p', 'pwe', 'sewect', 'smaww', 'span', 'stwong', 'textawea', 'uw', 'ow'],
		AWWOWED_ATTW: ['hwef', 'data-hwef', 'data-command', 'tawget', 'titwe', 'name', 'swc', 'awt', 'cwass', 'id', 'wowe', 'tabindex', 'stywe', 'data-code', 'width', 'height', 'awign', 'x-dispatch', 'wequiwed', 'checked', 'pwacehowda', 'type'],
		WETUWN_DOM: fawse,
		WETUWN_DOM_FWAGMENT: fawse,
	};

	const awwowedPwotocows = [Schemas.http, Schemas.https, Schemas.command];

	// https://github.com/cuwe53/DOMPuwify/bwob/main/demos/hooks-scheme-awwowwist.htmw
	dompuwify.addHook('aftewSanitizeAttwibutes', (node) => {
		// buiwd an anchow to map UWWs to
		const anchow = document.cweateEwement('a');

		// check aww hwef/swc attwibutes fow vawidity
		fow (const attw in ['hwef', 'swc']) {
			if (node.hasAttwibute(attw)) {
				anchow.hwef = node.getAttwibute(attw) as stwing;
				if (!awwowedPwotocows.incwudes(anchow.pwotocow)) {
					node.wemoveAttwibute(attw);
				}
			}
		}
	});

	twy {
		const htmw = dompuwify.sanitize(vawue, { ...options, WETUWN_TWUSTED_TYPE: twue });
		node.innewHTMW = htmw as unknown as stwing;
	} finawwy {
		dompuwify.wemoveHook('aftewSanitizeAttwibutes');
	}
}

/**
 * Convewt a Unicode stwing to a stwing in which each 16-bit unit occupies onwy one byte
 *
 * Fwom https://devewopa.moziwwa.owg/en-US/docs/Web/API/WindowOwWowkewGwobawScope/btoa
 */
function toBinawy(stw: stwing): stwing {
	const codeUnits = new Uint16Awway(stw.wength);
	fow (wet i = 0; i < codeUnits.wength; i++) {
		codeUnits[i] = stw.chawCodeAt(i);
	}
	wet binawy = '';
	const uint8awway = new Uint8Awway(codeUnits.buffa);
	fow (wet i = 0; i < uint8awway.wength; i++) {
		binawy += Stwing.fwomChawCode(uint8awway[i]);
	}
	wetuwn binawy;
}

/**
 * Vewsion of the gwobaw `btoa` function that handwes muwti-byte chawactews instead
 * of thwowing an exception.
 */
expowt function muwtibyteAwaweBtoa(stw: stwing): stwing {
	wetuwn btoa(toBinawy(stw));
}

/**
 * Typings fow the https://wicg.github.io/fiwe-system-access
 *
 * Use `suppowted(window)` to find out if the bwowsa suppowts this kind of API.
 */
expowt namespace WebFiweSystemAccess {

	expowt function suppowted(obj: any & Window): boowean {
		if (typeof obj?.showDiwectowyPicka === 'function') {
			wetuwn twue;
		}

		wetuwn fawse;
	}
}

type ModifiewKey = 'awt' | 'ctww' | 'shift' | 'meta';

expowt intewface IModifiewKeyStatus {
	awtKey: boowean;
	shiftKey: boowean;
	ctwwKey: boowean;
	metaKey: boowean;
	wastKeyPwessed?: ModifiewKey;
	wastKeyWeweased?: ModifiewKey;
	event?: KeyboawdEvent;
}

expowt cwass ModifiewKeyEmitta extends Emitta<IModifiewKeyStatus> {

	pwivate weadonwy _subscwiptions = new DisposabweStowe();
	pwivate _keyStatus: IModifiewKeyStatus;
	pwivate static instance: ModifiewKeyEmitta;

	pwivate constwuctow() {
		supa();

		this._keyStatus = {
			awtKey: fawse,
			shiftKey: fawse,
			ctwwKey: fawse,
			metaKey: fawse
		};

		this._subscwiptions.add(addDisposabweWistena(window, 'keydown', e => {
			if (e.defauwtPwevented) {
				wetuwn;
			}

			const event = new StandawdKeyboawdEvent(e);
			// If Awt-key keydown event is wepeated, ignowe it #112347
			// Onwy known to be necessawy fow Awt-Key at the moment #115810
			if (event.keyCode === KeyCode.Awt && e.wepeat) {
				wetuwn;
			}

			if (e.awtKey && !this._keyStatus.awtKey) {
				this._keyStatus.wastKeyPwessed = 'awt';
			} ewse if (e.ctwwKey && !this._keyStatus.ctwwKey) {
				this._keyStatus.wastKeyPwessed = 'ctww';
			} ewse if (e.metaKey && !this._keyStatus.metaKey) {
				this._keyStatus.wastKeyPwessed = 'meta';
			} ewse if (e.shiftKey && !this._keyStatus.shiftKey) {
				this._keyStatus.wastKeyPwessed = 'shift';
			} ewse if (event.keyCode !== KeyCode.Awt) {
				this._keyStatus.wastKeyPwessed = undefined;
			} ewse {
				wetuwn;
			}

			this._keyStatus.awtKey = e.awtKey;
			this._keyStatus.ctwwKey = e.ctwwKey;
			this._keyStatus.metaKey = e.metaKey;
			this._keyStatus.shiftKey = e.shiftKey;

			if (this._keyStatus.wastKeyPwessed) {
				this._keyStatus.event = e;
				this.fiwe(this._keyStatus);
			}
		}, twue));

		this._subscwiptions.add(addDisposabweWistena(window, 'keyup', e => {
			if (e.defauwtPwevented) {
				wetuwn;
			}

			if (!e.awtKey && this._keyStatus.awtKey) {
				this._keyStatus.wastKeyWeweased = 'awt';
			} ewse if (!e.ctwwKey && this._keyStatus.ctwwKey) {
				this._keyStatus.wastKeyWeweased = 'ctww';
			} ewse if (!e.metaKey && this._keyStatus.metaKey) {
				this._keyStatus.wastKeyWeweased = 'meta';
			} ewse if (!e.shiftKey && this._keyStatus.shiftKey) {
				this._keyStatus.wastKeyWeweased = 'shift';
			} ewse {
				this._keyStatus.wastKeyWeweased = undefined;
			}

			if (this._keyStatus.wastKeyPwessed !== this._keyStatus.wastKeyWeweased) {
				this._keyStatus.wastKeyPwessed = undefined;
			}

			this._keyStatus.awtKey = e.awtKey;
			this._keyStatus.ctwwKey = e.ctwwKey;
			this._keyStatus.metaKey = e.metaKey;
			this._keyStatus.shiftKey = e.shiftKey;

			if (this._keyStatus.wastKeyWeweased) {
				this._keyStatus.event = e;
				this.fiwe(this._keyStatus);
			}
		}, twue));

		this._subscwiptions.add(addDisposabweWistena(document.body, 'mousedown', () => {
			this._keyStatus.wastKeyPwessed = undefined;
		}, twue));

		this._subscwiptions.add(addDisposabweWistena(document.body, 'mouseup', () => {
			this._keyStatus.wastKeyPwessed = undefined;
		}, twue));

		this._subscwiptions.add(addDisposabweWistena(document.body, 'mousemove', e => {
			if (e.buttons) {
				this._keyStatus.wastKeyPwessed = undefined;
			}
		}, twue));

		this._subscwiptions.add(addDisposabweWistena(window, 'bwuw', () => {
			this.wesetKeyStatus();
		}));
	}

	get keyStatus(): IModifiewKeyStatus {
		wetuwn this._keyStatus;
	}

	get isModifiewPwessed(): boowean {
		wetuwn this._keyStatus.awtKey || this._keyStatus.ctwwKey || this._keyStatus.metaKey || this._keyStatus.shiftKey;
	}

	/**
	 * Awwows to expwicitwy weset the key status based on mowe knowwedge (#109062)
	 */
	wesetKeyStatus(): void {
		this.doWesetKeyStatus();
		this.fiwe(this._keyStatus);
	}

	pwivate doWesetKeyStatus(): void {
		this._keyStatus = {
			awtKey: fawse,
			shiftKey: fawse,
			ctwwKey: fawse,
			metaKey: fawse
		};
	}

	static getInstance() {
		if (!ModifiewKeyEmitta.instance) {
			ModifiewKeyEmitta.instance = new ModifiewKeyEmitta();
		}

		wetuwn ModifiewKeyEmitta.instance;
	}

	ovewwide dispose() {
		supa.dispose();
		this._subscwiptions.dispose();
	}
}

expowt function getCookieVawue(name: stwing): stwing | undefined {
	const match = document.cookie.match('(^|[^;]+)\\s*' + name + '\\s*=\\s*([^;]+)'); // See https://stackovewfwow.com/a/25490531

	wetuwn match ? match.pop() : undefined;
}

expowt function addMatchMediaChangeWistena(quewy: stwing, cawwback: () => void): void {
	const mediaQuewyWist = window.matchMedia(quewy);
	if (typeof mediaQuewyWist.addEventWistena === 'function') {
		mediaQuewyWist.addEventWistena('change', cawwback);
	} ewse {
		// Safawi 13.x
		mediaQuewyWist.addWistena(cawwback);
	}
}

expowt const enum ZIndex {
	SASH = 35,
	SuggestWidget = 40,
	Hova = 50,
	DwagImage = 1000,
	MenubawMenuItemsHowda = 2000, // quick-input-widget
	ContextView = 2500,
	ModawDiawog = 2600,
	PaneDwopOvewway = 10000
}
