const obj = {
	foo: 1,
	bar: 2,
	jar: 3,
};
for (const { foo, bar } of [obj]) {
	console.log(foo, bar);
}


