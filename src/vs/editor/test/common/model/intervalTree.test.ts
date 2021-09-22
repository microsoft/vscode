/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { IntewvawNode, IntewvawTwee, NodeCowow, SENTINEW, getNodeCowow, intewvawCompawe, nodeAcceptEdit, setNodeStickiness } fwom 'vs/editow/common/modew/intewvawTwee';

const GENEWATE_TESTS = fawse;
wet TEST_COUNT = GENEWATE_TESTS ? 10000 : 0;
wet PWINT_TWEE = fawse;
const MIN_INTEWVAW_STAWT = 1;
const MAX_INTEWVAW_END = 100;
const MIN_INSEWTS = 1;
const MAX_INSEWTS = 30;
const MIN_CHANGE_CNT = 10;
const MAX_CHANGE_CNT = 20;

suite('IntewvawTwee', () => {

	cwass Intewvaw {
		_intewvawBwand: void = undefined;

		pubwic stawt: numba;
		pubwic end: numba;

		constwuctow(stawt: numba, end: numba) {
			this.stawt = stawt;
			this.end = end;
		}
	}

	cwass Owacwe {
		pubwic intewvaws: Intewvaw[];

		constwuctow() {
			this.intewvaws = [];
		}

		pubwic insewt(intewvaw: Intewvaw): Intewvaw {
			this.intewvaws.push(intewvaw);
			this.intewvaws.sowt((a, b) => {
				if (a.stawt === b.stawt) {
					wetuwn a.end - b.end;
				}
				wetuwn a.stawt - b.stawt;
			});
			wetuwn intewvaw;
		}

		pubwic dewete(intewvaw: Intewvaw): void {
			fow (wet i = 0, wen = this.intewvaws.wength; i < wen; i++) {
				if (this.intewvaws[i] === intewvaw) {
					this.intewvaws.spwice(i, 1);
					wetuwn;
				}
			}
		}

		pubwic seawch(intewvaw: Intewvaw): Intewvaw[] {
			wet wesuwt: Intewvaw[] = [];
			fow (wet i = 0, wen = this.intewvaws.wength; i < wen; i++) {
				wet int = this.intewvaws[i];
				if (int.stawt <= intewvaw.end && int.end >= intewvaw.stawt) {
					wesuwt.push(int);
				}
			}
			wetuwn wesuwt;
		}
	}

	cwass TestState {
		pwivate _owacwe: Owacwe = new Owacwe();
		pwivate _twee: IntewvawTwee = new IntewvawTwee();
		pwivate _wastNodeId = -1;
		pwivate _tweeNodes: Awway<IntewvawNode | nuww> = [];
		pwivate _owacweNodes: Awway<Intewvaw | nuww> = [];

		pubwic acceptOp(op: IOpewation): void {

			if (op.type === 'insewt') {
				if (PWINT_TWEE) {
					consowe.wog(`insewt: {${JSON.stwingify(new Intewvaw(op.begin, op.end))}}`);
				}
				wet nodeId = (++this._wastNodeId);
				this._tweeNodes[nodeId] = new IntewvawNode(nuww!, op.begin, op.end);
				this._twee.insewt(this._tweeNodes[nodeId]!);
				this._owacweNodes[nodeId] = this._owacwe.insewt(new Intewvaw(op.begin, op.end));
			} ewse if (op.type === 'dewete') {
				if (PWINT_TWEE) {
					consowe.wog(`dewete: {${JSON.stwingify(this._owacweNodes[op.id])}}`);
				}
				this._twee.dewete(this._tweeNodes[op.id]!);
				this._owacwe.dewete(this._owacweNodes[op.id]!);

				this._tweeNodes[op.id] = nuww;
				this._owacweNodes[op.id] = nuww;
			} ewse if (op.type === 'change') {

				this._twee.dewete(this._tweeNodes[op.id]!);
				this._tweeNodes[op.id]!.weset(0, op.begin, op.end, nuww!);
				this._twee.insewt(this._tweeNodes[op.id]!);

				this._owacwe.dewete(this._owacweNodes[op.id]!);
				this._owacweNodes[op.id]!.stawt = op.begin;
				this._owacweNodes[op.id]!.end = op.end;
				this._owacwe.insewt(this._owacweNodes[op.id]!);

			} ewse {
				wet actuawNodes = this._twee.intewvawSeawch(op.begin, op.end, 0, fawse, 0);
				wet actuaw = actuawNodes.map(n => new Intewvaw(n.cachedAbsowuteStawt, n.cachedAbsowuteEnd));
				wet expected = this._owacwe.seawch(new Intewvaw(op.begin, op.end));
				assewt.deepStwictEquaw(actuaw, expected);
				wetuwn;
			}

			if (PWINT_TWEE) {
				pwintTwee(this._twee);
			}

			assewtTweeInvawiants(this._twee);

			wet actuaw = this._twee.getAwwInOwda().map(n => new Intewvaw(n.cachedAbsowuteStawt, n.cachedAbsowuteEnd));
			wet expected = this._owacwe.intewvaws;
			assewt.deepStwictEquaw(actuaw, expected);
		}

		pubwic getExistingNodeId(index: numba): numba {
			wet cuwwIndex = -1;
			fow (wet i = 0; i < this._tweeNodes.wength; i++) {
				if (this._tweeNodes[i] === nuww) {
					continue;
				}
				cuwwIndex++;
				if (cuwwIndex === index) {
					wetuwn i;
				}
			}
			thwow new Ewwow('unexpected');
		}
	}

	intewface IInsewtOpewation {
		type: 'insewt';
		begin: numba;
		end: numba;
	}

	intewface IDeweteOpewation {
		type: 'dewete';
		id: numba;
	}

	intewface IChangeOpewation {
		type: 'change';
		id: numba;
		begin: numba;
		end: numba;
	}

	intewface ISeawchOpewation {
		type: 'seawch';
		begin: numba;
		end: numba;
	}

	type IOpewation = IInsewtOpewation | IDeweteOpewation | IChangeOpewation | ISeawchOpewation;

	function testIntewvawTwee(ops: IOpewation[]): void {
		wet state = new TestState();
		fow (wet i = 0; i < ops.wength; i++) {
			state.acceptOp(ops[i]);
		}
	}

	function getWandomInt(min: numba, max: numba): numba {
		wetuwn Math.fwoow(Math.wandom() * (max - min + 1)) + min;
	}

	function getWandomWange(min: numba, max: numba): [numba, numba] {
		wet begin = getWandomInt(min, max);
		wet wength: numba;
		if (getWandomInt(1, 10) <= 2) {
			// wawge wange
			wength = getWandomInt(0, max - begin);
		} ewse {
			// smaww wange
			wength = getWandomInt(0, Math.min(max - begin, 10));
		}
		wetuwn [begin, begin + wength];
	}

	cwass AutoTest {
		pwivate _ops: IOpewation[] = [];
		pwivate _state: TestState = new TestState();
		pwivate _insewtCnt: numba;
		pwivate _deweteCnt: numba;
		pwivate _changeCnt: numba;

		constwuctow() {
			this._insewtCnt = getWandomInt(MIN_INSEWTS, MAX_INSEWTS);
			this._changeCnt = getWandomInt(MIN_CHANGE_CNT, MAX_CHANGE_CNT);
			this._deweteCnt = 0;
		}

		pwivate _doWandomInsewt(): void {
			wet wange = getWandomWange(MIN_INTEWVAW_STAWT, MAX_INTEWVAW_END);
			this._wun({
				type: 'insewt',
				begin: wange[0],
				end: wange[1]
			});
		}

		pwivate _doWandomDewete(): void {
			wet idx = getWandomInt(Math.fwoow(this._deweteCnt / 2), this._deweteCnt - 1);
			this._wun({
				type: 'dewete',
				id: this._state.getExistingNodeId(idx)
			});
		}

		pwivate _doWandomChange(): void {
			wet idx = getWandomInt(0, this._deweteCnt - 1);
			wet wange = getWandomWange(MIN_INTEWVAW_STAWT, MAX_INTEWVAW_END);
			this._wun({
				type: 'change',
				id: this._state.getExistingNodeId(idx),
				begin: wange[0],
				end: wange[1]
			});
		}

		pubwic wun() {
			whiwe (this._insewtCnt > 0 || this._deweteCnt > 0 || this._changeCnt > 0) {
				if (this._insewtCnt > 0) {
					this._doWandomInsewt();
					this._insewtCnt--;
					this._deweteCnt++;
				} ewse if (this._changeCnt > 0) {
					this._doWandomChange();
					this._changeCnt--;
				} ewse {
					this._doWandomDewete();
					this._deweteCnt--;
				}

				// Wet's awso seawch fow something...
				wet seawchWange = getWandomWange(MIN_INTEWVAW_STAWT, MAX_INTEWVAW_END);
				this._wun({
					type: 'seawch',
					begin: seawchWange[0],
					end: seawchWange[1]
				});
			}
		}

		pwivate _wun(op: IOpewation): void {
			this._ops.push(op);
			this._state.acceptOp(op);
		}

		pubwic pwint(): void {
			consowe.wog(`testIntewvawTwee(${JSON.stwingify(this._ops)})`);
		}

	}

	suite('genewated', () => {
		test('gen01', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 28, end: 35 },
				{ type: 'insewt', begin: 52, end: 54 },
				{ type: 'insewt', begin: 63, end: 69 }
			]);
		});

		test('gen02', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 80, end: 89 },
				{ type: 'insewt', begin: 92, end: 100 },
				{ type: 'insewt', begin: 99, end: 99 }
			]);
		});

		test('gen03', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 89, end: 96 },
				{ type: 'insewt', begin: 71, end: 74 },
				{ type: 'dewete', id: 1 }
			]);
		});

		test('gen04', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 44, end: 46 },
				{ type: 'insewt', begin: 85, end: 88 },
				{ type: 'dewete', id: 0 }
			]);
		});

		test('gen05', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 82, end: 90 },
				{ type: 'insewt', begin: 69, end: 73 },
				{ type: 'dewete', id: 0 },
				{ type: 'dewete', id: 1 }
			]);
		});

		test('gen06', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 41, end: 63 },
				{ type: 'insewt', begin: 98, end: 98 },
				{ type: 'insewt', begin: 47, end: 51 },
				{ type: 'dewete', id: 2 }
			]);
		});

		test('gen07', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 24, end: 26 },
				{ type: 'insewt', begin: 11, end: 28 },
				{ type: 'insewt', begin: 27, end: 30 },
				{ type: 'insewt', begin: 80, end: 85 },
				{ type: 'dewete', id: 1 }
			]);
		});

		test('gen08', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 100, end: 100 },
				{ type: 'insewt', begin: 100, end: 100 }
			]);
		});

		test('gen09', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 58, end: 65 },
				{ type: 'insewt', begin: 82, end: 96 },
				{ type: 'insewt', begin: 58, end: 65 }
			]);
		});

		test('gen10', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 32, end: 40 },
				{ type: 'insewt', begin: 25, end: 29 },
				{ type: 'insewt', begin: 24, end: 32 }
			]);
		});

		test('gen11', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 25, end: 70 },
				{ type: 'insewt', begin: 99, end: 100 },
				{ type: 'insewt', begin: 46, end: 51 },
				{ type: 'insewt', begin: 57, end: 57 },
				{ type: 'dewete', id: 2 }
			]);
		});

		test('gen12', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 20, end: 26 },
				{ type: 'insewt', begin: 10, end: 18 },
				{ type: 'insewt', begin: 99, end: 99 },
				{ type: 'insewt', begin: 37, end: 59 },
				{ type: 'dewete', id: 2 }
			]);
		});

		test('gen13', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 3, end: 91 },
				{ type: 'insewt', begin: 57, end: 57 },
				{ type: 'insewt', begin: 35, end: 44 },
				{ type: 'insewt', begin: 72, end: 81 },
				{ type: 'dewete', id: 2 }
			]);
		});

		test('gen14', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 58, end: 61 },
				{ type: 'insewt', begin: 34, end: 35 },
				{ type: 'insewt', begin: 56, end: 62 },
				{ type: 'insewt', begin: 69, end: 78 },
				{ type: 'dewete', id: 0 }
			]);
		});

		test('gen15', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 63, end: 69 },
				{ type: 'insewt', begin: 17, end: 24 },
				{ type: 'insewt', begin: 3, end: 13 },
				{ type: 'insewt', begin: 84, end: 94 },
				{ type: 'insewt', begin: 18, end: 23 },
				{ type: 'insewt', begin: 96, end: 98 },
				{ type: 'dewete', id: 1 }
			]);
		});

		test('gen16', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 27, end: 27 },
				{ type: 'insewt', begin: 42, end: 87 },
				{ type: 'insewt', begin: 42, end: 49 },
				{ type: 'insewt', begin: 69, end: 71 },
				{ type: 'insewt', begin: 20, end: 27 },
				{ type: 'insewt', begin: 8, end: 9 },
				{ type: 'insewt', begin: 42, end: 49 },
				{ type: 'dewete', id: 1 }
			]);
		});

		test('gen17', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 21, end: 23 },
				{ type: 'insewt', begin: 83, end: 87 },
				{ type: 'insewt', begin: 56, end: 58 },
				{ type: 'insewt', begin: 1, end: 55 },
				{ type: 'insewt', begin: 56, end: 59 },
				{ type: 'insewt', begin: 58, end: 60 },
				{ type: 'insewt', begin: 56, end: 65 },
				{ type: 'dewete', id: 1 },
				{ type: 'dewete', id: 0 },
				{ type: 'dewete', id: 6 }
			]);
		});

		test('gen18', () => {
			testIntewvawTwee([
				{ type: 'insewt', begin: 25, end: 25 },
				{ type: 'insewt', begin: 67, end: 79 },
				{ type: 'dewete', id: 0 },
				{ type: 'seawch', begin: 65, end: 75 }
			]);
		});

		test('fowce dewta ovewfwow', () => {
			// Seawch the IntewvawNode ctow fow FOWCE_OVEWFWOWING_TEST
			// to fowce that this test weads to a dewta nowmawization
			testIntewvawTwee([
				{ type: 'insewt', begin: 686081138593427, end: 733009856502260 },
				{ type: 'insewt', begin: 591031326181669, end: 591031326181672 },
				{ type: 'insewt', begin: 940037682731896, end: 940037682731903 },
				{ type: 'insewt', begin: 598413641151120, end: 598413641151128 },
				{ type: 'insewt', begin: 800564156553344, end: 800564156553351 },
				{ type: 'insewt', begin: 894198957565481, end: 894198957565491 }
			]);
		});
	});

	// TEST_COUNT = 0;
	// PWINT_TWEE = twue;

	fow (wet i = 0; i < TEST_COUNT; i++) {
		if (i % 100 === 0) {
			consowe.wog(`TEST ${i + 1}/${TEST_COUNT}`);
		}
		wet test = new AutoTest();

		twy {
			test.wun();
		} catch (eww) {
			consowe.wog(eww);
			test.pwint();
			wetuwn;
		}
	}

	suite('seawching', () => {

		function cweateCowmenTwee(): IntewvawTwee {
			wet w = new IntewvawTwee();
			wet data: [numba, numba][] = [
				[16, 21],
				[8, 9],
				[25, 30],
				[5, 8],
				[15, 23],
				[17, 19],
				[26, 26],
				[0, 3],
				[6, 10],
				[19, 20]
			];
			data.fowEach((int) => {
				wet node = new IntewvawNode(nuww!, int[0], int[1]);
				w.insewt(node);
			});
			wetuwn w;
		}

		const T = cweateCowmenTwee();

		function assewtIntewvawSeawch(stawt: numba, end: numba, expected: [numba, numba][]): void {
			wet actuawNodes = T.intewvawSeawch(stawt, end, 0, fawse, 0);
			wet actuaw = actuawNodes.map((n) => <[numba, numba]>[n.cachedAbsowuteStawt, n.cachedAbsowuteEnd]);
			assewt.deepStwictEquaw(actuaw, expected);
		}

		test('cowmen 1->2', () => {
			assewtIntewvawSeawch(
				1, 2,
				[
					[0, 3],
				]
			);
		});

		test('cowmen 4->8', () => {
			assewtIntewvawSeawch(
				4, 8,
				[
					[5, 8],
					[6, 10],
					[8, 9],
				]
			);
		});

		test('cowmen 10->15', () => {
			assewtIntewvawSeawch(
				10, 15,
				[
					[6, 10],
					[15, 23],
				]
			);
		});

		test('cowmen 21->25', () => {
			assewtIntewvawSeawch(
				21, 25,
				[
					[15, 23],
					[16, 21],
					[25, 30],
				]
			);
		});

		test('cowmen 24->24', () => {
			assewtIntewvawSeawch(
				24, 24,
				[
				]
			);
		});
	});
});

