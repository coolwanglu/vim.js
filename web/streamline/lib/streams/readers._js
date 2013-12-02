/**
 * Copyright (c) 2011 Bruno Jouhier <bruno.jouhier@sage.com>
 * MIT License
 */
"use strict";

var streams = require("./streams");

/// !nodoc -- experimental
/// 
/// # streamline/lib/streams/readers
///  
/// Readers module
/// The `readers` module contains higher level readers built on top of pull-mode streams.
/// 
exports.Reader = function(stream, boundary, options) {
	options = options || {};
	options.defaultSize = options.defaultSize || 512;
	if (!stream.emitter && typeof stream.on === "function") {
		// break require string in 2 to fool client require
		stream = new streams.ReadableStream(stream, options);
		stream.setEncoding(options.encoding || "utf8");
	}
	if (!boundary) boundary = "\n";
	this.readItem = function(_) {
		var chunks = [];
		var len = options.defaultSize;
		while (stream) {
			var chunk = stream.read(_, len + boundary.length);
			if (chunk == null) stream = null;
			else {
				var i = chunk.indexOf(boundary);
				if (i >= 0) {
					stream.unread(chunk.substring(i + boundary.length));
					chunks.push(chunk.substring(0, i));
					break;
				} else if (chunk.length == len + boundary.length) {
					stream.unread(chunk.substring(len));
					chunks.push(chunk.substring(0, len));
				} else {
					// don't require boundary at end of stream
					if (stream.read(_) !== null)
						throw new Error("missing boundary:" + boundary + " in: " + chunk);
					chunks.push(chunk);
					stream = null;
				}
			}
		}
		return chunks.length == 0 ? null : chunks.join('');
	}
	this.close = function(_) {
		stream = null;
	}
}