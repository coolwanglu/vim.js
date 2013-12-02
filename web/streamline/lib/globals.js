/// !doc
/// 
/// # Container for global context
/// 
/// The `globals` module is a container for the global `context` object which is maintained across
/// asynchronous calls.
/// 
/// This context is very handy to store information that all calls should be able to access
/// but that you don't want to pass explicitly via function parameters. The most obvious example is
/// the `locale` that each request may set differently and that your low level libraries should
/// be able to retrieve to format messages.
/// 
/// `var globals = require('streamline/lib/globals')`
/// 
/// * `globals.context = ctx`
/// * `ctx = globals.context`  
///   sets and gets the context
/// 
/// Note: an empty context (`{}`) is automatically set by the server wrappers of the `streams` module,
/// before they dispatch a request. So, with these wrappers, each request starts with a fresh empty context.
// This module may be loaded several times so we need a true global (with a secret name!).
// This implementation also allows us to share the context between modules compiled in callback and fibers mode.
var glob = typeof global === "object" ? global : window;
var secret = "_20c7abceb95c4eb88b7ca1895b1170d1";
module.exports = (glob[secret] || (glob[secret] = { context: {} }));

var g = glob[secret];

// Internal call to manage runtimes
g.runtime || Object.defineProperty(g, 'runtime', {
	get: function() { return g.__runtime__; },
	set: function(value) {
		if (g.__runtime__ !== value) {
			if (g.__runtime__) {
				if (/-fast$/.test(g.__runtime__) ||
					/-fast$/.test(value)) throw new Error("cannot mix streamline runtimes: " + g.__runtime__ + " and " + value);
				console.log("warning: mixing streamline runtimes: " + g.__runtime__ + " and " + value);
			}
			g.__runtime__ = value;
		}
	}
});