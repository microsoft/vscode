import { sum } from "./sum";


class App {
	run() {
		return sum(12, 23, 45)
	}
}

console.log(new App().run());
