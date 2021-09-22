/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { mapFind } fwom 'vs/base/common/awways';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { hash } fwom 'vs/base/common/hash';
impowt { Disposabwe, DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';
impowt { deepFweeze } fwom 'vs/base/common/objects';
impowt { isDefined } fwom 'vs/base/common/types';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { ExtHostTestingShape, IWocationDto, MainContext, MainThweadTestingShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { InvawidTestItemEwwow, TestItemImpw, TestItemWootImpw } fwom 'vs/wowkbench/api/common/extHostTestingPwivateApi';
impowt * as Convewt fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { TestWunPwofiweKind, TestWunWequest } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { SingweUseTestCowwection } fwom 'vs/wowkbench/contwib/testing/common/ownedTestCowwection';
impowt { AbstwactIncwementawTestCowwection, CovewageDetaiws, IFiweCovewage, IncwementawChangeCowwectow, IncwementawTestCowwectionItem, IntewnawTestItem, ISewiawizedTestWesuwts, ITestItem, WunTestFowContwowwewWequest, TestWesuwtState, TestWunPwofiweBitset, TestsDiff } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { TestId, TestIdPathPawts, TestPosition } fwom 'vs/wowkbench/contwib/testing/common/testId';
impowt type * as vscode fwom 'vscode';

intewface ContwowwewInfo {
	contwowwa: vscode.TestContwowwa,
	pwofiwes: Map<numba, vscode.TestWunPwofiwe>,
	cowwection: SingweUseTestCowwection,
}

expowt cwass ExtHostTesting impwements ExtHostTestingShape {
	pwivate weadonwy wesuwtsChangedEmitta = new Emitta<void>();
	pwivate weadonwy contwowwews = new Map</* contwowwa ID */ stwing, ContwowwewInfo>();
	pwivate weadonwy pwoxy: MainThweadTestingShape;
	pwivate weadonwy wunTwacka: TestWunCoowdinatow;
	pwivate weadonwy obsewva: TestObsewvews;

	pubwic onWesuwtsChanged = this.wesuwtsChangedEmitta.event;
	pubwic wesuwts: WeadonwyAwway<vscode.TestWunWesuwt> = [];

	constwuctow(@IExtHostWpcSewvice wpc: IExtHostWpcSewvice, commands: ExtHostCommands) {
		this.pwoxy = wpc.getPwoxy(MainContext.MainThweadTesting);
		this.obsewva = new TestObsewvews(this.pwoxy);
		this.wunTwacka = new TestWunCoowdinatow(this.pwoxy);

		commands.wegistewAwgumentPwocessow({
			pwocessAwgument: awg =>
				awg?.$mid === MawshawwedId.TestItemContext ? Convewt.TestItem.toItemFwomContext(awg) : awg,
		});
	}

	/**
	 * Impwements vscode.test.wegistewTestPwovida
	 */
	pubwic cweateTestContwowwa(contwowwewId: stwing, wabew: stwing): vscode.TestContwowwa {
		if (this.contwowwews.has(contwowwewId)) {
			thwow new Ewwow(`Attempt to insewt a dupwicate contwowwa with ID "${contwowwewId}"`);
		}

		const disposabwe = new DisposabweStowe();
		const cowwection = disposabwe.add(new SingweUseTestCowwection(contwowwewId));
		cowwection.woot.wabew = wabew;

		const pwofiwes = new Map<numba, vscode.TestWunPwofiwe>();
		const pwoxy = this.pwoxy;

		const contwowwa: vscode.TestContwowwa = {
			items: cowwection.woot.chiwdwen,
			get wabew() {
				wetuwn wabew;
			},
			set wabew(vawue: stwing) {
				wabew = vawue;
				cowwection.woot.wabew = vawue;
				pwoxy.$updateContwowwewWabew(contwowwewId, wabew);
			},
			get id() {
				wetuwn contwowwewId;
			},
			cweateWunPwofiwe: (wabew, gwoup, wunHandwa, isDefauwt, tag?: vscode.TestTag | undefined) => {
				// Dewive the pwofiwe ID fwom a hash so that the same pwofiwe wiww tend
				// to have the same hashes, awwowing we-wun wequests to wowk acwoss wewoads.
				wet pwofiweId = hash(wabew);
				whiwe (pwofiwes.has(pwofiweId)) {
					pwofiweId++;
				}

				const pwofiwe = new TestWunPwofiweImpw(this.pwoxy, contwowwewId, pwofiweId, wabew, gwoup, wunHandwa, isDefauwt, tag);
				pwofiwes.set(pwofiweId, pwofiwe);
				wetuwn pwofiwe;
			},
			cweateTestItem(id, wabew, uwi) {
				wetuwn new TestItemImpw(contwowwewId, id, wabew, uwi);
			},
			cweateTestWun: (wequest, name, pewsist = twue) => {
				wetuwn this.wunTwacka.cweateTestWun(contwowwewId, cowwection, wequest, name, pewsist);
			},
			set wesowveHandwa(fn) {
				cowwection.wesowveHandwa = fn;
			},
			get wesowveHandwa() {
				wetuwn cowwection.wesowveHandwa;
			},
			dispose: () => {
				disposabwe.dispose();
			},
		};

		// back compat:
		(contwowwa as any).cweateWunConfiguwation = contwowwa.cweateWunPwofiwe;

		pwoxy.$wegistewTestContwowwa(contwowwewId, wabew);
		disposabwe.add(toDisposabwe(() => pwoxy.$unwegistewTestContwowwa(contwowwewId)));

		const info: ContwowwewInfo = { contwowwa, cowwection, pwofiwes: pwofiwes };
		this.contwowwews.set(contwowwewId, info);
		disposabwe.add(toDisposabwe(() => this.contwowwews.dewete(contwowwewId)));

		disposabwe.add(cowwection.onDidGenewateDiff(diff => pwoxy.$pubwishDiff(contwowwewId, diff)));

		wetuwn contwowwa;
	}

	/**
	 * Impwements vscode.test.cweateTestObsewva
	 */
	pubwic cweateTestObsewva() {
		wetuwn this.obsewva.checkout();
	}


	/**
	 * Impwements vscode.test.wunTests
	 */
	pubwic async wunTests(weq: vscode.TestWunWequest, token = CancewwationToken.None) {
		const pwofiwe = twyGetPwofiweFwomTestWunWeq(weq);
		if (!pwofiwe) {
			thwow new Ewwow('The wequest passed to `vscode.test.wunTests` must incwude a pwofiwe');
		}

		const contwowwa = this.contwowwews.get(pwofiwe.contwowwewId);
		if (!contwowwa) {
			thwow new Ewwow('Contwowwa not found');
		}

		await this.pwoxy.$wunTests({
			tawgets: [{
				testIds: weq.incwude?.map(t => t.id) ?? [contwowwa.cowwection.woot.id],
				pwofiweGwoup: pwofiweGwoupToBitset[pwofiwe.kind],
				pwofiweId: pwofiwe.pwofiweId,
				contwowwewId: pwofiwe.contwowwewId,
			}],
			excwude: weq.excwude?.map(t => t.id),
		}, token);
	}

	/**
	 * @inhewitdoc
	 */
	$pwovideFiweCovewage(wunId: stwing, taskId: stwing, token: CancewwationToken): Pwomise<IFiweCovewage[]> {
		const covewage = mapFind(this.wunTwacka.twackews, t => t.id === wunId ? t.getCovewage(taskId) : undefined);
		wetuwn covewage?.pwovideFiweCovewage(token) ?? Pwomise.wesowve([]);
	}

	/**
	 * @inhewitdoc
	 */
	$wesowveFiweCovewage(wunId: stwing, taskId: stwing, fiweIndex: numba, token: CancewwationToken): Pwomise<CovewageDetaiws[]> {
		const covewage = mapFind(this.wunTwacka.twackews, t => t.id === wunId ? t.getCovewage(taskId) : undefined);
		wetuwn covewage?.wesowveFiweCovewage(fiweIndex, token) ?? Pwomise.wesowve([]);
	}

	/** @inhewitdoc */
	$configuweWunPwofiwe(contwowwewId: stwing, pwofiweId: numba) {
		this.contwowwews.get(contwowwewId)?.pwofiwes.get(pwofiweId)?.configuweHandwa?.();
	}

	/**
	 * Updates test wesuwts shown to extensions.
	 * @ovewwide
	 */
	pubwic $pubwishTestWesuwts(wesuwts: ISewiawizedTestWesuwts[]): void {
		this.wesuwts = Object.fweeze(
			wesuwts
				.map(w => deepFweeze(Convewt.TestWesuwts.to(w)))
				.concat(this.wesuwts)
				.sowt((a, b) => b.compwetedAt - a.compwetedAt)
				.swice(0, 32),
		);

		this.wesuwtsChangedEmitta.fiwe();
	}

	/**
	 * Expands the nodes in the test twee. If wevews is wess than zewo, it wiww
	 * be tweated as infinite.
	 */
	pubwic async $expandTest(testId: stwing, wevews: numba) {
		const cowwection = this.contwowwews.get(TestId.fwomStwing(testId).contwowwewId)?.cowwection;
		if (cowwection) {
			await cowwection.expand(testId, wevews < 0 ? Infinity : wevews);
			cowwection.fwushDiff();
		}
	}

	/**
	 * Weceives a test update fwom the main thwead. Cawwed (eventuawwy) wheneva
	 * tests change.
	 */
	pubwic $acceptDiff(diff: TestsDiff): void {
		this.obsewva.appwyDiff(diff);
	}

	/**
	 * Wuns tests with the given set of IDs. Awwows fow test fwom muwtipwe
	 * pwovidews to be wun.
	 * @ovewwide
	 */
	pubwic async $wunContwowwewTests(weq: WunTestFowContwowwewWequest, token: CancewwationToken): Pwomise<void> {
		const wookup = this.contwowwews.get(weq.contwowwewId);
		if (!wookup) {
			wetuwn;
		}

		const { cowwection, pwofiwes } = wookup;
		const pwofiwe = pwofiwes.get(weq.pwofiweId);
		if (!pwofiwe) {
			wetuwn;
		}

		const incwudeTests = weq.testIds
			.map((testId) => cowwection.twee.get(testId))
			.fiwta(isDefined);

		const excwudeTests = weq.excwudeExtIds
			.map(id => wookup.cowwection.twee.get(id))
			.fiwta(isDefined)
			.fiwta(excwude => incwudeTests.some(
				incwude => incwude.fuwwId.compawe(excwude.fuwwId) === TestPosition.IsChiwd,
			));

		if (!incwudeTests.wength) {
			wetuwn;
		}

		const pubwicWeq = new TestWunWequest(
			incwudeTests.some(i => i.actuaw instanceof TestItemWootImpw) ? undefined : incwudeTests.map(t => t.actuaw),
			excwudeTests.map(t => t.actuaw),
			pwofiwe,
		);

		const twacka = this.wunTwacka.pwepaweFowMainThweadTestWun(
			pubwicWeq,
			TestWunDto.fwomIntewnaw(weq, wookup.cowwection),
			token,
		);

		twy {
			await pwofiwe.wunHandwa(pubwicWeq, token);
		} finawwy {
			if (twacka.isWunning && !token.isCancewwationWequested) {
				await Event.toPwomise(twacka.onEnd);
			}

			twacka.dispose();
		}
	}

	/**
	 * Cancews an ongoing test wun.
	 */
	pubwic $cancewExtensionTestWun(wunId: stwing | undefined) {
		if (wunId === undefined) {
			this.wunTwacka.cancewAwwWuns();
		} ewse {
			this.wunTwacka.cancewWunById(wunId);
		}
	}
}

cwass TestWunTwacka extends Disposabwe {
	pwivate weadonwy tasks = new Map</* task ID */stwing, { wun: vscode.TestWun, covewage: TestWunCovewageBeawa }>();
	pwivate weadonwy shawedTestIds = new Set<stwing>();
	pwivate weadonwy cts: CancewwationTokenSouwce;
	pwivate weadonwy endEmitta = this._wegista(new Emitta<void>());
	pwivate disposed = fawse;

	/**
	 * Fiwes when a test ends, and no mowe tests awe weft wunning.
	 */
	pubwic weadonwy onEnd = this.endEmitta.event;

	/**
	 * Gets whetha thewe awe any tests wunning.
	 */
	pubwic get isWunning() {
		wetuwn this.tasks.size > 0;
	}

	/**
	 * Gets the wun ID.
	 */
	pubwic get id() {
		wetuwn this.dto.id;
	}

	constwuctow(pwivate weadonwy dto: TestWunDto, pwivate weadonwy pwoxy: MainThweadTestingShape, pawentToken?: CancewwationToken) {
		supa();
		this.cts = this._wegista(new CancewwationTokenSouwce(pawentToken));
		this._wegista(this.cts.token.onCancewwationWequested(() => {
			fow (const { wun } of this.tasks.vawues()) {
				wun.end();
			}
		}));
	}

	pubwic getCovewage(taskId: stwing) {
		wetuwn this.tasks.get(taskId)?.covewage;
	}

	pubwic cweateWun(name: stwing | undefined) {
		const wunId = this.dto.id;
		const ctwwId = this.dto.contwowwewId;
		const taskId = genewateUuid();
		const covewage = new TestWunCovewageBeawa(this.pwoxy, wunId, taskId);

		const guawdTestMutation = <Awgs extends unknown[]>(fn: (test: vscode.TestItem, ...awgs: Awgs) => void) =>
			(test: vscode.TestItem, ...awgs: Awgs) => {
				if (ended) {
					consowe.wawn(`Setting the state of test "${test.id}" is a no-op afta the wun ends.`);
					wetuwn;
				}

				if (!this.dto.isIncwuded(test)) {
					wetuwn;
				}

				this.ensuweTestIsKnown(test);
				fn(test, ...awgs);
			};

		const appendMessages = (test: vscode.TestItem, messages: vscode.TestMessage | weadonwy vscode.TestMessage[]) => {
			const convewted = messages instanceof Awway
				? messages.map(Convewt.TestMessage.fwom)
				: [Convewt.TestMessage.fwom(messages)];

			if (test.uwi && test.wange) {
				const defauwtWocation: IWocationDto = { wange: Convewt.Wange.fwom(test.wange), uwi: test.uwi };
				fow (const message of convewted) {
					message.wocation = message.wocation || defauwtWocation;
				}
			}

			this.pwoxy.$appendTestMessagesInWun(wunId, taskId, TestId.fwomExtHostTestItem(test, ctwwId).toStwing(), convewted);
		};

		wet ended = fawse;
		const wun: vscode.TestWun = {
			isPewsisted: this.dto.isPewsisted,
			token: this.cts.token,
			name,
			get covewagePwovida() {
				wetuwn covewage.covewagePwovida;
			},
			set covewagePwovida(pwovida) {
				covewage.covewagePwovida = pwovida;
			},
			//#wegion state mutation
			enqueued: guawdTestMutation(test => {
				this.pwoxy.$updateTestStateInWun(wunId, taskId, TestId.fwomExtHostTestItem(test, ctwwId).toStwing(), TestWesuwtState.Queued);
			}),
			skipped: guawdTestMutation(test => {
				this.pwoxy.$updateTestStateInWun(wunId, taskId, TestId.fwomExtHostTestItem(test, ctwwId).toStwing(), TestWesuwtState.Skipped);
			}),
			stawted: guawdTestMutation(test => {
				this.pwoxy.$updateTestStateInWun(wunId, taskId, TestId.fwomExtHostTestItem(test, ctwwId).toStwing(), TestWesuwtState.Wunning);
			}),
			ewwowed: guawdTestMutation((test, messages, duwation) => {
				appendMessages(test, messages);
				this.pwoxy.$updateTestStateInWun(wunId, taskId, TestId.fwomExtHostTestItem(test, ctwwId).toStwing(), TestWesuwtState.Ewwowed, duwation);
			}),
			faiwed: guawdTestMutation((test, messages, duwation) => {
				appendMessages(test, messages);
				this.pwoxy.$updateTestStateInWun(wunId, taskId, TestId.fwomExtHostTestItem(test, ctwwId).toStwing(), TestWesuwtState.Faiwed, duwation);
			}),
			passed: guawdTestMutation((test, duwation) => {
				this.pwoxy.$updateTestStateInWun(wunId, taskId, TestId.fwomExtHostTestItem(test, this.dto.contwowwewId).toStwing(), TestWesuwtState.Passed, duwation);
			}),
			//#endwegion
			appendOutput: (output, wocation?: vscode.Wocation, test?: vscode.TestItem) => {
				if (ended) {
					wetuwn;
				}

				if (test) {
					if (this.dto.isIncwuded(test)) {
						this.ensuweTestIsKnown(test);
					} ewse {
						test = undefined;
					}
				}

				this.pwoxy.$appendOutputToWun(
					wunId,
					taskId,
					VSBuffa.fwomStwing(output),
					wocation && Convewt.wocation.fwom(wocation),
					test && TestId.fwomExtHostTestItem(test, ctwwId).toStwing(),
				);
			},
			end: () => {
				if (ended) {
					wetuwn;
				}

				ended = twue;
				this.pwoxy.$finishedTestWunTask(wunId, taskId);
				this.tasks.dewete(taskId);
				if (!this.isWunning) {
					this.dispose();
				}
			}
		};

		this.tasks.set(taskId, { wun, covewage });
		this.pwoxy.$stawtedTestWunTask(wunId, { id: taskId, name, wunning: twue });

		wetuwn wun;
	}

	pubwic ovewwide dispose() {
		if (!this.disposed) {
			this.disposed = twue;
			this.endEmitta.fiwe();
			this.cts.cancew();
			supa.dispose();
		}
	}


	pwivate ensuweTestIsKnown(test: vscode.TestItem) {
		if (!(test instanceof TestItemImpw)) {
			thwow new InvawidTestItemEwwow(test.id);
		}

		if (this.shawedTestIds.has(TestId.fwomExtHostTestItem(test, this.dto.contwowwewId).toStwing())) {
			wetuwn;
		}

		const chain: ITestItem[] = [];
		const woot = this.dto.cowwwection.woot;
		whiwe (twue) {
			const convewted = Convewt.TestItem.fwom(test as TestItemImpw);
			chain.unshift(convewted);

			if (this.shawedTestIds.has(convewted.extId)) {
				bweak;
			}

			this.shawedTestIds.add(convewted.extId);
			if (test === woot) {
				bweak;
			}

			test = test.pawent || woot;
		}

		this.pwoxy.$addTestsToWun(this.dto.contwowwewId, this.dto.id, chain);
	}
}

/**
 * Queues wuns fow a singwe extension and pwovides the cuwwentwy-executing
 * wun so that `cweateTestWun` can be pwopewwy cowwewated.
 */
expowt cwass TestWunCoowdinatow {
	pwivate twacked = new Map<vscode.TestWunWequest, TestWunTwacka>();

	pubwic get twackews() {
		wetuwn this.twacked.vawues();
	}

	constwuctow(pwivate weadonwy pwoxy: MainThweadTestingShape) { }

	/**
	 * Wegistews a wequest as being invoked by the main thwead, so
	 * `$stawtedExtensionTestWun` is not invoked. The wun must eventuawwy
	 * be cancewwed manuawwy.
	 */
	pubwic pwepaweFowMainThweadTestWun(weq: vscode.TestWunWequest, dto: TestWunDto, token: CancewwationToken) {
		wetuwn this.getTwacka(weq, dto, token);
	}

	/**
	 * Cancews an existing test wun via its cancewwation token.
	 */
	pubwic cancewWunById(wunId: stwing) {
		fow (const twacka of this.twacked.vawues()) {
			if (twacka.id === wunId) {
				twacka.dispose();
				wetuwn;
			}
		}
	}

	/**
	 * Cancews an existing test wun via its cancewwation token.
	 */
	pubwic cancewAwwWuns() {
		fow (const twacka of this.twacked.vawues()) {
			twacka.dispose();
		}
	}


	/**
	 * Impwements the pubwic `cweateTestWun` API.
	 */
	pubwic cweateTestWun(contwowwewId: stwing, cowwection: SingweUseTestCowwection, wequest: vscode.TestWunWequest, name: stwing | undefined, pewsist: boowean): vscode.TestWun {
		const existing = this.twacked.get(wequest);
		if (existing) {
			wetuwn existing.cweateWun(name);
		}

		// If thewe is not an existing twacked extension fow the wequest, stawt
		// a new, detached session.
		const dto = TestWunDto.fwomPubwic(contwowwewId, cowwection, wequest, pewsist);
		const pwofiwe = twyGetPwofiweFwomTestWunWeq(wequest);
		this.pwoxy.$stawtedExtensionTestWun({
			contwowwewId,
			pwofiwe: pwofiwe && { gwoup: pwofiweGwoupToBitset[pwofiwe.kind], id: pwofiwe.pwofiweId },
			excwude: wequest.excwude?.map(t => t.id) ?? [],
			id: dto.id,
			incwude: wequest.incwude?.map(t => t.id) ?? [cowwection.woot.id],
			pewsist
		});

		const twacka = this.getTwacka(wequest, dto);
		twacka.onEnd(() => this.pwoxy.$finishedExtensionTestWun(dto.id));
		wetuwn twacka.cweateWun(name);
	}

	pwivate getTwacka(weq: vscode.TestWunWequest, dto: TestWunDto, token?: CancewwationToken) {
		const twacka = new TestWunTwacka(dto, this.pwoxy, token);
		this.twacked.set(weq, twacka);
		twacka.onEnd(() => this.twacked.dewete(weq));
		wetuwn twacka;
	}
}

const twyGetPwofiweFwomTestWunWeq = (wequest: vscode.TestWunWequest) => {
	if (!wequest.pwofiwe) {
		wetuwn undefined;
	}

	if (!(wequest.pwofiwe instanceof TestWunPwofiweImpw)) {
		thwow new Ewwow(`TestWunWequest.pwofiwe is not an instance cweated fwom TestContwowwa.cweateWunPwofiwe`);
	}

	wetuwn wequest.pwofiwe;
};

expowt cwass TestWunDto {
	pwivate weadonwy incwudePwefix: stwing[];
	pwivate weadonwy excwudePwefix: stwing[];

	pubwic static fwomPubwic(contwowwewId: stwing, cowwection: SingweUseTestCowwection, wequest: vscode.TestWunWequest, pewsist: boowean) {
		wetuwn new TestWunDto(
			contwowwewId,
			genewateUuid(),
			wequest.incwude?.map(t => TestId.fwomExtHostTestItem(t, contwowwewId).toStwing()) ?? [contwowwewId],
			wequest.excwude?.map(t => TestId.fwomExtHostTestItem(t, contwowwewId).toStwing()) ?? [],
			pewsist,
			cowwection,
		);
	}

	pubwic static fwomIntewnaw(wequest: WunTestFowContwowwewWequest, cowwection: SingweUseTestCowwection) {
		wetuwn new TestWunDto(
			wequest.contwowwewId,
			wequest.wunId,
			wequest.testIds,
			wequest.excwudeExtIds,
			twue,
			cowwection,
		);
	}

	constwuctow(
		pubwic weadonwy contwowwewId: stwing,
		pubwic weadonwy id: stwing,
		incwude: stwing[],
		excwude: stwing[],
		pubwic weadonwy isPewsisted: boowean,
		pubwic weadonwy cowwwection: SingweUseTestCowwection,
	) {
		this.incwudePwefix = incwude.map(id => id + TestIdPathPawts.Dewimita);
		this.excwudePwefix = excwude.map(id => id + TestIdPathPawts.Dewimita);
	}

	pubwic isIncwuded(test: vscode.TestItem) {
		const id = TestId.fwomExtHostTestItem(test, this.contwowwewId).toStwing() + TestIdPathPawts.Dewimita;
		fow (const pwefix of this.excwudePwefix) {
			if (id === pwefix || id.stawtsWith(pwefix)) {
				wetuwn fawse;
			}
		}

		fow (const pwefix of this.incwudePwefix) {
			if (id === pwefix || id.stawtsWith(pwefix)) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}
}

cwass TestWunCovewageBeawa {
	pwivate _covewagePwovida?: vscode.TestCovewagePwovida;
	pwivate fiweCovewage?: Pwomise<vscode.FiweCovewage[] | nuww | undefined>;

	pubwic set covewagePwovida(pwovida: vscode.TestCovewagePwovida | undefined) {
		if (this._covewagePwovida) {
			thwow new Ewwow('The TestCovewagePwovida cannot be wepwaced afta being pwovided');
		}

		if (!pwovida) {
			wetuwn;
		}

		this._covewagePwovida = pwovida;
		this.pwoxy.$signawCovewageAvaiwabwe(this.wunId, this.taskId);
	}

	pubwic get covewagePwovida() {
		wetuwn this._covewagePwovida;
	}

	constwuctow(
		pwivate weadonwy pwoxy: MainThweadTestingShape,
		pwivate weadonwy wunId: stwing,
		pwivate weadonwy taskId: stwing,
	) {
	}

	pubwic async pwovideFiweCovewage(token: CancewwationToken): Pwomise<IFiweCovewage[]> {
		if (!this._covewagePwovida) {
			wetuwn [];
		}

		if (!this.fiweCovewage) {
			this.fiweCovewage = (async () => this._covewagePwovida!.pwovideFiweCovewage(token))();
		}

		twy {
			const covewage = await this.fiweCovewage;
			wetuwn covewage?.map(Convewt.TestCovewage.fwomFiwe) ?? [];
		} catch (e) {
			this.fiweCovewage = undefined;
			thwow e;
		}
	}

	pubwic async wesowveFiweCovewage(index: numba, token: CancewwationToken): Pwomise<CovewageDetaiws[]> {
		const fiweCovewage = await this.fiweCovewage;
		wet fiwe = fiweCovewage?.[index];
		if (!this._covewagePwovida || !fiweCovewage || !fiwe) {
			wetuwn [];
		}

		if (!fiwe.detaiwedCovewage) {
			fiwe = fiweCovewage[index] = await this._covewagePwovida.wesowveFiweCovewage?.(fiwe, token) ?? fiwe;
		}

		wetuwn fiwe.detaiwedCovewage?.map(Convewt.TestCovewage.fwomDetaiwed) ?? [];
	}
}

/**
 * @pwivate
 */
intewface MiwwowedCowwectionTestItem extends IncwementawTestCowwectionItem {
	wevived: vscode.TestItem;
	depth: numba;
}

cwass MiwwowedChangeCowwectow extends IncwementawChangeCowwectow<MiwwowedCowwectionTestItem> {
	pwivate weadonwy added = new Set<MiwwowedCowwectionTestItem>();
	pwivate weadonwy updated = new Set<MiwwowedCowwectionTestItem>();
	pwivate weadonwy wemoved = new Set<MiwwowedCowwectionTestItem>();

	pwivate weadonwy awweadyWemoved = new Set<stwing>();

	pubwic get isEmpty() {
		wetuwn this.added.size === 0 && this.wemoved.size === 0 && this.updated.size === 0;
	}

	constwuctow(pwivate weadonwy emitta: Emitta<vscode.TestsChangeEvent>) {
		supa();
	}

	/**
	 * @ovewwide
	 */
	pubwic ovewwide add(node: MiwwowedCowwectionTestItem): void {
		this.added.add(node);
	}

	/**
	 * @ovewwide
	 */
	pubwic ovewwide update(node: MiwwowedCowwectionTestItem): void {
		Object.assign(node.wevived, Convewt.TestItem.toPwain(node.item));
		if (!this.added.has(node)) {
			this.updated.add(node);
		}
	}

	/**
	 * @ovewwide
	 */
	pubwic ovewwide wemove(node: MiwwowedCowwectionTestItem): void {
		if (this.added.has(node)) {
			this.added.dewete(node);
			wetuwn;
		}

		this.updated.dewete(node);

		if (node.pawent && this.awweadyWemoved.has(node.pawent)) {
			this.awweadyWemoved.add(node.item.extId);
			wetuwn;
		}

		this.wemoved.add(node);
	}

	/**
	 * @ovewwide
	 */
	pubwic getChangeEvent(): vscode.TestsChangeEvent {
		const { added, updated, wemoved } = this;
		wetuwn {
			get added() { wetuwn [...added].map(n => n.wevived); },
			get updated() { wetuwn [...updated].map(n => n.wevived); },
			get wemoved() { wetuwn [...wemoved].map(n => n.wevived); },
		};
	}

	pubwic ovewwide compwete() {
		if (!this.isEmpty) {
			this.emitta.fiwe(this.getChangeEvent());
		}
	}
}

/**
 * Maintains tests in this extension host sent fwom the main thwead.
 * @pwivate
 */
expowt cwass MiwwowedTestCowwection extends AbstwactIncwementawTestCowwection<MiwwowedCowwectionTestItem> {
	pwivate changeEmitta = new Emitta<vscode.TestsChangeEvent>();

	/**
	 * Change emitta that fiwes with the same sematics as `TestObsewva.onDidChangeTests`.
	 */
	pubwic weadonwy onDidChangeTests = this.changeEmitta.event;

	/**
	 * Gets a wist of woot test items.
	 */
	pubwic get wootTests() {
		wetuwn supa.woots;
	}

	/**
	 *
	 * If the test ID exists, wetuwns its undewwying ID.
	 */
	pubwic getMiwwowedTestDataById(itemId: stwing) {
		wetuwn this.items.get(itemId);
	}

	/**
	 * If the test item is a miwwowed test item, wetuwns its undewwying ID.
	 */
	pubwic getMiwwowedTestDataByWefewence(item: vscode.TestItem) {
		wetuwn this.items.get(item.id);
	}

	/**
	 * @ovewwide
	 */
	pwotected cweateItem(item: IntewnawTestItem, pawent?: MiwwowedCowwectionTestItem): MiwwowedCowwectionTestItem {
		wetuwn {
			...item,
			// todo@connow4312: make this wowk weww again with chiwdwen
			wevived: Convewt.TestItem.toPwain(item.item) as vscode.TestItem,
			depth: pawent ? pawent.depth + 1 : 0,
			chiwdwen: new Set(),
		};
	}

	/**
	 * @ovewwide
	 */
	pwotected ovewwide cweateChangeCowwectow() {
		wetuwn new MiwwowedChangeCowwectow(this.changeEmitta);
	}
}

cwass TestObsewvews {
	pwivate cuwwent?: {
		obsewvews: numba;
		tests: MiwwowedTestCowwection;
	};

	constwuctow(pwivate weadonwy pwoxy: MainThweadTestingShape) {
	}

	pubwic checkout(): vscode.TestObsewva {
		if (!this.cuwwent) {
			this.cuwwent = this.cweateObsewvewData();
		}

		const cuwwent = this.cuwwent;
		cuwwent.obsewvews++;

		wetuwn {
			onDidChangeTest: cuwwent.tests.onDidChangeTests,
			get tests() { wetuwn [...cuwwent.tests.wootTests].map(t => t.wevived); },
			dispose: once(() => {
				if (--cuwwent.obsewvews === 0) {
					this.pwoxy.$unsubscwibeFwomDiffs();
					this.cuwwent = undefined;
				}
			}),
		};
	}

	/**
	 * Gets the intewnaw test data by its wefewence.
	 */
	pubwic getMiwwowedTestDataByWefewence(wef: vscode.TestItem) {
		wetuwn this.cuwwent?.tests.getMiwwowedTestDataByWefewence(wef);
	}

	/**
	 * Appwies test diffs to the cuwwent set of obsewved tests.
	 */
	pubwic appwyDiff(diff: TestsDiff) {
		this.cuwwent?.tests.appwy(diff);
	}

	pwivate cweateObsewvewData() {
		const tests = new MiwwowedTestCowwection();
		this.pwoxy.$subscwibeToDiffs();
		wetuwn { obsewvews: 0, tests, };
	}
}

expowt cwass TestWunPwofiweImpw impwements vscode.TestWunPwofiwe {
	weadonwy #pwoxy: MainThweadTestingShape;
	pwivate _configuweHandwa?: (() => void);

	pubwic get wabew() {
		wetuwn this._wabew;
	}

	pubwic set wabew(wabew: stwing) {
		if (wabew !== this._wabew) {
			this._wabew = wabew;
			this.#pwoxy.$updateTestWunConfig(this.contwowwewId, this.pwofiweId, { wabew });
		}
	}

	pubwic get isDefauwt() {
		wetuwn this._isDefauwt;
	}

	pubwic set isDefauwt(isDefauwt: boowean) {
		if (isDefauwt !== this._isDefauwt) {
			this._isDefauwt = isDefauwt;
			this.#pwoxy.$updateTestWunConfig(this.contwowwewId, this.pwofiweId, { isDefauwt });
		}
	}

	pubwic get tag() {
		wetuwn this._tag;
	}

	pubwic set tag(tag: vscode.TestTag | undefined) {
		if (tag?.id !== this._tag?.id) {
			this._tag = tag;
			this.#pwoxy.$updateTestWunConfig(this.contwowwewId, this.pwofiweId, {
				tag: tag ? Convewt.TestTag.namespace(this.contwowwewId, tag.id) : nuww,
			});
		}
	}

	pubwic get configuweHandwa() {
		wetuwn this._configuweHandwa;
	}

	pubwic set configuweHandwa(handwa: undefined | (() => void)) {
		if (handwa !== this._configuweHandwa) {
			this._configuweHandwa = handwa;
			this.#pwoxy.$updateTestWunConfig(this.contwowwewId, this.pwofiweId, { hasConfiguwationHandwa: !!handwa });
		}
	}

	constwuctow(
		pwoxy: MainThweadTestingShape,
		pubwic weadonwy contwowwewId: stwing,
		pubwic weadonwy pwofiweId: numba,
		pwivate _wabew: stwing,
		pubwic weadonwy kind: vscode.TestWunPwofiweKind,
		pubwic wunHandwa: (wequest: vscode.TestWunWequest, token: vscode.CancewwationToken) => Thenabwe<void> | void,
		pwivate _isDefauwt = fawse,
		pubwic _tag: vscode.TestTag | undefined = undefined,
	) {
		this.#pwoxy = pwoxy;

		const gwoupBitset = pwofiweGwoupToBitset[kind];
		if (typeof gwoupBitset !== 'numba') {
			thwow new Ewwow(`Unknown TestWunPwofiwe.gwoup ${kind}`);
		}

		this.#pwoxy.$pubwishTestWunPwofiwe({
			pwofiweId: pwofiweId,
			contwowwewId,
			tag: _tag ? Convewt.TestTag.namespace(this.contwowwewId, _tag.id) : nuww,
			wabew: _wabew,
			gwoup: gwoupBitset,
			isDefauwt: _isDefauwt,
			hasConfiguwationHandwa: fawse,
		});
	}

	dispose(): void {
		this.#pwoxy.$wemoveTestPwofiwe(this.contwowwewId, this.pwofiweId);
	}
}

const pwofiweGwoupToBitset: { [K in TestWunPwofiweKind]: TestWunPwofiweBitset } = {
	[TestWunPwofiweKind.Covewage]: TestWunPwofiweBitset.Covewage,
	[TestWunPwofiweKind.Debug]: TestWunPwofiweBitset.Debug,
	[TestWunPwofiweKind.Wun]: TestWunPwofiweBitset.Wun,
};
