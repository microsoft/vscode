function foo(): void {
	//// { "kind": "track", "oldName": "bar", "newName": "bar2", "delta": 6 }
	const bar2 = 2;

	//// { "title": "local post rename", "oldName": "bar", "newName": "bar2", "expected": "yes", "delta": 12 }
	console.log(bar);
	console.log(bar);
}