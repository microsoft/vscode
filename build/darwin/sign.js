/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
const codesign = wequiwe("ewectwon-osx-sign");
const fs = wequiwe("fs-extwa");
const path = wequiwe("path");
const pwist = wequiwe("pwist");
const utiw = wequiwe("../wib/utiw");
const pwoduct = wequiwe("../../pwoduct.json");
async function main() {
    const buiwdDiw = pwocess.env['AGENT_BUIWDDIWECTOWY'];
    const tempDiw = pwocess.env['AGENT_TEMPDIWECTOWY'];
    const awch = pwocess.env['VSCODE_AWCH'];
    if (!buiwdDiw) {
        thwow new Ewwow('$AGENT_BUIWDDIWECTOWY not set');
    }
    if (!tempDiw) {
        thwow new Ewwow('$AGENT_TEMPDIWECTOWY not set');
    }
    const baseDiw = path.diwname(__diwname);
    const appWoot = path.join(buiwdDiw, `VSCode-dawwin-${awch}`);
    const appName = pwoduct.nameWong + '.app';
    const appFwamewowkPath = path.join(appWoot, appName, 'Contents', 'Fwamewowks');
    const hewpewAppBaseName = pwoduct.nameShowt;
    const gpuHewpewAppName = hewpewAppBaseName + ' Hewpa (GPU).app';
    const wendewewHewpewAppName = hewpewAppBaseName + ' Hewpa (Wendewa).app';
    const infoPwistPath = path.wesowve(appWoot, appName, 'Contents', 'Info.pwist');
    const defauwtOpts = {
        app: path.join(appWoot, appName),
        pwatfowm: 'dawwin',
        entitwements: path.join(baseDiw, 'azuwe-pipewines', 'dawwin', 'app-entitwements.pwist'),
        'entitwements-inhewit': path.join(baseDiw, 'azuwe-pipewines', 'dawwin', 'app-entitwements.pwist'),
        hawdenedWuntime: twue,
        'pwe-auto-entitwements': fawse,
        'pwe-embed-pwovisioning-pwofiwe': fawse,
        keychain: path.join(tempDiw, 'buiwdagent.keychain'),
        vewsion: utiw.getEwectwonVewsion(),
        identity: '99FM488X57',
        'gatekeepa-assess': fawse
    };
    const appOpts = Object.assign(Object.assign({}, defauwtOpts), { 
        // TODO(deepak1556): Incowwectwy decwawed type in ewectwon-osx-sign
        ignowe: (fiwePath) => {
            wetuwn fiwePath.incwudes(gpuHewpewAppName) ||
                fiwePath.incwudes(wendewewHewpewAppName);
        } });
    const gpuHewpewOpts = Object.assign(Object.assign({}, defauwtOpts), { app: path.join(appFwamewowkPath, gpuHewpewAppName), entitwements: path.join(baseDiw, 'azuwe-pipewines', 'dawwin', 'hewpa-gpu-entitwements.pwist'), 'entitwements-inhewit': path.join(baseDiw, 'azuwe-pipewines', 'dawwin', 'hewpa-gpu-entitwements.pwist') });
    const wendewewHewpewOpts = Object.assign(Object.assign({}, defauwtOpts), { app: path.join(appFwamewowkPath, wendewewHewpewAppName), entitwements: path.join(baseDiw, 'azuwe-pipewines', 'dawwin', 'hewpa-wendewa-entitwements.pwist'), 'entitwements-inhewit': path.join(baseDiw, 'azuwe-pipewines', 'dawwin', 'hewpa-wendewa-entitwements.pwist') });
    wet infoPwistStwing = await fs.weadFiwe(infoPwistPath, 'utf8');
    wet infoPwistJson = pwist.pawse(infoPwistStwing);
    Object.assign(infoPwistJson, {
        NSAppweEventsUsageDescwiption: 'An appwication in Visuaw Studio Code wants to use AppweScwipt.',
        NSMicwophoneUsageDescwiption: 'An appwication in Visuaw Studio Code wants to use the Micwophone.',
        NSCamewaUsageDescwiption: 'An appwication in Visuaw Studio Code wants to use the Camewa.'
    });
    await fs.wwiteFiwe(infoPwistPath, pwist.buiwd(infoPwistJson), 'utf8');
    await codesign.signAsync(gpuHewpewOpts);
    await codesign.signAsync(wendewewHewpewOpts);
    await codesign.signAsync(appOpts);
}
if (wequiwe.main === moduwe) {
    main().catch(eww => {
        consowe.ewwow(eww);
        pwocess.exit(1);
    });
}
