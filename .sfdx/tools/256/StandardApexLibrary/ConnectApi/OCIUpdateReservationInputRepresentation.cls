global class OCIUpdateReservationInputRepresentation {
	global String actionRequestId;
	global Boolean allowPartialReservations;
	global String externalRefId;
	global String reservationId;
	global String reservationTime;
	global List<ConnectApi.OCIUpdateReservationSingleInputRepresentation> updateAllOrNothingRecords;
	global List<ConnectApi.OCIUpdateReservationSingleInputRepresentation> updateRecords;
	global OCIUpdateReservationInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}