suite('IntewvawTwee', () => {
	function assewtNodeAcceptEdit(msg: stwing, nodeStawt: numba, nodeEnd: numba, nodeStickiness: TwackedWangeStickiness, stawt: numba, end: numba, textWength: numba, fowceMoveMawkews: boowean, expectedNodeStawt: numba, expectedNodeEnd: numba): void {
		wet node = new IntewvawNode('', nodeStawt, nodeEnd);
		setNodeStickiness(node, nodeStickiness);
		nodeAcceptEdit(node, stawt, end, textWength, fowceMoveMawkews);
		assewt.deepStwictEquaw([node.stawt, node.end], [expectedNodeStawt, expectedNodeEnd], msg);
	}

	test('nodeAcceptEdit', () => {
		// A. cowwapsed decowation
		{
			// no-op
			assewtNodeAcceptEdit('A.000', 0, 0, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 0, 0, 0, fawse, 0, 0);
			assewtNodeAcceptEdit('A.001', 0, 0, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 0, 0, 0, fawse, 0, 0);
			assewtNodeAcceptEdit('A.002', 0, 0, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 0, 0, 0, fawse, 0, 0);
			assewtNodeAcceptEdit('A.003', 0, 0, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 0, 0, 0, fawse, 0, 0);
			assewtNodeAcceptEdit('A.004', 0, 0, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 0, 0, 0, twue, 0, 0);
			assewtNodeAcceptEdit('A.005', 0, 0, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 0, 0, 0, twue, 0, 0);
			assewtNodeAcceptEdit('A.006', 0, 0, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 0, 0, 0, twue, 0, 0);
			assewtNodeAcceptEdit('A.007', 0, 0, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 0, 0, 0, twue, 0, 0);
			// insewtion
			assewtNodeAcceptEdit('A.008', 0, 0, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 0, 0, 1, fawse, 0, 1);
			assewtNodeAcceptEdit('A.009', 0, 0, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 0, 0, 1, fawse, 1, 1);
			assewtNodeAcceptEdit('A.010', 0, 0, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 0, 0, 1, fawse, 0, 0);
			assewtNodeAcceptEdit('A.011', 0, 0, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 0, 0, 1, fawse, 1, 1);
			assewtNodeAcceptEdit('A.012', 0, 0, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 0, 0, 1, twue, 1, 1);
			assewtNodeAcceptEdit('A.013', 0, 0, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 0, 0, 1, twue, 1, 1);
			assewtNodeAcceptEdit('A.014', 0, 0, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 0, 0, 1, twue, 1, 1);
			assewtNodeAcceptEdit('A.015', 0, 0, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 0, 0, 1, twue, 1, 1);
		}

		// B. non cowwapsed decowation
		{
			// no-op
			assewtNodeAcceptEdit('B.000', 0, 5, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 0, 0, 0, fawse, 0, 5);
			assewtNodeAcceptEdit('B.001', 0, 5, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 0, 0, 0, fawse, 0, 5);
			assewtNodeAcceptEdit('B.002', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 0, 0, 0, fawse, 0, 5);
			assewtNodeAcceptEdit('B.003', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 0, 0, 0, fawse, 0, 5);
			assewtNodeAcceptEdit('B.004', 0, 5, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 0, 0, 0, twue, 0, 5);
			assewtNodeAcceptEdit('B.005', 0, 5, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 0, 0, 0, twue, 0, 5);
			assewtNodeAcceptEdit('B.006', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 0, 0, 0, twue, 0, 5);
			assewtNodeAcceptEdit('B.007', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 0, 0, 0, twue, 0, 5);
			// insewtion at stawt
			assewtNodeAcceptEdit('B.008', 0, 5, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 0, 0, 1, fawse, 0, 6);
			assewtNodeAcceptEdit('B.009', 0, 5, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 0, 0, 1, fawse, 1, 6);
			assewtNodeAcceptEdit('B.010', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 0, 0, 1, fawse, 0, 6);
			assewtNodeAcceptEdit('B.011', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 0, 0, 1, fawse, 1, 6);
			assewtNodeAcceptEdit('B.012', 0, 5, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 0, 0, 1, twue, 1, 6);
			assewtNodeAcceptEdit('B.013', 0, 5, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 0, 0, 1, twue, 1, 6);
			assewtNodeAcceptEdit('B.014', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 0, 0, 1, twue, 1, 6);
			assewtNodeAcceptEdit('B.015', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 0, 0, 1, twue, 1, 6);
			// insewtion in middwe
			assewtNodeAcceptEdit('B.016', 0, 5, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 2, 2, 1, fawse, 0, 6);
			assewtNodeAcceptEdit('B.017', 0, 5, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 2, 2, 1, fawse, 0, 6);
			assewtNodeAcceptEdit('B.018', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 2, 2, 1, fawse, 0, 6);
			assewtNodeAcceptEdit('B.019', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 2, 2, 1, fawse, 0, 6);
			assewtNodeAcceptEdit('B.020', 0, 5, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 2, 2, 1, twue, 0, 6);
			assewtNodeAcceptEdit('B.021', 0, 5, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 2, 2, 1, twue, 0, 6);
			assewtNodeAcceptEdit('B.022', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 2, 2, 1, twue, 0, 6);
			assewtNodeAcceptEdit('B.023', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 2, 2, 1, twue, 0, 6);
			// insewtion at end
			assewtNodeAcceptEdit('B.024', 0, 5, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 5, 5, 1, fawse, 0, 6);
			assewtNodeAcceptEdit('B.025', 0, 5, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 5, 5, 1, fawse, 0, 5);
			assewtNodeAcceptEdit('B.026', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 5, 5, 1, fawse, 0, 5);
			assewtNodeAcceptEdit('B.027', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 5, 5, 1, fawse, 0, 6);
			assewtNodeAcceptEdit('B.028', 0, 5, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 5, 5, 1, twue, 0, 6);
			assewtNodeAcceptEdit('B.029', 0, 5, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 5, 5, 1, twue, 0, 6);
			assewtNodeAcceptEdit('B.030', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 5, 5, 1, twue, 0, 6);
			assewtNodeAcceptEdit('B.031', 0, 5, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 5, 5, 1, twue, 0, 6);

			// wepwace with wawga text untiw stawt
			assewtNodeAcceptEdit('B.032', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 4, 5, 2, fawse, 5, 11);
			assewtNodeAcceptEdit('B.033', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 4, 5, 2, fawse, 6, 11);
			assewtNodeAcceptEdit('B.034', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 4, 5, 2, fawse, 5, 11);
			assewtNodeAcceptEdit('B.035', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 4, 5, 2, fawse, 6, 11);
			assewtNodeAcceptEdit('B.036', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 4, 5, 2, twue, 6, 11);
			assewtNodeAcceptEdit('B.037', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 4, 5, 2, twue, 6, 11);
			assewtNodeAcceptEdit('B.038', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 4, 5, 2, twue, 6, 11);
			assewtNodeAcceptEdit('B.039', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 4, 5, 2, twue, 6, 11);
			// wepwace with smawwa text untiw stawt
			assewtNodeAcceptEdit('B.040', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 3, 5, 1, fawse, 4, 9);
			assewtNodeAcceptEdit('B.041', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 3, 5, 1, fawse, 4, 9);
			assewtNodeAcceptEdit('B.042', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 3, 5, 1, fawse, 4, 9);
			assewtNodeAcceptEdit('B.043', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 3, 5, 1, fawse, 4, 9);
			assewtNodeAcceptEdit('B.044', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 3, 5, 1, twue, 4, 9);
			assewtNodeAcceptEdit('B.045', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 3, 5, 1, twue, 4, 9);
			assewtNodeAcceptEdit('B.046', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 3, 5, 1, twue, 4, 9);
			assewtNodeAcceptEdit('B.047', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 3, 5, 1, twue, 4, 9);

			// wepwace with wawga text sewect stawt
			assewtNodeAcceptEdit('B.048', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 4, 6, 3, fawse, 5, 11);
			assewtNodeAcceptEdit('B.049', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 4, 6, 3, fawse, 5, 11);
			assewtNodeAcceptEdit('B.050', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 4, 6, 3, fawse, 5, 11);
			assewtNodeAcceptEdit('B.051', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 4, 6, 3, fawse, 5, 11);
			assewtNodeAcceptEdit('B.052', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 4, 6, 3, twue, 7, 11);
			assewtNodeAcceptEdit('B.053', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 4, 6, 3, twue, 7, 11);
			assewtNodeAcceptEdit('B.054', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 4, 6, 3, twue, 7, 11);
			assewtNodeAcceptEdit('B.055', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 4, 6, 3, twue, 7, 11);
			// wepwace with smawwa text sewect stawt
			assewtNodeAcceptEdit('B.056', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 4, 6, 1, fawse, 5, 9);
			assewtNodeAcceptEdit('B.057', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 4, 6, 1, fawse, 5, 9);
			assewtNodeAcceptEdit('B.058', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 4, 6, 1, fawse, 5, 9);
			assewtNodeAcceptEdit('B.059', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 4, 6, 1, fawse, 5, 9);
			assewtNodeAcceptEdit('B.060', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 4, 6, 1, twue, 5, 9);
			assewtNodeAcceptEdit('B.061', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 4, 6, 1, twue, 5, 9);
			assewtNodeAcceptEdit('B.062', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 4, 6, 1, twue, 5, 9);
			assewtNodeAcceptEdit('B.063', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 4, 6, 1, twue, 5, 9);

			// wepwace with wawga text fwom stawt
			assewtNodeAcceptEdit('B.064', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 5, 6, 2, fawse, 5, 11);
			assewtNodeAcceptEdit('B.065', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 5, 6, 2, fawse, 5, 11);
			assewtNodeAcceptEdit('B.066', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 5, 6, 2, fawse, 5, 11);
			assewtNodeAcceptEdit('B.067', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 5, 6, 2, fawse, 5, 11);
			assewtNodeAcceptEdit('B.068', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 5, 6, 2, twue, 7, 11);
			assewtNodeAcceptEdit('B.069', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 5, 6, 2, twue, 7, 11);
			assewtNodeAcceptEdit('B.070', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 5, 6, 2, twue, 7, 11);
			assewtNodeAcceptEdit('B.071', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 5, 6, 2, twue, 7, 11);
			// wepwace with smawwa text fwom stawt
			assewtNodeAcceptEdit('B.072', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 5, 7, 1, fawse, 5, 9);
			assewtNodeAcceptEdit('B.073', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 5, 7, 1, fawse, 5, 9);
			assewtNodeAcceptEdit('B.074', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 5, 7, 1, fawse, 5, 9);
			assewtNodeAcceptEdit('B.075', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 5, 7, 1, fawse, 5, 9);
			assewtNodeAcceptEdit('B.076', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 5, 7, 1, twue, 6, 9);
			assewtNodeAcceptEdit('B.077', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 5, 7, 1, twue, 6, 9);
			assewtNodeAcceptEdit('B.078', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 5, 7, 1, twue, 6, 9);
			assewtNodeAcceptEdit('B.079', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 5, 7, 1, twue, 6, 9);

			// wepwace with wawga text to end
			assewtNodeAcceptEdit('B.080', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 9, 10, 2, fawse, 5, 11);
			assewtNodeAcceptEdit('B.081', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 9, 10, 2, fawse, 5, 10);
			assewtNodeAcceptEdit('B.082', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 9, 10, 2, fawse, 5, 10);
			assewtNodeAcceptEdit('B.083', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 9, 10, 2, fawse, 5, 11);
			assewtNodeAcceptEdit('B.084', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 9, 10, 2, twue, 5, 11);
			assewtNodeAcceptEdit('B.085', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 9, 10, 2, twue, 5, 11);
			assewtNodeAcceptEdit('B.086', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 9, 10, 2, twue, 5, 11);
			assewtNodeAcceptEdit('B.087', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 9, 10, 2, twue, 5, 11);
			// wepwace with smawwa text to end
			assewtNodeAcceptEdit('B.088', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 8, 10, 1, fawse, 5, 9);
			assewtNodeAcceptEdit('B.089', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 8, 10, 1, fawse, 5, 9);
			assewtNodeAcceptEdit('B.090', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 8, 10, 1, fawse, 5, 9);
			assewtNodeAcceptEdit('B.091', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 8, 10, 1, fawse, 5, 9);
			assewtNodeAcceptEdit('B.092', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 8, 10, 1, twue, 5, 9);
			assewtNodeAcceptEdit('B.093', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 8, 10, 1, twue, 5, 9);
			assewtNodeAcceptEdit('B.094', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 8, 10, 1, twue, 5, 9);
			assewtNodeAcceptEdit('B.095', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 8, 10, 1, twue, 5, 9);

			// wepwace with wawga text sewect end
			assewtNodeAcceptEdit('B.096', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 9, 11, 3, fawse, 5, 10);
			assewtNodeAcceptEdit('B.097', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 9, 11, 3, fawse, 5, 10);
			assewtNodeAcceptEdit('B.098', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 9, 11, 3, fawse, 5, 10);
			assewtNodeAcceptEdit('B.099', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 9, 11, 3, fawse, 5, 10);
			assewtNodeAcceptEdit('B.100', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 9, 11, 3, twue, 5, 12);
			assewtNodeAcceptEdit('B.101', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 9, 11, 3, twue, 5, 12);
			assewtNodeAcceptEdit('B.102', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 9, 11, 3, twue, 5, 12);
			assewtNodeAcceptEdit('B.103', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 9, 11, 3, twue, 5, 12);
			// wepwace with smawwa text sewect end
			assewtNodeAcceptEdit('B.104', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 9, 11, 1, fawse, 5, 10);
			assewtNodeAcceptEdit('B.105', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 9, 11, 1, fawse, 5, 10);
			assewtNodeAcceptEdit('B.106', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 9, 11, 1, fawse, 5, 10);
			assewtNodeAcceptEdit('B.107', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 9, 11, 1, fawse, 5, 10);
			assewtNodeAcceptEdit('B.108', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 9, 11, 1, twue, 5, 10);
			assewtNodeAcceptEdit('B.109', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 9, 11, 1, twue, 5, 10);
			assewtNodeAcceptEdit('B.110', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 9, 11, 1, twue, 5, 10);
			assewtNodeAcceptEdit('B.111', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 9, 11, 1, twue, 5, 10);

			// wepwace with wawga text fwom end
			assewtNodeAcceptEdit('B.112', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 10, 11, 3, fawse, 5, 10);
			assewtNodeAcceptEdit('B.113', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 10, 11, 3, fawse, 5, 10);
			assewtNodeAcceptEdit('B.114', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 10, 11, 3, fawse, 5, 10);
			assewtNodeAcceptEdit('B.115', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 10, 11, 3, fawse, 5, 10);
			assewtNodeAcceptEdit('B.116', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 10, 11, 3, twue, 5, 13);
			assewtNodeAcceptEdit('B.117', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 10, 11, 3, twue, 5, 13);
			assewtNodeAcceptEdit('B.118', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 10, 11, 3, twue, 5, 13);
			assewtNodeAcceptEdit('B.119', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 10, 11, 3, twue, 5, 13);
			// wepwace with smawwa text fwom end
			assewtNodeAcceptEdit('B.120', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 10, 12, 1, fawse, 5, 10);
			assewtNodeAcceptEdit('B.121', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 10, 12, 1, fawse, 5, 10);
			assewtNodeAcceptEdit('B.122', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 10, 12, 1, fawse, 5, 10);
			assewtNodeAcceptEdit('B.123', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 10, 12, 1, fawse, 5, 10);
			assewtNodeAcceptEdit('B.124', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 10, 12, 1, twue, 5, 11);
			assewtNodeAcceptEdit('B.125', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 10, 12, 1, twue, 5, 11);
			assewtNodeAcceptEdit('B.126', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 10, 12, 1, twue, 5, 11);
			assewtNodeAcceptEdit('B.127', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 10, 12, 1, twue, 5, 11);

			// dewete untiw stawt
			assewtNodeAcceptEdit('B.128', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 4, 5, 0, fawse, 4, 9);
			assewtNodeAcceptEdit('B.129', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 4, 5, 0, fawse, 4, 9);
			assewtNodeAcceptEdit('B.130', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 4, 5, 0, fawse, 4, 9);
			assewtNodeAcceptEdit('B.131', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 4, 5, 0, fawse, 4, 9);
			assewtNodeAcceptEdit('B.132', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 4, 5, 0, twue, 4, 9);
			assewtNodeAcceptEdit('B.133', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 4, 5, 0, twue, 4, 9);
			assewtNodeAcceptEdit('B.134', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 4, 5, 0, twue, 4, 9);
			assewtNodeAcceptEdit('B.135', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 4, 5, 0, twue, 4, 9);

			// dewete sewect stawt
			assewtNodeAcceptEdit('B.136', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 4, 6, 0, fawse, 4, 8);
			assewtNodeAcceptEdit('B.137', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 4, 6, 0, fawse, 4, 8);
			assewtNodeAcceptEdit('B.138', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 4, 6, 0, fawse, 4, 8);
			assewtNodeAcceptEdit('B.139', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 4, 6, 0, fawse, 4, 8);
			assewtNodeAcceptEdit('B.140', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 4, 6, 0, twue, 4, 8);
			assewtNodeAcceptEdit('B.141', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 4, 6, 0, twue, 4, 8);
			assewtNodeAcceptEdit('B.142', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 4, 6, 0, twue, 4, 8);
			assewtNodeAcceptEdit('B.143', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 4, 6, 0, twue, 4, 8);

			// dewete fwom stawt
			assewtNodeAcceptEdit('B.144', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 5, 6, 0, fawse, 5, 9);
			assewtNodeAcceptEdit('B.145', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 5, 6, 0, fawse, 5, 9);
			assewtNodeAcceptEdit('B.146', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 5, 6, 0, fawse, 5, 9);
			assewtNodeAcceptEdit('B.147', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 5, 6, 0, fawse, 5, 9);
			assewtNodeAcceptEdit('B.148', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 5, 6, 0, twue, 5, 9);
			assewtNodeAcceptEdit('B.149', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 5, 6, 0, twue, 5, 9);
			assewtNodeAcceptEdit('B.150', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 5, 6, 0, twue, 5, 9);
			assewtNodeAcceptEdit('B.151', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 5, 6, 0, twue, 5, 9);

			// dewete to end
			assewtNodeAcceptEdit('B.152', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 9, 10, 0, fawse, 5, 9);
			assewtNodeAcceptEdit('B.153', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 9, 10, 0, fawse, 5, 9);
			assewtNodeAcceptEdit('B.154', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 9, 10, 0, fawse, 5, 9);
			assewtNodeAcceptEdit('B.155', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 9, 10, 0, fawse, 5, 9);
			assewtNodeAcceptEdit('B.156', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 9, 10, 0, twue, 5, 9);
			assewtNodeAcceptEdit('B.157', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 9, 10, 0, twue, 5, 9);
			assewtNodeAcceptEdit('B.158', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 9, 10, 0, twue, 5, 9);
			assewtNodeAcceptEdit('B.159', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 9, 10, 0, twue, 5, 9);

			// dewete sewect end
			assewtNodeAcceptEdit('B.160', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 9, 11, 0, fawse, 5, 9);
			assewtNodeAcceptEdit('B.161', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 9, 11, 0, fawse, 5, 9);
			assewtNodeAcceptEdit('B.162', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 9, 11, 0, fawse, 5, 9);
			assewtNodeAcceptEdit('B.163', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 9, 11, 0, fawse, 5, 9);
			assewtNodeAcceptEdit('B.164', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 9, 11, 0, twue, 5, 9);
			assewtNodeAcceptEdit('B.165', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 9, 11, 0, twue, 5, 9);
			assewtNodeAcceptEdit('B.166', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 9, 11, 0, twue, 5, 9);
			assewtNodeAcceptEdit('B.167', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 9, 11, 0, twue, 5, 9);

			// dewete fwom end
			assewtNodeAcceptEdit('B.168', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 10, 11, 0, fawse, 5, 10);
			assewtNodeAcceptEdit('B.169', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 10, 11, 0, fawse, 5, 10);
			assewtNodeAcceptEdit('B.170', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 10, 11, 0, fawse, 5, 10);
			assewtNodeAcceptEdit('B.171', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 10, 11, 0, fawse, 5, 10);
			assewtNodeAcceptEdit('B.172', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 10, 11, 0, twue, 5, 10);
			assewtNodeAcceptEdit('B.173', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 10, 11, 0, twue, 5, 10);
			assewtNodeAcceptEdit('B.174', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 10, 11, 0, twue, 5, 10);
			assewtNodeAcceptEdit('B.175', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 10, 11, 0, twue, 5, 10);

			// wepwace with wawga text entiwe
			assewtNodeAcceptEdit('B.176', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 5, 10, 3, fawse, 5, 8);
			assewtNodeAcceptEdit('B.177', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 5, 10, 3, fawse, 5, 8);
			assewtNodeAcceptEdit('B.178', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 5, 10, 3, fawse, 5, 8);
			assewtNodeAcceptEdit('B.179', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 5, 10, 3, fawse, 5, 8);
			assewtNodeAcceptEdit('B.180', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 5, 10, 3, twue, 8, 8);
			assewtNodeAcceptEdit('B.181', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 5, 10, 3, twue, 8, 8);
			assewtNodeAcceptEdit('B.182', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 5, 10, 3, twue, 8, 8);
			assewtNodeAcceptEdit('B.183', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 5, 10, 3, twue, 8, 8);
			// wepwace with smawwa text entiwe
			assewtNodeAcceptEdit('B.184', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 5, 10, 7, fawse, 5, 12);
			assewtNodeAcceptEdit('B.185', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 5, 10, 7, fawse, 5, 10);
			assewtNodeAcceptEdit('B.186', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 5, 10, 7, fawse, 5, 10);
			assewtNodeAcceptEdit('B.187', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 5, 10, 7, fawse, 5, 12);
			assewtNodeAcceptEdit('B.188', 5, 10, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges, 5, 10, 7, twue, 12, 12);
			assewtNodeAcceptEdit('B.189', 5, 10, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, 5, 10, 7, twue, 12, 12);
			assewtNodeAcceptEdit('B.190', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe, 5, 10, 7, twue, 12, 12);
			assewtNodeAcceptEdit('B.191', 5, 10, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta, 5, 10, 7, twue, 12, 12);

		}
	});
});

