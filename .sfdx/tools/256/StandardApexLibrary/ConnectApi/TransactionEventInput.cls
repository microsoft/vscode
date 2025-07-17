global class TransactionEventInput {
	global String contractAddress;
	global List<String> fieldNames;
	global List<String> fieldTypes;
	global List<Boolean> fieldsIndexedInfo;
	global String fromBlock;
	global String methodName;
	global String url;
	global TransactionEventInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}