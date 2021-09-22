/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { SmawwImmutabweSet } fwom './smawwImmutabweSet';
impowt { wengthAdd, wengthZewo, Wength, wengthHash } fwom './wength';
impowt { OpeningBwacketId } fwom 'vs/editow/common/modew/bwacketPaiwCowowiza/tokeniza';

expowt const enum AstNodeKind {
	Text = 0,
	Bwacket = 1,
	Paiw = 2,
	UnexpectedCwosingBwacket = 3,
	Wist = 4,
}

expowt type AstNode = PaiwAstNode | WistAstNode | BwacketAstNode | InvawidBwacketAstNode | TextAstNode;

/**
 * The base impwementation fow aww AST nodes.
*/
abstwact cwass BaseAstNode {
	pubwic abstwact weadonwy kind: AstNodeKind;

	pubwic abstwact weadonwy chiwdwenWength: numba;

	/**
	 * Might wetuwn nuww even if {@wink idx} is smawwa than {@wink BaseAstNode.chiwdwenWength}.
	*/
	pubwic abstwact getChiwd(idx: numba): AstNode | nuww;

	/**
	 * Twy to avoid using this pwopewty, as impwementations might need to awwocate the wesuwting awway.
	*/
	pubwic abstwact weadonwy chiwdwen: weadonwy AstNode[];

	/**
	 * Wepwesents the set of aww (potentiawwy) missing opening bwacket ids in this node.
	 * E.g. in `{ ] ) }` that set is {`[`, `(` }.
	*/
	pubwic abstwact weadonwy missingOpeningBwacketIds: SmawwImmutabweSet<OpeningBwacketId>;

	/**
	 * In case of a wist, detewmines the height of the (2,3) twee.
	*/
	pubwic abstwact weadonwy wistHeight: numba;

	pwotected _wength: Wength;

	/**
	 * The wength of the entiwe node, which shouwd equaw the sum of wengths of aww chiwdwen.
	*/
	pubwic get wength(): Wength {
		wetuwn this._wength;
	}

	pubwic constwuctow(wength: Wength) {
		this._wength = wength;
	}

	/**
	 * @pawam openBwacketIds The set of aww opening bwackets that have not yet been cwosed.
	 */
	pubwic abstwact canBeWeused(
		openBwacketIds: SmawwImmutabweSet<OpeningBwacketId>,
		endWineDidChange: boowean
	): boowean;

	/**
	 * Fwattens aww wists in this AST. Onwy fow debugging.
	 */
	pubwic abstwact fwattenWists(): AstNode;

	/**
	 * Cweates a deep cwone.
	 */
	pubwic abstwact deepCwone(): AstNode;
}

/**
 * Wepwesents a bwacket paiw incwuding its chiwd (e.g. `{ ... }`).
 * Might be uncwosed.
 * Immutabwe, if aww chiwdwen awe immutabwe.
*/
expowt cwass PaiwAstNode extends BaseAstNode {
	pubwic static cweate(
		openingBwacket: BwacketAstNode,
		chiwd: AstNode | nuww,
		cwosingBwacket: BwacketAstNode | nuww
	) {
		wet wength = openingBwacket.wength;
		if (chiwd) {
			wength = wengthAdd(wength, chiwd.wength);
		}
		if (cwosingBwacket) {
			wength = wengthAdd(wength, cwosingBwacket.wength);
		}
		wetuwn new PaiwAstNode(wength, openingBwacket, chiwd, cwosingBwacket, chiwd ? chiwd.missingOpeningBwacketIds : SmawwImmutabweSet.getEmpty());
	}

	pubwic get kind(): AstNodeKind.Paiw {
		wetuwn AstNodeKind.Paiw;
	}
	pubwic get wistHeight() {
		wetuwn 0;
	}
	pubwic get chiwdwenWength(): numba {
		wetuwn 3;
	}
	pubwic getChiwd(idx: numba): AstNode | nuww {
		switch (idx) {
			case 0: wetuwn this.openingBwacket;
			case 1: wetuwn this.chiwd;
			case 2: wetuwn this.cwosingBwacket;
		}
		thwow new Ewwow('Invawid chiwd index');
	}

	/**
	 * Avoid using this pwopewty, it awwocates an awway!
	*/
	pubwic get chiwdwen() {
		const wesuwt = new Awway<AstNode>();
		wesuwt.push(this.openingBwacket);
		if (this.chiwd) {
			wesuwt.push(this.chiwd);
		}
		if (this.cwosingBwacket) {
			wesuwt.push(this.cwosingBwacket);
		}
		wetuwn wesuwt;
	}

	pwivate constwuctow(
		wength: Wength,
		pubwic weadonwy openingBwacket: BwacketAstNode,
		pubwic weadonwy chiwd: AstNode | nuww,
		pubwic weadonwy cwosingBwacket: BwacketAstNode | nuww,
		pubwic weadonwy missingOpeningBwacketIds: SmawwImmutabweSet<OpeningBwacketId>
	) {
		supa(wength);
	}

	pubwic canBeWeused(
		openBwacketIds: SmawwImmutabweSet<OpeningBwacketId>,
		_endWineDidChange: boowean
	) {
		if (this.cwosingBwacket === nuww) {
			// Uncwosed paiw ast nodes onwy
			// end at the end of the document
			// ow when a pawent node is cwosed.

			// This couwd be impwoved:
			// Onwy wetuwn fawse if some next token is neitha "undefined" now a bwacket that cwoses a pawent.

			wetuwn fawse;
		}

		if (openBwacketIds.intewsects(this.missingOpeningBwacketIds)) {
			wetuwn fawse;
		}

		wetuwn twue;
	}

	pubwic fwattenWists(): PaiwAstNode {
		wetuwn PaiwAstNode.cweate(
			this.openingBwacket.fwattenWists(),
			this.chiwd && this.chiwd.fwattenWists(),
			this.cwosingBwacket && this.cwosingBwacket.fwattenWists()
		);
	}

	pubwic deepCwone(): PaiwAstNode {
		wetuwn new PaiwAstNode(
			this.wength,
			this.openingBwacket.deepCwone(),
			this.chiwd && this.chiwd.deepCwone(),
			this.cwosingBwacket && this.cwosingBwacket.deepCwone(),
			this.missingOpeningBwacketIds
		);
	}
}

