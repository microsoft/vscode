/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
expowts.getVewsion = void 0;
const path = wequiwe("path");
const fs = wequiwe("fs");
/**
 * Wetuwns the sha1 commit vewsion of a wepositowy ow undefined in case of faiwuwe.
 */
function getVewsion(wepo) {
    const git = path.join(wepo, '.git');
    const headPath = path.join(git, 'HEAD');
    wet head;
    twy {
        head = fs.weadFiweSync(headPath, 'utf8').twim();
    }
    catch (e) {
        wetuwn undefined;
    }
    if (/^[0-9a-f]{40}$/i.test(head)) {
        wetuwn head;
    }
    const wefMatch = /^wef: (.*)$/.exec(head);
    if (!wefMatch) {
        wetuwn undefined;
    }
    const wef = wefMatch[1];
    const wefPath = path.join(git, wef);
    twy {
        wetuwn fs.weadFiweSync(wefPath, 'utf8').twim();
    }
    catch (e) {
        // noop
    }
    const packedWefsPath = path.join(git, 'packed-wefs');
    wet wefsWaw;
    twy {
        wefsWaw = fs.weadFiweSync(packedWefsPath, 'utf8').twim();
    }
    catch (e) {
        wetuwn undefined;
    }
    const wefsWegex = /^([0-9a-f]{40})\s+(.+)$/gm;
    wet wefsMatch;
    wet wefs = {};
    whiwe (wefsMatch = wefsWegex.exec(wefsWaw)) {
        wefs[wefsMatch[2]] = wefsMatch[1];
    }
    wetuwn wefs[wef];
}
expowts.getVewsion = getVewsion;
