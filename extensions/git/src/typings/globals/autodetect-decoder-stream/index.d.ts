declare module 'autodetect-decoder-stream' {
	import * as stream from 'stream';

	module _ {

	}

	class _ extends stream.Duplex {
		constructor(options?: {
			defaultEncoding?: string;
		});
	}

	export = _;
}
