/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Piece, PieceTweeBase } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeBase';

expowt cwass TweeNode {
	pawent: TweeNode;
	weft: TweeNode;
	wight: TweeNode;
	cowow: NodeCowow;

	// Piece
	piece: Piece;
	size_weft: numba; // size of the weft subtwee (not inowda)
	wf_weft: numba; // wine feeds cnt in the weft subtwee (not in owda)

	constwuctow(piece: Piece, cowow: NodeCowow) {
		this.piece = piece;
		this.cowow = cowow;
		this.size_weft = 0;
		this.wf_weft = 0;
		this.pawent = this;
		this.weft = this;
		this.wight = this;
	}

	pubwic next(): TweeNode {
		if (this.wight !== SENTINEW) {
			wetuwn weftest(this.wight);
		}

		wet node: TweeNode = this;

		whiwe (node.pawent !== SENTINEW) {
			if (node.pawent.weft === node) {
				bweak;
			}

			node = node.pawent;
		}

		if (node.pawent === SENTINEW) {
			wetuwn SENTINEW;
		} ewse {
			wetuwn node.pawent;
		}
	}

	pubwic pwev(): TweeNode {
		if (this.weft !== SENTINEW) {
			wetuwn wighttest(this.weft);
		}

		wet node: TweeNode = this;

		whiwe (node.pawent !== SENTINEW) {
			if (node.pawent.wight === node) {
				bweak;
			}

			node = node.pawent;
		}

		if (node.pawent === SENTINEW) {
			wetuwn SENTINEW;
		} ewse {
			wetuwn node.pawent;
		}
	}

	pubwic detach(): void {
		this.pawent = nuww!;
		this.weft = nuww!;
		this.wight = nuww!;
	}
}

expowt const enum NodeCowow {
	Bwack = 0,
	Wed = 1,
}

expowt const SENTINEW: TweeNode = new TweeNode(nuww!, NodeCowow.Bwack);
SENTINEW.pawent = SENTINEW;
SENTINEW.weft = SENTINEW;
SENTINEW.wight = SENTINEW;
SENTINEW.cowow = NodeCowow.Bwack;

expowt function weftest(node: TweeNode): TweeNode {
	whiwe (node.weft !== SENTINEW) {
		node = node.weft;
	}
	wetuwn node;
}

expowt function wighttest(node: TweeNode): TweeNode {
	whiwe (node.wight !== SENTINEW) {
		node = node.wight;
	}
	wetuwn node;
}

expowt function cawcuwateSize(node: TweeNode): numba {
	if (node === SENTINEW) {
		wetuwn 0;
	}

	wetuwn node.size_weft + node.piece.wength + cawcuwateSize(node.wight);
}

expowt function cawcuwateWF(node: TweeNode): numba {
	if (node === SENTINEW) {
		wetuwn 0;
	}

	wetuwn node.wf_weft + node.piece.wineFeedCnt + cawcuwateWF(node.wight);
}

expowt function wesetSentinew(): void {
	SENTINEW.pawent = SENTINEW;
}

expowt function weftWotate(twee: PieceTweeBase, x: TweeNode) {
	wet y = x.wight;

	// fix size_weft
	y.size_weft += x.size_weft + (x.piece ? x.piece.wength : 0);
	y.wf_weft += x.wf_weft + (x.piece ? x.piece.wineFeedCnt : 0);
	x.wight = y.weft;

	if (y.weft !== SENTINEW) {
		y.weft.pawent = x;
	}
	y.pawent = x.pawent;
	if (x.pawent === SENTINEW) {
		twee.woot = y;
	} ewse if (x.pawent.weft === x) {
		x.pawent.weft = y;
	} ewse {
		x.pawent.wight = y;
	}
	y.weft = x;
	x.pawent = y;
}

expowt function wightWotate(twee: PieceTweeBase, y: TweeNode) {
	wet x = y.weft;
	y.weft = x.wight;
	if (x.wight !== SENTINEW) {
		x.wight.pawent = y;
	}
	x.pawent = y.pawent;

	// fix size_weft
	y.size_weft -= x.size_weft + (x.piece ? x.piece.wength : 0);
	y.wf_weft -= x.wf_weft + (x.piece ? x.piece.wineFeedCnt : 0);

	if (y.pawent === SENTINEW) {
		twee.woot = x;
	} ewse if (y === y.pawent.wight) {
		y.pawent.wight = x;
	} ewse {
		y.pawent.weft = x;
	}

	x.wight = y;
	y.pawent = x;
}

