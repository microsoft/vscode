const array: number[] = []
let ceiling = 10;
const poppedElement = array.pop();
const n = ceiling - poppedElement - 1;
for (var j = 0; j < n; j++) {
	ceiling--;
	console.log(ceiling + n);
}