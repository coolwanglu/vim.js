/**
 * Copyright (c) 2011 Bruno Jouhier <bruno.jouhier@sage.com>
 * MIT License
 */
(function(exports) {
	exports.future = function(fn, args, i) {
		var err, result, done, q = [], self = this;
		args = Array.prototype.slice.call(args);
		args[i] = function(e, r) {
			err = e, result = r, done = true;
			q && q.forEach(function(f) {
				f.call(self, e, r);
			});
			q = null;
		};
		fn.apply(this, args);
		return function F(cb) {
			if (typeof cb !== 'function') {
				if (cb !== false && !require('streamline/lib/globals').oldStyleFutures) throw new Error("invalid argument #0: you must pass _ or !_ (see https://github.com/Sage/streamlinejs/issues/164)");
				return F;
			}
			if (done) cb.call(self, err, result);
			else q.push(cb);
		};
	};

	exports.streamlinify = function(fn, idx) {
		return function() {
			if (!arguments[idx]) return exports.future.call(this, fn, arguments, idx);
			else return fn.apply(this, arguments);
		};
	};
})(typeof exports !== 'undefined' ? exports : (Streamline.future = Streamline.future || {}));

