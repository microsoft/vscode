export async function initialize({ number, port }) {
	// Receives data from `register`.
}

export async function resolve(specifier, context, nextResolve) {
	// Take an `import` or `require` specifier and resolve it to a URL.
}

export async function load(url, context, nextLoad) {
	// Take a resolved URL and return the source code to be evaluated.
}
