var es = require('event-stream');
var _ = require('underscore');

var allErrors = [];
var count = 0;

function onStart() {
	if (count++ > 0) {
		return;
	}

	console.log('*** Starting...');
}

function onEnd() {
	if (--count > 0) {
		return ;
	}

	var errors = _.flatten(allErrors);
	errors.map(function (err) { console.log('*** Error:', err); });
	console.log('*** Finished with', errors.length, 'errors.');
}

module.exports = function () {
	var errors = [];
	allErrors.push(errors);

	return function (err) {
		if (err) {
			errors.push(err);
			return;
		}

		errors.length = 0;
		onStart();
		return es.through(null, function () {
			onEnd();
			this.emit('end');
		});
	};
};