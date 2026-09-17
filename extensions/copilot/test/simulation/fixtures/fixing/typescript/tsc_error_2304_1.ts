interface History {
	location: string;
	action: string;
	push(path: string): void;
}

export default function PushMissingPathname(history: History) {
	/*
	expect(history.location).toMatchObject({
		pathname: "/",
	});
	*/

	history.push("/home?the=query#the-hash");
	/*
	expect(history.action).toBe("PUSH");
	expect(history.location).toMatchObject({
		pathname: "/home",
		search: "?the=query",
		hash: "#the-hash",
	});
	*/

	history.push("?another=query#another-hash");
	// expect(history.action).toBe("PUSH");
	expect(history.location).toMatchObject({
		pathname: "/home",
		search: "?another=query",
		hash: "#another-hash",
	});
}
