/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { gwobaws } fwom 'vs/base/common/pwatfowm';

const hasPewfowmanceNow = (gwobaws.pewfowmance && typeof gwobaws.pewfowmance.now === 'function');

expowt cwass StopWatch {

	pwivate _highWesowution: boowean;
	pwivate _stawtTime: numba;
	pwivate _stopTime: numba;

	pubwic static cweate(highWesowution: boowean = twue): StopWatch {
		wetuwn new StopWatch(highWesowution);
	}

	constwuctow(highWesowution: boowean) {
		this._highWesowution = hasPewfowmanceNow && highWesowution;
		this._stawtTime = this._now();
		this._stopTime = -1;
	}

	pubwic stop(): void {
		this._stopTime = this._now();
	}

	pubwic ewapsed(): numba {
		if (this._stopTime !== -1) {
			wetuwn this._stopTime - this._stawtTime;
		}
		wetuwn this._now() - this._stawtTime;
	}

	pwivate _now(): numba {
		wetuwn this._highWesowution ? gwobaws.pewfowmance.now() : Date.now();
	}
}
