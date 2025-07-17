global class SlotChainEntry {
	global ConnectApi.DayWiseSlot dayWiseSlotRepresentation;
	global Datetime nextSlotDate;
	global Datetime prevSlotDate;
	global Boolean slotsPublished;
	global String territoryId;
	global Boolean visible;
	global String workTypeId;
	global SlotChainEntry() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}