export declare function getHeapStatistics(): {
    total_heap_size: number;
    total_heap_size_executable: number;
    total_physical_size: number;
    total_available_size: number;
    used_heap_size: number;
    heap_size_limit: number;
    malloced_memory: number;
    peak_malloced_memory: number;
    does_zap_garbage: number;
    number_of_native_contexts: number;
    number_of_detached_contexts: number;
};
export declare function getHeapSpaceStatistics(): unknown[];
export declare function getHeapCodeStatistics(): {
    code_and_metadata_size: number;
    bytecode_and_metadata_size: number;
    external_script_source_size: number;
};
export declare function getHeapSnapshot(): null;
export declare function writeHeapSnapshot(): string;
export declare function setFlagsFromString(_flags: string): void;
export declare function takeCoverage(): void;
export declare function stopCoverage(): void;
export declare function cachedDataVersionTag(): number;
export declare function serialize(value: unknown): Uint8Array;
export declare function deserialize(bytes: Uint8Array): unknown;
export interface Serializer {
    writeHeader(): void;
    writeValue(_v: unknown): void;
    releaseBuffer(): Uint8Array;
}
export declare const Serializer: {
    new (): Serializer;
    prototype: any;
};
export interface Deserializer {
    readHeader(): boolean;
    readValue(): unknown;
}
export declare const Deserializer: {
    new (_buf: Uint8Array): Deserializer;
    prototype: any;
};
export interface DefaultSerializer extends Serializer {
}
export declare const DefaultSerializer: {
    new (): DefaultSerializer;
    prototype: any;
};
export interface DefaultDeserializer extends Deserializer {
}
export declare const DefaultDeserializer: {
    new (_buf: Uint8Array): DefaultDeserializer;
    prototype: any;
};
export declare function promiseHooks(): {
    onInit: () => void;
    onSettled: () => void;
    onBefore: () => void;
    onAfter: () => void;
    createHook: () => {
        enable: () => void;
        disable: () => void;
    };
};
declare const _default: {
    getHeapStatistics: typeof getHeapStatistics;
    getHeapSpaceStatistics: typeof getHeapSpaceStatistics;
    getHeapCodeStatistics: typeof getHeapCodeStatistics;
    getHeapSnapshot: typeof getHeapSnapshot;
    writeHeapSnapshot: typeof writeHeapSnapshot;
    setFlagsFromString: typeof setFlagsFromString;
    takeCoverage: typeof takeCoverage;
    stopCoverage: typeof stopCoverage;
    cachedDataVersionTag: typeof cachedDataVersionTag;
    serialize: typeof serialize;
    deserialize: typeof deserialize;
    Serializer: {
        new (): Serializer;
        prototype: any;
    };
    Deserializer: {
        new (_buf: Uint8Array): Deserializer;
        prototype: any;
    };
    DefaultSerializer: {
        new (): DefaultSerializer;
        prototype: any;
    };
    DefaultDeserializer: {
        new (_buf: Uint8Array): DefaultDeserializer;
        prototype: any;
    };
    promiseHooks: typeof promiseHooks;
};
export default _default;
