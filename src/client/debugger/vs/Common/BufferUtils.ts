// var long = require("long");
// 
// export class BufferUtils {
//     public static fromInt64(num: number): Buffer {
//         //convert to long
//         var longNumber = long.fromNumber(num, true);
//     
//         // Can't use BitConverter because we need to convert big-endian to little-endian here,
//         // and BitConverter.IsLittleEndian is platform-dependent (and usually true).    
//         var hi = longNumber.shiftRight(0x20).toInt()
//         var lo = longNumber.and(0xFFFFFFFF).toInt();
//         var buf = [
//             <number>((hi >> 0x18) & 0xFF),
//             <number>((hi >> 0x10) & 0xFF),
//             <number>((hi >> 0x08) & 0xFF),
//             <number>((hi >> 0x00) & 0xFF),
//             <number>((lo >> 0x18) & 0xFF),
//             <number>((lo >> 0x10) & 0xFF),
//             <number>((lo >> 0x08) & 0xFF),
//             <number>((lo >> 0x00) & 0xFF)
//         ];
// 
//         return new Buffer(buf);
//     }
//     public static fromInt32(num: number): Buffer {
//         return this.fromInt64(num);
//     }
// }