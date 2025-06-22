// This section defines all of the different ways we can display the various values
// in the waveform viewer. To create your own format, you need to implement a new
// ValueFormat object and add it to the valueFormatList array at the bottom of the file.
// There are helper functions supplied to discern 9-state values and to format as binary
// in case non-2-state values are invalid.
// You will also need to define a new command in the package.json file (which has examples)
// under contributes.commands and create the context menus entries under 
// contributes.menus.vaporview.valueFormat. You will also need to register the new
// command in the extension.ts (which has examples)

export function  valueIs9State(value: string): boolean {
  if (value.match(/[uxzwlh-]/)) {return true;}
  return false;
}

function formatBinaryString(inputString: string) {
  return inputString.replace(/\B(?=(\w{4})+(?!\w))/g, "_");
}

function signedBinaryStringToInt(inputString: string) {
  const isNegative = inputString[0] === '1';
  let result = parseInt(inputString, 2);
  if (isNegative) {
    result -= Math.pow(2, inputString.length);
  }
  return result;
}

function formatBinaryStringFloat9State(inputString: string, exponentBits: number, mantissaBits: number) {
  const sign = inputString[0];
  const exponent = inputString.slice(1, 1 + exponentBits);
  const mantissa = inputString.slice(1 + exponentBits);
  return sign + "_" + exponent + "_" + mantissa;
}

function parseBinaryStringAsFloat(inputString: string, exponentBits: number, mantissaBits: number) {
  const sign = inputString[0] === '1' ? -1 : 1;
  const exponent = parseInt(inputString.slice(1, 1 + exponentBits), 2);
  const mantissa = parseInt(inputString.slice(1 + exponentBits), 2);
  // Infinity and NaN
  if (exponent === Math.pow(2, exponentBits) - 1) {
    if (mantissa === 0) {
      return sign * Infinity;
    } else {
      return sign * NaN;
    }
  }
  return sign * Math.pow(2, exponent - (Math.pow(2, exponentBits - 1) - 1)) * (1 + mantissa / Math.pow(2, mantissaBits));
}

function formatFloat(inputString: string, exponentBits: number, mantissaBits: number, is2State: boolean) {
  if (!is2State) {
    return formatBinaryStringFloat9State(inputString, exponentBits, mantissaBits);
  }
  return parseBinaryStringAsFloat(inputString, exponentBits, mantissaBits).toString();
}

// This function checks for a valid number in float format in the search bar
function checkValidFloat(inputText: string) {
  if (inputText.match(/^-?(\d+)?\.?\d+$/)) {return true;}
  if (inputText.match(/^-?Inf(inity)?$/)) {return true;}
  if (inputText.match(/^-?NaN$/)) {return true;}
  return false;
}

// This function parses a number and returns a binary string for searching
function parseFloatForSearch(inputText: string, exponentBits: number, mantissaBits: number,) {
  if (inputText.match(/^-?Inf(inity)?$/)) {
    const sign = inputText[0] === '-' ? '1' : '0';
    return sign + '1'.repeat(exponentBits) + '0'.repeat(mantissaBits);
  }
  if (inputText.match(/^-?NaN$/)) {
    const sign = inputText[0] === '-' ? '1' : '0';
    return sign + '1'.repeat(exponentBits) + '1' + '.'.repeat(mantissaBits - 1);
  }
  const number = parseFloat(inputText);
  const sign = number < 0 ? '1' : '0';
  const absNumber = Math.abs(number);
  const exponent = Math.floor(Math.log2(absNumber));
  const mantissa = absNumber / Math.pow(2, exponent) - 1;
  return sign + exponent.toString(2).padStart(exponentBits, '0') + mantissa.toString(2).slice(2).padEnd(mantissaBits, '0');
}

// #region Value Format Interface
// The interface is defined by the ValueFormat interface:
export interface ValueFormat {
  // Unique identifier for the format
  id: string;

  // If true, the value will be right justified when displayed in a waveform
  rightJustify: boolean;

  // The text to display in the search symbol
  symbolText: string;

  // Function to format the string for display. The input format is an ASCII string of binary values
  // and the output format is a string that will be displayed in the viewer.
  formatString: (value: string, width: number, is2State: boolean) => string;

  // Function to check if the string is valid in the search bar
  checkValid: (value: string) => boolean;

  // Function to parse the value back to a binary string for searching
  parseValueForSearch: (value: string) => string;

  // Function to check if the value is a 9-state value
  is9State: (value: string) => boolean;
}

