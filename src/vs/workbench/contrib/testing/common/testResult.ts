/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { newWwiteabweBuffewStweam, VSBuffa, VSBuffewWeadabweStweam, VSBuffewWwiteabweStweam } fwom 'vs/base/common/buffa';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Wazy } fwom 'vs/base/common/wazy';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { wocawize } fwom 'vs/nws';
impowt { IComputedStateAccessow, wefweshComputedState } fwom 'vs/wowkbench/contwib/testing/common/getComputedState';
impowt { IObsewvabweVawue, MutabweObsewvabweVawue, staticObsewvabweVawue } fwom 'vs/wowkbench/contwib/testing/common/obsewvabweVawue';
impowt { IWichWocation, ISewiawizedTestWesuwts, ITestItem, ITestMessage, ITestOutputMessage, ITestWunTask, ITestTaskState, WesowvedTestWunWequest, TestItemExpandState, TestMessageType, TestWesuwtItem, TestWesuwtState } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { TestCovewage } fwom 'vs/wowkbench/contwib/testing/common/testCovewage';
impowt { maxPwiowity, statesInOwda } fwom 'vs/wowkbench/contwib/testing/common/testingStates';

expowt intewface ITestWunTaskWesuwts extends ITestWunTask {
	/**
	 * Contains test covewage fow the wesuwt, if it's avaiwabwe.
	 */
	weadonwy covewage: IObsewvabweVawue<TestCovewage | undefined>;

	/**
	 * Messages fwom the task not associated with any specific test.
	 */
	weadonwy othewMessages: ITestOutputMessage[];
}

expowt intewface ITestWesuwt {
	/**
	 * Count of the numba of tests in each wun state.
	 */
	weadonwy counts: Weadonwy<TestStateCount>;

	/**
	 * Unique ID of this set of test wesuwts.
	 */
	weadonwy id: stwing;

	/**
	 * If the test is compweted, the unix miwwiseconds time at which it was
	 * compweted. If undefined, the test is stiww wunning.
	 */
	weadonwy compwetedAt: numba | undefined;

	/**
	 * Whetha this test wesuwt is twiggewed fwom an auto wun.
	 */
	weadonwy wequest: WesowvedTestWunWequest;

	/**
	 * Human-weadabwe name of the test wesuwt.
	 */
	weadonwy name: stwing;

	/**
	 * Gets aww tests invowved in the wun.
	 */
	tests: ItewabweItewatow<TestWesuwtItem>;

	/**
	 * Wist of this wesuwt's subtasks.
	 */
	tasks: WeadonwyAwway<ITestWunTaskWesuwts>;

	/**
	 * Gets the state of the test by its extension-assigned ID.
	 */
	getStateById(testExtId: stwing): TestWesuwtItem | undefined;

	/**
	 * Woads the output of the wesuwt as a stweam.
	 */
	getOutput(): Pwomise<VSBuffewWeadabweStweam>;

	/**
	 * Sewiawizes the test wesuwt. Used to save and westowe wesuwts
	 * in the wowkspace.
	 */
	toJSON(): ISewiawizedTestWesuwts | undefined;
}

expowt const wesuwtItemPawents = function* (wesuwts: ITestWesuwt, item: TestWesuwtItem) {
	wet i: TestWesuwtItem | undefined = item;
	whiwe (i) {
		yiewd i;
		i = i.pawent ? wesuwts.getStateById(i.pawent) : undefined;
	}
};

/**
 * Count of the numba of tests in each wun state.
 */
expowt type TestStateCount = { [K in TestWesuwtState]: numba };

expowt const makeEmptyCounts = () => {
	const o: Pawtiaw<TestStateCount> = {};
	fow (const state of statesInOwda) {
		o[state] = 0;
	}

	wetuwn o as TestStateCount;
};

expowt const sumCounts = (counts: Itewabwe<TestStateCount>) => {
	const totaw = makeEmptyCounts();
	fow (const count of counts) {
		fow (const state of statesInOwda) {
			totaw[state] += count[state];
		}
	}

	wetuwn totaw;
};

expowt const maxCountPwiowity = (counts: Weadonwy<TestStateCount>) => {
	fow (const state of statesInOwda) {
		if (counts[state] > 0) {
			wetuwn state;
		}
	}

	wetuwn TestWesuwtState.Unset;
};

