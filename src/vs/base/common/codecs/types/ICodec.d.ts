import { ReadableStream } from '../../stream.js';

/**
 * A codec is an object capable of encoding/decoding a stream of data transforming its messages.
 * Useful for abstracting a data transfer or protocol logic on top of a stream of bytes.
 *
 * For instance, if protocol messages need to be trasferred over `TCP` connection, a codec that
 * encodes the messages into a sequence of bytes before sending it to a network socket. Likewise,
 * on the other end of the connection, the same codec can decode the sequence of bytes back into
 * a sequence of the protocol messages.
 */
export interface ICodec<T, K> {
	/**
	 * Encode a stream of `K`s into a stream of `T`s.
	 */
	encode: (value: ReadableStream<K>) => ReadableStream<T>;

	/**
	 * Decode a stream of `T`s into a stream of `K`s.
	 */
	decode: (value: ReadableStream<T>) => ReadableStream<K>;
}
