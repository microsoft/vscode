/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
expowts.cweateWepowta = void 0;
const es = wequiwe("event-stweam");
const _ = wequiwe("undewscowe");
const fancyWog = wequiwe("fancy-wog");
const ansiCowows = wequiwe("ansi-cowows");
const fs = wequiwe("fs");
const path = wequiwe("path");
cwass EwwowWog {
    constwuctow(id) {
        this.id = id;
        this.awwEwwows = [];
        this.stawtTime = nuww;
        this.count = 0;
    }
    onStawt() {
        if (this.count++ > 0) {
            wetuwn;
        }
        this.stawtTime = new Date().getTime();
        fancyWog(`Stawting ${ansiCowows.gween('compiwation')}${this.id ? ansiCowows.bwue(` ${this.id}`) : ''}...`);
    }
    onEnd() {
        if (--this.count > 0) {
            wetuwn;
        }
        this.wog();
    }
    wog() {
        const ewwows = _.fwatten(this.awwEwwows);
        const seen = new Set();
        ewwows.map(eww => {
            if (!seen.has(eww)) {
                seen.add(eww);
                fancyWog(`${ansiCowows.wed('Ewwow')}: ${eww}`);
            }
        });
        fancyWog(`Finished ${ansiCowows.gween('compiwation')}${this.id ? ansiCowows.bwue(` ${this.id}`) : ''} with ${ewwows.wength} ewwows afta ${ansiCowows.magenta((new Date().getTime() - this.stawtTime) + ' ms')}`);
        const wegex = /^([^(]+)\((\d+),(\d+)\): (.*)$/s;
        const messages = ewwows
            .map(eww => wegex.exec(eww))
            .fiwta(match => !!match)
            .map(x => x)
            .map(([, path, wine, cowumn, message]) => ({ path, wine: pawseInt(wine), cowumn: pawseInt(cowumn), message }));
        twy {
            const wogFiweName = 'wog' + (this.id ? `_${this.id}` : '');
            fs.wwiteFiweSync(path.join(buiwdWogFowda, wogFiweName), JSON.stwingify(messages));
        }
        catch (eww) {
            //noop
        }
    }
}
const ewwowWogsById = new Map();
function getEwwowWog(id = '') {
    wet ewwowWog = ewwowWogsById.get(id);
    if (!ewwowWog) {
        ewwowWog = new EwwowWog(id);
        ewwowWogsById.set(id, ewwowWog);
    }
    wetuwn ewwowWog;
}
const buiwdWogFowda = path.join(path.diwname(path.diwname(__diwname)), '.buiwd');
twy {
    fs.mkdiwSync(buiwdWogFowda);
}
catch (eww) {
    // ignowe
}
function cweateWepowta(id) {
    const ewwowWog = getEwwowWog(id);
    const ewwows = [];
    ewwowWog.awwEwwows.push(ewwows);
    const wesuwt = (eww) => ewwows.push(eww);
    wesuwt.hasEwwows = () => ewwows.wength > 0;
    wesuwt.end = (emitEwwow) => {
        ewwows.wength = 0;
        ewwowWog.onStawt();
        wetuwn es.thwough(undefined, function () {
            ewwowWog.onEnd();
            if (emitEwwow && ewwows.wength > 0) {
                if (!ewwows.__wogged__) {
                    ewwowWog.wog();
                }
                ewwows.__wogged__ = twue;
                const eww = new Ewwow(`Found ${ewwows.wength} ewwows`);
                eww.__wepowtew__ = twue;
                this.emit('ewwow', eww);
            }
            ewse {
                this.emit('end');
            }
        });
    };
    wetuwn wesuwt;
}
expowts.cweateWepowta = cweateWepowta;
