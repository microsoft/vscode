'use strict';
var Connection = require('tedious').Connection;
var EventEmitter = require('events').EventEmitter;
var util = require('util');

function release() {
    this.pool.release(this);
}

var PENDING = 0;
var FREE = 1;
var USED = 2;
var RETRY = 3;

function ConnectionPool(poolConfig, connectionConfig) {
    this.connections = []; //open connections of any state
    this.waiting = []; //acquire() callbacks that are waiting for a connection to come available
    this.connectionConfig = connectionConfig;

    this.max = poolConfig.max || 50;

    this.min = Math.min(this.max, poolConfig.min >= 0 ? poolConfig.min : 10);

    this.idleTimeout = !poolConfig.idleTimeout && poolConfig.idleTimeout !== false
        ? 300000 //5 min
        : poolConfig.idleTimeout;

    this.retryDelay = !poolConfig.retryDelay && poolConfig.retryDelay !== false
        ? 5000
        : poolConfig.retryDelay;

    this.acquireTimeout = !poolConfig.acquireTimeout && poolConfig.acquireTimeout !== false
        ? 60000 //1 min
        : poolConfig.acquireTimeout;

    if (poolConfig.log) {
        if (Object.prototype.toString.call(poolConfig.log) == '[object Function]')
            this.log = poolConfig.log;
        else {
            this.log = function(text) {
                console.log('Tedious-Connection-Pool: ' + text);
            };
        }
    } else {
        this.log = function() {};
    }

    this.drained = false;

    setTimeout(fill.bind(this), 4);
}

util.inherits(ConnectionPool, EventEmitter);

var cid = 1;

function createConnection(pooled) {
    if (this.drained) //pool has been drained
        return;

    var self = this;
    var endHandler;

    this.log('creating connection: ' + cid);
    var connection = new Connection(this.connectionConfig);
    connection.release = release;
    connection.pool = this;
    if (pooled) {
        pooled.id = cid++;
        pooled.con = connection;
        pooled.status = PENDING;
    } else {
        pooled = {
            id: cid++,
            con: connection,
            status: PENDING
        };

        this.connections.push(pooled);
    }

    var handleError = function(err) {
        self.log('connection closing because of error');

        connection.removeListener('end', endHandler);
        pooled.status = RETRY;
        pooled.con = undefined;
        if (pooled.timeout)
            clearTimeout(pooled.timeout);

        pooled.timeout = setTimeout(createConnection.bind(self, pooled), self.retryDelay);
        self.emit('error', err);
    };

    connection.on('connect', function (err) {
        self.log('connection connected: ' + pooled.id);
        if (self.drained) { //pool has been drained
            self.log('connection closing because pool is drained');
            connection.close();
            return;
        }

        if (err) {
            handleError(err);
            return;
        }

        var waiter = self.waiting.shift();
        if (waiter !== undefined)
            setUsed.call(self, pooled, waiter);
        else
            setFree.call(self, pooled);
    });

    connection.on('error', handleError);

    endHandler = function () {
        self.log('connection ended: ' + pooled.id);
        if (self.drained) //pool has been drained
            return;

        for (var i = self.connections.length - 1; i >= 0; i--) {
            if (self.connections[i].con === connection) {
                self.connections.splice(i, 1);
                fill.call(self);
                return;
            }
        }
    };

    connection.on('end', endHandler);
}

function fill() {
    if (this.drained) //pool has been drained
        return;

    var available = 0;
    for (var i = this.connections.length - 1; i >= 0; i--) {
        if (this.connections[i].status !== USED) {
            available++;
        }
    }

    var amount = Math.min(
        this.max - this.connections.length, //max that can be created
        this.waiting.length - available); //how many are needed, minus how many are available

    amount = Math.max(
        this.min - this.connections.length, //amount to create to reach min
        amount);

    if (amount > 0)
        this.log('filling pool with ' + amount);

    for (i = 0; i < amount; i++)
        createConnection.call(this);
}

ConnectionPool.prototype.acquire = function (callback) {
    if (this.drained) //pool has been drained
        return;

    var self = this;
    var free;

    //look for free connection
    var l = this.connections.length;
    for (var i = 0; i < l; i++) {
        var pooled = this.connections[i];

        if (pooled.status === FREE) {
            free = pooled;
            break;
        }
    }

    var waiter: { callback: any; timeout?: any } = {
        callback: callback
    };

    if (free === undefined) { //no valid connection found
        if (this.acquireTimeout) {

            waiter.timeout = setTimeout(function () {
                for (var i = self.waiting.length - 1; i >= 0; i--) {
                    var waiter2 = self.waiting[i];

                    if (waiter2.timeout === waiter.timeout) {
                        self.waiting.splice(i, 1);
                        waiter.callback(new Error('Acquire Timeout Exceeded'));
                        return;
                    }
                }
            }, this.acquireTimeout);
        }

        this.waiting.push(waiter);
        fill.call(this);
    } else {
        setUsed.call(this, free, waiter);
    }
};

function setUsed(pooled, waiter) {
    pooled.status = USED;
    if (pooled.timeout) {
        clearTimeout(pooled.timeout);
        pooled.timeout = undefined;
    }
    if (waiter.timeout) {
        clearTimeout(waiter.timeout);
        waiter.timeout = undefined;
    }
    this.log('acquired connection ' + pooled.id);
    waiter.callback(null, pooled.con);
}

function setFree(pooled) {
    var self = this;

    pooled.status = FREE;
    pooled.timeout = setTimeout(function() {
        self.log('closing idle connection: ' + pooled.id);
        pooled.con.close();
    }, this.idleTimeout);
}

ConnectionPool.prototype.release = function(connection) {
    if (this.drained) //pool has been drained
        return;

    var self = this;
    var i, pooled;

    for (i = self.connections.length - 1; i >= 0; i--) {
        pooled = self.connections[i];

        if (pooled.con === connection) {
            //reset connection & release it
            connection.reset(function (err) {
                if (!pooled.con) //the connection failed during the reset
                    return;
                
                if (err) { //there is an error, don't reuse the connection, just close it
                    pooled.con.close();
                    return;
                }
                self.log('connection reset: ' + pooled.id);

                var waiter = self.waiting.shift();

                if (waiter !== undefined) {
                    setUsed.call(self, pooled, waiter);
                    //if (waiter.timeout)
                    //    clearTimeout(waiter.timeout);
                    //waiter.callback(null, connection);
                } else {
                    setFree.call(self, pooled);
                }
            });

            return;
        }
    }
};

ConnectionPool.prototype.drain = function (callback) {
    this.log('draining pool');
    if (this.drained) {//pool has been drained
        if (callback)
            callback();
        return;
    }

    this.drained = true;

    for (i = this.waiting.length - 1; i >= 0; i--) {
        var waiter = this.waiting[i];

        if (waiter.timeout)
            clearTimeout(waiter.timeout);
    }

    this.waiting = null;

    var eventTotal = this.connections.length;
    var eventCount = 0;

    if (eventTotal === 0 && callback)
        callback();

    var ended = function() {
        if (++eventCount === eventTotal && callback)
            callback();
    };

    for (var i = this.connections.length - 1; i >= 0; i--) {
        var pooled = this.connections[i];

        if (pooled.timeout)
            clearTimeout(pooled.timeout);

        if (pooled.con) {
            pooled.con.on('end', ended);
            pooled.con.close();
        } else {
            ended();
        }
    }

    this.connections = null;
};

module.exports = ConnectionPool;
