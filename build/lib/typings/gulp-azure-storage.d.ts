declare module 'gulp-azure-storage' {
	import { ThroughStream } from 'event-stream';

	export function upload(options: any): ThroughStream;
}
