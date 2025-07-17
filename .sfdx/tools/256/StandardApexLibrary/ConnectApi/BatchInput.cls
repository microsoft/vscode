global class BatchInput {
	global BatchInput(Object input, ConnectApi.BinaryInput binary) { }
	global BatchInput(Object input, List<ConnectApi.BinaryInput> binaries) { }
	global BatchInput(Object input) { }
	global Object clone() { }
	global List<ConnectApi.BinaryInput> getBinaries() { }
	global Object getInput() { }
	global String toString() { }

}