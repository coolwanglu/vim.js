/**
 * Copyright (c) 2011 Bruno Jouhier <bruno.jouhier@sage.com>
 * MIT License
 */
"use strict";

var streams = require("./streams");
/// !nodoc -- experimental
/// 
/// # streamline/lib/streams/jsonRequest
///  
/// Simple json request wrapper
exports.send = function(_, url, obj) {
	var json = obj && typeof obj !== "string" ? JSON.stringify(obj) : obj;
	var result = streams.httpRequest({
		url: url,
		method: json ? "POST" : "GET",
		headers: {
			"content-type": "application/json"
		}
	}).end(json, "utf8").response(_).readAll(_);
	return JSON.parse(result);
}