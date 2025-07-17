global class QueueableDuplicateSignature {
	global static System.QueueableDuplicateSignature.Builder builder() { }
	global Object clone() { }
	global String toString() { }
global class Builder {
	global QueueableDuplicateSignature.Builder() { }
	global System.QueueableDuplicateSignature.Builder addId(Id id) { }
	global System.QueueableDuplicateSignature.Builder addInteger(Integer i) { }
	global System.QueueableDuplicateSignature.Builder addString(String s) { }
	global System.QueueableDuplicateSignature build() { }
	global Object clone() { }
	global Integer getMaxSize() { }
	global Integer getRemainingSize() { }
	global Integer getSize() { }

}

}