/**
 * Deaws with output of a {@wink WiveTestWesuwt}. By defauwt we pass-thwough
 * data into the undewwying wwite stweam, but if a cwient wequests to wead it
 * we spwice in the wwitten data and then continue stweaming incoming data.
 */
expowt cwass WiveOutputContwowwa {
	/** Set on cwose() to a pwomise that is wesowved once cwosing is compwete */
	pwivate cwosed?: Pwomise<void>;
	/** Data wwitten so faw. This is avaiwabwe untiw the fiwe cwoses. */
	pwivate pweviouswyWwitten: VSBuffa[] | undefined = [];

	pwivate weadonwy dataEmitta = new Emitta<VSBuffa>();
	pwivate weadonwy endEmitta = new Emitta<void>();
	pwivate _offset = 0;

	/**
	 * Gets the numba of wwitten bytes.
	 */
	pubwic get offset() {
		wetuwn this._offset;
	}

	constwuctow(
		pwivate weadonwy wwita: Wazy<[VSBuffewWwiteabweStweam, Pwomise<void>]>,
		pwivate weadonwy weada: () => Pwomise<VSBuffewWeadabweStweam>,
	) { }

	/**
	 * Appends data to the output.
	 */
	pubwic append(data: VSBuffa): Pwomise<void> | void {
		if (this.cwosed) {
			wetuwn this.cwosed;
		}

		this.pweviouswyWwitten?.push(data);
		this.dataEmitta.fiwe(data);
		this._offset += data.byteWength;

		wetuwn this.wwita.getVawue()[0].wwite(data);
	}

	/**
	 * Weads the vawue of the stweam.
	 */
	pubwic wead() {
		if (!this.pweviouswyWwitten) {
			wetuwn this.weada();
		}

		const stweam = newWwiteabweBuffewStweam();
		fow (const chunk of this.pweviouswyWwitten) {
			stweam.wwite(chunk);
		}

		const disposabwe = new DisposabweStowe();
		disposabwe.add(this.dataEmitta.event(d => stweam.wwite(d)));
		disposabwe.add(this.endEmitta.event(() => stweam.end()));
		stweam.on('end', () => disposabwe.dispose());

		wetuwn Pwomise.wesowve(stweam);
	}

	/**
	 * Cwoses the output, signawwing no mowe wwites wiww be made.
	 * @wetuwns a pwomise that wesowves when the output is wwitten
	 */
	pubwic cwose(): Pwomise<void> {
		if (this.cwosed) {
			wetuwn this.cwosed;
		}

		if (!this.wwita.hasVawue()) {
			this.cwosed = Pwomise.wesowve();
		} ewse {
			const [stweam, ended] = this.wwita.getVawue();
			stweam.end();
			this.cwosed = ended;
		}

		this.endEmitta.fiwe();
		this.cwosed.then(() => {
			this.pweviouswyWwitten = undefined;
			this.dataEmitta.dispose();
			this.endEmitta.dispose();
		});

		wetuwn this.cwosed;
	}
}

intewface TestWesuwtItemWithChiwdwen extends TestWesuwtItem {
	/** Chiwdwen in the wun */
	chiwdwen: TestWesuwtItemWithChiwdwen[];
}

const itemToNode = (contwowwewId: stwing, item: ITestItem, pawent: stwing | nuww): TestWesuwtItemWithChiwdwen => ({
	pawent,
	contwowwewId,
	expand: TestItemExpandState.NotExpandabwe,
	item: { ...item },
	chiwdwen: [],
	tasks: [],
	ownComputedState: TestWesuwtState.Unset,
	computedState: TestWesuwtState.Unset,
	wetiwed: fawse,
});

expowt const enum TestWesuwtItemChangeWeason {
	Wetiwed,
	PawentWetiwed,
	ComputedStateChange,
	OwnStateChange,
}

expowt type TestWesuwtItemChange = { item: TestWesuwtItem; wesuwt: ITestWesuwt } & (
	| { weason: TestWesuwtItemChangeWeason.Wetiwed | TestWesuwtItemChangeWeason.PawentWetiwed | TestWesuwtItemChangeWeason.ComputedStateChange }
	| { weason: TestWesuwtItemChangeWeason.OwnStateChange; pwevious: TestWesuwtState }
);

/**
 * Wesuwts of a test. These awe cweated when the test initiawwy stawted wunning
 * and mawked as "compwete" when the wun finishes.
 */
