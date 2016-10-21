// Type definitions for chalk v0.4.0
// Project: https://github.com/sindresorhus/chalk
// Definitions by: Diullei Gomes <https://github.com/Diullei>, Bart van der Schoor <https://github.com/Bartvds>, Nico Jansen <https://github.com/nicojs>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare namespace Chalk {

    export var enabled: boolean;
    export var supportsColor: boolean;
    export var styles: ChalkStyleMap;

    export function stripColor(value: string): any;
    export function hasColor(str: string): boolean;

    export interface ChalkChain extends ChalkStyle {
        (...text: string[]): string;
    }

    export interface ChalkStyleElement {
        open: string;
        close: string;
    }

    // General
    export var reset: ChalkChain;
    export var bold: ChalkChain;
    export var italic: ChalkChain;
    export var underline: ChalkChain;
    export var inverse: ChalkChain;
    export var strikethrough: ChalkChain;

    // Text colors
    export var black: ChalkChain;
    export var red: ChalkChain;
    export var green: ChalkChain;
    export var yellow: ChalkChain;
    export var blue: ChalkChain;
    export var magenta: ChalkChain;
    export var cyan: ChalkChain;
    export var white: ChalkChain;
    export var gray: ChalkChain;
    export var grey: ChalkChain;

    // Background colors
    export var bgBlack: ChalkChain;
    export var bgRed: ChalkChain;
    export var bgGreen: ChalkChain;
    export var bgYellow: ChalkChain;
    export var bgBlue: ChalkChain;
    export var bgMagenta: ChalkChain;
    export var bgCyan: ChalkChain;
    export var bgWhite: ChalkChain;


    export interface ChalkStyle {
        // General
        reset: ChalkChain;
        bold: ChalkChain;
        italic: ChalkChain;
        underline: ChalkChain;
        inverse: ChalkChain;
        strikethrough: ChalkChain;

        // Text colors
        black: ChalkChain;
        red: ChalkChain;
        green: ChalkChain;
        yellow: ChalkChain;
        blue: ChalkChain;
        magenta: ChalkChain;
        cyan: ChalkChain;
        white: ChalkChain;
        gray: ChalkChain;
        grey: ChalkChain;

        // Background colors
        bgBlack: ChalkChain;
        bgRed: ChalkChain;
        bgGreen: ChalkChain;
        bgYellow: ChalkChain;
        bgBlue: ChalkChain;
        bgMagenta: ChalkChain;
        bgCyan: ChalkChain;
        bgWhite: ChalkChain;
    }

    export interface ChalkStyleMap {
        // General
        reset: ChalkStyleElement;
        bold: ChalkStyleElement;
        italic: ChalkStyleElement;
        underline: ChalkStyleElement;
        inverse: ChalkStyleElement;
        strikethrough: ChalkStyleElement;

        // Text colors
        black: ChalkStyleElement;
        red: ChalkStyleElement;
        green: ChalkStyleElement;
        yellow: ChalkStyleElement;
        blue: ChalkStyleElement;
        magenta: ChalkStyleElement;
        cyan: ChalkStyleElement;
        white: ChalkStyleElement;
        gray: ChalkStyleElement;

        // Background colors
        bgBlack: ChalkStyleElement;
        bgRed: ChalkStyleElement;
        bgGreen: ChalkStyleElement;
        bgYellow: ChalkStyleElement;
        bgBlue: ChalkStyleElement;
        bgMagenta: ChalkStyleElement;
        bgCyan: ChalkStyleElement;
        bgWhite: ChalkStyleElement;
    }
}

declare module "chalk" {
    export = Chalk;
}
