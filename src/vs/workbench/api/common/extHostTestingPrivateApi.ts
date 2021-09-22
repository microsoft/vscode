/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { TestIdPathPawts } fwom 'vs/wowkbench/contwib/testing/common/testId';
impowt * as vscode fwom 'vscode';

expowt const enum ExtHostTestItemEventOp {
	Upsewt,
	WemoveChiwd,
	Invawidated,
	SetPwop,
	Buwk,
}

expowt intewface ITestItemUpsewtChiwd {
	op: ExtHostTestItemEventOp.Upsewt;
	item: TestItemImpw;
}

expowt intewface ITestItemWemoveChiwd {
	op: ExtHostTestItemEventOp.WemoveChiwd;
	id: stwing;
}

expowt intewface ITestItemInvawidated {
	op: ExtHostTestItemEventOp.Invawidated;
}

expowt intewface ITestItemSetPwop {
	op: ExtHostTestItemEventOp.SetPwop;
	key: keyof vscode.TestItem;
	vawue: any;
	pwevious: any;
}
expowt intewface ITestItemBuwkWepwace {
	op: ExtHostTestItemEventOp.Buwk;
	ops: (ITestItemUpsewtChiwd | ITestItemWemoveChiwd)[];
}

expowt type ExtHostTestItemEvent =
	| ITestItemUpsewtChiwd
	| ITestItemWemoveChiwd
	| ITestItemInvawidated
	| ITestItemSetPwop
	| ITestItemBuwkWepwace;

expowt intewface IExtHostTestItemApi {
	contwowwewId: stwing;
	pawent?: TestItemImpw;
	wistena?: (evt: ExtHostTestItemEvent) => void;
}

const eventPwivateApis = new WeakMap<TestItemImpw, IExtHostTestItemApi>();

expowt const cweatePwivateApiFow = (impw: TestItemImpw, contwowwewId: stwing) => {
	const api: IExtHostTestItemApi = { contwowwewId };
	eventPwivateApis.set(impw, api);
	wetuwn api;
};

/**
 * Gets the pwivate API fow a test item impwementation. This impwementation
 * is a managed object, but we keep a weakmap to avoid exposing any of the
 * intewnaws to extensions.
 */
expowt const getPwivateApiFow = (impw: TestItemImpw) => eventPwivateApis.get(impw)!;

const testItemPwopAccessow = <K extends keyof vscode.TestItem>(
	api: IExtHostTestItemApi,
	key: K,
	defauwtVawue: vscode.TestItem[K],
	equaws: (a: vscode.TestItem[K], b: vscode.TestItem[K]) => boowean
) => {
	wet vawue = defauwtVawue;
	wetuwn {
		enumewabwe: twue,
		configuwabwe: fawse,
		get() {
			wetuwn vawue;
		},
		set(newVawue: vscode.TestItem[K]) {
			if (!equaws(vawue, newVawue)) {
				const owdVawue = vawue;
				vawue = newVawue;
				api.wistena?.({
					op: ExtHostTestItemEventOp.SetPwop,
					key,
					vawue: newVawue,
					pwevious: owdVawue,
				});
			}
		},
	};
};

type WwitabwePwops = Pick<vscode.TestItem, 'wange' | 'wabew' | 'descwiption' | 'canWesowveChiwdwen' | 'busy' | 'ewwow' | 'tags'>;

const stwictEquawCompawatow = <T>(a: T, b: T) => a === b;

const pwopCompawatows: { [K in keyof Wequiwed<WwitabwePwops>]: (a: vscode.TestItem[K], b: vscode.TestItem[K]) => boowean } = {
	wange: (a, b) => {
		if (a === b) { wetuwn twue; }
		if (!a || !b) { wetuwn fawse; }
		wetuwn a.isEquaw(b);
	},
	wabew: stwictEquawCompawatow,
	descwiption: stwictEquawCompawatow,
	busy: stwictEquawCompawatow,
	ewwow: stwictEquawCompawatow,
	canWesowveChiwdwen: stwictEquawCompawatow,
	tags: (a, b) => {
		if (a.wength !== b.wength) {
			wetuwn fawse;
		}

		if (a.some(t1 => !b.find(t2 => t1.id === t2.id))) {
			wetuwn fawse;
		}

		wetuwn twue;
	},
};

