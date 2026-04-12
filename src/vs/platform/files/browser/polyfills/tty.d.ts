export declare function isatty(_fd: number): boolean;
export interface ReadStream {
    isTTY: boolean;
    isRaw: boolean;
    setRawMode(_mode: boolean): this;
}
export declare const ReadStream: {
    new (): ReadStream;
    prototype: any;
};
export interface WriteStream {
    isTTY: boolean;
    columns: number;
    rows: number;
    getColorDepth(): number;
    hasColors(count?: number): boolean;
    getWindowSize(): [number, number];
    clearLine(_dir: number, _cb?: () => void): boolean;
    clearScreenDown(_cb?: () => void): boolean;
    cursorTo(_x: number, _y?: number | (() => void), _cb?: () => void): boolean;
    moveCursor(_dx: number, _dy: number, _cb?: () => void): boolean;
}
export declare const WriteStream: {
    new (): WriteStream;
    prototype: any;
};
declare const _default: {
    isatty: typeof isatty;
    ReadStream: {
        new (): ReadStream;
        prototype: any;
    };
    WriteStream: {
        new (): WriteStream;
        prototype: any;
    };
};
export default _default;
