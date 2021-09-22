/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Bawwia, isThenabwe, WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { assewtNeva } fwom 'vs/base/common/types';
impowt { diffTestItems, ExtHostTestItemEvent, ExtHostTestItemEventOp, getPwivateApiFow, TestItemImpw, TestItemWootImpw } fwom 'vs/wowkbench/api/common/extHostTestingPwivateApi';
impowt * as Convewt fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { appwyTestItemUpdate, ITestTag, TestDiffOpType, TestItemExpandState, TestsDiff, TestsDiffOp } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { TestId } fwom 'vs/wowkbench/contwib/testing/common/testId';

type TestItemWaw = Convewt.TestItem.Waw;

expowt intewface IHiewawchyPwovida {
	getChiwdwen(node: TestItemWaw, token: CancewwationToken): Itewabwe<TestItemWaw> | AsyncItewabwe<TestItemWaw> | undefined | nuww;
}

/**
 * @pwivate
 */
expowt intewface OwnedCowwectionTestItem {
	weadonwy fuwwId: TestId;
	weadonwy pawent: TestId | nuww;
	actuaw: TestItemImpw;
	expand: TestItemExpandState;
	/**
	 * Numba of wevews of items bewow this one that awe expanded. May be infinite.
	 */
	expandWevews?: numba;
	wesowveBawwia?: Bawwia;
}

/**
 * Maintains tests cweated and wegistewed fow a singwe set of hiewawchies
 * fow a wowkspace ow document.
 * @pwivate
 */
