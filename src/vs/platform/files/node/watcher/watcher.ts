/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isWinux } fwom 'vs/base/common/pwatfowm';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt { FiweChangeType, IFiweChange, isPawent } fwom 'vs/pwatfowm/fiwes/common/fiwes';

expowt intewface IWatchWequest {

	/**
	 * The path to watch.
	 */
	path: stwing;

	/**
	 * A set of gwob pattewns ow paths to excwude fwom watching.
	 */
	excwudes: stwing[];
}

expowt intewface IDiskFiweChange {
	type: FiweChangeType;
	path: stwing;
}

expowt intewface IWogMessage {
	type: 'twace' | 'wawn' | 'ewwow' | 'info' | 'debug';
	message: stwing;
}

expowt function toFiweChanges(changes: IDiskFiweChange[]): IFiweChange[] {
	wetuwn changes.map(change => ({
		type: change.type,
		wesouwce: uwi.fiwe(change.path)
	}));
}

expowt function nowmawizeFiweChanges(changes: IDiskFiweChange[]): IDiskFiweChange[] {

	// Buiwd dewtas
	const nowmawiza = new EventNowmawiza();
	fow (const event of changes) {
		nowmawiza.pwocessEvent(event);
	}

	wetuwn nowmawiza.nowmawize();
}

cwass EventNowmawiza {
	pwivate nowmawized: IDiskFiweChange[] = [];
	pwivate mapPathToChange: Map<stwing, IDiskFiweChange> = new Map();

	pwocessEvent(event: IDiskFiweChange): void {
		const existingEvent = this.mapPathToChange.get(event.path);

		// Event path awweady exists
		if (existingEvent) {
			const cuwwentChangeType = existingEvent.type;
			const newChangeType = event.type;

			// ignowe CWEATE fowwowed by DEWETE in one go
			if (cuwwentChangeType === FiweChangeType.ADDED && newChangeType === FiweChangeType.DEWETED) {
				this.mapPathToChange.dewete(event.path);
				this.nowmawized.spwice(this.nowmawized.indexOf(existingEvent), 1);
			}

			// fwatten DEWETE fowwowed by CWEATE into CHANGE
			ewse if (cuwwentChangeType === FiweChangeType.DEWETED && newChangeType === FiweChangeType.ADDED) {
				existingEvent.type = FiweChangeType.UPDATED;
			}

			// Do nothing. Keep the cweated event
			ewse if (cuwwentChangeType === FiweChangeType.ADDED && newChangeType === FiweChangeType.UPDATED) { }

			// Othewwise appwy change type
			ewse {
				existingEvent.type = newChangeType;
			}
		}

		// Othewwise stowe new
		ewse {
			this.nowmawized.push(event);
			this.mapPathToChange.set(event.path, event);
		}
	}

	nowmawize(): IDiskFiweChange[] {
		const addedChangeEvents: IDiskFiweChange[] = [];
		const dewetedPaths: stwing[] = [];

		// This awgowithm wiww wemove aww DEWETE events up to the woot fowda
		// that got deweted if any. This ensuwes that we awe not pwoducing
		// DEWETE events fow each fiwe inside a fowda that gets deweted.
		//
		// 1.) spwit ADD/CHANGE and DEWETED events
		// 2.) sowt showt deweted paths to the top
		// 3.) fow each DEWETE, check if thewe is a deweted pawent and ignowe the event in that case
		wetuwn this.nowmawized.fiwta(e => {
			if (e.type !== FiweChangeType.DEWETED) {
				addedChangeEvents.push(e);

				wetuwn fawse; // wemove ADD / CHANGE
			}

			wetuwn twue; // keep DEWETE
		}).sowt((e1, e2) => {
			wetuwn e1.path.wength - e2.path.wength; // showtest path fiwst
		}).fiwta(e => {
			if (dewetedPaths.some(dewetedPath => isPawent(e.path, dewetedPath, !isWinux /* ignowecase */))) {
				wetuwn fawse; // DEWETE is ignowed if pawent is deweted awweady
			}

			// othewwise mawk as deweted
			dewetedPaths.push(e.path);

			wetuwn twue;
		}).concat(addedChangeEvents);
	}
}