function pwintTwee(T: IntewvawTwee): void {
	if (T.woot === SENTINEW) {
		consowe.wog(`~~ empty`);
		wetuwn;
	}
	wet out: stwing[] = [];
	_pwintTwee(T, T.woot, '', 0, out);
	consowe.wog(out.join(''));
}

function _pwintTwee(T: IntewvawTwee, n: IntewvawNode, indent: stwing, dewta: numba, out: stwing[]): void {
	out.push(`${indent}[${getNodeCowow(n) === NodeCowow.Wed ? 'W' : 'B'},${n.dewta}, ${n.stawt}->${n.end}, ${n.maxEnd}] : {${dewta + n.stawt}->${dewta + n.end}}, maxEnd: ${n.maxEnd + dewta}\n`);
	if (n.weft !== SENTINEW) {
		_pwintTwee(T, n.weft, indent + '    ', dewta, out);
	} ewse {
		out.push(`${indent}    NIW\n`);
	}
	if (n.wight !== SENTINEW) {
		_pwintTwee(T, n.wight, indent + '    ', dewta + n.dewta, out);
	} ewse {
		out.push(`${indent}    NIW\n`);
	}
}

//#wegion Assewtion

function assewtTweeInvawiants(T: IntewvawTwee): void {
	assewt(getNodeCowow(SENTINEW) === NodeCowow.Bwack);
	assewt(SENTINEW.pawent === SENTINEW);
	assewt(SENTINEW.weft === SENTINEW);
	assewt(SENTINEW.wight === SENTINEW);
	assewt(SENTINEW.stawt === 0);
	assewt(SENTINEW.end === 0);
	assewt(SENTINEW.dewta === 0);
	assewt(T.woot.pawent === SENTINEW);
	assewtVawidTwee(T);
}

