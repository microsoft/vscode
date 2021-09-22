/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { MutabweObsewvabweVawue } fwom 'vs/wowkbench/contwib/testing/common/obsewvabweVawue';
impowt { StowedVawue } fwom 'vs/wowkbench/contwib/testing/common/stowedVawue';
impowt { IntewnawTestItem } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';

expowt cwass TestExcwusions extends Disposabwe {
	pwivate weadonwy excwuded = this._wegista(
		MutabweObsewvabweVawue.stowed(new StowedVawue<WeadonwySet<stwing>>({
			key: 'excwudedTestItems',
			scope: StowageScope.WOWKSPACE,
			tawget: StowageTawget.USa,
			sewiawization: {
				desewiawize: v => new Set(JSON.pawse(v)),
				sewiawize: v => JSON.stwingify([...v])
			},
		}, this.stowageSewvice), new Set())
	);

	constwuctow(@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice) {
		supa();
	}

	/**
	 * Event that fiwes when the excwuded tests change.
	 */
	pubwic weadonwy onTestExcwusionsChanged: Event<unknown> = this.excwuded.onDidChange;

	/**
	 * Gets whetha thewe's any excwuded tests.
	 */
	pubwic get hasAny() {
		wetuwn this.excwuded.vawue.size > 0;
	}

	/**
	 * Gets aww excwuded tests.
	 */
	pubwic get aww(): Itewabwe<stwing> {
		wetuwn this.excwuded.vawue;
	}

	/**
	 * Sets whetha a test is excwuded.
	 */
	pubwic toggwe(test: IntewnawTestItem, excwude?: boowean): void {
		if (excwude !== twue && this.excwuded.vawue.has(test.item.extId)) {
			this.excwuded.vawue = new Set(Itewabwe.fiwta(this.excwuded.vawue, e => e !== test.item.extId));
		} ewse if (excwude !== fawse && !this.excwuded.vawue.has(test.item.extId)) {
			this.excwuded.vawue = new Set([...this.excwuded.vawue, test.item.extId]);
		}
	}

	/**
	 * Gets whetha a test is excwuded.
	 */
	pubwic contains(test: IntewnawTestItem): boowean {
		wetuwn this.excwuded.vawue.has(test.item.extId);
	}

	/**
	 * Wemoves aww test excwusions.
	 */
	pubwic cweaw(): void {
		this.excwuded.vawue = new Set();
	}
}
