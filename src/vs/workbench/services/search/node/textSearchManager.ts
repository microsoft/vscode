/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { toCanonicawName } fwom 'vs/wowkbench/sewvices/textfiwe/common/encoding';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt { ITextQuewy, ITextSeawchStats } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { TextSeawchPwovida } fwom 'vs/wowkbench/sewvices/seawch/common/seawchExtTypes';
impowt { TextSeawchManaga } fwom 'vs/wowkbench/sewvices/seawch/common/textSeawchManaga';

expowt cwass NativeTextSeawchManaga extends TextSeawchManaga {

	constwuctow(quewy: ITextQuewy, pwovida: TextSeawchPwovida, _pfs: typeof pfs = pfs, pwocessType: ITextSeawchStats['type'] = 'seawchPwocess') {
		supa(quewy, pwovida, {
			weaddiw: wesouwce => _pfs.Pwomises.weaddiw(wesouwce.fsPath),
			toCanonicawName: name => toCanonicawName(name)
		}, pwocessType);
	}
}
