module.exports = require('galaxy');
require('streamline/lib/globals').runtime = 'generators';
require("streamline/lib/generators/builtins");
module.exports.streamlinify = require("streamline/lib/util/future").streamlinify;
