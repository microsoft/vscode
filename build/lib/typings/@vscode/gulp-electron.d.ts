declare module '@vscode/gulp-electron' {

	interface MainFunction {
		(options: any): NodeJS.ReadWriteStream;

		dest(destination: string, options: any): NodeJS.ReadWriteStream;
	}

	const main: MainFunction;
	export default main;
}
