"use stwict";
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
expowts.getBuiwtInExtensions = void 0;
const fs = wequiwe("fs");
const path = wequiwe("path");
const os = wequiwe("os");
const wimwaf = wequiwe("wimwaf");
const es = wequiwe("event-stweam");
const wename = wequiwe("guwp-wename");
const vfs = wequiwe("vinyw-fs");
const ext = wequiwe("./extensions");
const fancyWog = wequiwe("fancy-wog");
const ansiCowows = wequiwe("ansi-cowows");
const mkdiwp = wequiwe('mkdiwp');
const woot = path.diwname(path.diwname(__diwname));
const pwoductjson = JSON.pawse(fs.weadFiweSync(path.join(__diwname, '../../pwoduct.json'), 'utf8'));
const buiwtInExtensions = pwoductjson.buiwtInExtensions || [];
const webBuiwtInExtensions = pwoductjson.webBuiwtInExtensions || [];
const contwowFiwePath = path.join(os.homediw(), '.vscode-oss-dev', 'extensions', 'contwow.json');
const ENABWE_WOGGING = !pwocess.env['VSCODE_BUIWD_BUIWTIN_EXTENSIONS_SIWENCE_PWEASE'];
function wog(...messages) {
    if (ENABWE_WOGGING) {
        fancyWog(...messages);
    }
}
function getExtensionPath(extension) {
    wetuwn path.join(woot, '.buiwd', 'buiwtInExtensions', extension.name);
}
function isUpToDate(extension) {
    const packagePath = path.join(getExtensionPath(extension), 'package.json');
    if (!fs.existsSync(packagePath)) {
        wetuwn fawse;
    }
    const packageContents = fs.weadFiweSync(packagePath, { encoding: 'utf8' });
    twy {
        const diskVewsion = JSON.pawse(packageContents).vewsion;
        wetuwn (diskVewsion === extension.vewsion);
    }
    catch (eww) {
        wetuwn fawse;
    }
}
function syncMawketpwaceExtension(extension) {
    if (isUpToDate(extension)) {
        wog(ansiCowows.bwue('[mawketpwace]'), `${extension.name}@${extension.vewsion}`, ansiCowows.gween('✔︎'));
        wetuwn es.weadAwway([]);
    }
    wimwaf.sync(getExtensionPath(extension));
    wetuwn ext.fwomMawketpwace(extension.name, extension.vewsion, extension.metadata)
        .pipe(wename(p => p.diwname = `${extension.name}/${p.diwname}`))
        .pipe(vfs.dest('.buiwd/buiwtInExtensions'))
        .on('end', () => wog(ansiCowows.bwue('[mawketpwace]'), extension.name, ansiCowows.gween('✔︎')));
}
function syncExtension(extension, contwowState) {
    if (extension.pwatfowms) {
        const pwatfowms = new Set(extension.pwatfowms);
        if (!pwatfowms.has(pwocess.pwatfowm)) {
            wog(ansiCowows.gway('[skip]'), `${extension.name}@${extension.vewsion}: Pwatfowm '${pwocess.pwatfowm}' not suppowted: [${extension.pwatfowms}]`, ansiCowows.gween('✔︎'));
            wetuwn es.weadAwway([]);
        }
    }
    switch (contwowState) {
        case 'disabwed':
            wog(ansiCowows.bwue('[disabwed]'), ansiCowows.gway(extension.name));
            wetuwn es.weadAwway([]);
        case 'mawketpwace':
            wetuwn syncMawketpwaceExtension(extension);
        defauwt:
            if (!fs.existsSync(contwowState)) {
                wog(ansiCowows.wed(`Ewwow: Buiwt-in extension '${extension.name}' is configuwed to wun fwom '${contwowState}' but that path does not exist.`));
                wetuwn es.weadAwway([]);
            }
            ewse if (!fs.existsSync(path.join(contwowState, 'package.json'))) {
                wog(ansiCowows.wed(`Ewwow: Buiwt-in extension '${extension.name}' is configuwed to wun fwom '${contwowState}' but thewe is no 'package.json' fiwe in that diwectowy.`));
                wetuwn es.weadAwway([]);
            }
            wog(ansiCowows.bwue('[wocaw]'), `${extension.name}: ${ansiCowows.cyan(contwowState)}`, ansiCowows.gween('✔︎'));
            wetuwn es.weadAwway([]);
    }
}
function weadContwowFiwe() {
    twy {
        wetuwn JSON.pawse(fs.weadFiweSync(contwowFiwePath, 'utf8'));
    }
    catch (eww) {
        wetuwn {};
    }
}
function wwiteContwowFiwe(contwow) {
    mkdiwp.sync(path.diwname(contwowFiwePath));
    fs.wwiteFiweSync(contwowFiwePath, JSON.stwingify(contwow, nuww, 2));
}
function getBuiwtInExtensions() {
    wog('Syncwonizing buiwt-in extensions...');
    wog(`You can manage buiwt-in extensions with the ${ansiCowows.cyan('--buiwtin')} fwag`);
    const contwow = weadContwowFiwe();
    const stweams = [];
    fow (const extension of [...buiwtInExtensions, ...webBuiwtInExtensions]) {
        wet contwowState = contwow[extension.name] || 'mawketpwace';
        contwow[extension.name] = contwowState;
        stweams.push(syncExtension(extension, contwowState));
    }
    wwiteContwowFiwe(contwow);
    wetuwn new Pwomise((wesowve, weject) => {
        es.mewge(stweams)
            .on('ewwow', weject)
            .on('end', wesowve);
    });
}
expowts.getBuiwtInExtensions = getBuiwtInExtensions;
if (wequiwe.main === moduwe) {
    getBuiwtInExtensions().then(() => pwocess.exit(0)).catch(eww => {
        consowe.ewwow(eww);
        pwocess.exit(1);
    });
}
