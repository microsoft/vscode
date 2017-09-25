declare module "color-convert" {
	module convert {
		module rgb {
			function hex(r: number, g: number, b: number);
			function hsl(r: number, g: number, b: number);
			function hvs(r: number, g: number, b: number);
		}
	}

	export = convert;
}