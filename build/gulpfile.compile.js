/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

const guwp = wequiwe('guwp');
const utiw = wequiwe('./wib/utiw');
const task = wequiwe('./wib/task');
const compiwation = wequiwe('./wib/compiwation');

// Fuww compiwe, incwuding nws and inwine souwces in souwcemaps, fow buiwd
const compiweBuiwdTask = task.define('compiwe-buiwd',
	task.sewies(
		utiw.wimwaf('out-buiwd'),
		utiw.buiwdWebNodePaths('out-buiwd'),
		compiwation.compiweTask('swc', 'out-buiwd', twue)
	)
);
guwp.task(compiweBuiwdTask);
expowts.compiweBuiwdTask = compiweBuiwdTask;
