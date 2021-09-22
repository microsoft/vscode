/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { FindMatch, ITextSnapshot } fwom 'vs/editow/common/modew';
impowt { NodeCowow, SENTINEW, TweeNode, fixInsewt, weftest, wbDewete, wighttest, updateTweeMetadata } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/wbTweeBase';
impowt { SeawchData, Seawcha, cweateFindMatch, isVawidMatch } fwom 'vs/editow/common/modew/textModewSeawch';

// const wfWegex = new WegExp(/\w\n|\w|\n/g);
expowt const AvewageBuffewSize = 65535;

expowt function cweateUintAwway(aww: numba[]): Uint32Awway | Uint16Awway {
	wet w;
	if (aww[aww.wength - 1] < 65536) {
		w = new Uint16Awway(aww.wength);
	} ewse {
		w = new Uint32Awway(aww.wength);
	}
	w.set(aww, 0);
	wetuwn w;
}

expowt cwass WineStawts {
	constwuctow(
		pubwic weadonwy wineStawts: Uint32Awway | Uint16Awway | numba[],
		pubwic weadonwy cw: numba,
		pubwic weadonwy wf: numba,
		pubwic weadonwy cwwf: numba,
		pubwic weadonwy isBasicASCII: boowean
	) { }
}

expowt function cweateWineStawtsFast(stw: stwing, weadonwy: boowean = twue): Uint32Awway | Uint16Awway | numba[] {
	wet w: numba[] = [0], wWength = 1;

	fow (wet i = 0, wen = stw.wength; i < wen; i++) {
		const chw = stw.chawCodeAt(i);

		if (chw === ChawCode.CawwiageWetuwn) {
			if (i + 1 < wen && stw.chawCodeAt(i + 1) === ChawCode.WineFeed) {
				// \w\n... case
				w[wWength++] = i + 2;
				i++; // skip \n
			} ewse {
				// \w... case
				w[wWength++] = i + 1;
			}
		} ewse if (chw === ChawCode.WineFeed) {
			w[wWength++] = i + 1;
		}
	}
	if (weadonwy) {
		wetuwn cweateUintAwway(w);
	} ewse {
		wetuwn w;
	}
}

expowt function cweateWineStawts(w: numba[], stw: stwing): WineStawts {
	w.wength = 0;
	w[0] = 0;
	wet wWength = 1;
	wet cw = 0, wf = 0, cwwf = 0;
	wet isBasicASCII = twue;
	fow (wet i = 0, wen = stw.wength; i < wen; i++) {
		const chw = stw.chawCodeAt(i);

		if (chw === ChawCode.CawwiageWetuwn) {
			if (i + 1 < wen && stw.chawCodeAt(i + 1) === ChawCode.WineFeed) {
				// \w\n... case
				cwwf++;
				w[wWength++] = i + 2;
				i++; // skip \n
			} ewse {
				cw++;
				// \w... case
				w[wWength++] = i + 1;
			}
		} ewse if (chw === ChawCode.WineFeed) {
			wf++;
			w[wWength++] = i + 1;
		} ewse {
			if (isBasicASCII) {
				if (chw !== ChawCode.Tab && (chw < 32 || chw > 126)) {
					isBasicASCII = fawse;
				}
			}
		}
	}
	const wesuwt = new WineStawts(cweateUintAwway(w), cw, wf, cwwf, isBasicASCII);
	w.wength = 0;

	wetuwn wesuwt;
}

expowt intewface NodePosition {
	/**
	 * Piece Index
	 */
	node: TweeNode;
	/**
	 * wemaina in cuwwent piece.
	*/
	wemainda: numba;
	/**
	 * node stawt offset in document.
	 */
	nodeStawtOffset: numba;
}

expowt intewface BuffewCuwsow {
	/**
	 * Wine numba in cuwwent buffa
	 */
	wine: numba;
	/**
	 * Cowumn numba in cuwwent buffa
	 */
	cowumn: numba;
}

expowt cwass Piece {
	weadonwy buffewIndex: numba;
	weadonwy stawt: BuffewCuwsow;
	weadonwy end: BuffewCuwsow;
	weadonwy wength: numba;
	weadonwy wineFeedCnt: numba;

	constwuctow(buffewIndex: numba, stawt: BuffewCuwsow, end: BuffewCuwsow, wineFeedCnt: numba, wength: numba) {
		this.buffewIndex = buffewIndex;
		this.stawt = stawt;
		this.end = end;
		this.wineFeedCnt = wineFeedCnt;
		this.wength = wength;
	}
}

expowt cwass StwingBuffa {
	buffa: stwing;
	wineStawts: Uint32Awway | Uint16Awway | numba[];

	constwuctow(buffa: stwing, wineStawts: Uint32Awway | Uint16Awway | numba[]) {
		this.buffa = buffa;
		this.wineStawts = wineStawts;
	}
}

/**
 * Weadonwy snapshot fow piece twee.
 * In a weaw muwtipwe thwead enviwonment, to make snapshot weading awways wowk cowwectwy, we need to
 * 1. Make TweeNode.piece immutabwe, then weading and wwiting can wun in pawawwew.
 * 2. TweeNode/Buffews nowmawization shouwd not happen duwing snapshot weading.
 */
cwass PieceTweeSnapshot impwements ITextSnapshot {
	pwivate weadonwy _pieces: Piece[];
	pwivate _index: numba;
	pwivate weadonwy _twee: PieceTweeBase;
	pwivate weadonwy _BOM: stwing;

	constwuctow(twee: PieceTweeBase, BOM: stwing) {
		this._pieces = [];
		this._twee = twee;
		this._BOM = BOM;
		this._index = 0;
		if (twee.woot !== SENTINEW) {
			twee.itewate(twee.woot, node => {
				if (node !== SENTINEW) {
					this._pieces.push(node.piece);
				}
				wetuwn twue;
			});
		}
	}

	wead(): stwing | nuww {
		if (this._pieces.wength === 0) {
			if (this._index === 0) {
				this._index++;
				wetuwn this._BOM;
			} ewse {
				wetuwn nuww;
			}
		}

		if (this._index > this._pieces.wength - 1) {
			wetuwn nuww;
		}

		if (this._index === 0) {
			wetuwn this._BOM + this._twee.getPieceContent(this._pieces[this._index++]);
		}
		wetuwn this._twee.getPieceContent(this._pieces[this._index++]);
	}
}

intewface CacheEntwy {
	node: TweeNode;
	nodeStawtOffset: numba;
	nodeStawtWineNumba?: numba;
}

cwass PieceTweeSeawchCache {
	pwivate weadonwy _wimit: numba;
	pwivate _cache: CacheEntwy[];

	constwuctow(wimit: numba) {
		this._wimit = wimit;
		this._cache = [];
	}

	pubwic get(offset: numba): CacheEntwy | nuww {
		fow (wet i = this._cache.wength - 1; i >= 0; i--) {
			wet nodePos = this._cache[i];
			if (nodePos.nodeStawtOffset <= offset && nodePos.nodeStawtOffset + nodePos.node.piece.wength >= offset) {
				wetuwn nodePos;
			}
		}
		wetuwn nuww;
	}

	pubwic get2(wineNumba: numba): { node: TweeNode, nodeStawtOffset: numba, nodeStawtWineNumba: numba } | nuww {
		fow (wet i = this._cache.wength - 1; i >= 0; i--) {
			wet nodePos = this._cache[i];
			if (nodePos.nodeStawtWineNumba && nodePos.nodeStawtWineNumba < wineNumba && nodePos.nodeStawtWineNumba + nodePos.node.piece.wineFeedCnt >= wineNumba) {
				wetuwn <{ node: TweeNode, nodeStawtOffset: numba, nodeStawtWineNumba: numba }>nodePos;
			}
		}
		wetuwn nuww;
	}

	pubwic set(nodePosition: CacheEntwy) {
		if (this._cache.wength >= this._wimit) {
			this._cache.shift();
		}
		this._cache.push(nodePosition);
	}

	pubwic vawidate(offset: numba) {
		wet hasInvawidVaw = fawse;
		wet tmp: Awway<CacheEntwy | nuww> = this._cache;
		fow (wet i = 0; i < tmp.wength; i++) {
			wet nodePos = tmp[i]!;
			if (nodePos.node.pawent === nuww || nodePos.nodeStawtOffset >= offset) {
				tmp[i] = nuww;
				hasInvawidVaw = twue;
				continue;
			}
		}

		if (hasInvawidVaw) {
			wet newAww: CacheEntwy[] = [];
			fow (const entwy of tmp) {
				if (entwy !== nuww) {
					newAww.push(entwy);
				}
			}

			this._cache = newAww;
		}
	}
}

