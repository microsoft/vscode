declare module 'pump' {
	function f(
		str1:NodeJS.WritableStream,
		str2:NodeJS.WritableStream,
		str3:NodeJS.WritableStream,
		str4:NodeJS.WritableStream,
		str5:NodeJS.WritableStream,
		str6:NodeJS.WritableStream,
		str7:NodeJS.WritableStream,
		str8:NodeJS.WritableStream,
		str9:NodeJS.WritableStream,
		str10:NodeJS.WritableStream,
		cb:(err:any)=>void
	): NodeJS.WritableStream;

	/**
	 * This is required as per:
	 * https://github.com/Microsoft/TypeScript/issues/5073
	 */
	namespace f {}

	export = f;
}