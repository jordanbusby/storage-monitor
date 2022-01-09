/*
1. Get [storage_id, storage_code, panel_URL] set
2. Iterate through, ask each one for fulldata.dat (are they not xt? Figure that out.)
3. Every hour query the panels four times. 
4. insert into storage_monitor_responses the storage_id, storage_code, time, and the response
  a. if no response, enter null into response to show host is down.
*/

/**
 * @todo
 * 1. Need to grab panel_logins from panel list query so we can iterate through the logins instead
 *    of trying a static 'agri:7008'
 * 2. Need to implement this to run every thiry minutes.
 * 3. Bunch of other stuff.
 */

 
 ** 12/28/21

 I'm building a suitable interface for tracking jobs that need to be attempted again for a number of different errors.
 However, the plan currently is to only attempt to retry jobs that have authentication errors.
 I'm building an interface that holds all the results of the connection attempt so that eventually
 we can go back through it and retry or update the DB accordingly.

 /**
 * We have our initial list of jobs, which is the list of
 * panels from the Database, along with an array of objects
 * that hold the http request options, and then we will set a property
 * for the requestResult object. We can move these jobs from here to there,
 * moving them into different lists depending on if we need to retry them
 * or depending on the certain type of error or whatever.
 */