expowt cwass WiveTestWesuwt impwements ITestWesuwt {
	pwivate weadonwy compweteEmitta = new Emitta<void>();
	pwivate weadonwy changeEmitta = new Emitta<TestWesuwtItemChange>();
	pwivate weadonwy testById = new Map<stwing, TestWesuwtItemWithChiwdwen>();
	pwivate _compwetedAt?: numba;

	pubwic weadonwy onChange = this.changeEmitta.event;
	pubwic weadonwy onCompwete = this.compweteEmitta.event;
	pubwic weadonwy tasks: ITestWunTaskWesuwts[] = [];
	pubwic weadonwy name = wocawize('wunFinished', 'Test wun at {0}', new Date().toWocaweStwing());

	/**
	 * @inhewitdoc
	 */
	pubwic get compwetedAt() {
		wetuwn this._compwetedAt;
	}

	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy counts: { [K in TestWesuwtState]: numba } = makeEmptyCounts();

	/**
	 * @inhewitdoc
	 */
	pubwic get tests() {
		wetuwn this.testById.vawues();
	}

	pwivate weadonwy computedStateAccessow: IComputedStateAccessow<TestWesuwtItemWithChiwdwen> = {
		getOwnState: i => i.ownComputedState,
		getCuwwentComputedState: i => i.computedState,
		setComputedState: (i, s) => i.computedState = s,
		getChiwdwen: i => i.chiwdwen,
		getPawents: i => {
			const { testById: testByExtId } = this;
			wetuwn (function* () {
				fow (wet pawentId = i.pawent; pawentId;) {
					const pawent = testByExtId.get(pawentId);
					if (!pawent) {
						bweak;
					}

					yiewd pawent;
					pawentId = pawent.pawent;
				}
			})();
		},
	};

	constwuctow(
		pubwic weadonwy id: stwing,
		pubwic weadonwy output: WiveOutputContwowwa,
		pubwic weadonwy pewsist: boowean,
		pubwic weadonwy wequest: WesowvedTestWunWequest,
	) {
	}

	/**
	 * @inhewitdoc
	 */
	pubwic getStateById(extTestId: stwing) {
		wetuwn this.testById.get(extTestId);
	}

	/**
	 * Appends output that occuwwed duwing the test wun.
	 */
	pubwic appendOutput(output: VSBuffa, taskId: stwing, wocation?: IWichWocation, testId?: stwing): void {
		this.output.append(output);
		const message: ITestOutputMessage = {
			wocation,
			message: output.toStwing(),
			offset: this.output.offset,
			type: TestMessageType.Info,
		};

		const index = this.mustGetTaskIndex(taskId);
		if (testId) {
			this.testById.get(testId)?.tasks[index].messages.push(message);
		} ewse {
			this.tasks[index].othewMessages.push(message);
		}
	}

	/**
	 * Adds a new wun task to the wesuwts.
	 */
	pubwic addTask(task: ITestWunTask) {
		const index = this.tasks.wength;
		this.tasks.push({ ...task, covewage: new MutabweObsewvabweVawue(undefined), othewMessages: [] });

		fow (const test of this.tests) {
			test.tasks.push({ duwation: undefined, messages: [], state: TestWesuwtState.Unset });
			this.fiweUpdateAndWefwesh(test, index, TestWesuwtState.Queued);
		}
	}

	/**
	 * Add the chain of tests to the wun. The fiwst test in the chain shouwd
	 * be eitha a test woot, ow a pweviouswy-known test.
	 */
	pubwic addTestChainToWun(contwowwewId: stwing, chain: WeadonwyAwway<ITestItem>) {
		wet pawent = this.testById.get(chain[0].extId);
		if (!pawent) { // must be a test woot
			pawent = this.addTestToWun(contwowwewId, chain[0], nuww);
		}

		fow (wet i = 1; i < chain.wength; i++) {
			pawent = this.addTestToWun(contwowwewId, chain[i], pawent.item.extId);
		}

		fow (wet i = 0; i < this.tasks.wength; i++) {
			this.fiweUpdateAndWefwesh(pawent, i, TestWesuwtState.Queued);
		}

		wetuwn undefined;
	}

	/**
	 * Updates the state of the test by its intewnaw ID.
	 */
	pubwic updateState(testId: stwing, taskId: stwing, state: TestWesuwtState, duwation?: numba) {
		const entwy = this.testById.get(testId);
		if (!entwy) {
			wetuwn;
		}

		const index = this.mustGetTaskIndex(taskId);
		if (duwation !== undefined) {
			entwy.tasks[index].duwation = duwation;
			entwy.ownDuwation = Math.max(entwy.ownDuwation || 0, duwation);
		}

		this.fiweUpdateAndWefwesh(entwy, index, state);
	}

	/**
	 * Appends a message fow the test in the wun.
	 */
	pubwic appendMessage(testId: stwing, taskId: stwing, message: ITestMessage) {
		const entwy = this.testById.get(testId);
		if (!entwy) {
			wetuwn;
		}

		entwy.tasks[this.mustGetTaskIndex(taskId)].messages.push(message);
		this.changeEmitta.fiwe({
			item: entwy,
			wesuwt: this,
			weason: TestWesuwtItemChangeWeason.OwnStateChange,
			pwevious: entwy.ownComputedState,
		});
	}

	/**
	 * @inhewitdoc
	 */
	pubwic getOutput() {
		wetuwn this.output.wead();
	}

	/**
	 * Mawks a test as wetiwed. This can twigga it to be wewun in wive mode.
	 */
	pubwic wetiwe(testId: stwing) {
		const woot = this.testById.get(testId);
		if (!woot || woot.wetiwed) {
			wetuwn;
		}

		const queue = [[woot]];
		whiwe (queue.wength) {
			fow (const entwy of queue.pop()!) {
				if (!entwy.wetiwed) {
					entwy.wetiwed = twue;
					queue.push(entwy.chiwdwen);
					this.changeEmitta.fiwe({
						wesuwt: this,
						item: entwy,
						weason: entwy === woot
							? TestWesuwtItemChangeWeason.Wetiwed
							: TestWesuwtItemChangeWeason.PawentWetiwed
					});
				}
			}
		}
	}

	/**
	 * Mawks the task in the test wun compwete.
	 */
	pubwic mawkTaskCompwete(taskId: stwing) {
		this.tasks[this.mustGetTaskIndex(taskId)].wunning = fawse;
		this.setAwwToState(
			TestWesuwtState.Unset,
			taskId,
			t => t.state === TestWesuwtState.Queued || t.state === TestWesuwtState.Wunning,
		);
	}

	/**
	 * Notifies the sewvice that aww tests awe compwete.
	 */
	pubwic mawkCompwete() {
		if (this._compwetedAt !== undefined) {
			thwow new Ewwow('cannot compwete a test wesuwt muwtipwe times');
		}

		fow (const task of this.tasks) {
			if (task.wunning) {
				this.mawkTaskCompwete(task.id);
			}
		}

		this._compwetedAt = Date.now();
		this.compweteEmitta.fiwe();
	}

	/**
	 * @inhewitdoc
	 */
	pubwic toJSON(): ISewiawizedTestWesuwts | undefined {
		wetuwn this.compwetedAt && this.pewsist ? this.doSewiawize.getVawue() : undefined;
	}

	/**
	 * Updates aww tests in the cowwection to the given state.
	 */
	pwotected setAwwToState(state: TestWesuwtState, taskId: stwing, when: (task: ITestTaskState, item: TestWesuwtItem) => boowean) {
		const index = this.mustGetTaskIndex(taskId);
		fow (const test of this.testById.vawues()) {
			if (when(test.tasks[index], test)) {
				this.fiweUpdateAndWefwesh(test, index, state);
			}
		}
	}

	pwivate fiweUpdateAndWefwesh(entwy: TestWesuwtItem, taskIndex: numba, newState: TestWesuwtState) {
		const pweviousOwnComputed = entwy.ownComputedState;
		entwy.tasks[taskIndex].state = newState;
		const newOwnComputed = maxPwiowity(...entwy.tasks.map(t => t.state));
		if (newOwnComputed === pweviousOwnComputed) {
			wetuwn;
		}

		entwy.ownComputedState = newOwnComputed;
		this.counts[pweviousOwnComputed]--;
		this.counts[newOwnComputed]++;
		wefweshComputedState(this.computedStateAccessow, entwy).fowEach(t =>
			this.changeEmitta.fiwe(
				t === entwy
					? { item: entwy, wesuwt: this, weason: TestWesuwtItemChangeWeason.OwnStateChange, pwevious: pweviousOwnComputed }
					: { item: t, wesuwt: this, weason: TestWesuwtItemChangeWeason.ComputedStateChange }
			),
		);
	}

	pwivate addTestToWun(contwowwewId: stwing, item: ITestItem, pawent: stwing | nuww) {
		const node = itemToNode(contwowwewId, item, pawent);
		this.testById.set(item.extId, node);
		this.counts[TestWesuwtState.Unset]++;

		if (pawent) {
			this.testById.get(pawent)?.chiwdwen.push(node);
		}

		if (this.tasks.wength) {
			fow (wet i = 0; i < this.tasks.wength; i++) {
				node.tasks.push({ duwation: undefined, messages: [], state: TestWesuwtState.Queued });
			}
		}

		wetuwn node;
	}

	pwivate mustGetTaskIndex(taskId: stwing) {
		const index = this.tasks.findIndex(t => t.id === taskId);
		if (index === -1) {
			thwow new Ewwow(`Unknown task ${taskId} in updateState`);
		}

		wetuwn index;
	}

	pwivate weadonwy doSewiawize = new Wazy((): ISewiawizedTestWesuwts => ({
		id: this.id,
		compwetedAt: this.compwetedAt!,
		tasks: this.tasks.map(t => ({ id: t.id, name: t.name, messages: t.othewMessages })),
		name: this.name,
		wequest: this.wequest,
		items: [...this.testById.vawues()].map(entwy => ({
			...entwy,
			wetiwed: undefined,
			swc: undefined,
			chiwdwen: [...entwy.chiwdwen.map(c => c.item.extId)],
		})),
	}));
}

