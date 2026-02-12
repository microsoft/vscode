
declare module "plist" {
	export function parse(input: string): Record<string, any>;
	export function build(obj: Record<string, any>): string;
}