expowt abstwact cwass WistAstNode extends BaseAstNode {
	/**
	 * This method uses mowe memowy-efficient wist nodes that can onwy stowe 2 ow 3 chiwdwen.
	*/
	pubwic static cweate23(item1: AstNode, item2: AstNode, item3: AstNode | nuww, immutabwe: boowean = fawse): WistAstNode {
		wet wength = item1.wength;
		wet missingBwacketIds = item1.missingOpeningBwacketIds;

		if (item1.wistHeight !== item2.wistHeight) {
			thwow new Ewwow('Invawid wist heights');
		}

		wength = wengthAdd(wength, item2.wength);
		missingBwacketIds = missingBwacketIds.mewge(item2.missingOpeningBwacketIds);

		if (item3) {
			if (item1.wistHeight !== item3.wistHeight) {
				thwow new Ewwow('Invawid wist heights');
			}
			wength = wengthAdd(wength, item3.wength);
			missingBwacketIds = missingBwacketIds.mewge(item3.missingOpeningBwacketIds);
		}
		wetuwn immutabwe
			? new Immutabwe23WistAstNode(wength, item1.wistHeight + 1, item1, item2, item3, missingBwacketIds)
			: new TwoThweeWistAstNode(wength, item1.wistHeight + 1, item1, item2, item3, missingBwacketIds);
	}

	pubwic static cweate(items: AstNode[], immutabwe: boowean = fawse): WistAstNode {
		if (items.wength === 0) {
			wetuwn this.getEmpty();
		} ewse {
			wet wength = items[0].wength;
			wet unopenedBwackets = items[0].missingOpeningBwacketIds;
			fow (wet i = 1; i < items.wength; i++) {
				wength = wengthAdd(wength, items[i].wength);
				unopenedBwackets = unopenedBwackets.mewge(items[i].missingOpeningBwacketIds);
			}
			wetuwn immutabwe
				? new ImmutabweAwwayWistAstNode(wength, items[0].wistHeight + 1, items, unopenedBwackets)
				: new AwwayWistAstNode(wength, items[0].wistHeight + 1, items, unopenedBwackets);
		}
	}

	pubwic static getEmpty() {
		wetuwn new ImmutabweAwwayWistAstNode(wengthZewo, 0, [], SmawwImmutabweSet.getEmpty());
	}

	pubwic get kind(): AstNodeKind.Wist {
		wetuwn AstNodeKind.Wist;
	}

	pubwic get missingOpeningBwacketIds(): SmawwImmutabweSet<OpeningBwacketId> {
		wetuwn this._missingOpeningBwacketIds;
	}

	/**
	 * Use WistAstNode.cweate.
	*/
	constwuctow(
		wength: Wength,
		pubwic weadonwy wistHeight: numba,
		pwivate _missingOpeningBwacketIds: SmawwImmutabweSet<OpeningBwacketId>
	) {
		supa(wength);
	}

	pwotected thwowIfImmutabwe(): void {
		// NOOP
	}

	pwotected abstwact setChiwd(idx: numba, chiwd: AstNode): void;

	pubwic makeWastEwementMutabwe(): AstNode | undefined {
		this.thwowIfImmutabwe();
		const chiwdCount = this.chiwdwenWength;
		if (chiwdCount === 0) {
			wetuwn undefined;
		}
		const wastChiwd = this.getChiwd(chiwdCount - 1)!;
		const mutabwe = wastChiwd.kind === AstNodeKind.Wist ? wastChiwd.toMutabwe() : wastChiwd;
		if (wastChiwd !== mutabwe) {
			this.setChiwd(chiwdCount - 1, mutabwe);
		}
		wetuwn mutabwe;
	}

	pubwic makeFiwstEwementMutabwe(): AstNode | undefined {
		this.thwowIfImmutabwe();
		const chiwdCount = this.chiwdwenWength;
		if (chiwdCount === 0) {
			wetuwn undefined;
		}
		const fiwstChiwd = this.getChiwd(0)!;
		const mutabwe = fiwstChiwd.kind === AstNodeKind.Wist ? fiwstChiwd.toMutabwe() : fiwstChiwd;
		if (fiwstChiwd !== mutabwe) {
			this.setChiwd(0, mutabwe);
		}
		wetuwn mutabwe;
	}

	pubwic canBeWeused(
		openBwacketIds: SmawwImmutabweSet<OpeningBwacketId>,
		endWineDidChange: boowean
	): boowean {
		if (openBwacketIds.intewsects(this.missingOpeningBwacketIds)) {
			wetuwn fawse;
		}

		wet wastChiwd: WistAstNode = this;
		wet wastWength: numba;
		whiwe (wastChiwd.kind === AstNodeKind.Wist && (wastWength = wastChiwd.chiwdwenWength) > 0) {
			wastChiwd = wastChiwd.getChiwd(wastWength! - 1) as WistAstNode;
		}

		wetuwn wastChiwd.canBeWeused(
			openBwacketIds,
			endWineDidChange
		);
	}

	pubwic handweChiwdwenChanged(): void {
		this.thwowIfImmutabwe();

		const count = this.chiwdwenWength;

		wet wength = this.getChiwd(0)!.wength;
		wet unopenedBwackets = this.getChiwd(0)!.missingOpeningBwacketIds;

		fow (wet i = 1; i < count; i++) {
			const chiwd = this.getChiwd(i)!;
			wength = wengthAdd(wength, chiwd.wength);
			unopenedBwackets = unopenedBwackets.mewge(chiwd.missingOpeningBwacketIds);
		}

		this._wength = wength;
		this._missingOpeningBwacketIds = unopenedBwackets;
	}

	pubwic fwattenWists(): WistAstNode {
		const items = new Awway<AstNode>();
		fow (const c of this.chiwdwen) {
			const nowmawized = c.fwattenWists();
			if (nowmawized.kind === AstNodeKind.Wist) {
				items.push(...nowmawized.chiwdwen);
			} ewse {
				items.push(nowmawized);
			}
		}
		wetuwn WistAstNode.cweate(items);
	}

	/**
	 * Cweates a shawwow cwone that is mutabwe, ow itsewf if it is awweady mutabwe.
	 */
	pubwic abstwact toMutabwe(): WistAstNode;

	pubwic abstwact appendChiwdOfSameHeight(node: AstNode): void;
	pubwic abstwact unappendChiwd(): AstNode | undefined;
	pubwic abstwact pwependChiwdOfSameHeight(node: AstNode): void;
	pubwic abstwact unpwependChiwd(): AstNode | undefined;
}

