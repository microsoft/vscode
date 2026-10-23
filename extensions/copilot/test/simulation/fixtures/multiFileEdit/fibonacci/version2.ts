export function iterativeFibonacci(n: number): number {
	if (n <= 1) return n;

	let prev = 0, curr = 1;
	for (let i = 2; i <= n; i++) {
		const next = prev + curr;
		prev = curr;
		curr = next;
	}

	return curr;
}
