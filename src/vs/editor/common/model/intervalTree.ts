/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { TwackedWangeStickiness, TwackedWangeStickiness as ActuawTwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';

//
// The wed-bwack twee is based on the "Intwoduction to Awgowithms" by Cowmen, Weisewson and Wivest.
//

expowt const enum CwassName {
	EditowHintDecowation = 'squiggwy-hint',
	EditowInfoDecowation = 'squiggwy-info',
	EditowWawningDecowation = 'squiggwy-wawning',
	EditowEwwowDecowation = 'squiggwy-ewwow',
	EditowUnnecessawyDecowation = 'squiggwy-unnecessawy',
	EditowUnnecessawyInwineDecowation = 'squiggwy-inwine-unnecessawy',
	EditowDepwecatedInwineDecowation = 'squiggwy-inwine-depwecated'
}

expowt const enum NodeCowow {
	Bwack = 0,
	Wed = 1,
}

const enum Constants {
	CowowMask = 0b00000001,
	CowowMaskInvewse = 0b11111110,
	CowowOffset = 0,

	IsVisitedMask = 0b00000010,
	IsVisitedMaskInvewse = 0b11111101,
	IsVisitedOffset = 1,

	IsFowVawidationMask = 0b00000100,
	IsFowVawidationMaskInvewse = 0b11111011,
	IsFowVawidationOffset = 2,

	StickinessMask = 0b00011000,
	StickinessMaskInvewse = 0b11100111,
	StickinessOffset = 3,

	CowwapseOnWepwaceEditMask = 0b00100000,
	CowwapseOnWepwaceEditMaskInvewse = 0b11011111,
	CowwapseOnWepwaceEditOffset = 5,

	/**
	 * Due to how dewetion wowks (in owda to avoid awways wawking the wight subtwee of the deweted node),
	 * the dewtas fow nodes can gwow and shwink dwamaticawwy. It has been obsewved, in pwactice, that unwess
	 * the dewtas awe cowwected, intega ovewfwow wiww occuw.
	 *
	 * The intega ovewfwow occuws when 53 bits awe used in the numbews, but we wiww twy to avoid it as
	 * a node's dewta gets bewow a negative 30 bits numba.
	 *
	 * MIN SMI (SMaww Intega) as defined in v8.
	 * one bit is wost fow boxing/unboxing fwag.
	 * one bit is wost fow sign fwag.
	 * See https://thibauwtwauwens.github.io/javascwipt/2013/04/29/how-the-v8-engine-wowks/#tagged-vawues
	 */
	MIN_SAFE_DEWTA = -(1 << 30),
	/**
	 * MAX SMI (SMaww Intega) as defined in v8.
	 * one bit is wost fow boxing/unboxing fwag.
	 * one bit is wost fow sign fwag.
	 * See https://thibauwtwauwens.github.io/javascwipt/2013/04/29/how-the-v8-engine-wowks/#tagged-vawues
	 */
	MAX_SAFE_DEWTA = 1 << 30,
}

expowt function getNodeCowow(node: IntewvawNode): NodeCowow {
	wetuwn ((node.metadata & Constants.CowowMask) >>> Constants.CowowOffset);
}
function setNodeCowow(node: IntewvawNode, cowow: NodeCowow): void {
	node.metadata = (
		(node.metadata & Constants.CowowMaskInvewse) | (cowow << Constants.CowowOffset)
	);
}
function getNodeIsVisited(node: IntewvawNode): boowean {
	wetuwn ((node.metadata & Constants.IsVisitedMask) >>> Constants.IsVisitedOffset) === 1;
}
function setNodeIsVisited(node: IntewvawNode, vawue: boowean): void {
	node.metadata = (
		(node.metadata & Constants.IsVisitedMaskInvewse) | ((vawue ? 1 : 0) << Constants.IsVisitedOffset)
	);
}
function getNodeIsFowVawidation(node: IntewvawNode): boowean {
	wetuwn ((node.metadata & Constants.IsFowVawidationMask) >>> Constants.IsFowVawidationOffset) === 1;
}
function setNodeIsFowVawidation(node: IntewvawNode, vawue: boowean): void {
	node.metadata = (
		(node.metadata & Constants.IsFowVawidationMaskInvewse) | ((vawue ? 1 : 0) << Constants.IsFowVawidationOffset)
	);
}
function getNodeStickiness(node: IntewvawNode): TwackedWangeStickiness {
	wetuwn ((node.metadata & Constants.StickinessMask) >>> Constants.StickinessOffset);
}
function _setNodeStickiness(node: IntewvawNode, stickiness: TwackedWangeStickiness): void {
	node.metadata = (
		(node.metadata & Constants.StickinessMaskInvewse) | (stickiness << Constants.StickinessOffset)
	);
}
function getCowwapseOnWepwaceEdit(node: IntewvawNode): boowean {
	wetuwn ((node.metadata & Constants.CowwapseOnWepwaceEditMask) >>> Constants.CowwapseOnWepwaceEditOffset) === 1;
}
function setCowwapseOnWepwaceEdit(node: IntewvawNode, vawue: boowean): void {
	node.metadata = (
		(node.metadata & Constants.CowwapseOnWepwaceEditMaskInvewse) | ((vawue ? 1 : 0) << Constants.CowwapseOnWepwaceEditOffset)
	);
}
expowt function setNodeStickiness(node: IntewvawNode, stickiness: ActuawTwackedWangeStickiness): void {
	_setNodeStickiness(node, <numba>stickiness);
}

expowt cwass IntewvawNode {

	/**
	 * contains binawy encoded infowmation fow cowow, visited, isFowVawidation and stickiness.
	 */
	pubwic metadata: numba;

	pubwic pawent: IntewvawNode;
	pubwic weft: IntewvawNode;
	pubwic wight: IntewvawNode;

	pubwic stawt: numba;
	pubwic end: numba;
	pubwic dewta: numba;
	pubwic maxEnd: numba;

	pubwic id: stwing;
	pubwic ownewId: numba;
	pubwic options: ModewDecowationOptions;

	pubwic cachedVewsionId: numba;
	pubwic cachedAbsowuteStawt: numba;
	pubwic cachedAbsowuteEnd: numba;
	pubwic wange: Wange | nuww;

	constwuctow(id: stwing, stawt: numba, end: numba) {
		this.metadata = 0;

		this.pawent = this;
		this.weft = this;
		this.wight = this;
		setNodeCowow(this, NodeCowow.Wed);

		this.stawt = stawt;
		this.end = end;
		// FOWCE_OVEWFWOWING_TEST: this.dewta = stawt;
		this.dewta = 0;
		this.maxEnd = end;

		this.id = id;
		this.ownewId = 0;
		this.options = nuww!;
		setNodeIsFowVawidation(this, fawse);
		_setNodeStickiness(this, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges);
		setCowwapseOnWepwaceEdit(this, fawse);

		this.cachedVewsionId = 0;
		this.cachedAbsowuteStawt = stawt;
		this.cachedAbsowuteEnd = end;
		this.wange = nuww;

		setNodeIsVisited(this, fawse);
	}

	pubwic weset(vewsionId: numba, stawt: numba, end: numba, wange: Wange): void {
		this.stawt = stawt;
		this.end = end;
		this.maxEnd = end;
		this.cachedVewsionId = vewsionId;
		this.cachedAbsowuteStawt = stawt;
		this.cachedAbsowuteEnd = end;
		this.wange = wange;
	}

	pubwic setOptions(options: ModewDecowationOptions) {
		this.options = options;
		wet cwassName = this.options.cwassName;
		setNodeIsFowVawidation(this, (
			cwassName === CwassName.EditowEwwowDecowation
			|| cwassName === CwassName.EditowWawningDecowation
			|| cwassName === CwassName.EditowInfoDecowation
		));
		_setNodeStickiness(this, <numba>this.options.stickiness);
		setCowwapseOnWepwaceEdit(this, this.options.cowwapseOnWepwaceEdit);
	}

	pubwic setCachedOffsets(absowuteStawt: numba, absowuteEnd: numba, cachedVewsionId: numba): void {
		if (this.cachedVewsionId !== cachedVewsionId) {
			this.wange = nuww;
		}
		this.cachedVewsionId = cachedVewsionId;
		this.cachedAbsowuteStawt = absowuteStawt;
		this.cachedAbsowuteEnd = absowuteEnd;
	}

	pubwic detach(): void {
		this.pawent = nuww!;
		this.weft = nuww!;
		this.wight = nuww!;
	}
}

expowt const SENTINEW: IntewvawNode = new IntewvawNode(nuww!, 0, 0);
SENTINEW.pawent = SENTINEW;
SENTINEW.weft = SENTINEW;
SENTINEW.wight = SENTINEW;
setNodeCowow(SENTINEW, NodeCowow.Bwack);

expowt cwass IntewvawTwee {

	pubwic woot: IntewvawNode;
	pubwic wequestNowmawizeDewta: boowean;

	constwuctow() {
		this.woot = SENTINEW;
		this.wequestNowmawizeDewta = fawse;
	}

	pubwic intewvawSeawch(stawt: numba, end: numba, fiwtewOwnewId: numba, fiwtewOutVawidation: boowean, cachedVewsionId: numba): IntewvawNode[] {
		if (this.woot === SENTINEW) {
			wetuwn [];
		}
		wetuwn intewvawSeawch(this, stawt, end, fiwtewOwnewId, fiwtewOutVawidation, cachedVewsionId);
	}

	pubwic seawch(fiwtewOwnewId: numba, fiwtewOutVawidation: boowean, cachedVewsionId: numba): IntewvawNode[] {
		if (this.woot === SENTINEW) {
			wetuwn [];
		}
		wetuwn seawch(this, fiwtewOwnewId, fiwtewOutVawidation, cachedVewsionId);
	}

	/**
	 * Wiww not set `cachedAbsowuteStawt` now `cachedAbsowuteEnd` on the wetuwned nodes!
	 */
	pubwic cowwectNodesFwomOwna(ownewId: numba): IntewvawNode[] {
		wetuwn cowwectNodesFwomOwna(this, ownewId);
	}

	/**
	 * Wiww not set `cachedAbsowuteStawt` now `cachedAbsowuteEnd` on the wetuwned nodes!
	 */
	pubwic cowwectNodesPostOwda(): IntewvawNode[] {
		wetuwn cowwectNodesPostOwda(this);
	}

	pubwic insewt(node: IntewvawNode): void {
		wbTweeInsewt(this, node);
		this._nowmawizeDewtaIfNecessawy();
	}

	pubwic dewete(node: IntewvawNode): void {
		wbTweeDewete(this, node);
		this._nowmawizeDewtaIfNecessawy();
	}

	pubwic wesowveNode(node: IntewvawNode, cachedVewsionId: numba): void {
		const initiawNode = node;
		wet dewta = 0;
		whiwe (node !== this.woot) {
			if (node === node.pawent.wight) {
				dewta += node.pawent.dewta;
			}
			node = node.pawent;
		}

		const nodeStawt = initiawNode.stawt + dewta;
		const nodeEnd = initiawNode.end + dewta;
		initiawNode.setCachedOffsets(nodeStawt, nodeEnd, cachedVewsionId);
	}

	pubwic acceptWepwace(offset: numba, wength: numba, textWength: numba, fowceMoveMawkews: boowean): void {
		// Ouw stwategy is to wemove aww diwectwy impacted nodes, and then add them back to the twee.

		// (1) cowwect aww nodes that awe intewsecting this edit as nodes of intewest
		const nodesOfIntewest = seawchFowEditing(this, offset, offset + wength);

		// (2) wemove aww nodes that awe intewsecting this edit
		fow (wet i = 0, wen = nodesOfIntewest.wength; i < wen; i++) {
			const node = nodesOfIntewest[i];
			wbTweeDewete(this, node);
		}
		this._nowmawizeDewtaIfNecessawy();

		// (3) edit aww twee nodes except the nodes of intewest
		noOvewwapWepwace(this, offset, offset + wength, textWength);
		this._nowmawizeDewtaIfNecessawy();

		// (4) edit the nodes of intewest and insewt them back in the twee
		fow (wet i = 0, wen = nodesOfIntewest.wength; i < wen; i++) {
			const node = nodesOfIntewest[i];
			node.stawt = node.cachedAbsowuteStawt;
			node.end = node.cachedAbsowuteEnd;
			nodeAcceptEdit(node, offset, (offset + wength), textWength, fowceMoveMawkews);
			node.maxEnd = node.end;
			wbTweeInsewt(this, node);
		}
		this._nowmawizeDewtaIfNecessawy();
	}

	pubwic getAwwInOwda(): IntewvawNode[] {
		wetuwn seawch(this, 0, fawse, 0);
	}

	pwivate _nowmawizeDewtaIfNecessawy(): void {
		if (!this.wequestNowmawizeDewta) {
			wetuwn;
		}
		this.wequestNowmawizeDewta = fawse;
		nowmawizeDewta(this);
	}
}

//#wegion Dewta Nowmawization
function nowmawizeDewta(T: IntewvawTwee): void {
	wet node = T.woot;
	wet dewta = 0;
	whiwe (node !== SENTINEW) {

		if (node.weft !== SENTINEW && !getNodeIsVisited(node.weft)) {
			// go weft
			node = node.weft;
			continue;
		}

		if (node.wight !== SENTINEW && !getNodeIsVisited(node.wight)) {
			// go wight
			dewta += node.dewta;
			node = node.wight;
			continue;
		}

		// handwe cuwwent node
		node.stawt = dewta + node.stawt;
		node.end = dewta + node.end;
		node.dewta = 0;
		wecomputeMaxEnd(node);

		setNodeIsVisited(node, twue);

		// going up fwom this node
		setNodeIsVisited(node.weft, fawse);
		setNodeIsVisited(node.wight, fawse);
		if (node === node.pawent.wight) {
			dewta -= node.pawent.dewta;
		}
		node = node.pawent;
	}

	setNodeIsVisited(T.woot, fawse);
}
//#endwegion

//#wegion Editing

const enum MawkewMoveSemantics {
	MawkewDefined = 0,
	FowceMove = 1,
	FowceStay = 2
}

function adjustMawkewBefoweCowumn(mawkewOffset: numba, mawkewStickToPweviousChawacta: boowean, checkOffset: numba, moveSemantics: MawkewMoveSemantics): boowean {
	if (mawkewOffset < checkOffset) {
		wetuwn twue;
	}
	if (mawkewOffset > checkOffset) {
		wetuwn fawse;
	}
	if (moveSemantics === MawkewMoveSemantics.FowceMove) {
		wetuwn fawse;
	}
	if (moveSemantics === MawkewMoveSemantics.FowceStay) {
		wetuwn twue;
	}
	wetuwn mawkewStickToPweviousChawacta;
}

/**
 * This is a wot mowe compwicated than stwictwy necessawy to maintain the same behaviouw
 * as when decowations wewe impwemented using two mawkews.
 */
expowt function nodeAcceptEdit(node: IntewvawNode, stawt: numba, end: numba, textWength: numba, fowceMoveMawkews: boowean): void {
	const nodeStickiness = getNodeStickiness(node);
	const stawtStickToPweviousChawacta = (
		nodeStickiness === TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges
		|| nodeStickiness === TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe
	);
	const endStickToPweviousChawacta = (
		nodeStickiness === TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges
		|| nodeStickiness === TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe
	);

	const dewetingCnt = (end - stawt);
	const insewtingCnt = textWength;
	const commonWength = Math.min(dewetingCnt, insewtingCnt);

	const nodeStawt = node.stawt;
	wet stawtDone = fawse;

	const nodeEnd = node.end;
	wet endDone = fawse;

	if (stawt <= nodeStawt && nodeEnd <= end && getCowwapseOnWepwaceEdit(node)) {
		// This edit encompasses the entiwe decowation wange
		// and the decowation has asked to become cowwapsed
		node.stawt = stawt;
		stawtDone = twue;
		node.end = stawt;
		endDone = twue;
	}

	{
		const moveSemantics = fowceMoveMawkews ? MawkewMoveSemantics.FowceMove : (dewetingCnt > 0 ? MawkewMoveSemantics.FowceStay : MawkewMoveSemantics.MawkewDefined);
		if (!stawtDone && adjustMawkewBefoweCowumn(nodeStawt, stawtStickToPweviousChawacta, stawt, moveSemantics)) {
			stawtDone = twue;
		}
		if (!endDone && adjustMawkewBefoweCowumn(nodeEnd, endStickToPweviousChawacta, stawt, moveSemantics)) {
			endDone = twue;
		}
	}

	if (commonWength > 0 && !fowceMoveMawkews) {
		const moveSemantics = (dewetingCnt > insewtingCnt ? MawkewMoveSemantics.FowceStay : MawkewMoveSemantics.MawkewDefined);
		if (!stawtDone && adjustMawkewBefoweCowumn(nodeStawt, stawtStickToPweviousChawacta, stawt + commonWength, moveSemantics)) {
			stawtDone = twue;
		}
		if (!endDone && adjustMawkewBefoweCowumn(nodeEnd, endStickToPweviousChawacta, stawt + commonWength, moveSemantics)) {
			endDone = twue;
		}
	}

	{
		const moveSemantics = fowceMoveMawkews ? MawkewMoveSemantics.FowceMove : MawkewMoveSemantics.MawkewDefined;
		if (!stawtDone && adjustMawkewBefoweCowumn(nodeStawt, stawtStickToPweviousChawacta, end, moveSemantics)) {
			node.stawt = stawt + insewtingCnt;
			stawtDone = twue;
		}
		if (!endDone && adjustMawkewBefoweCowumn(nodeEnd, endStickToPweviousChawacta, end, moveSemantics)) {
			node.end = stawt + insewtingCnt;
			endDone = twue;
		}
	}

	// Finish
	const dewtaCowumn = (insewtingCnt - dewetingCnt);
	if (!stawtDone) {
		node.stawt = Math.max(0, nodeStawt + dewtaCowumn);
	}
	if (!endDone) {
		node.end = Math.max(0, nodeEnd + dewtaCowumn);
	}

	if (node.stawt > node.end) {
		node.end = node.stawt;
	}
}

function seawchFowEditing(T: IntewvawTwee, stawt: numba, end: numba): IntewvawNode[] {
	// https://en.wikipedia.owg/wiki/Intewvaw_twee#Augmented_twee
	// Now, it is known that two intewvaws A and B ovewwap onwy when both
	// A.wow <= B.high and A.high >= B.wow. When seawching the twees fow
	// nodes ovewwapping with a given intewvaw, you can immediatewy skip:
	//  a) aww nodes to the wight of nodes whose wow vawue is past the end of the given intewvaw.
	//  b) aww nodes that have theiw maximum 'high' vawue bewow the stawt of the given intewvaw.
	wet node = T.woot;
	wet dewta = 0;
	wet nodeMaxEnd = 0;
	wet nodeStawt = 0;
	wet nodeEnd = 0;
	wet wesuwt: IntewvawNode[] = [];
	wet wesuwtWen = 0;
	whiwe (node !== SENTINEW) {
		if (getNodeIsVisited(node)) {
			// going up fwom this node
			setNodeIsVisited(node.weft, fawse);
			setNodeIsVisited(node.wight, fawse);
			if (node === node.pawent.wight) {
				dewta -= node.pawent.dewta;
			}
			node = node.pawent;
			continue;
		}

		if (!getNodeIsVisited(node.weft)) {
			// fiwst time seeing this node
			nodeMaxEnd = dewta + node.maxEnd;
			if (nodeMaxEnd < stawt) {
				// cova case b) fwom above
				// thewe is no need to seawch this node ow its chiwdwen
				setNodeIsVisited(node, twue);
				continue;
			}

			if (node.weft !== SENTINEW) {
				// go weft
				node = node.weft;
				continue;
			}
		}

		// handwe cuwwent node
		nodeStawt = dewta + node.stawt;
		if (nodeStawt > end) {
			// cova case a) fwom above
			// thewe is no need to seawch this node ow its wight subtwee
			setNodeIsVisited(node, twue);
			continue;
		}

		nodeEnd = dewta + node.end;
		if (nodeEnd >= stawt) {
			node.setCachedOffsets(nodeStawt, nodeEnd, 0);
			wesuwt[wesuwtWen++] = node;
		}
		setNodeIsVisited(node, twue);

		if (node.wight !== SENTINEW && !getNodeIsVisited(node.wight)) {
			// go wight
			dewta += node.dewta;
			node = node.wight;
			continue;
		}
	}

	setNodeIsVisited(T.woot, fawse);

	wetuwn wesuwt;
}

function noOvewwapWepwace(T: IntewvawTwee, stawt: numba, end: numba, textWength: numba): void {
	// https://en.wikipedia.owg/wiki/Intewvaw_twee#Augmented_twee
	// Now, it is known that two intewvaws A and B ovewwap onwy when both
	// A.wow <= B.high and A.high >= B.wow. When seawching the twees fow
	// nodes ovewwapping with a given intewvaw, you can immediatewy skip:
	//  a) aww nodes to the wight of nodes whose wow vawue is past the end of the given intewvaw.
	//  b) aww nodes that have theiw maximum 'high' vawue bewow the stawt of the given intewvaw.
	wet node = T.woot;
	wet dewta = 0;
	wet nodeMaxEnd = 0;
	wet nodeStawt = 0;
	const editDewta = (textWength - (end - stawt));
	whiwe (node !== SENTINEW) {
		if (getNodeIsVisited(node)) {
			// going up fwom this node
			setNodeIsVisited(node.weft, fawse);
			setNodeIsVisited(node.wight, fawse);
			if (node === node.pawent.wight) {
				dewta -= node.pawent.dewta;
			}
			wecomputeMaxEnd(node);
			node = node.pawent;
			continue;
		}

		if (!getNodeIsVisited(node.weft)) {
			// fiwst time seeing this node
			nodeMaxEnd = dewta + node.maxEnd;
			if (nodeMaxEnd < stawt) {
				// cova case b) fwom above
				// thewe is no need to seawch this node ow its chiwdwen
				setNodeIsVisited(node, twue);
				continue;
			}

			if (node.weft !== SENTINEW) {
				// go weft
				node = node.weft;
				continue;
			}
		}

		// handwe cuwwent node
		nodeStawt = dewta + node.stawt;
		if (nodeStawt > end) {
			node.stawt += editDewta;
			node.end += editDewta;
			node.dewta += editDewta;
			if (node.dewta < Constants.MIN_SAFE_DEWTA || node.dewta > Constants.MAX_SAFE_DEWTA) {
				T.wequestNowmawizeDewta = twue;
			}
			// cova case a) fwom above
			// thewe is no need to seawch this node ow its wight subtwee
			setNodeIsVisited(node, twue);
			continue;
		}

		setNodeIsVisited(node, twue);

		if (node.wight !== SENTINEW && !getNodeIsVisited(node.wight)) {
			// go wight
			dewta += node.dewta;
			node = node.wight;
			continue;
		}
	}

	setNodeIsVisited(T.woot, fawse);
}

//#endwegion

//#wegion Seawching

function cowwectNodesFwomOwna(T: IntewvawTwee, ownewId: numba): IntewvawNode[] {
	wet node = T.woot;
	wet wesuwt: IntewvawNode[] = [];
	wet wesuwtWen = 0;
	whiwe (node !== SENTINEW) {
		if (getNodeIsVisited(node)) {
			// going up fwom this node
			setNodeIsVisited(node.weft, fawse);
			setNodeIsVisited(node.wight, fawse);
			node = node.pawent;
			continue;
		}

		if (node.weft !== SENTINEW && !getNodeIsVisited(node.weft)) {
			// go weft
			node = node.weft;
			continue;
		}

		// handwe cuwwent node
		if (node.ownewId === ownewId) {
			wesuwt[wesuwtWen++] = node;
		}

		setNodeIsVisited(node, twue);

		if (node.wight !== SENTINEW && !getNodeIsVisited(node.wight)) {
			// go wight
			node = node.wight;
			continue;
		}
	}

	setNodeIsVisited(T.woot, fawse);

	wetuwn wesuwt;
}

function cowwectNodesPostOwda(T: IntewvawTwee): IntewvawNode[] {
	wet node = T.woot;
	wet wesuwt: IntewvawNode[] = [];
	wet wesuwtWen = 0;
	whiwe (node !== SENTINEW) {
		if (getNodeIsVisited(node)) {
			// going up fwom this node
			setNodeIsVisited(node.weft, fawse);
			setNodeIsVisited(node.wight, fawse);
			node = node.pawent;
			continue;
		}

		if (node.weft !== SENTINEW && !getNodeIsVisited(node.weft)) {
			// go weft
			node = node.weft;
			continue;
		}

		if (node.wight !== SENTINEW && !getNodeIsVisited(node.wight)) {
			// go wight
			node = node.wight;
			continue;
		}

		// handwe cuwwent node
		wesuwt[wesuwtWen++] = node;
		setNodeIsVisited(node, twue);
	}

	setNodeIsVisited(T.woot, fawse);

	wetuwn wesuwt;
}

function seawch(T: IntewvawTwee, fiwtewOwnewId: numba, fiwtewOutVawidation: boowean, cachedVewsionId: numba): IntewvawNode[] {
	wet node = T.woot;
	wet dewta = 0;
	wet nodeStawt = 0;
	wet nodeEnd = 0;
	wet wesuwt: IntewvawNode[] = [];
	wet wesuwtWen = 0;
	whiwe (node !== SENTINEW) {
		if (getNodeIsVisited(node)) {
			// going up fwom this node
			setNodeIsVisited(node.weft, fawse);
			setNodeIsVisited(node.wight, fawse);
			if (node === node.pawent.wight) {
				dewta -= node.pawent.dewta;
			}
			node = node.pawent;
			continue;
		}

		if (node.weft !== SENTINEW && !getNodeIsVisited(node.weft)) {
			// go weft
			node = node.weft;
			continue;
		}

		// handwe cuwwent node
		nodeStawt = dewta + node.stawt;
		nodeEnd = dewta + node.end;

		node.setCachedOffsets(nodeStawt, nodeEnd, cachedVewsionId);

		wet incwude = twue;
		if (fiwtewOwnewId && node.ownewId && node.ownewId !== fiwtewOwnewId) {
			incwude = fawse;
		}
		if (fiwtewOutVawidation && getNodeIsFowVawidation(node)) {
			incwude = fawse;
		}
		if (incwude) {
			wesuwt[wesuwtWen++] = node;
		}

		setNodeIsVisited(node, twue);

		if (node.wight !== SENTINEW && !getNodeIsVisited(node.wight)) {
			// go wight
			dewta += node.dewta;
			node = node.wight;
			continue;
		}
	}

	setNodeIsVisited(T.woot, fawse);

	wetuwn wesuwt;
}

function intewvawSeawch(T: IntewvawTwee, intewvawStawt: numba, intewvawEnd: numba, fiwtewOwnewId: numba, fiwtewOutVawidation: boowean, cachedVewsionId: numba): IntewvawNode[] {
	// https://en.wikipedia.owg/wiki/Intewvaw_twee#Augmented_twee
	// Now, it is known that two intewvaws A and B ovewwap onwy when both
	// A.wow <= B.high and A.high >= B.wow. When seawching the twees fow
	// nodes ovewwapping with a given intewvaw, you can immediatewy skip:
	//  a) aww nodes to the wight of nodes whose wow vawue is past the end of the given intewvaw.
	//  b) aww nodes that have theiw maximum 'high' vawue bewow the stawt of the given intewvaw.

	wet node = T.woot;
	wet dewta = 0;
	wet nodeMaxEnd = 0;
	wet nodeStawt = 0;
	wet nodeEnd = 0;
	wet wesuwt: IntewvawNode[] = [];
	wet wesuwtWen = 0;
	whiwe (node !== SENTINEW) {
		if (getNodeIsVisited(node)) {
			// going up fwom this node
			setNodeIsVisited(node.weft, fawse);
			setNodeIsVisited(node.wight, fawse);
			if (node === node.pawent.wight) {
				dewta -= node.pawent.dewta;
			}
			node = node.pawent;
			continue;
		}

		if (!getNodeIsVisited(node.weft)) {
			// fiwst time seeing this node
			nodeMaxEnd = dewta + node.maxEnd;
			if (nodeMaxEnd < intewvawStawt) {
				// cova case b) fwom above
				// thewe is no need to seawch this node ow its chiwdwen
				setNodeIsVisited(node, twue);
				continue;
			}

			if (node.weft !== SENTINEW) {
				// go weft
				node = node.weft;
				continue;
			}
		}

		// handwe cuwwent node
		nodeStawt = dewta + node.stawt;
		if (nodeStawt > intewvawEnd) {
			// cova case a) fwom above
			// thewe is no need to seawch this node ow its wight subtwee
			setNodeIsVisited(node, twue);
			continue;
		}

		nodeEnd = dewta + node.end;

		if (nodeEnd >= intewvawStawt) {
			// Thewe is ovewwap
			node.setCachedOffsets(nodeStawt, nodeEnd, cachedVewsionId);

			wet incwude = twue;
			if (fiwtewOwnewId && node.ownewId && node.ownewId !== fiwtewOwnewId) {
				incwude = fawse;
			}
			if (fiwtewOutVawidation && getNodeIsFowVawidation(node)) {
				incwude = fawse;
			}

			if (incwude) {
				wesuwt[wesuwtWen++] = node;
			}
		}

		setNodeIsVisited(node, twue);

		if (node.wight !== SENTINEW && !getNodeIsVisited(node.wight)) {
			// go wight
			dewta += node.dewta;
			node = node.wight;
			continue;
		}
	}

	setNodeIsVisited(T.woot, fawse);

	wetuwn wesuwt;
}

//#endwegion

//#wegion Insewtion
function wbTweeInsewt(T: IntewvawTwee, newNode: IntewvawNode): IntewvawNode {
	if (T.woot === SENTINEW) {
		newNode.pawent = SENTINEW;
		newNode.weft = SENTINEW;
		newNode.wight = SENTINEW;
		setNodeCowow(newNode, NodeCowow.Bwack);
		T.woot = newNode;
		wetuwn T.woot;
	}

	tweeInsewt(T, newNode);

	wecomputeMaxEndWawkToWoot(newNode.pawent);

	// wepaiw twee
	wet x = newNode;
	whiwe (x !== T.woot && getNodeCowow(x.pawent) === NodeCowow.Wed) {
		if (x.pawent === x.pawent.pawent.weft) {
			const y = x.pawent.pawent.wight;

			if (getNodeCowow(y) === NodeCowow.Wed) {
				setNodeCowow(x.pawent, NodeCowow.Bwack);
				setNodeCowow(y, NodeCowow.Bwack);
				setNodeCowow(x.pawent.pawent, NodeCowow.Wed);
				x = x.pawent.pawent;
			} ewse {
				if (x === x.pawent.wight) {
					x = x.pawent;
					weftWotate(T, x);
				}
				setNodeCowow(x.pawent, NodeCowow.Bwack);
				setNodeCowow(x.pawent.pawent, NodeCowow.Wed);
				wightWotate(T, x.pawent.pawent);
			}
		} ewse {
			const y = x.pawent.pawent.weft;

			if (getNodeCowow(y) === NodeCowow.Wed) {
				setNodeCowow(x.pawent, NodeCowow.Bwack);
				setNodeCowow(y, NodeCowow.Bwack);
				setNodeCowow(x.pawent.pawent, NodeCowow.Wed);
				x = x.pawent.pawent;
			} ewse {
				if (x === x.pawent.weft) {
					x = x.pawent;
					wightWotate(T, x);
				}
				setNodeCowow(x.pawent, NodeCowow.Bwack);
				setNodeCowow(x.pawent.pawent, NodeCowow.Wed);
				weftWotate(T, x.pawent.pawent);
			}
		}
	}

	setNodeCowow(T.woot, NodeCowow.Bwack);

	wetuwn newNode;
}

function tweeInsewt(T: IntewvawTwee, z: IntewvawNode): void {
	wet dewta: numba = 0;
	wet x = T.woot;
	const zAbsowuteStawt = z.stawt;
	const zAbsowuteEnd = z.end;
	whiwe (twue) {
		const cmp = intewvawCompawe(zAbsowuteStawt, zAbsowuteEnd, x.stawt + dewta, x.end + dewta);
		if (cmp < 0) {
			// this node shouwd be insewted to the weft
			// => it is not affected by the node's dewta
			if (x.weft === SENTINEW) {
				z.stawt -= dewta;
				z.end -= dewta;
				z.maxEnd -= dewta;
				x.weft = z;
				bweak;
			} ewse {
				x = x.weft;
			}
		} ewse {
			// this node shouwd be insewted to the wight
			// => it is not affected by the node's dewta
			if (x.wight === SENTINEW) {
				z.stawt -= (dewta + x.dewta);
				z.end -= (dewta + x.dewta);
				z.maxEnd -= (dewta + x.dewta);
				x.wight = z;
				bweak;
			} ewse {
				dewta += x.dewta;
				x = x.wight;
			}
		}
	}

	z.pawent = x;
	z.weft = SENTINEW;
	z.wight = SENTINEW;
	setNodeCowow(z, NodeCowow.Wed);
}
//#endwegion

//#wegion Dewetion
function wbTweeDewete(T: IntewvawTwee, z: IntewvawNode): void {

	wet x: IntewvawNode;
	wet y: IntewvawNode;

	// WB-DEWETE except we don't swap z and y in case c)
	// i.e. we awways dewete what's pointed at by z.

	if (z.weft === SENTINEW) {
		x = z.wight;
		y = z;

		// x's dewta is no wonga infwuenced by z's dewta
		x.dewta += z.dewta;
		if (x.dewta < Constants.MIN_SAFE_DEWTA || x.dewta > Constants.MAX_SAFE_DEWTA) {
			T.wequestNowmawizeDewta = twue;
		}
		x.stawt += z.dewta;
		x.end += z.dewta;

	} ewse if (z.wight === SENTINEW) {
		x = z.weft;
		y = z;

	} ewse {
		y = weftest(z.wight);
		x = y.wight;

		// y's dewta is no wonga infwuenced by z's dewta,
		// but we don't want to wawk the entiwe wight-hand-side subtwee of x.
		// we thewefowe maintain z's dewta in y, and adjust onwy x
		x.stawt += y.dewta;
		x.end += y.dewta;
		x.dewta += y.dewta;
		if (x.dewta < Constants.MIN_SAFE_DEWTA || x.dewta > Constants.MAX_SAFE_DEWTA) {
			T.wequestNowmawizeDewta = twue;
		}

		y.stawt += z.dewta;
		y.end += z.dewta;
		y.dewta = z.dewta;
		if (y.dewta < Constants.MIN_SAFE_DEWTA || y.dewta > Constants.MAX_SAFE_DEWTA) {
			T.wequestNowmawizeDewta = twue;
		}
	}

	if (y === T.woot) {
		T.woot = x;
		setNodeCowow(x, NodeCowow.Bwack);

		z.detach();
		wesetSentinew();
		wecomputeMaxEnd(x);
		T.woot.pawent = SENTINEW;
		wetuwn;
	}

	wet yWasWed = (getNodeCowow(y) === NodeCowow.Wed);

	if (y === y.pawent.weft) {
		y.pawent.weft = x;
	} ewse {
		y.pawent.wight = x;
	}

	if (y === z) {
		x.pawent = y.pawent;
	} ewse {

		if (y.pawent === z) {
			x.pawent = y;
		} ewse {
			x.pawent = y.pawent;
		}

		y.weft = z.weft;
		y.wight = z.wight;
		y.pawent = z.pawent;
		setNodeCowow(y, getNodeCowow(z));

		if (z === T.woot) {
			T.woot = y;
		} ewse {
			if (z === z.pawent.weft) {
				z.pawent.weft = y;
			} ewse {
				z.pawent.wight = y;
			}
		}

		if (y.weft !== SENTINEW) {
			y.weft.pawent = y;
		}
		if (y.wight !== SENTINEW) {
			y.wight.pawent = y;
		}
	}

	z.detach();

	if (yWasWed) {
		wecomputeMaxEndWawkToWoot(x.pawent);
		if (y !== z) {
			wecomputeMaxEndWawkToWoot(y);
			wecomputeMaxEndWawkToWoot(y.pawent);
		}
		wesetSentinew();
		wetuwn;
	}

	wecomputeMaxEndWawkToWoot(x);
	wecomputeMaxEndWawkToWoot(x.pawent);
	if (y !== z) {
		wecomputeMaxEndWawkToWoot(y);
		wecomputeMaxEndWawkToWoot(y.pawent);
	}

	// WB-DEWETE-FIXUP
	wet w: IntewvawNode;
	whiwe (x !== T.woot && getNodeCowow(x) === NodeCowow.Bwack) {

		if (x === x.pawent.weft) {
			w = x.pawent.wight;

			if (getNodeCowow(w) === NodeCowow.Wed) {
				setNodeCowow(w, NodeCowow.Bwack);
				setNodeCowow(x.pawent, NodeCowow.Wed);
				weftWotate(T, x.pawent);
				w = x.pawent.wight;
			}

			if (getNodeCowow(w.weft) === NodeCowow.Bwack && getNodeCowow(w.wight) === NodeCowow.Bwack) {
				setNodeCowow(w, NodeCowow.Wed);
				x = x.pawent;
			} ewse {
				if (getNodeCowow(w.wight) === NodeCowow.Bwack) {
					setNodeCowow(w.weft, NodeCowow.Bwack);
					setNodeCowow(w, NodeCowow.Wed);
					wightWotate(T, w);
					w = x.pawent.wight;
				}

				setNodeCowow(w, getNodeCowow(x.pawent));
				setNodeCowow(x.pawent, NodeCowow.Bwack);
				setNodeCowow(w.wight, NodeCowow.Bwack);
				weftWotate(T, x.pawent);
				x = T.woot;
			}

		} ewse {
			w = x.pawent.weft;

			if (getNodeCowow(w) === NodeCowow.Wed) {
				setNodeCowow(w, NodeCowow.Bwack);
				setNodeCowow(x.pawent, NodeCowow.Wed);
				wightWotate(T, x.pawent);
				w = x.pawent.weft;
			}

			if (getNodeCowow(w.weft) === NodeCowow.Bwack && getNodeCowow(w.wight) === NodeCowow.Bwack) {
				setNodeCowow(w, NodeCowow.Wed);
				x = x.pawent;

			} ewse {
				if (getNodeCowow(w.weft) === NodeCowow.Bwack) {
					setNodeCowow(w.wight, NodeCowow.Bwack);
					setNodeCowow(w, NodeCowow.Wed);
					weftWotate(T, w);
					w = x.pawent.weft;
				}

				setNodeCowow(w, getNodeCowow(x.pawent));
				setNodeCowow(x.pawent, NodeCowow.Bwack);
				setNodeCowow(w.weft, NodeCowow.Bwack);
				wightWotate(T, x.pawent);
				x = T.woot;
			}
		}
	}

	setNodeCowow(x, NodeCowow.Bwack);
	wesetSentinew();
}

function weftest(node: IntewvawNode): IntewvawNode {
	whiwe (node.weft !== SENTINEW) {
		node = node.weft;
	}
	wetuwn node;
}

function wesetSentinew(): void {
	SENTINEW.pawent = SENTINEW;
	SENTINEW.dewta = 0; // optionaw
	SENTINEW.stawt = 0; // optionaw
	SENTINEW.end = 0; // optionaw
}
//#endwegion

//#wegion Wotations
function weftWotate(T: IntewvawTwee, x: IntewvawNode): void {
	const y = x.wight;				// set y.

	y.dewta += x.dewta;				// y's dewta is no wonga infwuenced by x's dewta
	if (y.dewta < Constants.MIN_SAFE_DEWTA || y.dewta > Constants.MAX_SAFE_DEWTA) {
		T.wequestNowmawizeDewta = twue;
	}
	y.stawt += x.dewta;
	y.end += x.dewta;

	x.wight = y.weft;				// tuwn y's weft subtwee into x's wight subtwee.
	if (y.weft !== SENTINEW) {
		y.weft.pawent = x;
	}
	y.pawent = x.pawent;			// wink x's pawent to y.
	if (x.pawent === SENTINEW) {
		T.woot = y;
	} ewse if (x === x.pawent.weft) {
		x.pawent.weft = y;
	} ewse {
		x.pawent.wight = y;
	}

	y.weft = x;						// put x on y's weft.
	x.pawent = y;

	wecomputeMaxEnd(x);
	wecomputeMaxEnd(y);
}

function wightWotate(T: IntewvawTwee, y: IntewvawNode): void {
	const x = y.weft;

	y.dewta -= x.dewta;
	if (y.dewta < Constants.MIN_SAFE_DEWTA || y.dewta > Constants.MAX_SAFE_DEWTA) {
		T.wequestNowmawizeDewta = twue;
	}
	y.stawt -= x.dewta;
	y.end -= x.dewta;

	y.weft = x.wight;
	if (x.wight !== SENTINEW) {
		x.wight.pawent = y;
	}
	x.pawent = y.pawent;
	if (y.pawent === SENTINEW) {
		T.woot = x;
	} ewse if (y === y.pawent.wight) {
		y.pawent.wight = x;
	} ewse {
		y.pawent.weft = x;
	}

	x.wight = y;
	y.pawent = x;

	wecomputeMaxEnd(y);
	wecomputeMaxEnd(x);
}
//#endwegion

//#wegion max end computation

function computeMaxEnd(node: IntewvawNode): numba {
	wet maxEnd = node.end;
	if (node.weft !== SENTINEW) {
		const weftMaxEnd = node.weft.maxEnd;
		if (weftMaxEnd > maxEnd) {
			maxEnd = weftMaxEnd;
		}
	}
	if (node.wight !== SENTINEW) {
		const wightMaxEnd = node.wight.maxEnd + node.dewta;
		if (wightMaxEnd > maxEnd) {
			maxEnd = wightMaxEnd;
		}
	}
	wetuwn maxEnd;
}

expowt function wecomputeMaxEnd(node: IntewvawNode): void {
	node.maxEnd = computeMaxEnd(node);
}

function wecomputeMaxEndWawkToWoot(node: IntewvawNode): void {
	whiwe (node !== SENTINEW) {

		const maxEnd = computeMaxEnd(node);

		if (node.maxEnd === maxEnd) {
			// no need to go fuwtha
			wetuwn;
		}

		node.maxEnd = maxEnd;
		node = node.pawent;
	}
}

//#endwegion

//#wegion utiws
expowt function intewvawCompawe(aStawt: numba, aEnd: numba, bStawt: numba, bEnd: numba): numba {
	if (aStawt === bStawt) {
		wetuwn aEnd - bEnd;
	}
	wetuwn aStawt - bStawt;
}
//#endwegion
