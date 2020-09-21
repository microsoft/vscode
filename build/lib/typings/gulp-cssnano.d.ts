
declare module "gulp-cssnano" {
	function f(opts:{reduceIdents:boolean;}): NodeJS.ReadWriteStream;

	/**
	 * This is required as per:
	 * https://github.com/microsoft/TypeScript/issues/5073
	 */
	namespace f {}

	export = f;
}
