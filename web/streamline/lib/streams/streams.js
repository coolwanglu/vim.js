/**
 * Copyright (c) 2011 Bruno Jouhier <bruno.jouhier@sage.com>
 * MIT License
 */
"use strict";

/// !nodoc -- experimental combo streams
/// 

if (typeof process === "object" && typeof process.cwd === "function") {
	var req = require; // trick to skip this dependency when serving client side requires
	module.exports = req('./server/streams');
} else {
	module.exports = require('./client/streams');
}