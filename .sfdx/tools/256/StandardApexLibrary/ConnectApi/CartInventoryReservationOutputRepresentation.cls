global class CartInventoryReservationOutputRepresentation {
	global String errorCode;
	global String errorMessage;
	global List<ConnectApi.CartInventoryItemReservationOutputRepresentation> inventoryItemReservations;
	global String reservationIdentifier;
	global Boolean success;
	global CartInventoryReservationOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}