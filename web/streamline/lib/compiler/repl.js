"use strict";

var vm = require('vm');

function _getTransform(options) {
	if (options.generators) {
		if (options.fast) return require("streamline/lib/generators-fast/transform");
		else return require("streamline/lib/generators/transform");
	} else if (options.fibers) {
		if (options.fast) return require("streamline/lib/fibers-fast/transform");
		else return require("streamline/lib/fibers/transform");
	} else {
		return require("streamline/lib/callbacks/transform");
	}
}

exports.run = function(prog, options) {
	function evaluate(cmd, context, filename, callback) {
		try {
			var transform = _getTransform(options);
			var cmd = cmd.substring(1, cmd.length - 1);
			if (prog == "_coffee") {
				var coffee = require("streamline/lib/util/require")("coffee-script");
				cmd = coffee.compile(cmd, {
					filename: filename,
					bare: true
				}).replace(/\n/g, '').replace(/;$/, '');
			}
			var isStatement = /^\s*(var|function|if|switch|for|while|do|try)\b/.test(cmd);
			cmd = isStatement ? cmd : ("return (" + cmd + ')');
			var decl = /^\s*(var|function)\s*(\w+)([\s\S]*)$/.exec(cmd);
			var vars = "";
			if (decl) {
				vars += "var " + decl[2] + ";";
				if (decl[1] === "function") cmd = decl[2] + "=function " + decl[2] + decl[3];
				else cmd = decl[2] + decl[3];
			}
			var source = vars + transform.transform("(function(_) {" + cmd + "})(_ >> __callback);");
			context.__filename = filename;
			// cannot assign context.__ directly in callback - need to investigate why
			context.__private = context.__private || {};
			context.__ = context.__private.__;
			context.__callback = function(err, result) {
				if (!err) context.__private.__ = result;
				callback(err, result);
			};
			vm.runInContext(source, context, filename);
		} catch (ex) {
			callback(ex);
		}
	}

	require('repl').start({
		prompt: prog + "> ",
		eval: evaluate,
	});
}