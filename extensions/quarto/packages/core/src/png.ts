/*
 * png.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 * Copyright (C) 2020 by mel-mouk@achiev (ISC license):
 *  https://github.com/achiev-open/png-decoder-intro
 * Copyright (C) 2017 by Michael Wang (ISC license):
 *  https://github.com/MWGitHub/basic-loaders/blob/master/src/png/byte-converter.js
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */


export class PngImage {
  public content: Array<Uint8Array> = [];

  public width = -1;
  public height = -1;
  public dpiX = -1;
  public dpiY = -1;
  public isHighDpi = false;
  private bitDepth = -1;
  private colourType = -1;
  private compressionMethod = -1;
  private filterMethod = -1;
  private interlaceMethod = -1;

  constructor(bytes: Uint8Array, sizeOnly = true) {
    const magicNumberBytes = bytes.slice(0, 8);
    const magicNumber = bytesToString(magicNumberBytes);
    if (magicNumber !== "13780787113102610") {
      throw new Error("Not a png file");
    }

    let pos = 8;
    while (pos < bytes.length) {
      const chunk = new PngChunk(bytes.slice(pos));

      switch (chunk.type) {
        case "IHDR":
          this.parseIHDRChunk(chunk, sizeOnly);
          break;
        case "pHYs":
          this.parsePHYSChunk(chunk);
          break;
        case "IDAT": // image data, time to go
          return;
      }
      // We will parse the data here depending on the chunk type
      pos += chunk.totalLength;
    }
  }

  private parseIHDRChunk(chunk: PngChunk, sizeOnly: boolean) {
    this.width = bytesToUint32(chunk.data, 0, 4);
    this.height = bytesToUint32(chunk.data, 4, 4);

    if (sizeOnly) {
      return;
    }

    // we noticed that some pngs weren't able to yield all of these
    // fields (specifically one didn't have colourType). for now
    // we don't try to read them by default -- leave the code here
    // though in case we need it at some point
    this.bitDepth = chunk.data.slice(8, 9)[0];
    if (this.bitDepth !== 8) {
      throw new Error("bitDepth not supported");
    }

    this.colourType = chunk.data.slice(9, 10)[0];
    if (this.colourType !== 6) {
      throw new Error("colourType not supported");
    }

    this.compressionMethod = chunk.data.slice(10, 11)[0];
    if (this.compressionMethod !== 0) {
      throw new Error("compressionMethod not supported");
    }

    this.filterMethod = chunk.data.slice(11, 12)[0];
    if (this.filterMethod !== 0) {
      throw new Error("filterMethod not supported");
    }

    this.interlaceMethod = chunk.data.slice(12, 13)[0];
    if (this.interlaceMethod !== 0) {
      throw new Error("Interlacing not supported");
    }
  }

  private parsePHYSChunk(chunk: PngChunk) {
    const meter = chunk.data[8];
    if (meter === 1) {
      const x = bytesToUint32(chunk.data, 0, 4);
      const y = bytesToUint32(chunk.data, 4, 4);
      const kMetersPerInch = 0.0254;
      this.dpiX = Math.round(x * kMetersPerInch);
      this.dpiY = Math.round(y * kMetersPerInch);
      this.isHighDpi = this.dpiX === 144 || this.dpiX === 192;
    }
  }
}

class PngChunk {
  public totalLength: number;
  public dataLength: number;
  public type: string;
  public data: Uint8Array;
  public crc: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.dataLength = this.getLength(bytes);
    this.type = this.getType(bytes);
    this.data = this.getData(bytes);
    this.crc = this.getCRC(bytes);
    this.totalLength = this.dataLength + 12;
  }

  private getLength(bytes: Uint8Array): number {
    const lengthBytes: Uint8Array = bytes.slice(0, 4);
    return bytesToUint32(lengthBytes);
  }

  private getType(bytes: Uint8Array): string {
    const typeByte: Uint8Array = bytes.slice(4, 8);
    return new TextDecoder("ascii").decode(typeByte);
  }

  private getData(bytes: Uint8Array): Uint8Array {
    return bytes.slice(8, 8 + this.dataLength);
  }

  private getCRC(bytes: Uint8Array): Uint8Array {
    return bytes.slice(8 + this.dataLength, 8 + this.dataLength + 4);
  }
}

const MAX_SIGNIFICANT_SIZE = 127;

function bytesToUint32(byteArray: Uint8Array, start = 0, count?: number) {
  if (count === undefined) {
    count = byteArray.length;
  }

  if (count > 4) {
    throw new Error("Length cannot be greater than 4");
  }

  let position = start;
  let value = 0;

  if (count === 4) {
    let sigValue = byteArray[position];

    if (sigValue > MAX_SIGNIFICANT_SIZE) {
      value += MAX_SIGNIFICANT_SIZE << 24;
      sigValue -= MAX_SIGNIFICANT_SIZE;
    }
    value += sigValue << 24;
    position++;
  }

  for (let i = position; i < start + count; i++) {
    value += byteArray[i] << (8 * (count - (i - start) - 1));
  }

  return value;
}

function bytesToString(byteArray: Uint8Array, start = 0, count?: number) {
  if (count === undefined) {
    count = byteArray.length;
  }

  let result = "";
  for (let i = start; i < start + count; i++) {
    const byte = byteArray[i];

    if (byte === 0) {
      result += "00";
    } else if (byte < 10) {
      result += `0${byte.toString()}`;
    } else {
      result += byte.toString();
    }
  }

  return result;
}
