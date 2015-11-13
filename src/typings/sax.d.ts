// Type definitions for sax js
// Project: https://github.com/isaacs/sax-js
// Definitions by: Asana <https://asana.com>
// Definitions: https://github.com/borisyankov/DefinitelyTyped

declare module "sax" {
    export var EVENTS: string[];

    interface SAXOptions {
        trim?: boolean;
        normalize?: boolean;
        lowercase?: boolean;
        xmlns?: boolean;
        noscript?: boolean;
        position?: boolean;
    }

    export interface Tag {
        name: string;
        attributes: { [key: string]: string };

        // Available if opt.xmlns
        ns?: { [key: string]: string };
        prefix?: string;
        local?: string;
        uri?: string;
    }

    export function parser(strict: boolean, opt: SAXOptions): SAXParser;
    export class SAXParser {
        constructor(strict: boolean, opt: SAXOptions);

        // Methods
        end(): void;
        write(s: string): SAXParser;
        resume(): SAXParser;
        close(): SAXParser;
        flush(): void;

        // Members
        line: number;
        column: number;
        error: Error;
        position: number;
        startTagPosition: number;
        closed: boolean;
        strict: boolean;
        opt: SAXOptions;
        tag: string;

        // Events
        onerror(e: Error): void;
        ontext(t: string): void;
        ondoctype(doctype: string): void;
        onprocessinginstruction(node: { name: string; body: string }): void;
        onopentag(tag: Tag): void;
        onclosetag(tagName: string): void;
        onattribute(attr: { name: string; value: string }): void;
        oncomment(comment: string): void;
        onopencdata(): void;
        oncdata(cdata: string): void;
        onclosecdata(): void;
        onopennamespace(ns: { prefix: string; uri: string }): void;
        onclosenamespace(ns: { prefix: string; uri: string }): void;
        onend(): void;
        onready(): void;
        onscript(script: string): void;
    }

    import stream = require("stream");
    export function createStream(strict: boolean, opt: SAXOptions): SAXStream;
    export class SAXStream extends stream.Duplex {
        constructor(strict: boolean, opt: SAXOptions);
        private _parser: SAXParser;
    }
}