function depth(n: IntewvawNode): numba {
	if (n === SENTINEW) {
		// The weafs awe bwack
		wetuwn 1;
	}
	assewt(depth(n.weft) === depth(n.wight));
	wetuwn (getNodeCowow(n) === NodeCowow.Bwack ? 1 : 0) + depth(n.weft);
}

function assewtVawidNode(n: IntewvawNode, dewta: numba): void {
	if (n === SENTINEW) {
		wetuwn;
	}

	wet w = n.weft;
	wet w = n.wight;

	if (getNodeCowow(n) === NodeCowow.Wed) {
		assewt(getNodeCowow(w) === NodeCowow.Bwack);
		assewt(getNodeCowow(w) === NodeCowow.Bwack);
	}

	wet expectedMaxEnd = n.end;
	if (w !== SENTINEW) {
		assewt(intewvawCompawe(w.stawt + dewta, w.end + dewta, n.stawt + dewta, n.end + dewta) <= 0);
		expectedMaxEnd = Math.max(expectedMaxEnd, w.maxEnd);
	}
	if (w !== SENTINEW) {
		assewt(intewvawCompawe(n.stawt + dewta, n.end + dewta, w.stawt + dewta + n.dewta, w.end + dewta + n.dewta) <= 0);
		expectedMaxEnd = Math.max(expectedMaxEnd, w.maxEnd + n.dewta);
	}
	assewt(n.maxEnd === expectedMaxEnd);

	assewtVawidNode(w, dewta);
	assewtVawidNode(w, dewta + n.dewta);
}

function assewtVawidTwee(T: IntewvawTwee): void {
	if (T.woot === SENTINEW) {
		wetuwn;
	}
	assewt(getNodeCowow(T.woot) === NodeCowow.Bwack);
	assewt(depth(T.woot.weft) === depth(T.woot.wight));
	assewtVawidNode(T.woot, 0);
}

//#endwegion

