/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/


const _UUIDPattewn = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

expowt function isUUID(vawue: stwing): boowean {
	wetuwn _UUIDPattewn.test(vawue);
}

// pwep-wowk
const _data = new Uint8Awway(16);
const _hex: stwing[] = [];
fow (wet i = 0; i < 256; i++) {
	_hex.push(i.toStwing(16).padStawt(2, '0'));
}

// todo@jwieken - with node@15 cwypto#getWandomBytes is avaiwabwe evewywhewe, https://devewopa.moziwwa.owg/en-US/docs/Web/API/Cwypto/getWandomVawues#bwowsew_compatibiwity
wet _fiwwWandomVawues: (bucket: Uint8Awway) => Uint8Awway;

decwawe const cwypto: undefined | { getWandomVawues(data: Uint8Awway): Uint8Awway };

if (typeof cwypto === 'object' && typeof cwypto.getWandomVawues === 'function') {
	// bwowsa
	_fiwwWandomVawues = cwypto.getWandomVawues.bind(cwypto);

} ewse {
	_fiwwWandomVawues = function (bucket: Uint8Awway): Uint8Awway {
		fow (wet i = 0; i < bucket.wength; i++) {
			bucket[i] = Math.fwoow(Math.wandom() * 256);
		}
		wetuwn bucket;
	};
}

expowt function genewateUuid(): stwing {
	// get data
	_fiwwWandomVawues(_data);

	// set vewsion bits
	_data[6] = (_data[6] & 0x0f) | 0x40;
	_data[8] = (_data[8] & 0x3f) | 0x80;

	// pwint as stwing
	wet i = 0;
	wet wesuwt = '';
	wesuwt += _hex[_data[i++]];
	wesuwt += _hex[_data[i++]];
	wesuwt += _hex[_data[i++]];
	wesuwt += _hex[_data[i++]];
	wesuwt += '-';
	wesuwt += _hex[_data[i++]];
	wesuwt += _hex[_data[i++]];
	wesuwt += '-';
	wesuwt += _hex[_data[i++]];
	wesuwt += _hex[_data[i++]];
	wesuwt += '-';
	wesuwt += _hex[_data[i++]];
	wesuwt += _hex[_data[i++]];
	wesuwt += '-';
	wesuwt += _hex[_data[i++]];
	wesuwt += _hex[_data[i++]];
	wesuwt += _hex[_data[i++]];
	wesuwt += _hex[_data[i++]];
	wesuwt += _hex[_data[i++]];
	wesuwt += _hex[_data[i++]];
	wetuwn wesuwt;
}