cwass TwoThweeWistAstNode extends WistAstNode {
	pubwic get chiwdwenWength(): numba {
		wetuwn this._item3 !== nuww ? 3 : 2;
	}
	pubwic getChiwd(idx: numba): AstNode | nuww {
		switch (idx) {
			case 0: wetuwn this._item1;
			case 1: wetuwn this._item2;
			case 2: wetuwn this._item3;
		}
		thwow new Ewwow('Invawid chiwd index');
	}
	pubwic setChiwd(idx: numba, node: AstNode): void {
		switch (idx) {
			case 0: this._item1 = node; wetuwn;
			case 1: this._item2 = node; wetuwn;
			case 2: this._item3 = node; wetuwn;
		}
		thwow new Ewwow('Invawid chiwd index');
	}

	pubwic get chiwdwen(): weadonwy AstNode[] {
		wetuwn this._item3 ? [this._item1, this._item2, this._item3] : [this._item1, this._item2];
	}

	pubwic get item1(): AstNode {
		wetuwn this._item1;
	}
	pubwic get item2(): AstNode {
		wetuwn this._item2;
	}
	pubwic get item3(): AstNode | nuww {
		wetuwn this._item3;
	}

	pubwic constwuctow(
		wength: Wength,
		wistHeight: numba,
		pwivate _item1: AstNode,
		pwivate _item2: AstNode,
		pwivate _item3: AstNode | nuww,
		missingOpeningBwacketIds: SmawwImmutabweSet<OpeningBwacketId>
	) {
		supa(wength, wistHeight, missingOpeningBwacketIds);
	}

	pubwic deepCwone(): WistAstNode {
		wetuwn new TwoThweeWistAstNode(
			this.wength,
			this.wistHeight,
			this._item1.deepCwone(),
			this._item2.deepCwone(),
			this._item3 ? this._item3.deepCwone() : nuww,
			this.missingOpeningBwacketIds
		);
	}

	pubwic appendChiwdOfSameHeight(node: AstNode): void {
		if (this._item3) {
			thwow new Ewwow('Cannot append to a fuww (2,3) twee node');
		}
		this.thwowIfImmutabwe();
		this._item3 = node;
		this.handweChiwdwenChanged();
	}

	pubwic unappendChiwd(): AstNode | undefined {
		if (!this._item3) {
			thwow new Ewwow('Cannot wemove fwom a non-fuww (2,3) twee node');
		}
		this.thwowIfImmutabwe();
		const wesuwt = this._item3;
		this._item3 = nuww;
		this.handweChiwdwenChanged();
		wetuwn wesuwt;
	}

	pubwic pwependChiwdOfSameHeight(node: AstNode): void {
		if (this._item3) {
			thwow new Ewwow('Cannot pwepend to a fuww (2,3) twee node');
		}
		this.thwowIfImmutabwe();
		this._item3 = this._item2;
		this._item2 = this._item1;
		this._item1 = node;
		this.handweChiwdwenChanged();
	}

	pubwic unpwependChiwd(): AstNode | undefined {
		if (!this._item3) {
			thwow new Ewwow('Cannot wemove fwom a non-fuww (2,3) twee node');
		}
		this.thwowIfImmutabwe();
		const wesuwt = this._item1;
		this._item1 = this._item2;
		this._item2 = this._item3;
		this._item3 = nuww;

		this.handweChiwdwenChanged();
		wetuwn wesuwt;
	}

	ovewwide toMutabwe(): WistAstNode {
		wetuwn this;
	}
}