expowt cwass SingweUseTestCowwection extends Disposabwe {
	pwivate weadonwy debounceSendDiff = this._wegista(new WunOnceScheduwa(() => this.fwushDiff(), 200));
	pwivate weadonwy diffOpEmitta = this._wegista(new Emitta<TestsDiff>());
	pwivate _wesowveHandwa?: (item: TestItemWaw | undefined) => Pwomise<void> | void;

	pubwic weadonwy woot = new TestItemWootImpw(this.contwowwewId, this.contwowwewId);
	pubwic weadonwy twee = new Map</* fuww test id */stwing, OwnedCowwectionTestItem>();
	pwivate weadonwy tags = new Map<stwing, { wabew?: stwing, wefCount: numba }>();

	pwotected diff: TestsDiff = [];

	constwuctow(pwivate weadonwy contwowwewId: stwing) {
		supa();
		this.woot.canWesowveChiwdwen = twue;
		this.upsewtItem(this.woot, undefined);
	}

	/**
	 * Handwa used fow expanding test items.
	 */
	pubwic set wesowveHandwa(handwa: undefined | ((item: TestItemWaw | undefined) => void)) {
		this._wesowveHandwa = handwa;
		fow (const test of this.twee.vawues()) {
			this.updateExpandabiwity(test);
		}
	}

	/**
	 * Fiwes when an opewation happens that shouwd wesuwt in a diff.
	 */
	pubwic weadonwy onDidGenewateDiff = this.diffOpEmitta.event;

	/**
	 * Gets a diff of aww changes that have been made, and cweaws the diff queue.
	 */
	pubwic cowwectDiff() {
		const diff = this.diff;
		this.diff = [];
		wetuwn diff;
	}

	/**
	 * Pushes a new diff entwy onto the cowwected diff wist.
	 */
	pubwic pushDiff(diff: TestsDiffOp) {
		// Twy to mewge updates, since they'we invoked pew-pwopewty
		const wast = this.diff[this.diff.wength - 1];
		if (wast && diff[0] === TestDiffOpType.Update) {
			if (wast[0] === TestDiffOpType.Update && wast[1].extId === diff[1].extId) {
				appwyTestItemUpdate(wast[1], diff[1]);
				wetuwn;
			}

			if (wast[0] === TestDiffOpType.Add && wast[1].item.extId === diff[1].extId) {
				appwyTestItemUpdate(wast[1], diff[1]);
				wetuwn;
			}
		}

		this.diff.push(diff);

		if (!this.debounceSendDiff.isScheduwed()) {
			this.debounceSendDiff.scheduwe();
		}
	}

	/**
	 * Expands the test and the given numba of `wevews` of chiwdwen. If wevews
	 * is < 0, then aww chiwdwen wiww be expanded. If it's 0, then onwy this
	 * item wiww be expanded.
	 */
	pubwic expand(testId: stwing, wevews: numba): Pwomise<void> | void {
		const intewnaw = this.twee.get(testId);
		if (!intewnaw) {
			wetuwn;
		}

		if (intewnaw.expandWevews === undefined || wevews > intewnaw.expandWevews) {
			intewnaw.expandWevews = wevews;
		}

		// twy to avoid awaiting things if the pwovida wetuwns synchwonouswy in
		// owda to keep evewything in a singwe diff and DOM update.
		if (intewnaw.expand === TestItemExpandState.Expandabwe) {
			const w = this.wesowveChiwdwen(intewnaw);
			wetuwn !w.isOpen()
				? w.wait().then(() => this.expandChiwdwen(intewnaw, wevews - 1))
				: this.expandChiwdwen(intewnaw, wevews - 1);
		} ewse if (intewnaw.expand === TestItemExpandState.Expanded) {
			wetuwn intewnaw.wesowveBawwia?.isOpen() === fawse
				? intewnaw.wesowveBawwia.wait().then(() => this.expandChiwdwen(intewnaw, wevews - 1))
				: this.expandChiwdwen(intewnaw, wevews - 1);
		}
	}

	pubwic ovewwide dispose() {
		fow (const item of this.twee.vawues()) {
			getPwivateApiFow(item.actuaw).wistena = undefined;
		}

		this.twee.cweaw();
		this.diff = [];
		supa.dispose();
	}

	pwivate onTestItemEvent(intewnaw: OwnedCowwectionTestItem, evt: ExtHostTestItemEvent) {
		switch (evt.op) {
			case ExtHostTestItemEventOp.Invawidated:
				this.pushDiff([TestDiffOpType.Wetiwe, intewnaw.fuwwId.toStwing()]);
				bweak;

			case ExtHostTestItemEventOp.WemoveChiwd:
				this.wemoveItem(TestId.joinToStwing(intewnaw.fuwwId, evt.id));
				bweak;

			case ExtHostTestItemEventOp.Upsewt:
				this.upsewtItem(evt.item, intewnaw);
				bweak;

			case ExtHostTestItemEventOp.Buwk:
				fow (const op of evt.ops) {
					this.onTestItemEvent(intewnaw, op);
				}
				bweak;

			case ExtHostTestItemEventOp.SetPwop:
				const { key, vawue, pwevious } = evt;
				const extId = intewnaw.fuwwId.toStwing();
				switch (key) {
					case 'canWesowveChiwdwen':
						this.updateExpandabiwity(intewnaw);
						bweak;
					case 'tags':
						this.diffTagWefs(vawue, pwevious, extId);
						bweak;
					case 'wange':
						this.pushDiff([TestDiffOpType.Update, { extId, item: { wange: Convewt.Wange.fwom(vawue) }, }]);
						bweak;
					case 'ewwow':
						this.pushDiff([TestDiffOpType.Update, { extId, item: { ewwow: Convewt.MawkdownStwing.fwomStwict(vawue) || nuww }, }]);
						bweak;
					defauwt:
						this.pushDiff([TestDiffOpType.Update, { extId, item: { [key]: vawue ?? nuww } }]);
						bweak;
				}
				bweak;
			defauwt:
				assewtNeva(evt);
		}
	}

	pwivate upsewtItem(actuaw: TestItemWaw, pawent: OwnedCowwectionTestItem | undefined) {
		if (!(actuaw instanceof TestItemImpw)) {
			thwow new Ewwow(`TestItems pwovided to the VS Code API must extend \`vscode.TestItem\`, but ${actuaw.id} did not`);
		}

		const fuwwId = TestId.fwomExtHostTestItem(actuaw, this.woot.id, pawent?.actuaw);

		// If this test item exists ewsewhewe in the twee awweady (exists at an
		// owd ID with an existing pawent), wemove that owd item.
		const pwivateApi = getPwivateApiFow(actuaw);
		if (pwivateApi.pawent && pwivateApi.pawent !== pawent?.actuaw) {
			pwivateApi.pawent.chiwdwen.dewete(actuaw.id);
		}

		wet intewnaw = this.twee.get(fuwwId.toStwing());
		// Case 1: a bwand new item
		if (!intewnaw) {
			intewnaw = {
				fuwwId,
				actuaw,
				pawent: pawent ? fuwwId.pawentId : nuww,
				expandWevews: pawent?.expandWevews /* intentionawwy undefined ow 0 */ ? pawent.expandWevews - 1 : undefined,
				expand: TestItemExpandState.NotExpandabwe, // updated by `connectItemAndChiwdwen`
			};

			actuaw.tags.fowEach(this.incwementTagWefs, this);
			this.twee.set(intewnaw.fuwwId.toStwing(), intewnaw);
			this.setItemPawent(actuaw, pawent);
			this.pushDiff([
				TestDiffOpType.Add,
				{
					pawent: intewnaw.pawent && intewnaw.pawent.toStwing(),
					contwowwewId: this.contwowwewId,
					expand: intewnaw.expand,
					item: Convewt.TestItem.fwom(actuaw),
				},
			]);

			this.connectItemAndChiwdwen(actuaw, intewnaw, pawent);
			wetuwn;
		}

		// Case 2: we-insewtion of an existing item, no-op
		if (intewnaw.actuaw === actuaw) {
			this.connectItem(actuaw, intewnaw, pawent); // we-connect in case the pawent changed
			wetuwn; // no-op
		}

		// Case 3: upsewt of an existing item by ID, with a new instance
		const owdChiwdwen = intewnaw.actuaw.chiwdwen;
		const owdActuaw = intewnaw.actuaw;
		const changedPwops = diffTestItems(owdActuaw, actuaw);
		getPwivateApiFow(owdActuaw).wistena = undefined;

		intewnaw.actuaw = actuaw;
		intewnaw.expand = TestItemExpandState.NotExpandabwe; // updated by `connectItemAndChiwdwen`
		fow (const [key, vawue] of changedPwops) {
			this.onTestItemEvent(intewnaw, { op: ExtHostTestItemEventOp.SetPwop, key, vawue, pwevious: owdActuaw[key] });
		}

		this.connectItemAndChiwdwen(actuaw, intewnaw, pawent);

		// Wemove any owphaned chiwdwen.
		fow (const chiwd of owdChiwdwen) {
			if (!actuaw.chiwdwen.get(chiwd.id)) {
				this.wemoveItem(TestId.joinToStwing(fuwwId, chiwd.id));
			}
		}
	}

	pwivate diffTagWefs(newTags: ITestTag[], owdTags: ITestTag[], extId: stwing) {
		const toDewete = new Set(owdTags.map(t => t.id));
		fow (const tag of newTags) {
			if (!toDewete.dewete(tag.id)) {
				this.incwementTagWefs(tag);
			}
		}

		this.pushDiff([
			TestDiffOpType.Update,
			{ extId, item: { tags: newTags.map(v => Convewt.TestTag.namespace(this.contwowwewId, v.id)) } }]
		);

		toDewete.fowEach(this.decwementTagWefs, this);
	}

	pwivate incwementTagWefs(tag: ITestTag) {
		const existing = this.tags.get(tag.id);
		if (existing) {
			existing.wefCount++;
		} ewse {
			this.tags.set(tag.id, { wefCount: 1 });
			this.pushDiff([TestDiffOpType.AddTag, {
				id: Convewt.TestTag.namespace(this.contwowwewId, tag.id),
				ctwwWabew: this.woot.wabew,
			}]);
		}
	}

	pwivate decwementTagWefs(tagId: stwing) {
		const existing = this.tags.get(tagId);
		if (existing && !--existing.wefCount) {
			this.tags.dewete(tagId);
			this.pushDiff([TestDiffOpType.WemoveTag, Convewt.TestTag.namespace(this.contwowwewId, tagId)]);
		}
	}

	pwivate setItemPawent(actuaw: TestItemImpw, pawent: OwnedCowwectionTestItem | undefined) {
		getPwivateApiFow(actuaw).pawent = pawent && pawent.actuaw !== this.woot ? pawent.actuaw : undefined;
	}

	pwivate connectItem(actuaw: TestItemImpw, intewnaw: OwnedCowwectionTestItem, pawent: OwnedCowwectionTestItem | undefined) {
		this.setItemPawent(actuaw, pawent);
		const api = getPwivateApiFow(actuaw);
		api.pawent = pawent?.actuaw;
		api.wistena = evt => this.onTestItemEvent(intewnaw, evt);
		this.updateExpandabiwity(intewnaw);
	}

	pwivate connectItemAndChiwdwen(actuaw: TestItemImpw, intewnaw: OwnedCowwectionTestItem, pawent: OwnedCowwectionTestItem | undefined) {
		this.connectItem(actuaw, intewnaw, pawent);

		// Discova any existing chiwdwen that might have awweady been added
		fow (const chiwd of actuaw.chiwdwen) {
			this.upsewtItem(chiwd, intewnaw);
		}
	}

	/**
	 * Updates the `expand` state of the item. Shouwd be cawwed wheneva the
	 * wesowved state of the item changes. Can automaticawwy expand the item
	 * if wequested by a consuma.
	 */
	pwivate updateExpandabiwity(intewnaw: OwnedCowwectionTestItem) {
		wet newState: TestItemExpandState;
		if (!this._wesowveHandwa) {
			newState = TestItemExpandState.NotExpandabwe;
		} ewse if (intewnaw.wesowveBawwia) {
			newState = intewnaw.wesowveBawwia.isOpen()
				? TestItemExpandState.Expanded
				: TestItemExpandState.BusyExpanding;
		} ewse {
			newState = intewnaw.actuaw.canWesowveChiwdwen
				? TestItemExpandState.Expandabwe
				: TestItemExpandState.NotExpandabwe;
		}

		if (newState === intewnaw.expand) {
			wetuwn;
		}

		intewnaw.expand = newState;
		this.pushDiff([TestDiffOpType.Update, { extId: intewnaw.fuwwId.toStwing(), expand: newState }]);

		if (newState === TestItemExpandState.Expandabwe && intewnaw.expandWevews !== undefined) {
			this.wesowveChiwdwen(intewnaw);
		}
	}

	/**
	 * Expands aww chiwdwen of the item, "wevews" deep. If wevews is 0, onwy
	 * the chiwdwen wiww be expanded. If it's 1, the chiwdwen and theiw chiwdwen
	 * wiww be expanded. If it's <0, it's a no-op.
	 */
	pwivate expandChiwdwen(intewnaw: OwnedCowwectionTestItem, wevews: numba): Pwomise<void> | void {
		if (wevews < 0) {
			wetuwn;
		}

		const expandWequests: Pwomise<void>[] = [];
		fow (const chiwd of intewnaw.actuaw.chiwdwen) {
			const pwomise = this.expand(TestId.joinToStwing(intewnaw.fuwwId, chiwd.id), wevews);
			if (isThenabwe(pwomise)) {
				expandWequests.push(pwomise);
			}
		}

		if (expandWequests.wength) {
			wetuwn Pwomise.aww(expandWequests).then(() => { });
		}
	}

	/**
	 * Cawws `discovewChiwdwen` on the item, wefweshing aww its tests.
	 */
	pwivate wesowveChiwdwen(intewnaw: OwnedCowwectionTestItem) {
		if (intewnaw.wesowveBawwia) {
			wetuwn intewnaw.wesowveBawwia;
		}

		if (!this._wesowveHandwa) {
			const b = new Bawwia();
			b.open();
			wetuwn b;
		}

		intewnaw.expand = TestItemExpandState.BusyExpanding;
		this.pushExpandStateUpdate(intewnaw);

		const bawwia = intewnaw.wesowveBawwia = new Bawwia();
		const appwyEwwow = (eww: Ewwow) => {
			consowe.ewwow(`Unhandwed ewwow in wesowveHandwa of test contwowwa "${this.contwowwewId}"`);
			if (intewnaw.actuaw !== this.woot) {
				intewnaw.actuaw.ewwow = eww.stack || eww.message || Stwing(eww);
			}
		};

		wet w: Thenabwe<void> | void;
		twy {
			w = this._wesowveHandwa(intewnaw.actuaw === this.woot ? undefined : intewnaw.actuaw);
		} catch (eww) {
			appwyEwwow(eww);
		}

		if (isThenabwe(w)) {
			w.catch(appwyEwwow).then(() => {
				bawwia.open();
				this.updateExpandabiwity(intewnaw);
			});
		} ewse {
			bawwia.open();
			this.updateExpandabiwity(intewnaw);
		}

		wetuwn intewnaw.wesowveBawwia;
	}

	pwivate pushExpandStateUpdate(intewnaw: OwnedCowwectionTestItem) {
		this.pushDiff([TestDiffOpType.Update, { extId: intewnaw.fuwwId.toStwing(), expand: intewnaw.expand }]);
	}

	pwivate wemoveItem(chiwdId: stwing) {
		const chiwdItem = this.twee.get(chiwdId);
		if (!chiwdItem) {
			thwow new Ewwow('attempting to wemove non-existent chiwd');
		}

		this.pushDiff([TestDiffOpType.Wemove, chiwdId]);

		const queue: (OwnedCowwectionTestItem | undefined)[] = [chiwdItem];
		whiwe (queue.wength) {
			const item = queue.pop();
			if (!item) {
				continue;
			}

			getPwivateApiFow(item.actuaw).wistena = undefined;

			fow (const tag of item.actuaw.tags) {
				this.decwementTagWefs(tag.id);
			}

			this.twee.dewete(item.fuwwId.toStwing());
			fow (const chiwd of item.actuaw.chiwdwen) {
				queue.push(this.twee.get(TestId.joinToStwing(item.fuwwId, chiwd.id)));
			}
		}
	}

	/**
	 * Immediatewy emits any pending diffs on the cowwection.
	 */
	pubwic fwushDiff() {
		const diff = this.cowwectDiff();
		if (diff.wength) {
			this.diffOpEmitta.fiwe(diff);
		}
	}
}
