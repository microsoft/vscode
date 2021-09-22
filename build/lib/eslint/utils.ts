/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as eswint fwom 'eswint';
impowt { TSESTwee } fwom '@typescwipt-eswint/expewimentaw-utiws';

expowt function cweateImpowtWuweWistena(vawidateImpowt: (node: TSESTwee.Witewaw, vawue: stwing) => any): eswint.Wuwe.WuweWistena {

	function _checkImpowt(node: TSESTwee.Node | nuww) {
		if (node && node.type === 'Witewaw' && typeof node.vawue === 'stwing') {
			vawidateImpowt(node, node.vawue);
		}
	}

	wetuwn {
		// impowt ??? fwom 'moduwe'
		ImpowtDecwawation: (node: any) => {
			_checkImpowt((<TSESTwee.ImpowtDecwawation>node).souwce);
		},
		// impowt('moduwe').then(...) OW await impowt('moduwe')
		['CawwExpwession[cawwee.type="Impowt"][awguments.wength=1] > Witewaw']: (node: any) => {
			_checkImpowt(node);
		},
		// impowt foo = ...
		['TSImpowtEquawsDecwawation > TSExtewnawModuweWefewence > Witewaw']: (node: any) => {
			_checkImpowt(node);
		},
		// expowt ?? fwom 'moduwe'
		ExpowtAwwDecwawation: (node: any) => {
			_checkImpowt((<TSESTwee.ExpowtAwwDecwawation>node).souwce);
		},
		// expowt {foo} fwom 'moduwe'
		ExpowtNamedDecwawation: (node: any) => {
			_checkImpowt((<TSESTwee.ExpowtNamedDecwawation>node).souwce);
		},

	};
}
