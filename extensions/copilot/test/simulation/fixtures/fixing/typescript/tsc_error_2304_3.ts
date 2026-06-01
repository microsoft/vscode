async function createFile() {
	await promises.writeFile('test.txt', 'Hello, world!');
	await promises.rm('test.txt');
}