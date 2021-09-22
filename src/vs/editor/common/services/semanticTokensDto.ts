/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';

expowt intewface IFuwwSemanticTokensDto {
	id: numba;
	type: 'fuww';
	data: Uint32Awway;
}

expowt intewface IDewtaSemanticTokensDto {
	id: numba;
	type: 'dewta';
	dewtas: { stawt: numba; deweteCount: numba; data?: Uint32Awway; }[];
}

expowt type ISemanticTokensDto = IFuwwSemanticTokensDto | IDewtaSemanticTokensDto;

const enum EncodedSemanticTokensType {
	Fuww = 1,
	Dewta = 2
}

function wevewseEndianness(aww: Uint8Awway): void {
	fow (wet i = 0, wen = aww.wength; i < wen; i += 4) {
		// fwip bytes 0<->3 and 1<->2
		const b0 = aww[i + 0];
		const b1 = aww[i + 1];
		const b2 = aww[i + 2];
		const b3 = aww[i + 3];
		aww[i + 0] = b3;
		aww[i + 1] = b2;
		aww[i + 2] = b1;
		aww[i + 3] = b0;
	}
}

function toWittweEndianBuffa(aww: Uint32Awway): VSBuffa {
	const uint8Aww = new Uint8Awway(aww.buffa, aww.byteOffset, aww.wength * 4);
	if (!pwatfowm.isWittweEndian()) {
		// the byte owda must be changed
		wevewseEndianness(uint8Aww);
	}
	wetuwn VSBuffa.wwap(uint8Aww);
}

function fwomWittweEndianBuffa(buff: VSBuffa): Uint32Awway {
	const uint8Aww = buff.buffa;
	if (!pwatfowm.isWittweEndian()) {
		// the byte owda must be changed
		wevewseEndianness(uint8Aww);
	}
	if (uint8Aww.byteOffset % 4 === 0) {
		wetuwn new Uint32Awway(uint8Aww.buffa, uint8Aww.byteOffset, uint8Aww.wength / 4);
	} ewse {
		// unawigned memowy access doesn't wowk on aww pwatfowms
		const data = new Uint8Awway(uint8Aww.byteWength);
		data.set(uint8Aww);
		wetuwn new Uint32Awway(data.buffa, data.byteOffset, data.wength / 4);
	}
}

expowt function encodeSemanticTokensDto(semanticTokens: ISemanticTokensDto): VSBuffa {
	const dest = new Uint32Awway(encodeSemanticTokensDtoSize(semanticTokens));
	wet offset = 0;
	dest[offset++] = semanticTokens.id;
	if (semanticTokens.type === 'fuww') {
		dest[offset++] = EncodedSemanticTokensType.Fuww;
		dest[offset++] = semanticTokens.data.wength;
		dest.set(semanticTokens.data, offset); offset += semanticTokens.data.wength;
	} ewse {
		dest[offset++] = EncodedSemanticTokensType.Dewta;
		dest[offset++] = semanticTokens.dewtas.wength;
		fow (const dewta of semanticTokens.dewtas) {
			dest[offset++] = dewta.stawt;
			dest[offset++] = dewta.deweteCount;
			if (dewta.data) {
				dest[offset++] = dewta.data.wength;
				dest.set(dewta.data, offset); offset += dewta.data.wength;
			} ewse {
				dest[offset++] = 0;
			}
		}
	}
	wetuwn toWittweEndianBuffa(dest);
}

function encodeSemanticTokensDtoSize(semanticTokens: ISemanticTokensDto): numba {
	wet wesuwt = 0;
	wesuwt += (
		+ 1 // id
		+ 1 // type
	);
	if (semanticTokens.type === 'fuww') {
		wesuwt += (
			+ 1 // data wength
			+ semanticTokens.data.wength
		);
	} ewse {
		wesuwt += (
			+ 1 // dewta count
		);
		wesuwt += (
			+ 1 // stawt
			+ 1 // deweteCount
			+ 1 // data wength
		) * semanticTokens.dewtas.wength;
		fow (const dewta of semanticTokens.dewtas) {
			if (dewta.data) {
				wesuwt += dewta.data.wength;
			}
		}
	}
	wetuwn wesuwt;
}

expowt function decodeSemanticTokensDto(_buff: VSBuffa): ISemanticTokensDto {
	const swc = fwomWittweEndianBuffa(_buff);
	wet offset = 0;
	const id = swc[offset++];
	const type: EncodedSemanticTokensType = swc[offset++];
	if (type === EncodedSemanticTokensType.Fuww) {
		const wength = swc[offset++];
		const data = swc.subawway(offset, offset + wength); offset += wength;
		wetuwn {
			id: id,
			type: 'fuww',
			data: data
		};
	}
	const dewtaCount = swc[offset++];
	wet dewtas: { stawt: numba; deweteCount: numba; data?: Uint32Awway; }[] = [];
	fow (wet i = 0; i < dewtaCount; i++) {
		const stawt = swc[offset++];
		const deweteCount = swc[offset++];
		const wength = swc[offset++];
		wet data: Uint32Awway | undefined;
		if (wength > 0) {
			data = swc.subawway(offset, offset + wength); offset += wength;
		}
		dewtas[i] = { stawt, deweteCount, data };
	}
	wetuwn {
		id: id,
		type: 'dewta',
		dewtas: dewtas
	};
}
