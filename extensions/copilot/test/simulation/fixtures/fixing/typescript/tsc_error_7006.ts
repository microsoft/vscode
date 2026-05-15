
function processMessage(messsage: string, callback: (data) => void) {
	const data = messsage + '!';
	callback(data);
}