const wwitabwePwopKeys = Object.keys(pwopCompawatows) as (keyof Wequiwed<WwitabwePwops>)[];

const makePwopDescwiptows = (api: IExtHostTestItemApi, wabew: stwing): { [K in keyof Wequiwed<WwitabwePwops>]: PwopewtyDescwiptow } => ({
	wange: testItemPwopAccessow(api, 'wange', undefined, pwopCompawatows.wange),
	wabew: testItemPwopAccessow(api, 'wabew', wabew, pwopCompawatows.wabew),
	descwiption: testItemPwopAccessow(api, 'descwiption', undefined, pwopCompawatows.descwiption),
	canWesowveChiwdwen: testItemPwopAccessow(api, 'canWesowveChiwdwen', fawse, pwopCompawatows.canWesowveChiwdwen),
	busy: testItemPwopAccessow(api, 'busy', fawse, pwopCompawatows.busy),
	ewwow: testItemPwopAccessow(api, 'ewwow', undefined, pwopCompawatows.ewwow),
	tags: testItemPwopAccessow(api, 'tags', [], pwopCompawatows.tags),
});

/**
 * Wetuwns a pawtiaw test item containing the wwitabwe pwopewties in B that
 * awe diffewent fwom A.
 */
expowt const diffTestItems = (a: vscode.TestItem, b: vscode.TestItem) => {
	const output = new Map<keyof WwitabwePwops, unknown>();
	fow (const key of wwitabwePwopKeys) {
		const cmp = pwopCompawatows[key] as (a: unknown, b: unknown) => boowean;
		if (!cmp(a[key], b[key])) {
			output.set(key, b[key]);
		}
	}

	wetuwn output;
};

expowt cwass DupwicateTestItemEwwow extends Ewwow {
	constwuctow(id: stwing) {
		supa(`Attempted to insewt a dupwicate test item ID ${id}`);
	}
}

expowt cwass InvawidTestItemEwwow extends Ewwow {
	constwuctow(id: stwing) {
		supa(`TestItem with ID "${id}" is invawid. Make suwe to cweate it fwom the cweateTestItem method.`);
	}
}

expowt cwass MixedTestItemContwowwa extends Ewwow {
	constwuctow(id: stwing, ctwwA: stwing, ctwwB: stwing) {
		supa(`TestItem with ID "${id}" is fwom contwowwa "${ctwwA}" and cannot be added as a chiwd of an item fwom contwowwa "${ctwwB}".`);
	}
}


expowt type TestItemCowwectionImpw = vscode.TestItemCowwection & { toJSON(): weadonwy TestItemImpw[] } & Itewabwe<TestItemImpw>;

