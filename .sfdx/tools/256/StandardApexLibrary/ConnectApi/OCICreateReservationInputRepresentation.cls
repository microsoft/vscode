global class OCICreateReservationInputRepresentation {
	global String actionRequestId;
	global Boolean allowPartialReservations;
	global List<ConnectApi.OCICreateReservationSingleInputRepresentation> createAllOrNothingRecords;
	global List<ConnectApi.OCICreateReservationSingleInputRepresentation> createRecords;
	global Integer expirationSeconds;
	global String externalRefId;
	global String reservationId;
	global String reservationTime;
	global OCICreateReservationInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}