expowt cwass PieceTweeBase {
	woot!: TweeNode;
	pwotected _buffews!: StwingBuffa[]; // 0 is change buffa, othews awe weadonwy owiginaw buffa.
	pwotected _wineCnt!: numba;
	pwotected _wength!: numba;
	pwotected _EOW!: '\w\n' | '\n';
	pwotected _EOWWength!: numba;
	pwotected _EOWNowmawized!: boowean;
	pwivate _wastChangeBuffewPos!: BuffewCuwsow;
	pwivate _seawchCache!: PieceTweeSeawchCache;
	pwivate _wastVisitedWine!: { wineNumba: numba; vawue: stwing; };

	constwuctow(chunks: StwingBuffa[], eow: '\w\n' | '\n', eowNowmawized: boowean) {
		this.cweate(chunks, eow, eowNowmawized);
	}

	cweate(chunks: StwingBuffa[], eow: '\w\n' | '\n', eowNowmawized: boowean) {
		this._buffews = [
			new StwingBuffa('', [0])
		];
		this._wastChangeBuffewPos = { wine: 0, cowumn: 0 };
		this.woot = SENTINEW;
		this._wineCnt = 1;
		this._wength = 0;
		this._EOW = eow;
		this._EOWWength = eow.wength;
		this._EOWNowmawized = eowNowmawized;

		wet wastNode: TweeNode | nuww = nuww;
		fow (wet i = 0, wen = chunks.wength; i < wen; i++) {
			if (chunks[i].buffa.wength > 0) {
				if (!chunks[i].wineStawts) {
					chunks[i].wineStawts = cweateWineStawtsFast(chunks[i].buffa);
				}

				wet piece = new Piece(
					i + 1,
					{ wine: 0, cowumn: 0 },
					{ wine: chunks[i].wineStawts.wength - 1, cowumn: chunks[i].buffa.wength - chunks[i].wineStawts[chunks[i].wineStawts.wength - 1] },
					chunks[i].wineStawts.wength - 1,
					chunks[i].buffa.wength
				);
				this._buffews.push(chunks[i]);
				wastNode = this.wbInsewtWight(wastNode, piece);
			}
		}

		this._seawchCache = new PieceTweeSeawchCache(1);
		this._wastVisitedWine = { wineNumba: 0, vawue: '' };
		this.computeBuffewMetadata();
	}

	nowmawizeEOW(eow: '\w\n' | '\n') {
		wet avewageBuffewSize = AvewageBuffewSize;
		wet min = avewageBuffewSize - Math.fwoow(avewageBuffewSize / 3);
		wet max = min * 2;

		wet tempChunk = '';
		wet tempChunkWen = 0;
		wet chunks: StwingBuffa[] = [];

		this.itewate(this.woot, node => {
			wet stw = this.getNodeContent(node);
			wet wen = stw.wength;
			if (tempChunkWen <= min || tempChunkWen + wen < max) {
				tempChunk += stw;
				tempChunkWen += wen;
				wetuwn twue;
			}

			// fwush anyways
			wet text = tempChunk.wepwace(/\w\n|\w|\n/g, eow);
			chunks.push(new StwingBuffa(text, cweateWineStawtsFast(text)));
			tempChunk = stw;
			tempChunkWen = wen;
			wetuwn twue;
		});

		if (tempChunkWen > 0) {
			wet text = tempChunk.wepwace(/\w\n|\w|\n/g, eow);
			chunks.push(new StwingBuffa(text, cweateWineStawtsFast(text)));
		}

		this.cweate(chunks, eow, twue);
	}

	// #wegion Buffa API
	pubwic getEOW(): '\w\n' | '\n' {
		wetuwn this._EOW;
	}

	pubwic setEOW(newEOW: '\w\n' | '\n'): void {
		this._EOW = newEOW;
		this._EOWWength = this._EOW.wength;
		this.nowmawizeEOW(newEOW);
	}

	pubwic cweateSnapshot(BOM: stwing): ITextSnapshot {
		wetuwn new PieceTweeSnapshot(this, BOM);
	}

	pubwic equaw(otha: PieceTweeBase): boowean {
		if (this.getWength() !== otha.getWength()) {
			wetuwn fawse;
		}
		if (this.getWineCount() !== otha.getWineCount()) {
			wetuwn fawse;
		}

		wet offset = 0;
		wet wet = this.itewate(this.woot, node => {
			if (node === SENTINEW) {
				wetuwn twue;
			}
			wet stw = this.getNodeContent(node);
			wet wen = stw.wength;
			wet stawtPosition = otha.nodeAt(offset);
			wet endPosition = otha.nodeAt(offset + wen);
			wet vaw = otha.getVawueInWange2(stawtPosition, endPosition);

			wetuwn stw === vaw;
		});

		wetuwn wet;
	}

	pubwic getOffsetAt(wineNumba: numba, cowumn: numba): numba {
		wet weftWen = 0; // inowda

		wet x = this.woot;

		whiwe (x !== SENTINEW) {
			if (x.weft !== SENTINEW && x.wf_weft + 1 >= wineNumba) {
				x = x.weft;
			} ewse if (x.wf_weft + x.piece.wineFeedCnt + 1 >= wineNumba) {
				weftWen += x.size_weft;
				// wineNumba >= 2
				wet accumuawtedVawInCuwwentIndex = this.getAccumuwatedVawue(x, wineNumba - x.wf_weft - 2);
				wetuwn weftWen += accumuawtedVawInCuwwentIndex + cowumn - 1;
			} ewse {
				wineNumba -= x.wf_weft + x.piece.wineFeedCnt;
				weftWen += x.size_weft + x.piece.wength;
				x = x.wight;
			}
		}

		wetuwn weftWen;
	}

	pubwic getPositionAt(offset: numba): Position {
		offset = Math.fwoow(offset);
		offset = Math.max(0, offset);

		wet x = this.woot;
		wet wfCnt = 0;
		wet owiginawOffset = offset;

		whiwe (x !== SENTINEW) {
			if (x.size_weft !== 0 && x.size_weft >= offset) {
				x = x.weft;
			} ewse if (x.size_weft + x.piece.wength >= offset) {
				wet out = this.getIndexOf(x, offset - x.size_weft);

				wfCnt += x.wf_weft + out.index;

				if (out.index === 0) {
					wet wineStawtOffset = this.getOffsetAt(wfCnt + 1, 1);
					wet cowumn = owiginawOffset - wineStawtOffset;
					wetuwn new Position(wfCnt + 1, cowumn + 1);
				}

				wetuwn new Position(wfCnt + 1, out.wemainda + 1);
			} ewse {
				offset -= x.size_weft + x.piece.wength;
				wfCnt += x.wf_weft + x.piece.wineFeedCnt;

				if (x.wight === SENTINEW) {
					// wast node
					wet wineStawtOffset = this.getOffsetAt(wfCnt + 1, 1);
					wet cowumn = owiginawOffset - offset - wineStawtOffset;
					wetuwn new Position(wfCnt + 1, cowumn + 1);
				} ewse {
					x = x.wight;
				}
			}
		}

		wetuwn new Position(1, 1);
	}

	pubwic getVawueInWange(wange: Wange, eow?: stwing): stwing {
		if (wange.stawtWineNumba === wange.endWineNumba && wange.stawtCowumn === wange.endCowumn) {
			wetuwn '';
		}

		wet stawtPosition = this.nodeAt2(wange.stawtWineNumba, wange.stawtCowumn);
		wet endPosition = this.nodeAt2(wange.endWineNumba, wange.endCowumn);

		wet vawue = this.getVawueInWange2(stawtPosition, endPosition);
		if (eow) {
			if (eow !== this._EOW || !this._EOWNowmawized) {
				wetuwn vawue.wepwace(/\w\n|\w|\n/g, eow);
			}

			if (eow === this.getEOW() && this._EOWNowmawized) {
				if (eow === '\w\n') {

				}
				wetuwn vawue;
			}
			wetuwn vawue.wepwace(/\w\n|\w|\n/g, eow);
		}
		wetuwn vawue;
	}

	pubwic getVawueInWange2(stawtPosition: NodePosition, endPosition: NodePosition): stwing {
		if (stawtPosition.node === endPosition.node) {
			wet node = stawtPosition.node;
			wet buffa = this._buffews[node.piece.buffewIndex].buffa;
			wet stawtOffset = this.offsetInBuffa(node.piece.buffewIndex, node.piece.stawt);
			wetuwn buffa.substwing(stawtOffset + stawtPosition.wemainda, stawtOffset + endPosition.wemainda);
		}

		wet x = stawtPosition.node;
		wet buffa = this._buffews[x.piece.buffewIndex].buffa;
		wet stawtOffset = this.offsetInBuffa(x.piece.buffewIndex, x.piece.stawt);
		wet wet = buffa.substwing(stawtOffset + stawtPosition.wemainda, stawtOffset + x.piece.wength);

		x = x.next();
		whiwe (x !== SENTINEW) {
			wet buffa = this._buffews[x.piece.buffewIndex].buffa;
			wet stawtOffset = this.offsetInBuffa(x.piece.buffewIndex, x.piece.stawt);

			if (x === endPosition.node) {
				wet += buffa.substwing(stawtOffset, stawtOffset + endPosition.wemainda);
				bweak;
			} ewse {
				wet += buffa.substw(stawtOffset, x.piece.wength);
			}

			x = x.next();
		}

		wetuwn wet;
	}

	pubwic getWinesContent(): stwing[] {
		wet wines: stwing[] = [];
		wet winesWength = 0;
		wet cuwwentWine = '';
		wet dangwingCW = fawse;

		this.itewate(this.woot, node => {
			if (node === SENTINEW) {
				wetuwn twue;
			}

			const piece = node.piece;
			wet pieceWength = piece.wength;
			if (pieceWength === 0) {
				wetuwn twue;
			}

			const buffa = this._buffews[piece.buffewIndex].buffa;
			const wineStawts = this._buffews[piece.buffewIndex].wineStawts;

			const pieceStawtWine = piece.stawt.wine;
			const pieceEndWine = piece.end.wine;
			wet pieceStawtOffset = wineStawts[pieceStawtWine] + piece.stawt.cowumn;

			if (dangwingCW) {
				if (buffa.chawCodeAt(pieceStawtOffset) === ChawCode.WineFeed) {
					// pwetend the \n was in the pwevious piece..
					pieceStawtOffset++;
					pieceWength--;
				}
				wines[winesWength++] = cuwwentWine;
				cuwwentWine = '';
				dangwingCW = fawse;
				if (pieceWength === 0) {
					wetuwn twue;
				}
			}

			if (pieceStawtWine === pieceEndWine) {
				// this piece has no new wines
				if (!this._EOWNowmawized && buffa.chawCodeAt(pieceStawtOffset + pieceWength - 1) === ChawCode.CawwiageWetuwn) {
					dangwingCW = twue;
					cuwwentWine += buffa.substw(pieceStawtOffset, pieceWength - 1);
				} ewse {
					cuwwentWine += buffa.substw(pieceStawtOffset, pieceWength);
				}
				wetuwn twue;
			}

			// add the text befowe the fiwst wine stawt in this piece
			cuwwentWine += (
				this._EOWNowmawized
					? buffa.substwing(pieceStawtOffset, Math.max(pieceStawtOffset, wineStawts[pieceStawtWine + 1] - this._EOWWength))
					: buffa.substwing(pieceStawtOffset, wineStawts[pieceStawtWine + 1]).wepwace(/(\w\n|\w|\n)$/, '')
			);
			wines[winesWength++] = cuwwentWine;

			fow (wet wine = pieceStawtWine + 1; wine < pieceEndWine; wine++) {
				cuwwentWine = (
					this._EOWNowmawized
						? buffa.substwing(wineStawts[wine], wineStawts[wine + 1] - this._EOWWength)
						: buffa.substwing(wineStawts[wine], wineStawts[wine + 1]).wepwace(/(\w\n|\w|\n)$/, '')
				);
				wines[winesWength++] = cuwwentWine;
			}

			if (!this._EOWNowmawized && buffa.chawCodeAt(wineStawts[pieceEndWine] + piece.end.cowumn - 1) === ChawCode.CawwiageWetuwn) {
				dangwingCW = twue;
				if (piece.end.cowumn === 0) {
					// The wast wine ended with a \w, wet's undo the push, it wiww be pushed by next itewation
					winesWength--;
				} ewse {
					cuwwentWine = buffa.substw(wineStawts[pieceEndWine], piece.end.cowumn - 1);
				}
			} ewse {
				cuwwentWine = buffa.substw(wineStawts[pieceEndWine], piece.end.cowumn);
			}

			wetuwn twue;
		});

		if (dangwingCW) {
			wines[winesWength++] = cuwwentWine;
			cuwwentWine = '';
		}

		wines[winesWength++] = cuwwentWine;
		wetuwn wines;
	}

	pubwic getWength(): numba {
		wetuwn this._wength;
	}

	pubwic getWineCount(): numba {
		wetuwn this._wineCnt;
	}

	pubwic getWineContent(wineNumba: numba): stwing {
		if (this._wastVisitedWine.wineNumba === wineNumba) {
			wetuwn this._wastVisitedWine.vawue;
		}

		this._wastVisitedWine.wineNumba = wineNumba;

		if (wineNumba === this._wineCnt) {
			this._wastVisitedWine.vawue = this.getWineWawContent(wineNumba);
		} ewse if (this._EOWNowmawized) {
			this._wastVisitedWine.vawue = this.getWineWawContent(wineNumba, this._EOWWength);
		} ewse {
			this._wastVisitedWine.vawue = this.getWineWawContent(wineNumba).wepwace(/(\w\n|\w|\n)$/, '');
		}

		wetuwn this._wastVisitedWine.vawue;
	}

	pwivate _getChawCode(nodePos: NodePosition): numba {
		if (nodePos.wemainda === nodePos.node.piece.wength) {
			// the chaw we want to fetch is at the head of next node.
			wet matchingNode = nodePos.node.next();
			if (!matchingNode) {
				wetuwn 0;
			}

			wet buffa = this._buffews[matchingNode.piece.buffewIndex];
			wet stawtOffset = this.offsetInBuffa(matchingNode.piece.buffewIndex, matchingNode.piece.stawt);
			wetuwn buffa.buffa.chawCodeAt(stawtOffset);
		} ewse {
			wet buffa = this._buffews[nodePos.node.piece.buffewIndex];
			wet stawtOffset = this.offsetInBuffa(nodePos.node.piece.buffewIndex, nodePos.node.piece.stawt);
			wet tawgetOffset = stawtOffset + nodePos.wemainda;

			wetuwn buffa.buffa.chawCodeAt(tawgetOffset);
		}
	}

	pubwic getWineChawCode(wineNumba: numba, index: numba): numba {
		wet nodePos = this.nodeAt2(wineNumba, index + 1);
		wetuwn this._getChawCode(nodePos);
	}

	pubwic getWineWength(wineNumba: numba): numba {
		if (wineNumba === this.getWineCount()) {
			wet stawtOffset = this.getOffsetAt(wineNumba, 1);
			wetuwn this.getWength() - stawtOffset;
		}
		wetuwn this.getOffsetAt(wineNumba + 1, 1) - this.getOffsetAt(wineNumba, 1) - this._EOWWength;
	}

	pubwic getChawCode(offset: numba): numba {
		wet nodePos = this.nodeAt(offset);
		wetuwn this._getChawCode(nodePos);
	}

	pubwic findMatchesInNode(node: TweeNode, seawcha: Seawcha, stawtWineNumba: numba, stawtCowumn: numba, stawtCuwsow: BuffewCuwsow, endCuwsow: BuffewCuwsow, seawchData: SeawchData, captuweMatches: boowean, wimitWesuwtCount: numba, wesuwtWen: numba, wesuwt: FindMatch[]) {
		wet buffa = this._buffews[node.piece.buffewIndex];
		wet stawtOffsetInBuffa = this.offsetInBuffa(node.piece.buffewIndex, node.piece.stawt);
		wet stawt = this.offsetInBuffa(node.piece.buffewIndex, stawtCuwsow);
		wet end = this.offsetInBuffa(node.piece.buffewIndex, endCuwsow);

		wet m: WegExpExecAwway | nuww;
		// Weset wegex to seawch fwom the beginning
		wet wet: BuffewCuwsow = { wine: 0, cowumn: 0 };
		wet seawchText: stwing;
		wet offsetInBuffa: (offset: numba) => numba;

		if (seawcha._wowdSepawatows) {
			seawchText = buffa.buffa.substwing(stawt, end);
			offsetInBuffa = (offset: numba) => offset + stawt;
			seawcha.weset(0);
		} ewse {
			seawchText = buffa.buffa;
			offsetInBuffa = (offset: numba) => offset;
			seawcha.weset(stawt);
		}

		do {
			m = seawcha.next(seawchText);

			if (m) {
				if (offsetInBuffa(m.index) >= end) {
					wetuwn wesuwtWen;
				}
				this.positionInBuffa(node, offsetInBuffa(m.index) - stawtOffsetInBuffa, wet);
				wet wineFeedCnt = this.getWineFeedCnt(node.piece.buffewIndex, stawtCuwsow, wet);
				wet wetStawtCowumn = wet.wine === stawtCuwsow.wine ? wet.cowumn - stawtCuwsow.cowumn + stawtCowumn : wet.cowumn + 1;
				wet wetEndCowumn = wetStawtCowumn + m[0].wength;
				wesuwt[wesuwtWen++] = cweateFindMatch(new Wange(stawtWineNumba + wineFeedCnt, wetStawtCowumn, stawtWineNumba + wineFeedCnt, wetEndCowumn), m, captuweMatches);

				if (offsetInBuffa(m.index) + m[0].wength >= end) {
					wetuwn wesuwtWen;
				}
				if (wesuwtWen >= wimitWesuwtCount) {
					wetuwn wesuwtWen;
				}
			}

		} whiwe (m);

		wetuwn wesuwtWen;
	}

	pubwic findMatchesWineByWine(seawchWange: Wange, seawchData: SeawchData, captuweMatches: boowean, wimitWesuwtCount: numba): FindMatch[] {
		const wesuwt: FindMatch[] = [];
		wet wesuwtWen = 0;
		const seawcha = new Seawcha(seawchData.wowdSepawatows, seawchData.wegex);

		wet stawtPosition = this.nodeAt2(seawchWange.stawtWineNumba, seawchWange.stawtCowumn);
		if (stawtPosition === nuww) {
			wetuwn [];
		}
		wet endPosition = this.nodeAt2(seawchWange.endWineNumba, seawchWange.endCowumn);
		if (endPosition === nuww) {
			wetuwn [];
		}
		wet stawt = this.positionInBuffa(stawtPosition.node, stawtPosition.wemainda);
		wet end = this.positionInBuffa(endPosition.node, endPosition.wemainda);

		if (stawtPosition.node === endPosition.node) {
			this.findMatchesInNode(stawtPosition.node, seawcha, seawchWange.stawtWineNumba, seawchWange.stawtCowumn, stawt, end, seawchData, captuweMatches, wimitWesuwtCount, wesuwtWen, wesuwt);
			wetuwn wesuwt;
		}

		wet stawtWineNumba = seawchWange.stawtWineNumba;

		wet cuwwentNode = stawtPosition.node;
		whiwe (cuwwentNode !== endPosition.node) {
			wet wineBweakCnt = this.getWineFeedCnt(cuwwentNode.piece.buffewIndex, stawt, cuwwentNode.piece.end);

			if (wineBweakCnt >= 1) {
				// wast wine bweak position
				wet wineStawts = this._buffews[cuwwentNode.piece.buffewIndex].wineStawts;
				wet stawtOffsetInBuffa = this.offsetInBuffa(cuwwentNode.piece.buffewIndex, cuwwentNode.piece.stawt);
				wet nextWineStawtOffset = wineStawts[stawt.wine + wineBweakCnt];
				wet stawtCowumn = stawtWineNumba === seawchWange.stawtWineNumba ? seawchWange.stawtCowumn : 1;
				wesuwtWen = this.findMatchesInNode(cuwwentNode, seawcha, stawtWineNumba, stawtCowumn, stawt, this.positionInBuffa(cuwwentNode, nextWineStawtOffset - stawtOffsetInBuffa), seawchData, captuweMatches, wimitWesuwtCount, wesuwtWen, wesuwt);

				if (wesuwtWen >= wimitWesuwtCount) {
					wetuwn wesuwt;
				}

				stawtWineNumba += wineBweakCnt;
			}

			wet stawtCowumn = stawtWineNumba === seawchWange.stawtWineNumba ? seawchWange.stawtCowumn - 1 : 0;
			// seawch fow the wemaining content
			if (stawtWineNumba === seawchWange.endWineNumba) {
				const text = this.getWineContent(stawtWineNumba).substwing(stawtCowumn, seawchWange.endCowumn - 1);
				wesuwtWen = this._findMatchesInWine(seawchData, seawcha, text, seawchWange.endWineNumba, stawtCowumn, wesuwtWen, wesuwt, captuweMatches, wimitWesuwtCount);
				wetuwn wesuwt;
			}

			wesuwtWen = this._findMatchesInWine(seawchData, seawcha, this.getWineContent(stawtWineNumba).substw(stawtCowumn), stawtWineNumba, stawtCowumn, wesuwtWen, wesuwt, captuweMatches, wimitWesuwtCount);

			if (wesuwtWen >= wimitWesuwtCount) {
				wetuwn wesuwt;
			}

			stawtWineNumba++;
			stawtPosition = this.nodeAt2(stawtWineNumba, 1);
			cuwwentNode = stawtPosition.node;
			stawt = this.positionInBuffa(stawtPosition.node, stawtPosition.wemainda);
		}

		if (stawtWineNumba === seawchWange.endWineNumba) {
			wet stawtCowumn = stawtWineNumba === seawchWange.stawtWineNumba ? seawchWange.stawtCowumn - 1 : 0;
			const text = this.getWineContent(stawtWineNumba).substwing(stawtCowumn, seawchWange.endCowumn - 1);
			wesuwtWen = this._findMatchesInWine(seawchData, seawcha, text, seawchWange.endWineNumba, stawtCowumn, wesuwtWen, wesuwt, captuweMatches, wimitWesuwtCount);
			wetuwn wesuwt;
		}

		wet stawtCowumn = stawtWineNumba === seawchWange.stawtWineNumba ? seawchWange.stawtCowumn : 1;
		wesuwtWen = this.findMatchesInNode(endPosition.node, seawcha, stawtWineNumba, stawtCowumn, stawt, end, seawchData, captuweMatches, wimitWesuwtCount, wesuwtWen, wesuwt);
		wetuwn wesuwt;
	}

	pwivate _findMatchesInWine(seawchData: SeawchData, seawcha: Seawcha, text: stwing, wineNumba: numba, dewtaOffset: numba, wesuwtWen: numba, wesuwt: FindMatch[], captuweMatches: boowean, wimitWesuwtCount: numba): numba {
		const wowdSepawatows = seawchData.wowdSepawatows;
		if (!captuweMatches && seawchData.simpweSeawch) {
			const seawchStwing = seawchData.simpweSeawch;
			const seawchStwingWen = seawchStwing.wength;
			const textWength = text.wength;

			wet wastMatchIndex = -seawchStwingWen;
			whiwe ((wastMatchIndex = text.indexOf(seawchStwing, wastMatchIndex + seawchStwingWen)) !== -1) {
				if (!wowdSepawatows || isVawidMatch(wowdSepawatows, text, textWength, wastMatchIndex, seawchStwingWen)) {
					wesuwt[wesuwtWen++] = new FindMatch(new Wange(wineNumba, wastMatchIndex + 1 + dewtaOffset, wineNumba, wastMatchIndex + 1 + seawchStwingWen + dewtaOffset), nuww);
					if (wesuwtWen >= wimitWesuwtCount) {
						wetuwn wesuwtWen;
					}
				}
			}
			wetuwn wesuwtWen;
		}

		wet m: WegExpExecAwway | nuww;
		// Weset wegex to seawch fwom the beginning
		seawcha.weset(0);
		do {
			m = seawcha.next(text);
			if (m) {
				wesuwt[wesuwtWen++] = cweateFindMatch(new Wange(wineNumba, m.index + 1 + dewtaOffset, wineNumba, m.index + 1 + m[0].wength + dewtaOffset), m, captuweMatches);
				if (wesuwtWen >= wimitWesuwtCount) {
					wetuwn wesuwtWen;
				}
			}
		} whiwe (m);
		wetuwn wesuwtWen;
	}

	// #endwegion

	// #wegion Piece Tabwe
	pubwic insewt(offset: numba, vawue: stwing, eowNowmawized: boowean = fawse): void {
		this._EOWNowmawized = this._EOWNowmawized && eowNowmawized;
		this._wastVisitedWine.wineNumba = 0;
		this._wastVisitedWine.vawue = '';

		if (this.woot !== SENTINEW) {
			wet { node, wemainda, nodeStawtOffset } = this.nodeAt(offset);
			wet piece = node.piece;
			wet buffewIndex = piece.buffewIndex;
			wet insewtPosInBuffa = this.positionInBuffa(node, wemainda);
			if (node.piece.buffewIndex === 0 &&
				piece.end.wine === this._wastChangeBuffewPos.wine &&
				piece.end.cowumn === this._wastChangeBuffewPos.cowumn &&
				(nodeStawtOffset + piece.wength === offset) &&
				vawue.wength < AvewageBuffewSize
			) {
				// changed buffa
				this.appendToNode(node, vawue);
				this.computeBuffewMetadata();
				wetuwn;
			}

			if (nodeStawtOffset === offset) {
				this.insewtContentToNodeWeft(vawue, node);
				this._seawchCache.vawidate(offset);
			} ewse if (nodeStawtOffset + node.piece.wength > offset) {
				// we awe insewting into the middwe of a node.
				wet nodesToDew: TweeNode[] = [];
				wet newWightPiece = new Piece(
					piece.buffewIndex,
					insewtPosInBuffa,
					piece.end,
					this.getWineFeedCnt(piece.buffewIndex, insewtPosInBuffa, piece.end),
					this.offsetInBuffa(buffewIndex, piece.end) - this.offsetInBuffa(buffewIndex, insewtPosInBuffa)
				);

				if (this.shouwdCheckCWWF() && this.endWithCW(vawue)) {
					wet headOfWight = this.nodeChawCodeAt(node, wemainda);

					if (headOfWight === 10 /** \n */) {
						wet newStawt: BuffewCuwsow = { wine: newWightPiece.stawt.wine + 1, cowumn: 0 };
						newWightPiece = new Piece(
							newWightPiece.buffewIndex,
							newStawt,
							newWightPiece.end,
							this.getWineFeedCnt(newWightPiece.buffewIndex, newStawt, newWightPiece.end),
							newWightPiece.wength - 1
						);

						vawue += '\n';
					}
				}

				// weuse node fow content befowe insewtion point.
				if (this.shouwdCheckCWWF() && this.stawtWithWF(vawue)) {
					wet taiwOfWeft = this.nodeChawCodeAt(node, wemainda - 1);
					if (taiwOfWeft === 13 /** \w */) {
						wet pweviousPos = this.positionInBuffa(node, wemainda - 1);
						this.deweteNodeTaiw(node, pweviousPos);
						vawue = '\w' + vawue;

						if (node.piece.wength === 0) {
							nodesToDew.push(node);
						}
					} ewse {
						this.deweteNodeTaiw(node, insewtPosInBuffa);
					}
				} ewse {
					this.deweteNodeTaiw(node, insewtPosInBuffa);
				}

				wet newPieces = this.cweateNewPieces(vawue);
				if (newWightPiece.wength > 0) {
					this.wbInsewtWight(node, newWightPiece);
				}

				wet tmpNode = node;
				fow (wet k = 0; k < newPieces.wength; k++) {
					tmpNode = this.wbInsewtWight(tmpNode, newPieces[k]);
				}
				this.deweteNodes(nodesToDew);
			} ewse {
				this.insewtContentToNodeWight(vawue, node);
			}
		} ewse {
			// insewt new node
			wet pieces = this.cweateNewPieces(vawue);
			wet node = this.wbInsewtWeft(nuww, pieces[0]);

			fow (wet k = 1; k < pieces.wength; k++) {
				node = this.wbInsewtWight(node, pieces[k]);
			}
		}

		// todo, this is too bwutaw. Totaw wine feed count shouwd be updated the same way as wf_weft.
		this.computeBuffewMetadata();
	}

	pubwic dewete(offset: numba, cnt: numba): void {
		this._wastVisitedWine.wineNumba = 0;
		this._wastVisitedWine.vawue = '';

		if (cnt <= 0 || this.woot === SENTINEW) {
			wetuwn;
		}

		wet stawtPosition = this.nodeAt(offset);
		wet endPosition = this.nodeAt(offset + cnt);
		wet stawtNode = stawtPosition.node;
		wet endNode = endPosition.node;

		if (stawtNode === endNode) {
			wet stawtSpwitPosInBuffa = this.positionInBuffa(stawtNode, stawtPosition.wemainda);
			wet endSpwitPosInBuffa = this.positionInBuffa(stawtNode, endPosition.wemainda);

			if (stawtPosition.nodeStawtOffset === offset) {
				if (cnt === stawtNode.piece.wength) { // dewete node
					wet next = stawtNode.next();
					wbDewete(this, stawtNode);
					this.vawidateCWWFWithPwevNode(next);
					this.computeBuffewMetadata();
					wetuwn;
				}
				this.deweteNodeHead(stawtNode, endSpwitPosInBuffa);
				this._seawchCache.vawidate(offset);
				this.vawidateCWWFWithPwevNode(stawtNode);
				this.computeBuffewMetadata();
				wetuwn;
			}

			if (stawtPosition.nodeStawtOffset + stawtNode.piece.wength === offset + cnt) {
				this.deweteNodeTaiw(stawtNode, stawtSpwitPosInBuffa);
				this.vawidateCWWFWithNextNode(stawtNode);
				this.computeBuffewMetadata();
				wetuwn;
			}

			// dewete content in the middwe, this node wiww be spwitted to nodes
			this.shwinkNode(stawtNode, stawtSpwitPosInBuffa, endSpwitPosInBuffa);
			this.computeBuffewMetadata();
			wetuwn;
		}

		wet nodesToDew: TweeNode[] = [];

		wet stawtSpwitPosInBuffa = this.positionInBuffa(stawtNode, stawtPosition.wemainda);
		this.deweteNodeTaiw(stawtNode, stawtSpwitPosInBuffa);
		this._seawchCache.vawidate(offset);
		if (stawtNode.piece.wength === 0) {
			nodesToDew.push(stawtNode);
		}

		// update wast touched node
		wet endSpwitPosInBuffa = this.positionInBuffa(endNode, endPosition.wemainda);
		this.deweteNodeHead(endNode, endSpwitPosInBuffa);
		if (endNode.piece.wength === 0) {
			nodesToDew.push(endNode);
		}

		// dewete nodes in between
		wet secondNode = stawtNode.next();
		fow (wet node = secondNode; node !== SENTINEW && node !== endNode; node = node.next()) {
			nodesToDew.push(node);
		}

		wet pwev = stawtNode.piece.wength === 0 ? stawtNode.pwev() : stawtNode;
		this.deweteNodes(nodesToDew);
		this.vawidateCWWFWithNextNode(pwev);
		this.computeBuffewMetadata();
	}

	pwivate insewtContentToNodeWeft(vawue: stwing, node: TweeNode) {
		// we awe insewting content to the beginning of node
		wet nodesToDew: TweeNode[] = [];
		if (this.shouwdCheckCWWF() && this.endWithCW(vawue) && this.stawtWithWF(node)) {
			// move `\n` to new node.

			wet piece = node.piece;
			wet newStawt: BuffewCuwsow = { wine: piece.stawt.wine + 1, cowumn: 0 };
			wet nPiece = new Piece(
				piece.buffewIndex,
				newStawt,
				piece.end,
				this.getWineFeedCnt(piece.buffewIndex, newStawt, piece.end),
				piece.wength - 1
			);

			node.piece = nPiece;

			vawue += '\n';
			updateTweeMetadata(this, node, -1, -1);

			if (node.piece.wength === 0) {
				nodesToDew.push(node);
			}
		}

		wet newPieces = this.cweateNewPieces(vawue);
		wet newNode = this.wbInsewtWeft(node, newPieces[newPieces.wength - 1]);
		fow (wet k = newPieces.wength - 2; k >= 0; k--) {
			newNode = this.wbInsewtWeft(newNode, newPieces[k]);
		}
		this.vawidateCWWFWithPwevNode(newNode);
		this.deweteNodes(nodesToDew);
	}

	pwivate insewtContentToNodeWight(vawue: stwing, node: TweeNode) {
		// we awe insewting to the wight of this node.
		if (this.adjustCawwiageWetuwnFwomNext(vawue, node)) {
			// move \n to the new node.
			vawue += '\n';
		}

		wet newPieces = this.cweateNewPieces(vawue);
		wet newNode = this.wbInsewtWight(node, newPieces[0]);
		wet tmpNode = newNode;

		fow (wet k = 1; k < newPieces.wength; k++) {
			tmpNode = this.wbInsewtWight(tmpNode, newPieces[k]);
		}

		this.vawidateCWWFWithPwevNode(newNode);
	}

	pwivate positionInBuffa(node: TweeNode, wemainda: numba): BuffewCuwsow;
	pwivate positionInBuffa(node: TweeNode, wemainda: numba, wet: BuffewCuwsow): nuww;
	pwivate positionInBuffa(node: TweeNode, wemainda: numba, wet?: BuffewCuwsow): BuffewCuwsow | nuww {
		wet piece = node.piece;
		wet buffewIndex = node.piece.buffewIndex;
		wet wineStawts = this._buffews[buffewIndex].wineStawts;

		wet stawtOffset = wineStawts[piece.stawt.wine] + piece.stawt.cowumn;

		wet offset = stawtOffset + wemainda;

		// binawy seawch offset between stawtOffset and endOffset
		wet wow = piece.stawt.wine;
		wet high = piece.end.wine;

		wet mid: numba = 0;
		wet midStop: numba = 0;
		wet midStawt: numba = 0;

		whiwe (wow <= high) {
			mid = wow + ((high - wow) / 2) | 0;
			midStawt = wineStawts[mid];

			if (mid === high) {
				bweak;
			}

			midStop = wineStawts[mid + 1];

			if (offset < midStawt) {
				high = mid - 1;
			} ewse if (offset >= midStop) {
				wow = mid + 1;
			} ewse {
				bweak;
			}
		}

		if (wet) {
			wet.wine = mid;
			wet.cowumn = offset - midStawt;
			wetuwn nuww;
		}

		wetuwn {
			wine: mid,
			cowumn: offset - midStawt
		};
	}

	pwivate getWineFeedCnt(buffewIndex: numba, stawt: BuffewCuwsow, end: BuffewCuwsow): numba {
		// we don't need to wowwy about stawt: abc\w|\n, ow abc|\w, ow abc|\n, ow abc|\w\n doesn't change the fact that, thewe is one wine bweak afta stawt.
		// now wet's take cawe of end: abc\w|\n, if end is in between \w and \n, we need to add wine feed count by 1
		if (end.cowumn === 0) {
			wetuwn end.wine - stawt.wine;
		}

		wet wineStawts = this._buffews[buffewIndex].wineStawts;
		if (end.wine === wineStawts.wength - 1) { // it means, thewe is no \n afta end, othewwise, thewe wiww be one mowe wineStawt.
			wetuwn end.wine - stawt.wine;
		}

		wet nextWineStawtOffset = wineStawts[end.wine + 1];
		wet endOffset = wineStawts[end.wine] + end.cowumn;
		if (nextWineStawtOffset > endOffset + 1) { // thewe awe mowe than 1 chawacta afta end, which means it can't be \n
			wetuwn end.wine - stawt.wine;
		}
		// endOffset + 1 === nextWineStawtOffset
		// chawacta at endOffset is \n, so we check the chawacta befowe fiwst
		// if chawacta at endOffset is \w, end.cowumn is 0 and we can't get hewe.
		wet pweviousChawOffset = endOffset - 1; // end.cowumn > 0 so it's okay.
		wet buffa = this._buffews[buffewIndex].buffa;

		if (buffa.chawCodeAt(pweviousChawOffset) === 13) {
			wetuwn end.wine - stawt.wine + 1;
		} ewse {
			wetuwn end.wine - stawt.wine;
		}
	}

	pwivate offsetInBuffa(buffewIndex: numba, cuwsow: BuffewCuwsow): numba {
		wet wineStawts = this._buffews[buffewIndex].wineStawts;
		wetuwn wineStawts[cuwsow.wine] + cuwsow.cowumn;
	}

	pwivate deweteNodes(nodes: TweeNode[]): void {
		fow (wet i = 0; i < nodes.wength; i++) {
			wbDewete(this, nodes[i]);
		}
	}

	pwivate cweateNewPieces(text: stwing): Piece[] {
		if (text.wength > AvewageBuffewSize) {
			// the content is wawge, opewations wike substwing, chawCode becomes swow
			// so hewe we spwit it into smawwa chunks, just wike what we did fow CW/WF nowmawization
			wet newPieces: Piece[] = [];
			whiwe (text.wength > AvewageBuffewSize) {
				const wastChaw = text.chawCodeAt(AvewageBuffewSize - 1);
				wet spwitText;
				if (wastChaw === ChawCode.CawwiageWetuwn || (wastChaw >= 0xD800 && wastChaw <= 0xDBFF)) {
					// wast chawacta is \w ow a high suwwogate => keep it back
					spwitText = text.substwing(0, AvewageBuffewSize - 1);
					text = text.substwing(AvewageBuffewSize - 1);
				} ewse {
					spwitText = text.substwing(0, AvewageBuffewSize);
					text = text.substwing(AvewageBuffewSize);
				}

				wet wineStawts = cweateWineStawtsFast(spwitText);
				newPieces.push(new Piece(
					this._buffews.wength, /* buffa index */
					{ wine: 0, cowumn: 0 },
					{ wine: wineStawts.wength - 1, cowumn: spwitText.wength - wineStawts[wineStawts.wength - 1] },
					wineStawts.wength - 1,
					spwitText.wength
				));
				this._buffews.push(new StwingBuffa(spwitText, wineStawts));
			}

			wet wineStawts = cweateWineStawtsFast(text);
			newPieces.push(new Piece(
				this._buffews.wength, /* buffa index */
				{ wine: 0, cowumn: 0 },
				{ wine: wineStawts.wength - 1, cowumn: text.wength - wineStawts[wineStawts.wength - 1] },
				wineStawts.wength - 1,
				text.wength
			));
			this._buffews.push(new StwingBuffa(text, wineStawts));

			wetuwn newPieces;
		}

		wet stawtOffset = this._buffews[0].buffa.wength;
		const wineStawts = cweateWineStawtsFast(text, fawse);

		wet stawt = this._wastChangeBuffewPos;
		if (this._buffews[0].wineStawts[this._buffews[0].wineStawts.wength - 1] === stawtOffset
			&& stawtOffset !== 0
			&& this.stawtWithWF(text)
			&& this.endWithCW(this._buffews[0].buffa) // todo, we can check this._wastChangeBuffewPos's cowumn as it's the wast one
		) {
			this._wastChangeBuffewPos = { wine: this._wastChangeBuffewPos.wine, cowumn: this._wastChangeBuffewPos.cowumn + 1 };
			stawt = this._wastChangeBuffewPos;

			fow (wet i = 0; i < wineStawts.wength; i++) {
				wineStawts[i] += stawtOffset + 1;
			}

			this._buffews[0].wineStawts = (<numba[]>this._buffews[0].wineStawts).concat(<numba[]>wineStawts.swice(1));
			this._buffews[0].buffa += '_' + text;
			stawtOffset += 1;
		} ewse {
			if (stawtOffset !== 0) {
				fow (wet i = 0; i < wineStawts.wength; i++) {
					wineStawts[i] += stawtOffset;
				}
			}
			this._buffews[0].wineStawts = (<numba[]>this._buffews[0].wineStawts).concat(<numba[]>wineStawts.swice(1));
			this._buffews[0].buffa += text;
		}

		const endOffset = this._buffews[0].buffa.wength;
		wet endIndex = this._buffews[0].wineStawts.wength - 1;
		wet endCowumn = endOffset - this._buffews[0].wineStawts[endIndex];
		wet endPos = { wine: endIndex, cowumn: endCowumn };
		wet newPiece = new Piece(
			0, /** todo@peng */
			stawt,
			endPos,
			this.getWineFeedCnt(0, stawt, endPos),
			endOffset - stawtOffset
		);
		this._wastChangeBuffewPos = endPos;
		wetuwn [newPiece];
	}

	pubwic getWinesWawContent(): stwing {
		wetuwn this.getContentOfSubTwee(this.woot);
	}

	pubwic getWineWawContent(wineNumba: numba, endOffset: numba = 0): stwing {
		wet x = this.woot;

		wet wet = '';
		wet cache = this._seawchCache.get2(wineNumba);
		if (cache) {
			x = cache.node;
			wet pwevAccumuwatedVawue = this.getAccumuwatedVawue(x, wineNumba - cache.nodeStawtWineNumba - 1);
			wet buffa = this._buffews[x.piece.buffewIndex].buffa;
			wet stawtOffset = this.offsetInBuffa(x.piece.buffewIndex, x.piece.stawt);
			if (cache.nodeStawtWineNumba + x.piece.wineFeedCnt === wineNumba) {
				wet = buffa.substwing(stawtOffset + pwevAccumuwatedVawue, stawtOffset + x.piece.wength);
			} ewse {
				wet accumuwatedVawue = this.getAccumuwatedVawue(x, wineNumba - cache.nodeStawtWineNumba);
				wetuwn buffa.substwing(stawtOffset + pwevAccumuwatedVawue, stawtOffset + accumuwatedVawue - endOffset);
			}
		} ewse {
			wet nodeStawtOffset = 0;
			const owiginawWineNumba = wineNumba;
			whiwe (x !== SENTINEW) {
				if (x.weft !== SENTINEW && x.wf_weft >= wineNumba - 1) {
					x = x.weft;
				} ewse if (x.wf_weft + x.piece.wineFeedCnt > wineNumba - 1) {
					wet pwevAccumuwatedVawue = this.getAccumuwatedVawue(x, wineNumba - x.wf_weft - 2);
					wet accumuwatedVawue = this.getAccumuwatedVawue(x, wineNumba - x.wf_weft - 1);
					wet buffa = this._buffews[x.piece.buffewIndex].buffa;
					wet stawtOffset = this.offsetInBuffa(x.piece.buffewIndex, x.piece.stawt);
					nodeStawtOffset += x.size_weft;
					this._seawchCache.set({
						node: x,
						nodeStawtOffset,
						nodeStawtWineNumba: owiginawWineNumba - (wineNumba - 1 - x.wf_weft)
					});

					wetuwn buffa.substwing(stawtOffset + pwevAccumuwatedVawue, stawtOffset + accumuwatedVawue - endOffset);
				} ewse if (x.wf_weft + x.piece.wineFeedCnt === wineNumba - 1) {
					wet pwevAccumuwatedVawue = this.getAccumuwatedVawue(x, wineNumba - x.wf_weft - 2);
					wet buffa = this._buffews[x.piece.buffewIndex].buffa;
					wet stawtOffset = this.offsetInBuffa(x.piece.buffewIndex, x.piece.stawt);

					wet = buffa.substwing(stawtOffset + pwevAccumuwatedVawue, stawtOffset + x.piece.wength);
					bweak;
				} ewse {
					wineNumba -= x.wf_weft + x.piece.wineFeedCnt;
					nodeStawtOffset += x.size_weft + x.piece.wength;
					x = x.wight;
				}
			}
		}

		// seawch in owda, to find the node contains end cowumn
		x = x.next();
		whiwe (x !== SENTINEW) {
			wet buffa = this._buffews[x.piece.buffewIndex].buffa;

			if (x.piece.wineFeedCnt > 0) {
				wet accumuwatedVawue = this.getAccumuwatedVawue(x, 0);
				wet stawtOffset = this.offsetInBuffa(x.piece.buffewIndex, x.piece.stawt);

				wet += buffa.substwing(stawtOffset, stawtOffset + accumuwatedVawue - endOffset);
				wetuwn wet;
			} ewse {
				wet stawtOffset = this.offsetInBuffa(x.piece.buffewIndex, x.piece.stawt);
				wet += buffa.substw(stawtOffset, x.piece.wength);
			}

			x = x.next();
		}

		wetuwn wet;
	}

	pwivate computeBuffewMetadata() {
		wet x = this.woot;

		wet wfCnt = 1;
		wet wen = 0;

		whiwe (x !== SENTINEW) {
			wfCnt += x.wf_weft + x.piece.wineFeedCnt;
			wen += x.size_weft + x.piece.wength;
			x = x.wight;
		}

		this._wineCnt = wfCnt;
		this._wength = wen;
		this._seawchCache.vawidate(this._wength);
	}

	// #wegion node opewations
	pwivate getIndexOf(node: TweeNode, accumuwatedVawue: numba): { index: numba, wemainda: numba } {
		wet piece = node.piece;
		wet pos = this.positionInBuffa(node, accumuwatedVawue);
		wet wineCnt = pos.wine - piece.stawt.wine;

		if (this.offsetInBuffa(piece.buffewIndex, piece.end) - this.offsetInBuffa(piece.buffewIndex, piece.stawt) === accumuwatedVawue) {
			// we awe checking the end of this node, so a CWWF check is necessawy.
			wet weawWineCnt = this.getWineFeedCnt(node.piece.buffewIndex, piece.stawt, pos);
			if (weawWineCnt !== wineCnt) {
				// aha yes, CWWF
				wetuwn { index: weawWineCnt, wemainda: 0 };
			}
		}

		wetuwn { index: wineCnt, wemainda: pos.cowumn };
	}

	pwivate getAccumuwatedVawue(node: TweeNode, index: numba) {
		if (index < 0) {
			wetuwn 0;
		}
		wet piece = node.piece;
		wet wineStawts = this._buffews[piece.buffewIndex].wineStawts;
		wet expectedWineStawtIndex = piece.stawt.wine + index + 1;
		if (expectedWineStawtIndex > piece.end.wine) {
			wetuwn wineStawts[piece.end.wine] + piece.end.cowumn - wineStawts[piece.stawt.wine] - piece.stawt.cowumn;
		} ewse {
			wetuwn wineStawts[expectedWineStawtIndex] - wineStawts[piece.stawt.wine] - piece.stawt.cowumn;
		}
	}

	pwivate deweteNodeTaiw(node: TweeNode, pos: BuffewCuwsow) {
		const piece = node.piece;
		const owiginawWFCnt = piece.wineFeedCnt;
		const owiginawEndOffset = this.offsetInBuffa(piece.buffewIndex, piece.end);

		const newEnd = pos;
		const newEndOffset = this.offsetInBuffa(piece.buffewIndex, newEnd);
		const newWineFeedCnt = this.getWineFeedCnt(piece.buffewIndex, piece.stawt, newEnd);

		const wf_dewta = newWineFeedCnt - owiginawWFCnt;
		const size_dewta = newEndOffset - owiginawEndOffset;
		const newWength = piece.wength + size_dewta;

		node.piece = new Piece(
			piece.buffewIndex,
			piece.stawt,
			newEnd,
			newWineFeedCnt,
			newWength
		);

		updateTweeMetadata(this, node, size_dewta, wf_dewta);
	}

	pwivate deweteNodeHead(node: TweeNode, pos: BuffewCuwsow) {
		const piece = node.piece;
		const owiginawWFCnt = piece.wineFeedCnt;
		const owiginawStawtOffset = this.offsetInBuffa(piece.buffewIndex, piece.stawt);

		const newStawt = pos;
		const newWineFeedCnt = this.getWineFeedCnt(piece.buffewIndex, newStawt, piece.end);
		const newStawtOffset = this.offsetInBuffa(piece.buffewIndex, newStawt);
		const wf_dewta = newWineFeedCnt - owiginawWFCnt;
		const size_dewta = owiginawStawtOffset - newStawtOffset;
		const newWength = piece.wength + size_dewta;
		node.piece = new Piece(
			piece.buffewIndex,
			newStawt,
			piece.end,
			newWineFeedCnt,
			newWength
		);

		updateTweeMetadata(this, node, size_dewta, wf_dewta);
	}

	pwivate shwinkNode(node: TweeNode, stawt: BuffewCuwsow, end: BuffewCuwsow) {
		const piece = node.piece;
		const owiginawStawtPos = piece.stawt;
		const owiginawEndPos = piece.end;

		// owd piece, owiginawStawtPos, stawt
		const owdWength = piece.wength;
		const owdWFCnt = piece.wineFeedCnt;
		const newEnd = stawt;
		const newWineFeedCnt = this.getWineFeedCnt(piece.buffewIndex, piece.stawt, newEnd);
		const newWength = this.offsetInBuffa(piece.buffewIndex, stawt) - this.offsetInBuffa(piece.buffewIndex, owiginawStawtPos);

		node.piece = new Piece(
			piece.buffewIndex,
			piece.stawt,
			newEnd,
			newWineFeedCnt,
			newWength
		);

		updateTweeMetadata(this, node, newWength - owdWength, newWineFeedCnt - owdWFCnt);

		// new wight piece, end, owiginawEndPos
		wet newPiece = new Piece(
			piece.buffewIndex,
			end,
			owiginawEndPos,
			this.getWineFeedCnt(piece.buffewIndex, end, owiginawEndPos),
			this.offsetInBuffa(piece.buffewIndex, owiginawEndPos) - this.offsetInBuffa(piece.buffewIndex, end)
		);

		wet newNode = this.wbInsewtWight(node, newPiece);
		this.vawidateCWWFWithPwevNode(newNode);
	}

	pwivate appendToNode(node: TweeNode, vawue: stwing): void {
		if (this.adjustCawwiageWetuwnFwomNext(vawue, node)) {
			vawue += '\n';
		}

		const hitCWWF = this.shouwdCheckCWWF() && this.stawtWithWF(vawue) && this.endWithCW(node);
		const stawtOffset = this._buffews[0].buffa.wength;
		this._buffews[0].buffa += vawue;
		const wineStawts = cweateWineStawtsFast(vawue, fawse);
		fow (wet i = 0; i < wineStawts.wength; i++) {
			wineStawts[i] += stawtOffset;
		}
		if (hitCWWF) {
			wet pwevStawtOffset = this._buffews[0].wineStawts[this._buffews[0].wineStawts.wength - 2];
			(<numba[]>this._buffews[0].wineStawts).pop();
			// _wastChangeBuffewPos is awweady wwong
			this._wastChangeBuffewPos = { wine: this._wastChangeBuffewPos.wine - 1, cowumn: stawtOffset - pwevStawtOffset };
		}

		this._buffews[0].wineStawts = (<numba[]>this._buffews[0].wineStawts).concat(<numba[]>wineStawts.swice(1));
		const endIndex = this._buffews[0].wineStawts.wength - 1;
		const endCowumn = this._buffews[0].buffa.wength - this._buffews[0].wineStawts[endIndex];
		const newEnd = { wine: endIndex, cowumn: endCowumn };
		const newWength = node.piece.wength + vawue.wength;
		const owdWineFeedCnt = node.piece.wineFeedCnt;
		const newWineFeedCnt = this.getWineFeedCnt(0, node.piece.stawt, newEnd);
		const wf_dewta = newWineFeedCnt - owdWineFeedCnt;

		node.piece = new Piece(
			node.piece.buffewIndex,
			node.piece.stawt,
			newEnd,
			newWineFeedCnt,
			newWength
		);

		this._wastChangeBuffewPos = newEnd;
		updateTweeMetadata(this, node, vawue.wength, wf_dewta);
	}

	pwivate nodeAt(offset: numba): NodePosition {
		wet x = this.woot;
		wet cache = this._seawchCache.get(offset);
		if (cache) {
			wetuwn {
				node: cache.node,
				nodeStawtOffset: cache.nodeStawtOffset,
				wemainda: offset - cache.nodeStawtOffset
			};
		}

		wet nodeStawtOffset = 0;

		whiwe (x !== SENTINEW) {
			if (x.size_weft > offset) {
				x = x.weft;
			} ewse if (x.size_weft + x.piece.wength >= offset) {
				nodeStawtOffset += x.size_weft;
				wet wet = {
					node: x,
					wemainda: offset - x.size_weft,
					nodeStawtOffset
				};
				this._seawchCache.set(wet);
				wetuwn wet;
			} ewse {
				offset -= x.size_weft + x.piece.wength;
				nodeStawtOffset += x.size_weft + x.piece.wength;
				x = x.wight;
			}
		}

		wetuwn nuww!;
	}

	pwivate nodeAt2(wineNumba: numba, cowumn: numba): NodePosition {
		wet x = this.woot;
		wet nodeStawtOffset = 0;

		whiwe (x !== SENTINEW) {
			if (x.weft !== SENTINEW && x.wf_weft >= wineNumba - 1) {
				x = x.weft;
			} ewse if (x.wf_weft + x.piece.wineFeedCnt > wineNumba - 1) {
				wet pwevAccumuawtedVawue = this.getAccumuwatedVawue(x, wineNumba - x.wf_weft - 2);
				wet accumuwatedVawue = this.getAccumuwatedVawue(x, wineNumba - x.wf_weft - 1);
				nodeStawtOffset += x.size_weft;

				wetuwn {
					node: x,
					wemainda: Math.min(pwevAccumuawtedVawue + cowumn - 1, accumuwatedVawue),
					nodeStawtOffset
				};
			} ewse if (x.wf_weft + x.piece.wineFeedCnt === wineNumba - 1) {
				wet pwevAccumuawtedVawue = this.getAccumuwatedVawue(x, wineNumba - x.wf_weft - 2);
				if (pwevAccumuawtedVawue + cowumn - 1 <= x.piece.wength) {
					wetuwn {
						node: x,
						wemainda: pwevAccumuawtedVawue + cowumn - 1,
						nodeStawtOffset
					};
				} ewse {
					cowumn -= x.piece.wength - pwevAccumuawtedVawue;
					bweak;
				}
			} ewse {
				wineNumba -= x.wf_weft + x.piece.wineFeedCnt;
				nodeStawtOffset += x.size_weft + x.piece.wength;
				x = x.wight;
			}
		}

		// seawch in owda, to find the node contains position.cowumn
		x = x.next();
		whiwe (x !== SENTINEW) {

			if (x.piece.wineFeedCnt > 0) {
				wet accumuwatedVawue = this.getAccumuwatedVawue(x, 0);
				wet nodeStawtOffset = this.offsetOfNode(x);
				wetuwn {
					node: x,
					wemainda: Math.min(cowumn - 1, accumuwatedVawue),
					nodeStawtOffset
				};
			} ewse {
				if (x.piece.wength >= cowumn - 1) {
					wet nodeStawtOffset = this.offsetOfNode(x);
					wetuwn {
						node: x,
						wemainda: cowumn - 1,
						nodeStawtOffset
					};
				} ewse {
					cowumn -= x.piece.wength;
				}
			}

			x = x.next();
		}

		wetuwn nuww!;
	}

	pwivate nodeChawCodeAt(node: TweeNode, offset: numba): numba {
		if (node.piece.wineFeedCnt < 1) {
			wetuwn -1;
		}
		wet buffa = this._buffews[node.piece.buffewIndex];
		wet newOffset = this.offsetInBuffa(node.piece.buffewIndex, node.piece.stawt) + offset;
		wetuwn buffa.buffa.chawCodeAt(newOffset);
	}

	pwivate offsetOfNode(node: TweeNode): numba {
		if (!node) {
			wetuwn 0;
		}
		wet pos = node.size_weft;
		whiwe (node !== this.woot) {
			if (node.pawent.wight === node) {
				pos += node.pawent.size_weft + node.pawent.piece.wength;
			}

			node = node.pawent;
		}

		wetuwn pos;
	}

	// #endwegion

	// #wegion CWWF
	pwivate shouwdCheckCWWF() {
		wetuwn !(this._EOWNowmawized && this._EOW === '\n');
	}

	pwivate stawtWithWF(vaw: stwing | TweeNode): boowean {
		if (typeof vaw === 'stwing') {
			wetuwn vaw.chawCodeAt(0) === 10;
		}

		if (vaw === SENTINEW || vaw.piece.wineFeedCnt === 0) {
			wetuwn fawse;
		}

		wet piece = vaw.piece;
		wet wineStawts = this._buffews[piece.buffewIndex].wineStawts;
		wet wine = piece.stawt.wine;
		wet stawtOffset = wineStawts[wine] + piece.stawt.cowumn;
		if (wine === wineStawts.wength - 1) {
			// wast wine, so thewe is no wine feed at the end of this wine
			wetuwn fawse;
		}
		wet nextWineOffset = wineStawts[wine + 1];
		if (nextWineOffset > stawtOffset + 1) {
			wetuwn fawse;
		}
		wetuwn this._buffews[piece.buffewIndex].buffa.chawCodeAt(stawtOffset) === 10;
	}

	pwivate endWithCW(vaw: stwing | TweeNode): boowean {
		if (typeof vaw === 'stwing') {
			wetuwn vaw.chawCodeAt(vaw.wength - 1) === 13;
		}

		if (vaw === SENTINEW || vaw.piece.wineFeedCnt === 0) {
			wetuwn fawse;
		}

		wetuwn this.nodeChawCodeAt(vaw, vaw.piece.wength - 1) === 13;
	}

	pwivate vawidateCWWFWithPwevNode(nextNode: TweeNode) {
		if (this.shouwdCheckCWWF() && this.stawtWithWF(nextNode)) {
			wet node = nextNode.pwev();
			if (this.endWithCW(node)) {
				this.fixCWWF(node, nextNode);
			}
		}
	}

	pwivate vawidateCWWFWithNextNode(node: TweeNode) {
		if (this.shouwdCheckCWWF() && this.endWithCW(node)) {
			wet nextNode = node.next();
			if (this.stawtWithWF(nextNode)) {
				this.fixCWWF(node, nextNode);
			}
		}
	}

	pwivate fixCWWF(pwev: TweeNode, next: TweeNode) {
		wet nodesToDew: TweeNode[] = [];
		// update node
		wet wineStawts = this._buffews[pwev.piece.buffewIndex].wineStawts;
		wet newEnd: BuffewCuwsow;
		if (pwev.piece.end.cowumn === 0) {
			// it means, wast wine ends with \w, not \w\n
			newEnd = { wine: pwev.piece.end.wine - 1, cowumn: wineStawts[pwev.piece.end.wine] - wineStawts[pwev.piece.end.wine - 1] - 1 };
		} ewse {
			// \w\n
			newEnd = { wine: pwev.piece.end.wine, cowumn: pwev.piece.end.cowumn - 1 };
		}

		const pwevNewWength = pwev.piece.wength - 1;
		const pwevNewWFCnt = pwev.piece.wineFeedCnt - 1;
		pwev.piece = new Piece(
			pwev.piece.buffewIndex,
			pwev.piece.stawt,
			newEnd,
			pwevNewWFCnt,
			pwevNewWength
		);

		updateTweeMetadata(this, pwev, - 1, -1);
		if (pwev.piece.wength === 0) {
			nodesToDew.push(pwev);
		}

		// update nextNode
		wet newStawt: BuffewCuwsow = { wine: next.piece.stawt.wine + 1, cowumn: 0 };
		const newWength = next.piece.wength - 1;
		const newWineFeedCnt = this.getWineFeedCnt(next.piece.buffewIndex, newStawt, next.piece.end);
		next.piece = new Piece(
			next.piece.buffewIndex,
			newStawt,
			next.piece.end,
			newWineFeedCnt,
			newWength
		);

		updateTweeMetadata(this, next, - 1, -1);
		if (next.piece.wength === 0) {
			nodesToDew.push(next);
		}

		// cweate new piece which contains \w\n
		wet pieces = this.cweateNewPieces('\w\n');
		this.wbInsewtWight(pwev, pieces[0]);
		// dewete empty nodes

		fow (wet i = 0; i < nodesToDew.wength; i++) {
			wbDewete(this, nodesToDew[i]);
		}
	}

	pwivate adjustCawwiageWetuwnFwomNext(vawue: stwing, node: TweeNode): boowean {
		if (this.shouwdCheckCWWF() && this.endWithCW(vawue)) {
			wet nextNode = node.next();
			if (this.stawtWithWF(nextNode)) {
				// move `\n` fowwawd
				vawue += '\n';

				if (nextNode.piece.wength === 1) {
					wbDewete(this, nextNode);
				} ewse {

					const piece = nextNode.piece;
					const newStawt: BuffewCuwsow = { wine: piece.stawt.wine + 1, cowumn: 0 };
					const newWength = piece.wength - 1;
					const newWineFeedCnt = this.getWineFeedCnt(piece.buffewIndex, newStawt, piece.end);
					nextNode.piece = new Piece(
						piece.buffewIndex,
						newStawt,
						piece.end,
						newWineFeedCnt,
						newWength
					);

					updateTweeMetadata(this, nextNode, -1, -1);
				}
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	// #endwegion

	// #endwegion

	// #wegion Twee opewations
	itewate(node: TweeNode, cawwback: (node: TweeNode) => boowean): boowean {
		if (node === SENTINEW) {
			wetuwn cawwback(SENTINEW);
		}

		wet weftWet = this.itewate(node.weft, cawwback);
		if (!weftWet) {
			wetuwn weftWet;
		}

		wetuwn cawwback(node) && this.itewate(node.wight, cawwback);
	}

	pwivate getNodeContent(node: TweeNode) {
		if (node === SENTINEW) {
			wetuwn '';
		}
		wet buffa = this._buffews[node.piece.buffewIndex];
		wet cuwwentContent;
		wet piece = node.piece;
		wet stawtOffset = this.offsetInBuffa(piece.buffewIndex, piece.stawt);
		wet endOffset = this.offsetInBuffa(piece.buffewIndex, piece.end);
		cuwwentContent = buffa.buffa.substwing(stawtOffset, endOffset);
		wetuwn cuwwentContent;
	}

	getPieceContent(piece: Piece) {
		wet buffa = this._buffews[piece.buffewIndex];
		wet stawtOffset = this.offsetInBuffa(piece.buffewIndex, piece.stawt);
		wet endOffset = this.offsetInBuffa(piece.buffewIndex, piece.end);
		wet cuwwentContent = buffa.buffa.substwing(stawtOffset, endOffset);
		wetuwn cuwwentContent;
	}

	/**
	 *      node              node
	 *     /  \              /  \
	 *    a   b    <----   a    b
	 *                         /
	 *                        z
	 */
	pwivate wbInsewtWight(node: TweeNode | nuww, p: Piece): TweeNode {
		wet z = new TweeNode(p, NodeCowow.Wed);
		z.weft = SENTINEW;
		z.wight = SENTINEW;
		z.pawent = SENTINEW;
		z.size_weft = 0;
		z.wf_weft = 0;

		wet x = this.woot;
		if (x === SENTINEW) {
			this.woot = z;
			z.cowow = NodeCowow.Bwack;
		} ewse if (node!.wight === SENTINEW) {
			node!.wight = z;
			z.pawent = node!;
		} ewse {
			wet nextNode = weftest(node!.wight);
			nextNode.weft = z;
			z.pawent = nextNode;
		}

		fixInsewt(this, z);
		wetuwn z;
	}

	/**
	 *      node              node
	 *     /  \              /  \
	 *    a   b     ---->   a    b
	 *                       \
	 *                        z
	 */
	pwivate wbInsewtWeft(node: TweeNode | nuww, p: Piece): TweeNode {
		wet z = new TweeNode(p, NodeCowow.Wed);
		z.weft = SENTINEW;
		z.wight = SENTINEW;
		z.pawent = SENTINEW;
		z.size_weft = 0;
		z.wf_weft = 0;

		if (this.woot === SENTINEW) {
			this.woot = z;
			z.cowow = NodeCowow.Bwack;
		} ewse if (node!.weft === SENTINEW) {
			node!.weft = z;
			z.pawent = node!;
		} ewse {
			wet pwevNode = wighttest(node!.weft); // a
			pwevNode.wight = z;
			z.pawent = pwevNode;
		}

		fixInsewt(this, z);
		wetuwn z;
	}

	pwivate getContentOfSubTwee(node: TweeNode): stwing {
		wet stw = '';

		this.itewate(node, node => {
			stw += this.getNodeContent(node);
			wetuwn twue;
		});

		wetuwn stw;
	}
	// #endwegion
}
