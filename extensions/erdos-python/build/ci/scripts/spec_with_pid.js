'use strict';

/**
 * @module Spec
 */
/**
 * Module dependencies.
 */

const Base = require('mocha/lib/reporters/base');
const { constants } = require('mocha/lib/runner');

const { EVENT_RUN_BEGIN } = constants;
const { EVENT_RUN_END } = constants;
const { EVENT_SUITE_BEGIN } = constants;
const { EVENT_SUITE_END } = constants;
const { EVENT_TEST_FAIL } = constants;
const { EVENT_TEST_PASS } = constants;
const { EVENT_TEST_PENDING } = constants;
const { inherits } = require('mocha/lib/utils');

const { color } = Base;

const prefix = process.env.VSC_PYTHON_CI_TEST_PARALLEL ? `${process.pid}   ` : '';

/**
 * Constructs a new `Spec` reporter instance.
 *
 * @public
 * @class
 * @memberof Mocha.reporters
 * @extends Mocha.reporters.Base
 * @param {Runner} runner - Instance triggers reporter actions.
 * @param {Object} [options] - runner options
 */
function Spec(runner, options) {
    Base.call(this, runner, options);

    let indents = 0;
    let n = 0;

    function indent() {
        return Array(indents).join('  ');
    }

    runner.on(EVENT_RUN_BEGIN, () => {
        Base.consoleLog();
    });

    runner.on(EVENT_SUITE_BEGIN, (suite) => {
        indents += 1;
        Base.consoleLog(color('suite', `${prefix}%s%s`), indent(), suite.title);
    });

    runner.on(EVENT_SUITE_END, () => {
        indents -= 1;
        if (indents === 1) {
            Base.consoleLog();
        }
    });

    runner.on(EVENT_TEST_PENDING, (test) => {
        const fmt = indent() + color('pending', `${prefix} %s`);
        Base.consoleLog(fmt, test.title);
    });

    runner.on(EVENT_TEST_PASS, (test) => {
        let fmt;
        if (test.speed === 'fast') {
            fmt = indent() + color('checkmark', prefix + Base.symbols.ok) + color('pass', ' %s');
            Base.consoleLog(fmt, test.title);
        } else {
            fmt =
                indent() +
                color('checkmark', prefix + Base.symbols.ok) +
                color('pass', ' %s') +
                color(test.speed, ' (%dms)');
            Base.consoleLog(fmt, test.title, test.duration);
        }
    });

    runner.on(EVENT_TEST_FAIL, (test) => {
        n += 1;
        Base.consoleLog(indent() + color('fail', `${prefix}%d) %s`), n, test.title);
    });

    runner.once(EVENT_RUN_END, this.epilogue.bind(this));
}

/**
 * Inherit from `Base.prototype`.
 */
inherits(Spec, Base);

Spec.description = 'hierarchical & verbose [default]';

/**
 * Expose `Spec`.
 */

// eslint-disable-next-line no-global-assign
exports = Spec;
module.exports = exports;
