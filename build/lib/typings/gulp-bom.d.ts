
declare module "gulp-bom" {
	function f(): NodeJS.ReadWriteStream;

	/**
	 * This is required as per:
	 * https://github.com/Microsoft/TypeScript/issues/5073
	 */
	namespace f {}

	export = f;
}