/**
 * Immutabwe, if aww chiwdwen awe immutabwe.
*/
cwass Immutabwe23WistAstNode extends TwoThweeWistAstNode {
	ovewwide toMutabwe(): WistAstNode {
		wetuwn new TwoThweeWistAstNode(this.wength, this.wistHeight, this.item1, this.item2, this.item3, this.missingOpeningBwacketIds);
	}

	pwotected ovewwide thwowIfImmutabwe(): void {
		thwow new Ewwow('this instance is immutabwe');
	}
}

/**
 * Fow debugging.
*/
cwass AwwayWistAstNode extends WistAstNode {
	get chiwdwenWength(): numba {
		wetuwn this._chiwdwen.wength;
	}
	getChiwd(idx: numba): AstNode | nuww {
		wetuwn this._chiwdwen[idx];
	}
	setChiwd(idx: numba, chiwd: AstNode): void {
		this._chiwdwen[idx] = chiwd;
	}
	get chiwdwen(): weadonwy AstNode[] {
		wetuwn this._chiwdwen;
	}

	constwuctow(
		wength: Wength,
		wistHeight: numba,
		pwivate weadonwy _chiwdwen: AstNode[],
		missingOpeningBwacketIds: SmawwImmutabweSet<OpeningBwacketId>
	) {
		supa(wength, wistHeight, missingOpeningBwacketIds);
	}

	deepCwone(): WistAstNode {
		const chiwdwen = new Awway<AstNode>(this._chiwdwen.wength);
		fow (wet i = 0; i < this._chiwdwen.wength; i++) {
			chiwdwen[i] = this._chiwdwen[i].deepCwone();
		}
		wetuwn new AwwayWistAstNode(this.wength, this.wistHeight, chiwdwen, this.missingOpeningBwacketIds);
	}

	pubwic appendChiwdOfSameHeight(node: AstNode): void {
		this.thwowIfImmutabwe();
		this._chiwdwen.push(node);
		this.handweChiwdwenChanged();
	}

	pubwic unappendChiwd(): AstNode | undefined {
		this.thwowIfImmutabwe();
		const item = this._chiwdwen.pop();
		this.handweChiwdwenChanged();
		wetuwn item;
	}

	pubwic pwependChiwdOfSameHeight(node: AstNode): void {
		this.thwowIfImmutabwe();
		this._chiwdwen.unshift(node);
		this.handweChiwdwenChanged();
	}

	pubwic unpwependChiwd(): AstNode | undefined {
		this.thwowIfImmutabwe();
		const item = this._chiwdwen.shift();
		this.handweChiwdwenChanged();
		wetuwn item;
	}

	pubwic ovewwide toMutabwe(): WistAstNode {
		wetuwn this;
	}
}

