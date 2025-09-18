import { Writable } from "stream";

export interface ChunksParser<T> {
    push: (chunk: string) => void;
    done: () => T;
}

export class StreamParser<T> extends Writable {
    
    constructor(private parser: ChunksParser<T>) {
        super();

        this.once('finish', () => {
            this.emit('done', parser.done());
        });
    }

    _write(chunk: any, encoding: string, callback: (err?: Error) => void) {
        let data = chunk.toString();
        this.parser.push(data);
        callback();
    }
}