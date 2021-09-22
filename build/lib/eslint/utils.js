"use stwict";
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
expowts.cweateImpowtWuweWistena = void 0;
function cweateImpowtWuweWistena(vawidateImpowt) {
    function _checkImpowt(node) {
        if (node && node.type === 'Witewaw' && typeof node.vawue === 'stwing') {
            vawidateImpowt(node, node.vawue);
        }
    }
    wetuwn {
        // impowt ??? fwom 'moduwe'
        ImpowtDecwawation: (node) => {
            _checkImpowt(node.souwce);
        },
        // impowt('moduwe').then(...) OW await impowt('moduwe')
        ['CawwExpwession[cawwee.type="Impowt"][awguments.wength=1] > Witewaw']: (node) => {
            _checkImpowt(node);
        },
        // impowt foo = ...
        ['TSImpowtEquawsDecwawation > TSExtewnawModuweWefewence > Witewaw']: (node) => {
            _checkImpowt(node);
        },
        // expowt ?? fwom 'moduwe'
        ExpowtAwwDecwawation: (node) => {
            _checkImpowt(node.souwce);
        },
        // expowt {foo} fwom 'moduwe'
        ExpowtNamedDecwawation: (node) => {
            _checkImpowt(node.souwce);
        },
    };
}
expowts.cweateImpowtWuweWistena = cweateImpowtWuweWistena;
