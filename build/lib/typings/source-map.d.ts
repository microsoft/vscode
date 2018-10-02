// Type definitions for source-map v0.1.38
// Project: https://github.com/mozilla/source-map
// Definitions by: Morten Houston Ludvigsen <https://github.com/MortenHoustonLudvigsen>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare namespace SourceMap {
    interface StartOfSourceMap {
        file?: string;
        sourceRoot?: string;
    }

    interface RawSourceMap extends StartOfSourceMap {
        version: string|number;
        sources: Array<string>;
        names: Array<string>;
        sourcesContent?: string[];
        mappings: string;
    }

    interface Position {
        line: number;
        column: number;
    }

    interface MappedPosition extends Position {
        source: string;
        name?: string;
    }

    interface MappingItem {
        source: string;
        generatedLine: number;
        generatedColumn: number;
        originalLine: number;
        originalColumn: number;
        name: string;
    }

    interface Mapping {
        generated: Position;
        original: Position;
        source: string;
        name?: string;
    }

    interface CodeWithSourceMap {
        code: string;
        map: SourceMapGenerator;
    }

    class SourceMapConsumer {
        public static GENERATED_ORDER: number;
        public static ORIGINAL_ORDER: number;

        constructor(rawSourceMap: RawSourceMap);
        public originalPositionFor(generatedPosition: Position): MappedPosition;
        public generatedPositionFor(originalPosition: MappedPosition): Position;
        public sourceContentFor(source: string): string;
        public eachMapping(callback: (mapping: MappingItem) => void, context?: any, order?: number): void;
    }

    class SourceMapGenerator {
        constructor(startOfSourceMap?: StartOfSourceMap);
        public static fromSourceMap(sourceMapConsumer: SourceMapConsumer): SourceMapGenerator;
        public addMapping(mapping: Mapping): void;
        public setSourceContent(sourceFile: string, sourceContent: string): void;
        public applySourceMap(sourceMapConsumer: SourceMapConsumer, sourceFile?: string, sourceMapPath?: string): void;
        public toString(): string;
        public toJSON(): RawSourceMap;
    }

    class SourceNode {
        constructor();
        constructor(line: number, column: number, source: string);
        constructor(line: number, column: number, source: string, chunk?: string, name?: string);
        public static fromStringWithSourceMap(code: string, sourceMapConsumer: SourceMapConsumer, relativePath?: string): SourceNode;
        public add(chunk: any): SourceNode;
        public prepend(chunk: any): SourceNode;
        public setSourceContent(sourceFile: string, sourceContent: string): void;
        public walk(fn: (chunk: string, mapping: MappedPosition) => void): void;
        public walkSourceContents(fn: (file: string, content: string) => void): void;
        public join(sep: string): SourceNode;
        public replaceRight(pattern: string, replacement: string): SourceNode;
        public toString(): string;
        public toStringWithSourceMap(startOfSourceMap?: StartOfSourceMap): CodeWithSourceMap;
    }
}

declare module 'source-map' {
    export = SourceMap;
}