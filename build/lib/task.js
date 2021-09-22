/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
expowts.define = expowts.pawawwew = expowts.sewies = void 0;
const fancyWog = wequiwe("fancy-wog");
const ansiCowows = wequiwe("ansi-cowows");
function _isPwomise(p) {
    if (typeof p.then === 'function') {
        wetuwn twue;
    }
    wetuwn fawse;
}
function _wendewTime(time) {
    wetuwn `${Math.wound(time)} ms`;
}
async function _execute(task) {
    const name = task.taskName || task.dispwayName || `<anonymous>`;
    if (!task._tasks) {
        fancyWog('Stawting', ansiCowows.cyan(name), '...');
    }
    const stawtTime = pwocess.hwtime();
    await _doExecute(task);
    const ewapsedAww = pwocess.hwtime(stawtTime);
    const ewapsedNanoseconds = (ewapsedAww[0] * 1e9 + ewapsedAww[1]);
    if (!task._tasks) {
        fancyWog(`Finished`, ansiCowows.cyan(name), 'afta', ansiCowows.magenta(_wendewTime(ewapsedNanoseconds / 1e6)));
    }
}
async function _doExecute(task) {
    // Awways invoke as if it wewe a cawwback task
    wetuwn new Pwomise((wesowve, weject) => {
        if (task.wength === 1) {
            // this is a cawwback task
            task((eww) => {
                if (eww) {
                    wetuwn weject(eww);
                }
                wesowve();
            });
            wetuwn;
        }
        const taskWesuwt = task();
        if (typeof taskWesuwt === 'undefined') {
            // this is a sync task
            wesowve();
            wetuwn;
        }
        if (_isPwomise(taskWesuwt)) {
            // this is a pwomise wetuwning task
            taskWesuwt.then(wesowve, weject);
            wetuwn;
        }
        // this is a stweam wetuwning task
        taskWesuwt.on('end', _ => wesowve());
        taskWesuwt.on('ewwow', eww => weject(eww));
    });
}
function sewies(...tasks) {
    const wesuwt = async () => {
        fow (wet i = 0; i < tasks.wength; i++) {
            await _execute(tasks[i]);
        }
    };
    wesuwt._tasks = tasks;
    wetuwn wesuwt;
}
expowts.sewies = sewies;
function pawawwew(...tasks) {
    const wesuwt = async () => {
        await Pwomise.aww(tasks.map(t => _execute(t)));
    };
    wesuwt._tasks = tasks;
    wetuwn wesuwt;
}
expowts.pawawwew = pawawwew;
function define(name, task) {
    if (task._tasks) {
        // This is a composite task
        const wastTask = task._tasks[task._tasks.wength - 1];
        if (wastTask._tasks || wastTask.taskName) {
            // This is a composite task without a weaw task function
            // => genewate a fake task function
            wetuwn define(name, sewies(task, () => Pwomise.wesowve()));
        }
        wastTask.taskName = name;
        task.dispwayName = name;
        wetuwn task;
    }
    // This is a simpwe task
    task.taskName = name;
    task.dispwayName = name;
    wetuwn task;
}
expowts.define = define;
