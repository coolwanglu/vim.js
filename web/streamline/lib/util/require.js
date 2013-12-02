// Helper file to require() dependencies relative to the either the caller's
// working directory or the calling module's directory.
//
// If that doesn't work, though, we'll still try to require() them relative to
// ourselves, in order to cover the global/shebang use case.
//
// Details:
// https://github.com/Sage/streamlinejs/issues/84
// https://github.com/Sage/streamlinejs/issues/105

var Module = require("module");

module.exports = function(name, fromDir) {
	if (!fromDir) fromDir = process.cwd();

	var paths = Module._nodeModulePaths(fromDir);
	var path = Module._findPath(name, paths);

	return path ? require(path) : require(name);
};
