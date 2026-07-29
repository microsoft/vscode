/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
const name = "John Doe";

// Function declaration
function greet(person) {
	return "Hello, " + person + "!";
}

// Object literal
const person = {
	firstName: "John",
	lastName: "Doe",
	fullName: function () {
		return this.firstName + " " + this.lastName;
	}
};

// Array literal
const numbers = [1, 2, 3, 4, 5];

// For loop
for (let i = 0; i < numbers.length; i++) {
	console.log(numbers[i]);
}

// If-else statement
if (name === "John Doe") {
	console.log(greet(name));
} else {
	console.log("Unknown person");
}

// Switch statement
switch (name) {
	case "John Doe":
		console.log("Name is John Doe");
		break;
	default:
		console.log("Unknown name");
		break;
}

// Try-catch statement
try {
	console.log(person.fullName());
} catch (error) {
	console.error("An error occurred: " + error.message);
}

// Promises and arrow functions
const promise = new Promise((resolve, reject) => {
	setTimeout(() => {
		resolve("Promise resolved");
	}, 1000);
});

promise.then((message) => {
	console.log(message);
}).catch((error) => {
	console.error("An error occurred: " + error.message);
});

// Classes and inheritance
class Animal {
	constructor(name) {
		this.name = name;
	}

	speak() {
		console.log(this.name + " makes a noise.");
	}
}

class Dog extends Animal {
	speak() {
		console.log(this.name + " barks.");
	}
}

const dog = new Dog("Rex");
dog.speak();
