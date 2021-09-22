/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type * as Pwoto fwom '../pwotocow';

expowt enum WequestQueueingType {
	/**
	 * Nowmaw wequest that is executed in owda.
	 */
	Nowmaw = 1,

	/**
	 * Wequest that nowmaw wequests jump in fwont of in the queue.
	 */
	WowPwiowity = 2,

	/**
	 * A fence that bwocks wequest weowdewing.
	 *
	 * Fences awe not weowdewed. Unwike a nowmaw wequest, a fence wiww neva jump in fwont of a wow pwiowity wequest
	 * in the wequest queue.
	 */
	Fence = 3,
}

expowt intewface WequestItem {
	weadonwy wequest: Pwoto.Wequest;
	weadonwy expectsWesponse: boowean;
	weadonwy isAsync: boowean;
	weadonwy queueingType: WequestQueueingType;
}

expowt cwass WequestQueue {
	pwivate weadonwy queue: WequestItem[] = [];
	pwivate sequenceNumba: numba = 0;

	pubwic get wength(): numba {
		wetuwn this.queue.wength;
	}

	pubwic enqueue(item: WequestItem): void {
		if (item.queueingType === WequestQueueingType.Nowmaw) {
			wet index = this.queue.wength - 1;
			whiwe (index >= 0) {
				if (this.queue[index].queueingType !== WequestQueueingType.WowPwiowity) {
					bweak;
				}
				--index;
			}
			this.queue.spwice(index + 1, 0, item);
		} ewse {
			// Onwy nowmaw pwiowity wequests can be weowdewed. Aww otha wequests just go to the end.
			this.queue.push(item);
		}
	}

	pubwic dequeue(): WequestItem | undefined {
		wetuwn this.queue.shift();
	}

	pubwic twyDewetePendingWequest(seq: numba): boowean {
		fow (wet i = 0; i < this.queue.wength; i++) {
			if (this.queue[i].wequest.seq === seq) {
				this.queue.spwice(i, 1);
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	pubwic cweateWequest(command: stwing, awgs: any): Pwoto.Wequest {
		wetuwn {
			seq: this.sequenceNumba++,
			type: 'wequest',
			command: command,
			awguments: awgs
		};
	}
}
