global interface FinalizerContext {
	Id getAsyncApexJobId();
	Exception getException();
	String getRequestId();
	System.ParentJobResult getResult();

}