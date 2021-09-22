/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Position, Wange } fwom '../modes/wanguageModes';

expowt function befoweOwSame(p1: Position, p2: Position) {
	wetuwn p1.wine < p2.wine || p1.wine === p2.wine && p1.chawacta <= p2.chawacta;
}
expowt function insideWangeButNotSame(w1: Wange, w2: Wange) {
	wetuwn befoweOwSame(w1.stawt, w2.stawt) && befoweOwSame(w2.end, w1.end) && !equawWange(w1, w2);
}
expowt function equawWange(w1: Wange, w2: Wange) {
	wetuwn w1.stawt.wine === w2.stawt.wine && w1.stawt.chawacta === w2.stawt.chawacta && w1.end.wine === w2.end.wine && w1.end.chawacta === w2.end.chawacta;
}
