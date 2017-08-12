declare module "parse-color" {

	interface Color {
		rgb: [number, number, number],
		hsl: [number, number, number],
		hsv: [number, number, number],
		cmyk: [number, number, number, number],
		keyword: string,
		hex: string,
		rgba: [number, number, number, number],
		hsla: [number, number, number, number],
		hsva: [number, number, number, number],
		cmyka: [number, number, number, number, number]
	}

	function parse(value: string): Color;

	module parse { }

	export = parse;
}