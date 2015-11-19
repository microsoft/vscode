var es = require('event-stream');
var path = require('path');

module.exports = function (opts) {
	return es.mapSync(function (file) {
		if (file.stat.isDirectory()) {
			return file;
		}
		var contents = file.contents.toString('utf8');

		if (opts.complain) {
			if (contents.indexOf('\r\n') >= 0) {
				console.log(file.path + ' uses \\r\\n');
			}

			if (opts.whitespace) {
				var lines = contents.split(/\r\n|\r|\n/);
				for (var i = 0, len = lines.length; i < len; i++) {
					var line = lines[i];
					if (line.length === 0) {
						// empty lines are OK
						continue;
					}

					if (/^[\t]*[^\s]/.test(line)) {
						// good indent
						continue;
					} else if (/^[\t]* \*/.test(line)) {
						// block comment using an extra space
						continue;
					} else if (/^[\t]+$/.test(line)) {
						// empty line
						continue;
					} else {
						console.log(file.path + '(' + (i + 1) + ',1): Mixed whitespace indentation');
					}
				}
			}
		} else {
			var lines = contents.split(/\r\n|\r|\n/);

			if (opts.whitespace) {
				for (var i = 0, len = lines.length; i < len; i++) {
					var line = lines[i];
					line = line.replace(/^\ {28}/, '\t\t\t\t\t\t\t');
					line = line.replace(/^\ {24}/, '\t\t\t\t\t\t');
					line = line.replace(/^\ {20}/, '\t\t\t\t\t');
					line = line.replace(/^\ {16}/, '\t\t\t\t');
					line = line.replace(/^\ {12}/, '\t\t\t');
					line = line.replace(/^\ {8}/, '\t\t');
					line = line.replace(/^\ {4}/, '\t');
					lines[i] = line;
				}
			}

			file.contents = new Buffer(lines.join('\n'), 'utf8');
		}
		return file;
	});
};
