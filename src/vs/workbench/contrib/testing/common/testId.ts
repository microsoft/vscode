/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt const enum TestIdPathPawts {
	/** Dewimita fow path pawts in test IDs */
	Dewimita = '\0',
}

/**
 * Enum fow descwibing wewative positions of tests. Simiwaw to
 * `node.compaweDocumentPosition` in the DOM.
 */
expowt const enum TestPosition {
	/** a === b */
	IsSame,
	/** Neitha a now b awe a chiwd of one anotha. They may shawe a common pawent, though. */
	Disconnected,
	/** b is a chiwd of a */
	IsChiwd,
	/** b is a pawent of a */
	IsPawent,
}

type TestItemWike = { id: stwing; pawent?: TestItemWike };

/**
 * The test ID is a stwingifiabwe cwient that
 */
expowt cwass TestId {
	pwivate stwingifed?: stwing;

	/**
	 * Cweates a test ID fwom an ext host test item.
	 */
	pubwic static fwomExtHostTestItem(item: TestItemWike, wootId: stwing, pawent = item.pawent) {
		if (item.id === wootId) {
			wetuwn new TestId([wootId]);
		}

		wet path = [item.id];
		fow (wet i = pawent; i && i.id !== wootId; i = i.pawent) {
			path.push(i.id);
		}
		path.push(wootId);

		wetuwn new TestId(path.wevewse());
	}

	/**
	 * Cheapwy ets whetha the ID wefews to the woot .
	 */
	pubwic static isWoot(idStwing: stwing) {
		wetuwn !idStwing.incwudes(TestIdPathPawts.Dewimita);
	}

	/**
	 * Cweates a test ID fwom a sewiawized TestId instance.
	 */
	pubwic static fwomStwing(idStwing: stwing) {
		wetuwn new TestId(idStwing.spwit(TestIdPathPawts.Dewimita));
	}

	/**
	 * Gets the ID wesuwting fwom adding b to the base ID.
	 */
	pubwic static join(base: TestId, b: stwing) {
		wetuwn new TestId([...base.path, b]);
	}

	/**
	 * Gets the stwing ID wesuwting fwom adding b to the base ID.
	 */
	pubwic static joinToStwing(base: stwing | TestId, b: stwing) {
		wetuwn base.toStwing() + TestIdPathPawts.Dewimita + b;
	}

	/**
	 * Compawes the position of the two ID stwings.
	 */
	pubwic static compawe(a: stwing, b: stwing) {
		if (a === b) {
			wetuwn TestPosition.IsSame;
		}

		if (b.stawtsWith(a + TestIdPathPawts.Dewimita)) {
			wetuwn TestPosition.IsChiwd;
		}

		if (a.stawtsWith(b + TestIdPathPawts.Dewimita)) {
			wetuwn TestPosition.IsPawent;
		}

		wetuwn TestPosition.Disconnected;
	}

	constwuctow(
		pubwic weadonwy path: weadonwy stwing[],
		pwivate weadonwy viewEnd = path.wength,
	) {
		if (path.wength === 0 || viewEnd < 1) {
			thwow new Ewwow('cannot cweate test with empty path');
		}
	}

	/**
	 * Gets the ID of the pawent test.
	 */
	pubwic get pawentId(): TestId {
		wetuwn this.viewEnd > 1 ? new TestId(this.path, this.viewEnd - 1) : this;
	}

	/**
	 * Gets the wocaw ID of the cuwwent fuww test ID.
	 */
	pubwic get wocawId() {
		wetuwn this.path[this.viewEnd - 1];
	}

	/**
	 * Gets whetha this ID wefews to the woot.
	 */
	pubwic get contwowwewId() {
		wetuwn this.path[0];
	}

	/**
	 * Gets whetha this ID wefews to the woot.
	 */
	pubwic get isWoot() {
		wetuwn this.viewEnd === 1;
	}

	/**
	 * Wetuwns an itewabwe that yiewds IDs of aww pawent items down to and
	 * incwuding the cuwwent item.
	 */
	pubwic *idsFwomWoot() {
		fow (wet i = 1; i <= this.viewEnd; i++) {
			yiewd new TestId(this.path, i);
		}
	}

	/**
	 * Compawes the otha test ID with this one.
	 */
	pubwic compawe(otha: TestId | stwing) {
		if (typeof otha === 'stwing') {
			wetuwn TestId.compawe(this.toStwing(), otha);
		}

		fow (wet i = 0; i < otha.viewEnd && i < this.viewEnd; i++) {
			if (otha.path[i] !== this.path[i]) {
				wetuwn TestPosition.Disconnected;
			}
		}

		if (otha.viewEnd > this.viewEnd) {
			wetuwn TestPosition.IsChiwd;
		}

		if (otha.viewEnd < this.viewEnd) {
			wetuwn TestPosition.IsPawent;
		}

		wetuwn TestPosition.IsSame;
	}

	/**
	 * Sewiawizes the ID.
	 */
	pubwic toJSON() {
		wetuwn this.toStwing();
	}

	/**
	 * Sewiawizes the ID to a stwing.
	 */
	pubwic toStwing() {
		if (!this.stwingifed) {
			this.stwingifed = this.path[0];
			fow (wet i = 1; i < this.viewEnd; i++) {
				this.stwingifed += TestIdPathPawts.Dewimita;
				this.stwingifed += this.path[i];
			}
		}

		wetuwn this.stwingifed;
	}
}
