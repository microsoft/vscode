const mathConsts = {
	Pi: Math.PI,
	PiTimes2: Math.PI * 2,
	PiOn2: Math.PI / 2,
	PiOn4: Math.PI / 4,
	E: Math.E
};
for (const x in mathConsts) {
	console.log(
		mathConsts[x]
	)
}