// #region Format Hexadecimal
export const formatHex: ValueFormat = {
  id: "hexadecimal",
  rightJustify: true,
  symbolText: "hex",

  formatString: (inputString: string, width: number, is2State: boolean) => {
  // If number format is hexadecimal
    if (!is2State) {
      const stringArray = inputString.replace(/\B(?=(.{4})+(?!.))/g, "_").split("_");
      return stringArray.map((chunk) => {

        if (chunk.match(/[z]/)) {return "z";}
        if (chunk.match(/[x]/)) {return "x";}
        if (chunk.match(/[u]/)) {return "u";}
        if (chunk.match(/[w]/)) {return "w";}
        if (chunk.match(/[l]/)) {return "l";}
        if (chunk.match(/[h]/)) {return "h";}
        if (chunk.match(/[-]/)) {return "-";}
        return parseInt(chunk, 2).toString(16);
      }).join('').replace(/\B(?=(.{4})+(?!.))/g, "_");
    } else {
      const stringArray = inputString.replace(/\B(?=(\d{16})+(?!\d))/g, "_").split("_");
      return stringArray.map((chunk) => {
        const digits = Math.ceil(chunk.length / 4);
        return parseInt(chunk, 2).toString(16).padStart(digits, '0');
      }).join('_');
    }
  },

  checkValid: (inputText: string) => {
    if (inputText.match(/^(0x)?[0-9a-fA-FxzXZ_]+$/)) {return true;}
    else {return false;}
  },

  parseValueForSearch: (inputText: string) =>{
    let result = inputText.replace(/_/g, '').replace(/^0x/i, '');
    result = result.split('').map((c) => {
      if (c.match(/[xXzZ]/)) {return '....';}
      return parseInt(c, 16).toString(2).padStart(4, '0');
    }).join('');
    return result;
  },

  is9State: valueIs9State,
};

// #region Format Octal
export const formatOctal: ValueFormat = {
  id: "octal",
  rightJustify: true,
  symbolText: "oct",

  formatString: (inputString: string, width: number, is2State: boolean) => {
  // If number format is hexadecimal
    if (!is2State) {
      const stringArray = inputString.replace(/\B(?=(.{3})+(?!.))/g, "_").split("_");
      return stringArray.map((chunk) => {

        if (chunk.match(/[z]/)) {return "z";}
        if (chunk.match(/[x]/)) {return "x";}
        if (chunk.match(/[u]/)) {return "u";}
        if (chunk.match(/[w]/)) {return "w";}
        if (chunk.match(/[l]/)) {return "l";}
        if (chunk.match(/[h]/)) {return "h";}
        if (chunk.match(/[-]/)) {return "-";}
        return parseInt(chunk, 2).toString(16);
      }).join('');
    } else {
      const stringArray = inputString.replace(/\B(?=(\d{3})+(?!\d))/g, "_").split("_");
      return stringArray.map((chunk) => {
        const digits = Math.ceil(chunk.length / 3);
        return parseInt(chunk, 2).toString(8).padStart(digits, '0');
      }).join('');
    }
  },

  checkValid: (inputText: string) => {
    if (inputText.match(/^[0-7xzXZ_]+$/)) {return true;}
    else {return false;}
  },

  parseValueForSearch: (inputText: string) =>{
    let result = inputText.replace(/_/g, '');
    result = result.split('').map((c) => {
      if (c.match(/[xXzZ]/)) {return '....';}
      return parseInt(c, 8).toString(2).padStart(3, '0');
    }).join('');
    return result;
  },

  is9State: valueIs9State,
};

// #region Format Binary
export const formatBinary: ValueFormat = {
  id: "binary",
  rightJustify: true,
  symbolText: "bin",

  formatString: formatBinaryString,

  checkValid: (inputText: string) => {
    if (inputText.match(/^b?[01xzXZdD_]+$/)) {return true;}
    else {return false;}
  },

  parseValueForSearch:(inputText: string) => {
    return inputText.replace(/_/g, '').replace(/[dD]/g, '.');
  },

  is9State: valueIs9State,
};

// #region Format Decimal
const formatDecimal: ValueFormat = {
  id: "decimal",
  rightJustify: false,
  symbolText: "dec",

  formatString: (inputString: string, width: number, is2State: boolean) => {
    if (!is2State) {
      return formatBinaryString(inputString);
    }
    const numericalData = inputString;
    const stringArray = numericalData.replace(/\B(?=(\d{32})+(?!\d))/g, "_").split("_");
    return stringArray.map((chunk) => {return parseInt(chunk, 2).toString(10);}).join('_');
  },

  checkValid: (inputText: string) => {
    if (inputText.match(/^[0-9xzXZ_,]+$/)) {return true;}
    else {return false;}
  },

  parseValueForSearch: (inputText: string) => {
    const result = inputText.replace(/,/g, '');
    return result.split('_').map((n) => {
      if (n === '') {return '';}
      if (n.match(/[xXzZ]/)) {return '.{32}';}
      return parseInt(n, 10).toString(2).padStart(32, '0');
    }).join('');
  },

  is9State: valueIs9State,
};

