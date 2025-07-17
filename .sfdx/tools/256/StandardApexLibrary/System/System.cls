global class System {
	/**
	 * Abort an apex job
	 */
	global static void abortJob(String jobId) { }
	global static void assert(Boolean condition, Object msg) { }
	global static void assert(Boolean condition) { }
	global static void assertEquals(Object expected, Object actual, Object msg) { }
	global static void assertEquals(Object expected, Object actual) { }
	global static void assertNotEquals(Object expected, Object actual, Object msg) { }
	global static void assertNotEquals(Object expected, Object actual) { }
	/**
	 * attach a finalizer for a queueable job.
	 */
	global static void attachFinalizer(Object finalizer) { }
	global static void changeOwnPassword(String oldPassword, String newPassword) { }
	global static System.PageReference currentPageReference() { }
	global static Long currentTimeMillis() { }
	global static void debug(LoggingLevel logLevel, Object o) { }
	global static void debug(Object o) { }
	global static Id enqueueJob(Object queueable, AsyncOptions asyncoptions) { }
	/**
	 * Add a job for queue for asynchronous execution with a minimum delay in minutes
	 */
	global static Id enqueueJob(Object queueable, Integer delay) { }
	/**
	 * Add a job to the queue for asynchronous execution.
	 */
	global static Id enqueueJob(Object queueable) { }
	global static Boolean equals(Object left, Object right) { }
	global static System.ApplicationReadWriteMode getApplicationReadWriteMode() { }
	/**
	 * Get the short code string for a given Quiddity
	 */
	global static String getQuiddityShortCode(System.Quiddity quiddity) { }
	global static Integer hashCode(Object obj) { }
	global static Boolean isBatch() { }
	/**
	 * is the current context inside a function callback
	 */
	global static Boolean isFunctionCallback() { }
	global static Boolean isFuture() { }
	/**
	 * is the current context inside a queueable job
	 */
	global static Boolean isQueueable() { }
	global static Boolean isRunningElasticCompute() { }
	global static Boolean isScheduled() { }
	global static void movePassword(Id targetUserId, Id sourceUserId) { }
	global static Datetime now() { }
	/**
	 * Pause a scheduled apex job by cron trigger id
	 */
	global static void pauseJobById(String cronTriggerId) { }
	/**
	 * Pause a scheduled apex job by job name
	 */
	global static void pauseJobByName(String jobName) { }
	/**
	 * For all the workitem ids passed in, perform the given action
	 */
	global static List<Id> process(List<Id> workItemIds, String action, String comments, String nextApprover) { }
	global static Integer purgeOldAsyncJobs(Date date) { }
	global static System.Version requestVersion() { }
	global static System.ResetPasswordResult resetPassword(Id userId, Boolean sendUserEmail) { }
	global static System.ResetPasswordResult resetPasswordWithEmailTemplate(Id userId, Boolean sendUserEmail, String emailTemplateName) { }
	/**
	 * Resume a paused scheduled apex job by cron trigger id
	 */
	global static void resumeJobById(String cronTriggerId) { }
	/**
	 * Resume a paused scheduled apex job by job name
	 */
	global static void resumeJobByName(String jobName) { }
	global static void runAs(SObject user, Object block) { }
	global static void runAs(Package.Version version) { }
	/**
	 * schedule an apex job
	 */
	global static String schedule(String jobName, String cronExp, Object schedulable) { }
	/**
	 * schedule a batch job to run in the future
	 */
	global static String scheduleBatch(Object batchable, String jobName, Integer minutesFromNow, Integer scopeSize) { }
	/**
	 * schedule a batch job to run in the future
	 */
	global static String scheduleBatch(Object batchable, String jobName, Integer minutesFromNow) { }
	global static void setPassword(Id userId, String password) { }
	/**
	 * Submit all the ids in bulk using the given comment and next approver
	 */
	global static List<Id> submit(List<Id> ids, String comments, String nextApprover) { }
	global static Date today() { }

}