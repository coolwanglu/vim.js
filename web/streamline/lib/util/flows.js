"use strict";
var globals = require('streamline/lib/globals');
var dir = 'streamline/lib/' + (globals.runtime || 'callbacks');
module.exports = require(dir + '/flows');
