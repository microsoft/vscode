declare module 'gulp-remote-retry-src' {

	import stream = require("stream");

	function remote(url: string, options: remote.IOptions): stream.Stream;

	module remote {
		export interface IRequestOptions {
			body?: any;
			json?: boolean;
			method?: string;
			headers?: any;
		}

		export interface IOptions {
			base?: string;
			buffer?: boolean;
			requestOptions?: IRequestOptions;
		}
	}

	export = remote;
}
