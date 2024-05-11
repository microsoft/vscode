export async function resolve(specifier, context, nextResolve) {
	if (specifier === "vscode") {
		return {
			shortCircuit: true,
			format: "module",
			url: new URL("./fake-vscode.js", import.meta.url).toString(),
		};
	}
	return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
	return nextLoad(url);
}
