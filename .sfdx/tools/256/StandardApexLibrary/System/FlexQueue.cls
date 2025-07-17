global class FlexQueue {
	/**
	 * set a job to run after another job
	 */
	global static Boolean moveAfterJob(Id jobToMoveId, Id jobInQueueId) { }
	/**
	 * set a job to run before another job
	 */
	global static Boolean moveBeforeJob(Id jobToMoveId, Id jobInQueueId) { }
	/**
	 * Move a job to the end of the queue
	 */
	global static Boolean moveJobToEnd(Id jobId) { }
	/**
	 * Move a job to the front of the queue
	 */
	global static Boolean moveJobToFront(Id jobId) { }

}