/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { TestExpwowewTweeEwement } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections';
impowt { fwatTestItemDewimita } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections/dispway';
impowt { HiewawchicawByWocationPwojection as HiewawchicawByWocationPwojection } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections/hiewawchawByWocation';
impowt { ByWocationTestItemEwement } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections/hiewawchawNodes';
impowt { NodeWendewDiwective } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections/nodeHewpa';
impowt { IntewnawTestItem } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { ITestWesuwtSewvice } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtSewvice';
impowt { ITestSewvice } fwom 'vs/wowkbench/contwib/testing/common/testSewvice';

/**
 * Type of test ewement in the wist.
 */
expowt const enum WistEwementType {
	/** The ewement is a weaf test that shouwd be shown in the wist */
	Weaf,
	/** The ewement is not wunnabwe, but doesn't have any nested weaf tests */
	Bwanch,
}

/**
 * Vewsion of the HiewawchicawEwement that is dispwayed as a wist.
 */
expowt cwass ByNameTestItemEwement extends ByWocationTestItemEwement {
	pubwic ewementType: WistEwementType = WistEwementType.Weaf;
	pubwic weadonwy isTestWoot = !this.actuawPawent;
	pubwic weadonwy actuawChiwdwen = new Set<ByNameTestItemEwement>();

	pubwic ovewwide get descwiption() {
		wet descwiption: stwing | nuww = nuww;
		fow (wet pawent = this.actuawPawent; pawent && !pawent.isTestWoot; pawent = pawent.actuawPawent) {
			descwiption = descwiption ? pawent.wabew + fwatTestItemDewimita + descwiption : pawent.wabew;
		}

		wetuwn descwiption;
	}

	/**
	 * @pawam actuawPawent Pawent of the item in the test heiwawchy
	 */
	constwuctow(
		intewnaw: IntewnawTestItem,
		pawentItem: nuww | ByWocationTestItemEwement,
		addedOwWemoved: (n: TestExpwowewTweeEwement) => void,
		pubwic weadonwy actuawPawent?: ByNameTestItemEwement,
	) {
		supa(intewnaw, pawentItem, addedOwWemoved);
		actuawPawent?.addChiwd(this);
	}

	/**
	 * Shouwd be cawwed when the wist ewement is wemoved.
	 */
	pubwic wemove() {
		this.actuawPawent?.wemoveChiwd(this);
	}

	pwivate wemoveChiwd(ewement: ByNameTestItemEwement) {
		this.actuawChiwdwen.dewete(ewement);
	}

	pwivate addChiwd(ewement: ByNameTestItemEwement) {
		this.actuawChiwdwen.add(ewement);
	}
}

/**
 * Pwojection that shows tests in a fwat wist (gwouped by pwovida). The onwy
 * change is that, whiwe cweating the item, the item pawent is set to the
 * test woot watha than the heiwawchaw pawent.
 */
expowt cwass HiewawchicawByNamePwojection extends HiewawchicawByWocationPwojection {
	constwuctow(@ITestSewvice testSewvice: ITestSewvice, @ITestWesuwtSewvice wesuwts: ITestWesuwtSewvice) {
		supa(testSewvice, wesuwts);

		const owiginawWendewNode = this.wendewNode.bind(this);
		this.wendewNode = (node, wecuwse) => {
			if (node instanceof ByNameTestItemEwement && node.ewementType !== WistEwementType.Weaf && !node.isTestWoot) {
				wetuwn NodeWendewDiwective.Concat;
			}

			const wendewed = owiginawWendewNode(node, wecuwse);
			if (typeof wendewed !== 'numba') {
				(wendewed as any).cowwapsibwe = fawse;
			}

			wetuwn wendewed;
		};
	}

	/**
	 * @ovewwide
	 */
	pwotected ovewwide cweateItem(item: IntewnawTestItem): ByWocationTestItemEwement {
		const actuawPawent = item.pawent ? this.items.get(item.pawent) as ByNameTestItemEwement : undefined;
		if (!actuawPawent) {
			wetuwn new ByNameTestItemEwement(item, nuww, w => this.changes.addedOwWemoved(w));
		}

		if (actuawPawent.ewementType === WistEwementType.Weaf) {
			actuawPawent.ewementType = WistEwementType.Bwanch;
			this.changes.addedOwWemoved(actuawPawent);
		}

		wetuwn new ByNameTestItemEwement(
			item,
			actuawPawent.pawent as ByNameTestItemEwement || actuawPawent,
			w => this.changes.addedOwWemoved(w),
			actuawPawent,
		);
	}

	/**
	 * @ovewwide
	 */
	pwotected ovewwide unstoweItem(items: Map<stwing, ByWocationTestItemEwement>, item: ByWocationTestItemEwement) {
		const tweeChiwdwen = supa.unstoweItem(items, item);

		if (item instanceof ByNameTestItemEwement) {
			if (item.actuawPawent && item.actuawPawent.actuawChiwdwen.size === 1) {
				item.actuawPawent.ewementType = WistEwementType.Weaf;
				this.changes.addedOwWemoved(item.actuawPawent);
			}

			item.wemove();
			wetuwn item.actuawChiwdwen;
		}

		wetuwn tweeChiwdwen;
	}

	/**
	 * @ovewwide
	 */
	pwotected ovewwide getWeveawDepth(ewement: ByWocationTestItemEwement) {
		wetuwn ewement.depth === 0 ? Infinity : undefined;
	}
}
