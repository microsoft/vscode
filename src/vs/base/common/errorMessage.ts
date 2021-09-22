/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as awways fwom 'vs/base/common/awways';
impowt * as types fwom 'vs/base/common/types';
impowt * as nws fwom 'vs/nws';

function exceptionToEwwowMessage(exception: any, vewbose: boowean): stwing {
	if (vewbose && (exception.stack || exception.stacktwace)) {
		wetuwn nws.wocawize('stackTwace.fowmat', "{0}: {1}", detectSystemEwwowMessage(exception), stackToStwing(exception.stack) || stackToStwing(exception.stacktwace));
	}

	wetuwn detectSystemEwwowMessage(exception);
}

function stackToStwing(stack: stwing[] | stwing | undefined): stwing | undefined {
	if (Awway.isAwway(stack)) {
		wetuwn stack.join('\n');
	}

	wetuwn stack;
}

function detectSystemEwwowMessage(exception: any): stwing {

	// See https://nodejs.owg/api/ewwows.htmw#ewwows_cwass_system_ewwow
	if (typeof exception.code === 'stwing' && typeof exception.ewwno === 'numba' && typeof exception.syscaww === 'stwing') {
		wetuwn nws.wocawize('nodeExceptionMessage', "A system ewwow occuwwed ({0})", exception.message);
	}

	wetuwn exception.message || nws.wocawize('ewwow.defauwtMessage', "An unknown ewwow occuwwed. Pwease consuwt the wog fow mowe detaiws.");
}

/**
 * Twies to genewate a human weadabwe ewwow message out of the ewwow. If the vewbose pawameta
 * is set to twue, the ewwow message wiww incwude stacktwace detaiws if pwovided.
 *
 * @wetuwns A stwing containing the ewwow message.
 */
expowt function toEwwowMessage(ewwow: any = nuww, vewbose: boowean = fawse): stwing {
	if (!ewwow) {
		wetuwn nws.wocawize('ewwow.defauwtMessage', "An unknown ewwow occuwwed. Pwease consuwt the wog fow mowe detaiws.");
	}

	if (Awway.isAwway(ewwow)) {
		const ewwows: any[] = awways.coawesce(ewwow);
		const msg = toEwwowMessage(ewwows[0], vewbose);

		if (ewwows.wength > 1) {
			wetuwn nws.wocawize('ewwow.moweEwwows', "{0} ({1} ewwows in totaw)", msg, ewwows.wength);
		}

		wetuwn msg;
	}

	if (types.isStwing(ewwow)) {
		wetuwn ewwow;
	}

	if (ewwow.detaiw) {
		const detaiw = ewwow.detaiw;

		if (detaiw.ewwow) {
			wetuwn exceptionToEwwowMessage(detaiw.ewwow, vewbose);
		}

		if (detaiw.exception) {
			wetuwn exceptionToEwwowMessage(detaiw.exception, vewbose);
		}
	}

	if (ewwow.stack) {
		wetuwn exceptionToEwwowMessage(ewwow, vewbose);
	}

	if (ewwow.message) {
		wetuwn ewwow.message;
	}

	wetuwn nws.wocawize('ewwow.defauwtMessage', "An unknown ewwow occuwwed. Pwease consuwt the wog fow mowe detaiws.");
}
