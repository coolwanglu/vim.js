"use strict";
(function() {
var sourceMap;
if (typeof exports !== 'undefined') {
	var req = require; // fool streamline-require so that we don't load source-map client-side
	try { sourceMap = req('source-map'); } catch (ex) {}
}
if (!sourceMap) {
	// Mock it for client-side
	sourceMap = {
		SourceNode: function(lineno, column, source, content) {
			this.children = content ? [content] : [];
		}
	};
	sourceMap.SourceNode.prototype.add = function(elt) {
		if (Array.isArray(elt)) this.children = this.children.concat(elt);
		else this.children.push(elt);
		return this;
	};
	sourceMap.SourceNode.prototype.prepend = function(elt) {
		if (Array.isArray(elt)) this.children = elt.concat(this.children.concat);
		else this.children.unshift(elt);
		return this;
	};
	sourceMap.SourceNode.prototype.toString = function() {
	    var str = "";
	    this.walk(function (chunk) {
	      str += chunk;
	    });
	    return str;
	};
	sourceMap.SourceNode.prototype.walk = function(f) {
		this.children.forEach(function(n) {
			if (n instanceof sourceMap.SourceNode) n.walk(f);
			else f(n);
		});
		return this;
	};
}
(function(module) {
function SourceNode() {
	sourceMap.SourceNode.apply(this, arguments);
}

SourceNode.prototype = Object.create(sourceMap.SourceNode.prototype, {
	constructor: {
		value: SourceNode,
		enumerable: false,
		writable: true,
		configurable: true
	},
	length: {
		get: function() {
			var len = 0;
			this.walk(function(str) { len += str.length; });
			return len;
		}
	}
});
SourceNode.prototype.stripPrefix = function(offset) {
	var _len;
	while (this.children.length > 0 && offset > 0 && (_len = this.children[0].length) <= offset) {
		this.children.shift();
		offset -= _len;
	}
	if (this.children.length == 0 || offset == 0) return this;
	if (typeof this.children[0] == 'string') {
		this.children[0] = this.children[0].substring(offset);
	} else {
		this.children[0].stripPrefix(offset);
	}
	return this;
};
SourceNode.prototype.stripSuffix = function(offset) {
	var _len, chlen;
	while ((chlen = this.children.length) > 0 && offset > 0 && (_len = this.children[chlen - 1].length) <= offset) {
		this.children.pop();
		offset -= _len;
	}
	if (chlen == 0 || offset == 0) return this;
	if (typeof this.children[chlen-1] == 'string') {
		this.children[chlen-1] = this.children[0].slice(0, -offset);
	} else {
		this.children[chlen-1].stripSuffix(offset);
	}
	return this;
};
SourceNode.prototype.map = function(f) {
	this.children = this.children.map(function(chunk) {
		if (chunk instanceof sourceMap.SourceNode) {
			return chunk.map(f);
		} else {
			return f(chunk);
		}
	});
	return this;
};
SourceNode.prototype.lastChar = function() {
	for (var i = this.children.length; i--; ) {
		var ret;
		if (typeof this.children[i] == 'string') {
			ret = this.children[i].slice(-1);
		} else {
			ret = this.children[i].lastChar();
		}
		if (ret) return ret;
	}
	return '';
};
module.exports = Object.create(sourceMap, { SourceNode: { value: SourceNode } });

})(typeof exports !== 'undefined' ? module : (Streamline.sourceMap = Streamline.sourceMap || {}));
})();