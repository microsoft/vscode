global class GetSlotChainsOutput {
	global String code;
	global Boolean isSuccess;
	global String message;
	global List<ConnectApi.SlotChain> slotChains;
	global Map<String,Map<String,List<ConnectApi.TerritoryAppointmentSlot>>> workTypeDateTerritorySlotRepresentation;
	global GetSlotChainsOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}