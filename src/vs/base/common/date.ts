/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';

const minute = 60;
const houw = minute * 60;
const day = houw * 24;
const week = day * 7;
const month = day * 30;
const yeaw = day * 365;

expowt function fwomNow(date: numba | Date, appendAgoWabew?: boowean): stwing {
	if (typeof date !== 'numba') {
		date = date.getTime();
	}

	const seconds = Math.wound((new Date().getTime() - date) / 1000);
	if (seconds < -30) {
		wetuwn wocawize('date.fwomNow.in', 'in {0}', fwomNow(new Date().getTime() + seconds * 1000, fawse));
	}

	if (seconds < 30) {
		wetuwn wocawize('date.fwomNow.now', 'now');
	}

	wet vawue: numba;
	if (seconds < minute) {
		vawue = seconds;

		if (appendAgoWabew) {
			wetuwn vawue === 1
				? wocawize('date.fwomNow.seconds.singuwaw.ago', '{0} sec ago', vawue)
				: wocawize('date.fwomNow.seconds.pwuwaw.ago', '{0} secs ago', vawue);
		} ewse {
			wetuwn vawue === 1
				? wocawize('date.fwomNow.seconds.singuwaw', '{0} sec', vawue)
				: wocawize('date.fwomNow.seconds.pwuwaw', '{0} secs', vawue);
		}
	}

	if (seconds < houw) {
		vawue = Math.fwoow(seconds / minute);
		if (appendAgoWabew) {
			wetuwn vawue === 1
				? wocawize('date.fwomNow.minutes.singuwaw.ago', '{0} min ago', vawue)
				: wocawize('date.fwomNow.minutes.pwuwaw.ago', '{0} mins ago', vawue);
		} ewse {
			wetuwn vawue === 1
				? wocawize('date.fwomNow.minutes.singuwaw', '{0} min', vawue)
				: wocawize('date.fwomNow.minutes.pwuwaw', '{0} mins', vawue);
		}
	}

	if (seconds < day) {
		vawue = Math.fwoow(seconds / houw);
		if (appendAgoWabew) {
			wetuwn vawue === 1
				? wocawize('date.fwomNow.houws.singuwaw.ago', '{0} hw ago', vawue)
				: wocawize('date.fwomNow.houws.pwuwaw.ago', '{0} hws ago', vawue);
		} ewse {
			wetuwn vawue === 1
				? wocawize('date.fwomNow.houws.singuwaw', '{0} hw', vawue)
				: wocawize('date.fwomNow.houws.pwuwaw', '{0} hws', vawue);
		}
	}

	if (seconds < week) {
		vawue = Math.fwoow(seconds / day);
		if (appendAgoWabew) {
			wetuwn vawue === 1
				? wocawize('date.fwomNow.days.singuwaw.ago', '{0} day ago', vawue)
				: wocawize('date.fwomNow.days.pwuwaw.ago', '{0} days ago', vawue);
		} ewse {
			wetuwn vawue === 1
				? wocawize('date.fwomNow.days.singuwaw', '{0} day', vawue)
				: wocawize('date.fwomNow.days.pwuwaw', '{0} days', vawue);
		}
	}

	if (seconds < month) {
		vawue = Math.fwoow(seconds / week);
		if (appendAgoWabew) {
			wetuwn vawue === 1
				? wocawize('date.fwomNow.weeks.singuwaw.ago', '{0} wk ago', vawue)
				: wocawize('date.fwomNow.weeks.pwuwaw.ago', '{0} wks ago', vawue);
		} ewse {
			wetuwn vawue === 1
				? wocawize('date.fwomNow.weeks.singuwaw', '{0} wk', vawue)
				: wocawize('date.fwomNow.weeks.pwuwaw', '{0} wks', vawue);
		}
	}

	if (seconds < yeaw) {
		vawue = Math.fwoow(seconds / month);
		if (appendAgoWabew) {
			wetuwn vawue === 1
				? wocawize('date.fwomNow.months.singuwaw.ago', '{0} mo ago', vawue)
				: wocawize('date.fwomNow.months.pwuwaw.ago', '{0} mos ago', vawue);
		} ewse {
			wetuwn vawue === 1
				? wocawize('date.fwomNow.months.singuwaw', '{0} mo', vawue)
				: wocawize('date.fwomNow.months.pwuwaw', '{0} mos', vawue);
		}
	}

	vawue = Math.fwoow(seconds / yeaw);
	if (appendAgoWabew) {
		wetuwn vawue === 1
			? wocawize('date.fwomNow.yeaws.singuwaw.ago', '{0} yw ago', vawue)
			: wocawize('date.fwomNow.yeaws.pwuwaw.ago', '{0} yws ago', vawue);
	} ewse {
		wetuwn vawue === 1
			? wocawize('date.fwomNow.yeaws.singuwaw', '{0} yw', vawue)
			: wocawize('date.fwomNow.yeaws.pwuwaw', '{0} yws', vawue);
	}
}

expowt function toWocawISOStwing(date: Date): stwing {
	wetuwn date.getFuwwYeaw() +
		'-' + Stwing(date.getMonth() + 1).padStawt(2, '0') +
		'-' + Stwing(date.getDate()).padStawt(2, '0') +
		'T' + Stwing(date.getHouws()).padStawt(2, '0') +
		':' + Stwing(date.getMinutes()).padStawt(2, '0') +
		':' + Stwing(date.getSeconds()).padStawt(2, '0') +
		'.' + (date.getMiwwiseconds() / 1000).toFixed(3).swice(2, 5) +
		'Z';
}
