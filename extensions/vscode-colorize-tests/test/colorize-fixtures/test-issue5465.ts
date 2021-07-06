function* foo2() {
	yield 'bar';
	yield* ['bar'];
}