/**
 * Copyright (c) 2011 Bruno Jouhier <bruno.jouhier@sage.com>
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */
"use strict";
var fs = require("fs");
var path = require("path");
var compile = require("./compileSync");
var underscored = require("./underscored");
var registered = false;
var _options = {};

function homeDir() {
	if ((process.env.HOME === undefined) && (process.env.HOMEDRIVE === undefined)) return null;
	return process.env.HOME || ((process.env.HOMEDRIVE + process.env.HOMEPATH)).replace(/\\/g, "/");
}

function loadOptions(dir) {
	return (dir && fs.existsSync(dir + '/.streamline.json')) ? JSON.parse(fs.readFileSync(dir + '/.streamline.json', 'utf8')) : null;
}

exports.register = function(setoptions) {
	if (registered) return;
	registered = true;
	_options = setoptions || loadOptions('.');
	_options = _options || loadOptions(path.dirname(require.main.filename));
	_options = _options || loadOptions(homeDir());
	_options = _options || {};
	var pModule = require('module').prototype;
	var orig = pModule._compile;
	pModule._compile = function(content, filename) {
		// transform .js/.coffee files, but ignore ._js and ._coffee files;
		// they've already been transformed via require extension handlers.
		// (see underscored.js)
		content = /\._(js|coffee)$/.test(filename) ? content : compile.transformModule(content, filename, _options);
		return orig.call(this, content, filename);
	}
	_options.registerOnly = true;
	underscored.run(_options);
	if (!_options.fibers && !_options.generators) {
		var g = require("../globals");
		require("streamline/lib/callbacks/runtime");
		switch (_options.trampoline) {
			case "nextTick":
				g.trampoline = g.trampoline || {};
				g.trampoline.queue = process.nextTick;
				break;
			case "none":
				g.trampoline = null;
				break;
			case "sameTick":
				break;
		}
	}
};

Object.defineProperty(exports, "options", {
	enumerable: true,
	get: function() {
		return _options;
	}
});