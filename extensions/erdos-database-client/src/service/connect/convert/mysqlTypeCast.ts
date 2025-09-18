import { FieldPacket } from 'mysql2/promise';
import * as sqlstring from 'sqlstring';
import { bitTypes, geometryTypes, hexTypes, numberTypes } from './resolveType';


// adapted from https://github.com/mysqljs/mysql/blob/master/lib/protocol/Parser.js
// changes:
// - cleaned up to use const/let + types
// - reduced duplication
// - made it return a string rather than an object/array
function parseGeometryValue(buffer: Buffer): string {
    let offset = 4;

    const geomConstructors = {
        1: 'POINT',
        2: 'LINESTRING',
        3: 'POLYGON',
        4: 'MULTIPOINT',
        5: 'MULTILINESTRING',
        6: 'MULTIPOLYGON',
        7: 'GEOMETRYCOLLECTION',
    };

    function readDouble(byteOrder: number): number {
        /* istanbul ignore next */ // ignore coverage for this line as it depends on internal db config
        const val = byteOrder
            ? buffer.readDoubleLE(offset)
            : buffer.readDoubleBE(offset);
        offset += 8;

        return val;
    }
    function readUInt32(byteOrder: number): number {
        /* istanbul ignore next */ // ignore coverage for this line as it depends on internal db config
        const val = byteOrder
            ? buffer.readUInt32LE(offset)
            : buffer.readUInt32BE(offset);
        offset += 4;

        return val;
    }

    function parseGeometry(): string {
        let result: Array<string> = [];

        const byteOrder = buffer.readUInt8(offset);
        offset += 1;

        const wkbType = readUInt32(byteOrder);

        switch (wkbType) {
            case 1: {
                // WKBPoint - POINT(1 1)
                const x = readDouble(byteOrder);
                const y = readDouble(byteOrder);
                result.push(`${x} ${y}`);
                break;
            }

            case 2: {
                // WKBLineString - LINESTRING(0 0,1 1,2 2)
                const numPoints = readUInt32(byteOrder);
                result = [];
                for (let i = numPoints; i > 0; i -= 1) {
                    const x = readDouble(byteOrder);
                    const y = readDouble(byteOrder);
                    result.push(`${x} ${y}`);
                }
                break;
            }

            case 3: {
                // WKBPolygon - POLYGON((0 0,10 0,10 10,0 10,0 0),(5 5,7 5,7 7,5 7, 5 5))
                const numRings = readUInt32(byteOrder);
                result = [];
                for (let i = numRings; i > 0; i -= 1) {
                    const numPoints = readUInt32(byteOrder);
                    const line: Array<string> = [];
                    for (let j = numPoints; j > 0; j -= 1) {
                        const x = readDouble(byteOrder);
                        const y = readDouble(byteOrder);
                        line.push(`${x} ${y}`);
                    }
                    result.push(`(${line.join(',')})`);
                }
                break;
            }

            case 4: // WKBMultiPoint
            case 5: // WKBMultiLineString
            case 6: // WKBMultiPolygon
            case 7: {
                // WKBGeometryCollection - GEOMETRYCOLLECTION(POINT(1 1),LINESTRING(0 0,1 1,2 2,3 3,4 4))
                const num = readUInt32(byteOrder);
                result = [];
                for (let i = num; i > 0; i -= 1) {
                    let geom = parseGeometry();
                    // remove the function name from the sub geometry declaration from the multi declaration
                    switch (wkbType) {
                        case 4: // WKBMultiPoint
                            // multipoint = MULTIPOINT(\d+ \d+, \d+ \d+....)
                            geom = geom.replace(/POINT\((.+)\)/, '$1');
                            break;

                        case 5: // WKBMultiLineString
                            geom = geom.replace('LINESTRING', '');
                            break;

                        case 6: // WKBMultiPolygon
                            geom = geom.replace('POLYGON', '');
                            break;
                    }
                    result.push(geom);
                }
                break;
            } // this case shouldn't happen ever

            /* istanbul ignore next */ default:
                throw new Error(`Unexpected WKBGeometry Type: ${wkbType}`);
        }

        return `${geomConstructors[wkbType]}(${result.join(',')})`;
    }

    return `GeomFromText('${parseGeometry()}')`;
}

export function dumpTypeCast(field: any): string {
    if (geometryTypes.has(field.type)) {
        const buf = field.buffer();
        return buf ? parseGeometryValue(buf) : null;
    } else if (numberTypes.has(field.type)) {
        const result = field.string();
        return result == null ? 'NULL' : result;
    } else if (bitTypes.has(field.type)) {
        const buf = field.buffer();
        return buf ? `${buf[0]}` : null;
    } else if (hexTypes.has(field.type)) {
        return sqlstring.escape(field.buffer());
    } else {
        return sqlstring.escape(field.string());
    }
}