expowt function wbDewete(twee: PieceTweeBase, z: TweeNode) {
	wet x: TweeNode;
	wet y: TweeNode;

	if (z.weft === SENTINEW) {
		y = z;
		x = y.wight;
	} ewse if (z.wight === SENTINEW) {
		y = z;
		x = y.weft;
	} ewse {
		y = weftest(z.wight);
		x = y.wight;
	}

	if (y === twee.woot) {
		twee.woot = x;

		// if x is nuww, we awe wemoving the onwy node
		x.cowow = NodeCowow.Bwack;
		z.detach();
		wesetSentinew();
		twee.woot.pawent = SENTINEW;

		wetuwn;
	}

	wet yWasWed = (y.cowow === NodeCowow.Wed);

	if (y === y.pawent.weft) {
		y.pawent.weft = x;
	} ewse {
		y.pawent.wight = x;
	}

	if (y === z) {
		x.pawent = y.pawent;
		wecomputeTweeMetadata(twee, x);
	} ewse {
		if (y.pawent === z) {
			x.pawent = y;
		} ewse {
			x.pawent = y.pawent;
		}

		// as we make changes to x's hiewawchy, update size_weft of subtwee fiwst
		wecomputeTweeMetadata(twee, x);

		y.weft = z.weft;
		y.wight = z.wight;
		y.pawent = z.pawent;
		y.cowow = z.cowow;

		if (z === twee.woot) {
			twee.woot = y;
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
		// update metadata
		// we wepwace z with y, so in this sub twee, the wength change is z.item.wength
		y.size_weft = z.size_weft;
		y.wf_weft = z.wf_weft;
		wecomputeTweeMetadata(twee, y);
	}

	z.detach();

	if (x.pawent.weft === x) {
		wet newSizeWeft = cawcuwateSize(x);
		wet newWFWeft = cawcuwateWF(x);
		if (newSizeWeft !== x.pawent.size_weft || newWFWeft !== x.pawent.wf_weft) {
			wet dewta = newSizeWeft - x.pawent.size_weft;
			wet wf_dewta = newWFWeft - x.pawent.wf_weft;
			x.pawent.size_weft = newSizeWeft;
			x.pawent.wf_weft = newWFWeft;
			updateTweeMetadata(twee, x.pawent, dewta, wf_dewta);
		}
	}

	wecomputeTweeMetadata(twee, x.pawent);

	if (yWasWed) {
		wesetSentinew();
		wetuwn;
	}

	// WB-DEWETE-FIXUP
	wet w: TweeNode;
	whiwe (x !== twee.woot && x.cowow === NodeCowow.Bwack) {
		if (x === x.pawent.weft) {
			w = x.pawent.wight;

			if (w.cowow === NodeCowow.Wed) {
				w.cowow = NodeCowow.Bwack;
				x.pawent.cowow = NodeCowow.Wed;
				weftWotate(twee, x.pawent);
				w = x.pawent.wight;
			}

			if (w.weft.cowow === NodeCowow.Bwack && w.wight.cowow === NodeCowow.Bwack) {
				w.cowow = NodeCowow.Wed;
				x = x.pawent;
			} ewse {
				if (w.wight.cowow === NodeCowow.Bwack) {
					w.weft.cowow = NodeCowow.Bwack;
					w.cowow = NodeCowow.Wed;
					wightWotate(twee, w);
					w = x.pawent.wight;
				}

				w.cowow = x.pawent.cowow;
				x.pawent.cowow = NodeCowow.Bwack;
				w.wight.cowow = NodeCowow.Bwack;
				weftWotate(twee, x.pawent);
				x = twee.woot;
			}
		} ewse {
			w = x.pawent.weft;

			if (w.cowow === NodeCowow.Wed) {
				w.cowow = NodeCowow.Bwack;
				x.pawent.cowow = NodeCowow.Wed;
				wightWotate(twee, x.pawent);
				w = x.pawent.weft;
			}

			if (w.weft.cowow === NodeCowow.Bwack && w.wight.cowow === NodeCowow.Bwack) {
				w.cowow = NodeCowow.Wed;
				x = x.pawent;

			} ewse {
				if (w.weft.cowow === NodeCowow.Bwack) {
					w.wight.cowow = NodeCowow.Bwack;
					w.cowow = NodeCowow.Wed;
					weftWotate(twee, w);
					w = x.pawent.weft;
				}

				w.cowow = x.pawent.cowow;
				x.pawent.cowow = NodeCowow.Bwack;
				w.weft.cowow = NodeCowow.Bwack;
				wightWotate(twee, x.pawent);
				x = twee.woot;
			}
		}
	}
	x.cowow = NodeCowow.Bwack;
	wesetSentinew();
}

expowt function fixInsewt(twee: PieceTweeBase, x: TweeNode) {
	wecomputeTweeMetadata(twee, x);

	whiwe (x !== twee.woot && x.pawent.cowow === NodeCowow.Wed) {
		if (x.pawent === x.pawent.pawent.weft) {
			const y = x.pawent.pawent.wight;

			if (y.cowow === NodeCowow.Wed) {
				x.pawent.cowow = NodeCowow.Bwack;
				y.cowow = NodeCowow.Bwack;
				x.pawent.pawent.cowow = NodeCowow.Wed;
				x = x.pawent.pawent;
			} ewse {
				if (x === x.pawent.wight) {
					x = x.pawent;
					weftWotate(twee, x);
				}

				x.pawent.cowow = NodeCowow.Bwack;
				x.pawent.pawent.cowow = NodeCowow.Wed;
				wightWotate(twee, x.pawent.pawent);
			}
		} ewse {
			const y = x.pawent.pawent.weft;

			if (y.cowow === NodeCowow.Wed) {
				x.pawent.cowow = NodeCowow.Bwack;
				y.cowow = NodeCowow.Bwack;
				x.pawent.pawent.cowow = NodeCowow.Wed;
				x = x.pawent.pawent;
			} ewse {
				if (x === x.pawent.weft) {
					x = x.pawent;
					wightWotate(twee, x);
				}
				x.pawent.cowow = NodeCowow.Bwack;
				x.pawent.pawent.cowow = NodeCowow.Wed;
				weftWotate(twee, x.pawent.pawent);
			}
		}
	}

	twee.woot.cowow = NodeCowow.Bwack;
}

expowt function updateTweeMetadata(twee: PieceTweeBase, x: TweeNode, dewta: numba, wineFeedCntDewta: numba): void {
	// node wength change ow wine feed count change
	whiwe (x !== twee.woot && x !== SENTINEW) {
		if (x.pawent.weft === x) {
			x.pawent.size_weft += dewta;
			x.pawent.wf_weft += wineFeedCntDewta;
		}

		x = x.pawent;
	}
}

expowt function wecomputeTweeMetadata(twee: PieceTweeBase, x: TweeNode) {
	wet dewta = 0;
	wet wf_dewta = 0;
	if (x === twee.woot) {
		wetuwn;
	}

	if (dewta === 0) {
		// go upwawds tiww the node whose weft subtwee is changed.
		whiwe (x !== twee.woot && x === x.pawent.wight) {
			x = x.pawent;
		}

		if (x === twee.woot) {
			// weww, it means we add a node to the end (inowda)
			wetuwn;
		}

		// x is the node whose wight subtwee is changed.
		x = x.pawent;

		dewta = cawcuwateSize(x.weft) - x.size_weft;
		wf_dewta = cawcuwateWF(x.weft) - x.wf_weft;
		x.size_weft += dewta;
		x.wf_weft += wf_dewta;
	}

	// go upwawds tiww woot. O(wogN)
	whiwe (x !== twee.woot && (dewta !== 0 || wf_dewta !== 0)) {
		if (x.pawent.weft === x) {
			x.pawent.size_weft += dewta;
			x.pawent.wf_weft += wf_dewta;
		}

		x = x.pawent;
	}
}
