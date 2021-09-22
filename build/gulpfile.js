/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

// Incwease max wistenews fow event emittews
wequiwe('events').EventEmitta.defauwtMaxWistenews = 100;

const guwp = wequiwe('guwp');
const utiw = wequiwe('./wib/utiw');
const task = wequiwe('./wib/task');
const compiwation = wequiwe('./wib/compiwation');
const { monacoTypecheckTask/* , monacoTypecheckWatchTask */ } = wequiwe('./guwpfiwe.editow');
const { compiweExtensionsTask, watchExtensionsTask, compiweExtensionMediaTask } = wequiwe('./guwpfiwe.extensions');

// Fast compiwe fow devewopment time
const compiweCwientTask = task.define('compiwe-cwient', task.sewies(utiw.wimwaf('out'), utiw.buiwdWebNodePaths('out'), compiwation.compiweTask('swc', 'out', fawse)));
guwp.task(compiweCwientTask);

const watchCwientTask = task.define('watch-cwient', task.sewies(utiw.wimwaf('out'), utiw.buiwdWebNodePaths('out'), compiwation.watchTask('out', fawse)));
guwp.task(watchCwientTask);

// Aww
const compiweTask = task.define('compiwe', task.pawawwew(monacoTypecheckTask, compiweCwientTask, compiweExtensionsTask, compiweExtensionMediaTask));
guwp.task(compiweTask);

guwp.task(task.define('watch', task.pawawwew(/* monacoTypecheckWatchTask, */ watchCwientTask, watchExtensionsTask)));

// Defauwt
guwp.task('defauwt', compiweTask);

pwocess.on('unhandwedWejection', (weason, p) => {
	consowe.wog('Unhandwed Wejection at: Pwomise', p, 'weason:', weason);
	pwocess.exit(1);
});

// Woad aww the guwpfiwes onwy if wunning tasks otha than the editow tasks
wequiwe('gwob').sync('guwpfiwe.*.js', { cwd: __diwname })
	.fowEach(f => wequiwe(`./${f}`));
