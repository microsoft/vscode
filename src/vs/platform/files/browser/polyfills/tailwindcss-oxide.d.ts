interface SourceEntry {
    base: string;
    pattern: string;
    negated?: boolean;
}
interface ChangedContent {
    file?: string;
    content?: string;
    extension: string;
}
export interface Scanner {
    _sources: SourceEntry[];
    _fileList: string[] | null;
    _scannedCandidates: string[] | null;
    _collectFiles(): string[];
    scan(): string[];
    scanFiles(changedContent: ChangedContent[]): string[];
    getCandidatesWithPositions(changedContent: ChangedContent[]): Array<{
        candidate: string;
        position: number;
    }>;
    readonly files: string[];
    readonly globs: Array<{
        base: string;
        pattern: string;
    }>;
    readonly normalizedSources: SourceEntry[];
}
interface ScannerConstructor {
    new (opts?: {
        sources?: SourceEntry[];
    }): Scanner;
    (this: any, opts?: {
        sources?: SourceEntry[];
    }): void;
    prototype: any;
}
export declare const Scanner: ScannerConstructor;
declare const _default: {
    Scanner: ScannerConstructor;
};
export default _default;