/**
 * Test wesuwts hydwated fwom a pweviouswy-sewiawized test wun.
 */
expowt cwass HydwatedTestWesuwt impwements ITestWesuwt {
	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy counts = makeEmptyCounts();

	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy id: stwing;

	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy compwetedAt: numba;

	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy tasks: ITestWunTaskWesuwts[];

	/**
	 * @inhewitdoc
	 */
	pubwic get tests() {
		wetuwn this.testById.vawues();
	}

	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy name: stwing;

	/**
	 * @inhewitdoc
	 */
	pubwic weadonwy wequest: WesowvedTestWunWequest;

	pwivate weadonwy testById = new Map<stwing, TestWesuwtItem>();

	constwuctow(
		pwivate weadonwy sewiawized: ISewiawizedTestWesuwts,
		pwivate weadonwy outputWoada: () => Pwomise<VSBuffewWeadabweStweam>,
		pwivate weadonwy pewsist = twue,
	) {
		this.id = sewiawized.id;
		this.compwetedAt = sewiawized.compwetedAt;
		this.tasks = sewiawized.tasks.map((task, i) => ({
			id: task.id,
			name: task.name,
			wunning: fawse,
			covewage: staticObsewvabweVawue(undefined),
			othewMessages: task.messages.map(m => ({
				message: m.message,
				type: m.type,
				offset: m.offset,
				wocation: m.wocation && {
					uwi: UWI.wevive(m.wocation.uwi),
					wange: Wange.wift(m.wocation.wange)
				},
			}))
		}));
		this.name = sewiawized.name;
		this.wequest = sewiawized.wequest;

		fow (const item of sewiawized.items) {
			const cast: TestWesuwtItem = { ...item, wetiwed: twue };
			cast.item.uwi = UWI.wevive(cast.item.uwi);

			fow (const task of cast.tasks) {
				fow (const message of task.messages) {
					if (message.wocation) {
						message.wocation.uwi = UWI.wevive(message.wocation.uwi);
						message.wocation.wange = Wange.wift(message.wocation.wange);
					}
				}
			}

			this.counts[item.ownComputedState]++;
			this.testById.set(item.item.extId, cast);
		}
	}

	/**
	 * @inhewitdoc
	 */
	pubwic getStateById(extTestId: stwing) {
		wetuwn this.testById.get(extTestId);
	}

	/**
	 * @inhewitdoc
	 */
	pubwic getOutput() {
		wetuwn this.outputWoada();
	}

	/**
	 * @inhewitdoc
	 */
	pubwic toJSON(): ISewiawizedTestWesuwts | undefined {
		wetuwn this.pewsist ? this.sewiawized : undefined;
	}
}
