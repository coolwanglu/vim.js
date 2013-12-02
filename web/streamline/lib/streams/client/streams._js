/**
 * Copyright (c) 2011 Bruno Jouhier <bruno.jouhier@sage.com>
 * MIT License
 */
"use strict";
/// !nodoc
/// 
/// # Client Streams module
/// 
/// The `streams` module contains _pull mode_ wrappers around AJAX streams.
/// 
// TODO: Client streams only deal with strings for now

function DataBuffer(options) {
	var _chunks = [];

	this.read = function(_, len) {
		if (len < 0) len = Infinity;
		if (len == 0) return "";
		var chunks = [],
			total = 0;
		while (total < len) {
			var chunk = _chunks.splice(0, 1)[0];
			if (!chunk) return chunks.length == 0 ? null : chunks.join('');
			if (total + chunk.length <= len) {
				chunks.push(chunk);
				total += chunk.length;
			} else {
				chunks.push(chunk.substring(0, len - total));
				_chunks.splice(0, 0, chunk.substring(len - total));
				total = len;
			}
		}
		return chunks.join('');
	}
	/// * `data = stream.readAll(_)`  
	///   reads till the end of stream.  
	///   Equivalent to `stream.read(_, -1)`.
	this.readAll = function(_) {
		return this.read(_, -1);
	}
	/// * `stream.unread(chunk)`  
	///   pushes the chunk back to the stream.  
	///   returns `this` for chaining.
	this.unread = function(chunk) {
		_chunks.splice(0, 0, chunk);
		return this;
	}

	this.write = function(_, data, enc) {
		_chunks.push(data);
		return this;
	}

	this.end = function(data, enc) {
		if (data) _chunks.push(data);
		return this;
	}

	this.contents = function() {
		return _chunks.join('');
	}
}

function HttpError(statusCode, message) {
	this.statusCode = statusCode;
	this.message = message;
	this.stack = new Error().stack;
}

function _fixHttpClientOptions(options) {
	if (!options) throw new Error("request error: no options");
	if (typeof options === "string") options = {
		url: options
	};
	return options;
}
/// 
/// ## HttpClientRequest
/// 
/// This is a wrapper around jQuery's `$.ajax` call, with
/// the same API as the server side HttpClientRequest
/// 
/// This stream is writable (see Writable Stream above).
/// 
/// * `request = streams.httpRequest(options)`  
///    creates the wrapper.  
///    The options are the following:
///    * `method`: the HTTP method, `'GET'` by default.
///    * `headers`: the HTTP headers.
///    * `url`: the requested URL (with query string if necessary).
///    * `proxy.url`: the proxy URL.
///    * `lowMark` and `highMark`: low and high water mark values for buffering (in bytes or characters depending
///      on encoding).  
///      Note that these values are only hints as the data is received in chunks.


function HttpClientRequest(options) {
	options = _fixHttpClientOptions(options);
	DataBuffer.call(this, options);
	var _xhr;
	this.response = function(callback) {
		if (!callback) return __future.call(this, this.response, arguments, 0);
		$.ajax({
			url: options.url,
			headers: options.headers,
			type: options.method,
			data: this.contents(),
			dataType: "text",
			// bypass jQuery parsing
			beforeSend: function(xhr) {
				_xhr = xhr;
			},
			success: function(data, statusText, xhr) {
				callback(null, new HttpClientResponse(data, xhr));
			},
			error: function(xhr, statusText, message) {
				if (statusText == "error") callback(new HttpError(xhr.status, statusText + ": " + message));
				else callback(new HttpError(400, statusText + ": " + message));
			}
		});
	}
	this.abort = function() {
		_xhr && _xhr.abort();
		_xhr = null;
	}
}

function HttpClientResponse(data, xhr) {
	DataBuffer.call(this);
	this.end(data);
	this.statusCode = xhr.status;
	this.headers = {};
	var self = this;
	xhr.getAllResponseHeaders().replace(/\r\n/g, '\n').split('\n').forEach(function(header) {
		var pair = header.split(':');
		self.headers[pair[0].toLowerCase()] = pair[1] && pair[1].trim();
	});
}

exports.httpRequest = function(options) {
	return new HttpClientRequest(options);
};