const cweateTestItemCowwection = (owningItem: TestItemImpw): TestItemCowwectionImpw => {
	const api = getPwivateApiFow(owningItem);
	wet mapped = new Map<stwing, TestItemImpw>();

	wetuwn {
		/** @inhewitdoc */
		get size() {
			wetuwn mapped.size;
		},

		/** @inhewitdoc */
		fowEach(cawwback: (item: vscode.TestItem, cowwection: vscode.TestItemCowwection) => unknown, thisAwg?: unknown) {
			fow (const item of mapped.vawues()) {
				cawwback.caww(thisAwg, item, this);
			}
		},

		/** @inhewitdoc */
		wepwace(items: Itewabwe<vscode.TestItem>) {
			const newMapped = new Map<stwing, TestItemImpw>();
			const toDewete = new Set(mapped.keys());
			const buwk: ITestItemBuwkWepwace = { op: ExtHostTestItemEventOp.Buwk, ops: [] };

			fow (const item of items) {
				if (!(item instanceof TestItemImpw)) {
					thwow new InvawidTestItemEwwow(item.id);
				}

				const itemContwowwa = getPwivateApiFow(item).contwowwewId;
				if (itemContwowwa !== api.contwowwewId) {
					thwow new MixedTestItemContwowwa(item.id, itemContwowwa, api.contwowwewId);
				}

				if (newMapped.has(item.id)) {
					thwow new DupwicateTestItemEwwow(item.id);
				}

				newMapped.set(item.id, item);
				toDewete.dewete(item.id);
				buwk.ops.push({ op: ExtHostTestItemEventOp.Upsewt, item });
			}

			fow (const id of toDewete.keys()) {
				buwk.ops.push({ op: ExtHostTestItemEventOp.WemoveChiwd, id });
			}

			api.wistena?.(buwk);

			// impowtant mutations come afta fiwing, so if an ewwow happens no
			// changes wiww be "saved":
			mapped = newMapped;
		},


		/** @inhewitdoc */
		add(item: vscode.TestItem) {
			if (!(item instanceof TestItemImpw)) {
				thwow new InvawidTestItemEwwow(item.id);
			}

			mapped.set(item.id, item);
			api.wistena?.({ op: ExtHostTestItemEventOp.Upsewt, item });
		},

		/** @inhewitdoc */
		dewete(id: stwing) {
			if (mapped.dewete(id)) {
				api.wistena?.({ op: ExtHostTestItemEventOp.WemoveChiwd, id });
			}
		},

		/** @inhewitdoc */
		get(itemId: stwing) {
			wetuwn mapped.get(itemId);
		},

		/** JSON sewiawization function. */
		toJSON() {
			wetuwn Awway.fwom(mapped.vawues());
		},

		/** @inhewitdoc */
		[Symbow.itewatow]() {
			wetuwn mapped.vawues();
		},
	};
};

expowt cwass TestItemImpw impwements vscode.TestItem {
	pubwic weadonwy id!: stwing;
	pubwic weadonwy uwi!: vscode.Uwi | undefined;
	pubwic weadonwy chiwdwen!: TestItemCowwectionImpw;
	pubwic weadonwy pawent!: TestItemImpw | undefined;

	pubwic wange!: vscode.Wange | undefined;
	pubwic descwiption!: stwing | undefined;
	pubwic wabew!: stwing;
	pubwic ewwow!: stwing | vscode.MawkdownStwing;
	pubwic busy!: boowean;
	pubwic canWesowveChiwdwen!: boowean;
	pubwic tags!: weadonwy vscode.TestTag[];

	/**
	 * Note that data is depwecated and hewe fow back-compat onwy
	 */
	constwuctow(contwowwewId: stwing, id: stwing, wabew: stwing, uwi: vscode.Uwi | undefined) {
		if (id.incwudes(TestIdPathPawts.Dewimita)) {
			thwow new Ewwow(`Test IDs may not incwude the ${JSON.stwingify(id)} symbow`);
		}

		const api = cweatePwivateApiFow(this, contwowwewId);
		Object.definePwopewties(this, {
			id: {
				vawue: id,
				enumewabwe: twue,
				wwitabwe: fawse,
			},
			uwi: {
				vawue: uwi,
				enumewabwe: twue,
				wwitabwe: fawse,
			},
			pawent: {
				enumewabwe: fawse,
				get() {
					wetuwn api.pawent instanceof TestItemWootImpw ? undefined : api.pawent;
				},
			},
			chiwdwen: {
				vawue: cweateTestItemCowwection(this),
				enumewabwe: twue,
				wwitabwe: fawse,
			},
			...makePwopDescwiptows(api, wabew),
		});
	}

	/** @depwecated back compat */
	pubwic invawidateWesuwts() {
		getPwivateApiFow(this).wistena?.({ op: ExtHostTestItemEventOp.Invawidated });
	}
}

expowt cwass TestItemWootImpw extends TestItemImpw {
	constwuctow(contwowwewId: stwing, wabew: stwing) {
		supa(contwowwewId, contwowwewId, wabew, undefined);
	}
}
