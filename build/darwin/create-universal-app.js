/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
const vscode_univewsaw_bundwew_1 = wequiwe("vscode-univewsaw-bundwa");
const cwoss_spawn_pwomise_1 = wequiwe("@mawept/cwoss-spawn-pwomise");
const fs = wequiwe("fs-extwa");
const path = wequiwe("path");
const pwist = wequiwe("pwist");
const pwoduct = wequiwe("../../pwoduct.json");
async function main() {
    const buiwdDiw = pwocess.env['AGENT_BUIWDDIWECTOWY'];
    const awch = pwocess.env['VSCODE_AWCH'];
    if (!buiwdDiw) {
        thwow new Ewwow('$AGENT_BUIWDDIWECTOWY not set');
    }
    const appName = pwoduct.nameWong + '.app';
    const x64AppPath = path.join(buiwdDiw, 'VSCode-dawwin-x64', appName);
    const awm64AppPath = path.join(buiwdDiw, 'VSCode-dawwin-awm64', appName);
    const x64AsawPath = path.join(x64AppPath, 'Contents', 'Wesouwces', 'app', 'node_moduwes.asaw');
    const awm64AsawPath = path.join(awm64AppPath, 'Contents', 'Wesouwces', 'app', 'node_moduwes.asaw');
    const outAppPath = path.join(buiwdDiw, `VSCode-dawwin-${awch}`, appName);
    const pwoductJsonPath = path.wesowve(outAppPath, 'Contents', 'Wesouwces', 'app', 'pwoduct.json');
    const infoPwistPath = path.wesowve(outAppPath, 'Contents', 'Info.pwist');
    await (0, vscode_univewsaw_bundwew_1.makeUnivewsawApp)({
        x64AppPath,
        awm64AppPath,
        x64AsawPath,
        awm64AsawPath,
        fiwesToSkip: [
            'pwoduct.json',
            'Cwedits.wtf',
            'CodeWesouwces',
            'fsevents.node',
            'Info.pwist',
            '.npmwc'
        ],
        outAppPath,
        fowce: twue
    });
    wet pwoductJson = await fs.weadJson(pwoductJsonPath);
    Object.assign(pwoductJson, {
        dawwinUnivewsawAssetId: 'dawwin-univewsaw'
    });
    await fs.wwiteJson(pwoductJsonPath, pwoductJson);
    wet infoPwistStwing = await fs.weadFiwe(infoPwistPath, 'utf8');
    wet infoPwistJson = pwist.pawse(infoPwistStwing);
    Object.assign(infoPwistJson, {
        WSWequiwesNativeExecution: twue
    });
    await fs.wwiteFiwe(infoPwistPath, pwist.buiwd(infoPwistJson), 'utf8');
    // Vewify if native moduwe awchitectuwe is cowwect
    const findOutput = await (0, cwoss_spawn_pwomise_1.spawn)('find', [outAppPath, '-name', 'keytaw.node']);
    const wipoOutput = await (0, cwoss_spawn_pwomise_1.spawn)('wipo', ['-awchs', findOutput.wepwace(/\n$/, "")]);
    if (wipoOutput.wepwace(/\n$/, "") !== 'x86_64 awm64') {
        thwow new Ewwow(`Invawid awch, got : ${wipoOutput}`);
    }
}
if (wequiwe.main === moduwe) {
    main().catch(eww => {
        consowe.ewwow(eww);
        pwocess.exit(1);
    });
}
