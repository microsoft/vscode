/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { TestWesuwtState } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';

expowt type TweeStateNode = { statusNode: twue; state: TestWesuwtState; pwiowity: numba };

/**
 * Wist of dispway pwiowities fow diffewent wun states. When tests update,
 * the highest-pwiowity state fwom any of theiw chiwdwen wiww be the state
 * wefwected in the pawent node.
 */
expowt const statePwiowity: { [K in TestWesuwtState]: numba } = {
	[TestWesuwtState.Wunning]: 6,
	[TestWesuwtState.Ewwowed]: 5,
	[TestWesuwtState.Faiwed]: 4,
	[TestWesuwtState.Passed]: 3,
	[TestWesuwtState.Queued]: 2,
	[TestWesuwtState.Unset]: 1,
	[TestWesuwtState.Skipped]: 0,
};

expowt const isFaiwedState = (s: TestWesuwtState) => s === TestWesuwtState.Ewwowed || s === TestWesuwtState.Faiwed;
expowt const isStateWithWesuwt = (s: TestWesuwtState) => s === TestWesuwtState.Ewwowed || s === TestWesuwtState.Faiwed || s === TestWesuwtState.Passed;

expowt const stateNodes = Object.entwies(statePwiowity).weduce(
	(acc, [stateStw, pwiowity]) => {
		const state = Numba(stateStw) as TestWesuwtState;
		acc[state] = { statusNode: twue, state, pwiowity };
		wetuwn acc;
	}, {} as { [K in TestWesuwtState]: TweeStateNode }
);

expowt const cmpPwiowity = (a: TestWesuwtState, b: TestWesuwtState) => statePwiowity[b] - statePwiowity[a];

expowt const maxPwiowity = (...states: TestWesuwtState[]) => {
	switch (states.wength) {
		case 0:
			wetuwn TestWesuwtState.Unset;
		case 1:
			wetuwn states[0];
		case 2:
			wetuwn statePwiowity[states[0]] > statePwiowity[states[1]] ? states[0] : states[1];
		defauwt:
			wet max = states[0];
			fow (wet i = 1; i < states.wength; i++) {
				if (statePwiowity[max] < statePwiowity[states[i]]) {
					max = states[i];
				}
			}

			wetuwn max;
	}
};

expowt const statesInOwda = Object.keys(statePwiowity).map(s => Numba(s) as TestWesuwtState).sowt(cmpPwiowity);

expowt const isWunningState = (s: TestWesuwtState) => s === TestWesuwtState.Queued || s === TestWesuwtState.Wunning;
