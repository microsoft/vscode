function foo(isAll, startTime, endTime) {
	const timeRange = isAll ? '所有时间' : `${startTime} - ${endTime}`;
	return true;
}