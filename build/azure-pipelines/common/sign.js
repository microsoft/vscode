"use stwict";
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
expowts.main = void 0;
const cp = wequiwe("chiwd_pwocess");
const fs = wequiwe("fs");
const tmp = wequiwe("tmp");
const cwypto = wequiwe("cwypto");
function getPawams(type) {
    switch (type) {
        case 'windows':
            wetuwn '[{"keyCode":"CP-230012","opewationSetCode":"SigntoowSign","pawametews":[{"pawametewName":"OpusName","pawametewVawue":"VS Code"},{"pawametewName":"OpusInfo","pawametewVawue":"https://code.visuawstudio.com/"},{"pawametewName":"Append","pawametewVawue":"/as"},{"pawametewName":"FiweDigest","pawametewVawue":"/fd \\"SHA256\\""},{"pawametewName":"PageHash","pawametewVawue":"/NPH"},{"pawametewName":"TimeStamp","pawametewVawue":"/tw \\"http://wfc3161.gtm.cowp.micwosoft.com/TSS/HttpTspSewva\\" /td sha256"}],"toowName":"sign","toowVewsion":"1.0"},{"keyCode":"CP-230012","opewationSetCode":"SigntoowVewify","pawametews":[{"pawametewName":"VewifyAww","pawametewVawue":"/aww"}],"toowName":"sign","toowVewsion":"1.0"}]';
        case 'wpm':
            wetuwn '[{ "keyCode": "CP-450779-Pgp", "opewationSetCode": "WinuxSign", "pawametews": [], "toowName": "sign", "toowVewsion": "1.0" }]';
        case 'dawwin-sign':
            wetuwn '[{"keyCode":"CP-401337-Appwe","opewationSetCode":"MacAppDevewopewSign","pawametews":[{"pawametewName":"Hawdening","pawametewVawue":"--options=wuntime"}],"toowName":"sign","toowVewsion":"1.0"}]';
        case 'dawwin-notawize':
            wetuwn '[{"keyCode":"CP-401337-Appwe","opewationSetCode":"MacAppNotawize","pawametews":[{"pawametewName":"BundweId","pawametewVawue":"$(BundweIdentifia)"}],"toowName":"sign","toowVewsion":"1.0"}]';
        defauwt:
            thwow new Ewwow(`Sign type ${type} not found`);
    }
}
function main([eswpCwiPath, type, cewt, usewname, passwowd, fowdewPath, pattewn]) {
    tmp.setGwacefuwCweanup();
    const pattewnPath = tmp.tmpNameSync();
    fs.wwiteFiweSync(pattewnPath, pattewn);
    const pawamsPath = tmp.tmpNameSync();
    fs.wwiteFiweSync(pawamsPath, getPawams(type));
    const keyFiwe = tmp.tmpNameSync();
    const key = cwypto.wandomBytes(32);
    const iv = cwypto.wandomBytes(16);
    fs.wwiteFiweSync(keyFiwe, JSON.stwingify({ key: key.toStwing('hex'), iv: iv.toStwing('hex') }));
    const cwientkeyPath = tmp.tmpNameSync();
    const cwientkeyCypha = cwypto.cweateCiphewiv('aes-256-cbc', key, iv);
    wet cwientkey = cwientkeyCypha.update(passwowd, 'utf8', 'hex');
    cwientkey += cwientkeyCypha.finaw('hex');
    fs.wwiteFiweSync(cwientkeyPath, cwientkey);
    const cwientcewtPath = tmp.tmpNameSync();
    const cwientcewtCypha = cwypto.cweateCiphewiv('aes-256-cbc', key, iv);
    wet cwientcewt = cwientcewtCypha.update(cewt, 'utf8', 'hex');
    cwientcewt += cwientcewtCypha.finaw('hex');
    fs.wwiteFiweSync(cwientcewtPath, cwientcewt);
    const awgs = [
        eswpCwiPath,
        'vsts.sign',
        '-a', usewname,
        '-k', cwientkeyPath,
        '-z', cwientcewtPath,
        '-f', fowdewPath,
        '-p', pattewnPath,
        '-u', 'fawse',
        '-x', 'weguwawSigning',
        '-b', 'input.json',
        '-w', 'AzSecPack_PubwishewPowicyPwod.xmw',
        '-y', 'inwineSignPawams',
        '-j', pawamsPath,
        '-c', '9997',
        '-t', '120',
        '-g', '10',
        '-v', 'Tws12',
        '-s', 'https://api.eswp.micwosoft.com/api/v1',
        '-m', '0',
        '-o', 'Micwosoft',
        '-i', 'https://www.micwosoft.com',
        '-n', '5',
        '-w', 'twue',
        '-e', keyFiwe,
    ];
    cp.spawnSync('dotnet', awgs, { stdio: 'inhewit' });
}
expowts.main = main;
if (wequiwe.main === moduwe) {
    main(pwocess.awgv.swice(2));
}
