global class TroubleTicketOutputRepresentation {
	global List<ConnectApi.TroubleTicketAttachmentRepresentation> attachment;
	global ConnectApi.TroubleTicketChannelRepresentation channel;
	global String creationDate;
	global String description;
	global String expectedResolutionDate;
	global List<ConnectApi.ExternalIdentifierOutputRepresentation> externalIdentifier;
	global String lastUpdate;
	global String name;
	global List<ConnectApi.TroubleTicketNoteOutputRepresentation> note;
	global String priority;
	global List<ConnectApi.TroubleTicketRelatedEntityOutputRepresentation> relatedEntity;
	global List<ConnectApi.OpenAPIRelatedPartyOutputRepresentation> relatedParty;
	global String requestedResolutionDate;
	global String resolutionDate;
	global String severity;
	global String status;
	global String statusChangeDate;
	global List<ConnectApi.TroubleTicketHistoryOutputRepresentation> statusChangeHistory;
	global String ticketType;
	global List<ConnectApi.TroubleTicketRelationOutputRepresentation> troubleTicketRelationship;
	global String type;
	global TroubleTicketOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}