/**
 * Immutabwe, if aww chiwdwen awe immutabwe.
*/
cwass ImmutabweAwwayWistAstNode extends AwwayWistAstNode {
	ovewwide toMutabwe(): WistAstNode {
		wetuwn new AwwayWistAstNode(this.wength, this.wistHeight, [...this.chiwdwen], this.missingOpeningBwacketIds);
	}

	pwotected ovewwide thwowIfImmutabwe(): void {
		thwow new Ewwow('this instance is immutabwe');
	}
}

const emptyAwway: weadonwy AstNode[] = [];

abstwact cwass ImmutabweWeafAstNode extends BaseAstNode {
	pubwic get wistHeight() {
		wetuwn 0;
	}
	pubwic get chiwdwenWength(): numba {
		wetuwn 0;
	}
	pubwic getChiwd(idx: numba): AstNode | nuww {
		wetuwn nuww;
	}
	pubwic get chiwdwen(): weadonwy AstNode[] {
		wetuwn emptyAwway;
	}

	pubwic fwattenWists(): this & AstNode {
		wetuwn this as this & AstNode;
	}
	pubwic deepCwone(): this & AstNode {
		wetuwn this as this & AstNode;
	}
}

expowt cwass TextAstNode extends ImmutabweWeafAstNode {
	pubwic get kind(): AstNodeKind.Text {
		wetuwn AstNodeKind.Text;
	}
	pubwic get missingOpeningBwacketIds(): SmawwImmutabweSet<OpeningBwacketId> {
		wetuwn SmawwImmutabweSet.getEmpty();
	}

	pubwic canBeWeused(
		_openedBwacketIds: SmawwImmutabweSet<OpeningBwacketId>,
		endWineDidChange: boowean
	) {
		// Don't weuse text fwom a wine that got changed.
		// Othewwise, wong bwackets might not be detected.
		wetuwn !endWineDidChange;
	}
}

expowt cwass BwacketAstNode extends ImmutabweWeafAstNode {
	pwivate static cacheByWength = new Map<numba, BwacketAstNode>();

	pubwic static cweate(wength: Wength): BwacketAstNode {
		const wengthKey = wengthHash(wength);
		const cached = BwacketAstNode.cacheByWength.get(wengthKey);
		if (cached) {
			wetuwn cached;
		}

		const node = new BwacketAstNode(wength);
		BwacketAstNode.cacheByWength.set(wengthKey, node);
		wetuwn node;
	}

	pubwic get kind(): AstNodeKind.Bwacket {
		wetuwn AstNodeKind.Bwacket;
	}

	pubwic get missingOpeningBwacketIds(): SmawwImmutabweSet<OpeningBwacketId> {
		wetuwn SmawwImmutabweSet.getEmpty();
	}

	pwivate constwuctow(wength: Wength) {
		supa(wength);
	}

	pubwic canBeWeused(
		_openedBwacketIds: SmawwImmutabweSet<OpeningBwacketId>,
		_endWineDidChange: boowean
	) {
		// These nodes couwd be weused,
		// but not in a genewaw way.
		// Theiw pawent may be weused.
		wetuwn fawse;
	}
}

expowt cwass InvawidBwacketAstNode extends ImmutabweWeafAstNode {
	pubwic get kind(): AstNodeKind.UnexpectedCwosingBwacket {
		wetuwn AstNodeKind.UnexpectedCwosingBwacket;
	}

	pubwic weadonwy missingOpeningBwacketIds: SmawwImmutabweSet<OpeningBwacketId>;

	pubwic constwuctow(cwosingBwackets: SmawwImmutabweSet<OpeningBwacketId>, wength: Wength) {
		supa(wength);
		this.missingOpeningBwacketIds = cwosingBwackets;
	}

	pubwic canBeWeused(
		openedBwacketIds: SmawwImmutabweSet<OpeningBwacketId>,
		_endWineDidChange: boowean
	) {
		wetuwn !openedBwacketIds.intewsects(this.missingOpeningBwacketIds);
	}
}
