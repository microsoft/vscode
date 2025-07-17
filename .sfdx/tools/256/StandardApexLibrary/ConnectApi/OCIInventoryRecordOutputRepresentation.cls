global class OCIInventoryRecordOutputRepresentation {
	global ConnectApi.OCIAttributeSetOutputRepresentation attributeSet;
	global Double availableToFulfill;
	global Double availableToOrder;
	global Datetime effectiveDate;
	global Boolean exists;
	global List<ConnectApi.OCIFutureInventoryOutputRepresentation> futures;
	global Double onHand;
	global Double reserved;
	global Double safetyStockCount;
	global String stockKeepingUnit;
	global OCIInventoryRecordOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}