// #region Format Signed
const formatSignedInt: ValueFormat = {
  id: "signed",
  rightJustify: false,
  symbolText: "int",

  formatString: (inputString: string, width: number, is2State: boolean) => {
    if (!is2State) {
      return formatBinaryString(inputString);
    }
    return signedBinaryStringToInt(inputString).toString();
  },

  checkValid: (inputText: string) => {
    if (inputText.match(/^-?[0-9xzXZ_,]+$/)) {return true;}
    else {return false;}
  },

  parseValueForSearch: (inputText: string) => {
    const result = inputText.replace(/[,_]/g, '');
    if (inputText[0] === "-") {
      // convert number to 2's complement with the minimum number of bits
      const positive = parseInt(result, 10);
      const positiveBinary = positive.toString(2);
      const length = positiveBinary.length;
      const negativeBinary = (positive + Math.pow(2, length)).toString(2);
      if (negativeBinary.length > length) {return negativeBinary.slice(1);}
      return negativeBinary;
    } else {
      return parseInt(result, 10).toString(2);
    }
  },

  is9State: valueIs9State,
};

// #region Format Float 8
export const formatFloat8: ValueFormat = {
  id: "float8",
  rightJustify: false,
  symbolText: "f8",
  formatString: (inputString: string, width: number, is2State: boolean) => {return formatFloat(inputString, 4, 3, is2State);},
  checkValid: checkValidFloat,
  parseValueForSearch: (inputText: string) => {return parseFloatForSearch(inputText, 4, 3);},
  is9State: valueIs9State,
};

// #region Format Float 16
export const formatFloat16: ValueFormat = {
  id: "float16",
  rightJustify: false,
  symbolText: "f16",
  formatString: (inputString: string, width: number, is2State: boolean) => {return formatFloat(inputString, 5, 10, is2State);},
  checkValid: checkValidFloat,
  parseValueForSearch: (inputText: string) => {return parseFloatForSearch(inputText, 5, 10);},
  is9State: valueIs9State,
};

// #region Format BFloat 16
export const formatBFloat16: ValueFormat = {
  id: "bfloat16",
  rightJustify: false,
  symbolText: "b16",
  formatString: (inputString: string, width: number, is2State: boolean) => {return formatFloat(inputString, 8, 7, is2State);},
  checkValid: checkValidFloat,
  parseValueForSearch: (inputText: string) => {return parseFloatForSearch(inputText, 8, 7);},
  is9State: valueIs9State,
};

// #region TensorFloat 32
export const formatTensorFloat32: ValueFormat = {
  id: "tensorfloat32",
  rightJustify: false,
  symbolText: "t19",
  formatString: (inputString: string, width: number, is2State: boolean) => {return formatFloat(inputString, 8, 10, is2State);},
  checkValid: checkValidFloat,
  parseValueForSearch: (inputText: string) => {return parseFloatForSearch(inputText, 8, 10);},
  is9State: valueIs9State,
};

// #region Format Float 32
export const formatFloat32: ValueFormat = {
  id: "float32",
  rightJustify: false,
  symbolText: "f32",
  formatString: (inputString: string, width: number, is2State: boolean) => {return formatFloat(inputString, 8, 23, is2State);},
  checkValid: checkValidFloat,
  parseValueForSearch: (inputText: string) => {return parseFloatForSearch(inputText, 8, 23);},
  is9State: valueIs9State,
};

// #region Format Float 64
export const formatFloat64: ValueFormat = {
  id: "float64",
  rightJustify: false,
  symbolText: "f64",
  formatString: (inputString: string, width: number, is2State: boolean) => {return formatFloat(inputString, 11, 52, is2State);},
  checkValid: checkValidFloat,
  parseValueForSearch: (inputText: string) => {return parseFloatForSearch(inputText, 11, 52);},
  is9State: valueIs9State,
};

// #region Format String
export const formatString: ValueFormat = {
  id: "string",
  rightJustify: false,
  symbolText: "str",

  formatString: (inputString: string, width: number, is2State: boolean) => {
    return inputString;
  },

  checkValid: (inputText: string) => {
    return true;
  },

  parseValueForSearch: (inputText: string) => {
    return inputText;
  },

  is9State: () => {return false;},
};

export const valueFormatList: ValueFormat[] = [
  formatBinary,
  formatHex,
  formatDecimal,
  formatOctal,
  formatSignedInt,
  formatFloat8,
  formatFloat16,
  formatFloat32,
  formatFloat64,
  formatBFloat16,
  formatTensorFloat32,
  formatString
];

// Profiling code:
//let vectors = []
//for (let i = 0; i < 1; i++) {
//    let s = ""; 
//    for (let i = 0; i < 64; i++) {
//        s += Math.round(Math.random()).toString();
//    }
//    vectors.push(s);
//}
//
//a = performance.now();
//vectors.forEach(v => {formatString(v, 64, true)});
//performance.now() - a