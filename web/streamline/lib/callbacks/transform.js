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
/// !doc
/// 
/// # Transformation engine (callback mode)
/// 
/// `var transform = require('streamline/lib/callbacks/transform')`
/// 
if (typeof exports !== 'undefined') {
	var Narcissus = require('../../deps/narcissus');
	var format = require('./format').format;
} else {
	var format = Streamline.format;
}(function(exports) {
	//"use strict";
	/// * `version = transform.version`  
	///   current version of the transformation algorithm.
	exports.version = require("streamline/lib/version").version + " (callbacks)";

	var parse = Narcissus.parser.parse;
	var pp = Narcissus.decompiler.pp;
	var definitions = Narcissus.definitions;

	eval(definitions.consts.replace(/const /g, "var "));

	function _assert(cond) {
		if (!cond) throw new Error("Assertion failed!")
	}

	function _tag(node) {
		if (!node || !node.type) return "*NOT_A_NODE*";
		var t = definitions.tokens[node.type];
		return /^\W/.test(t) ? definitions.opTypeNames[t] : t.toUpperCase();
	}

	/*
	 * Utility functions
	 */

	function originalLine(options, line, col) {
		if (!options.prevMap) return line;
		// Work around a bug in CoffeeScript's source maps; column number 0 is faulty.
		if (col == null) col = 1000;
		return options.prevMap.originalPositionFor({ line: line, column: col }).line;
	}

	function originalCol(options, line, col) {
		if (!options.prevMap) return col;
		return options.prevMap.originalPositionFor({ line: line, column: col }).column;
	}

	function _node(ref, type, children) {
		return {
			_scope: ref && ref._scope,
			_async: ref && ref._async,
			type: type,
			children: children
		};
	}

	function _identifier(name, initializer) {
		return {
			_scope: initializer && initializer._scope,
			type: IDENTIFIER,
			name: name,
			value: name,
			initializer: initializer
		};
	}

	function _number(val) {
		return {
			type: NUMBER,
			value: val
		};
	}

	function _string(val) {
		return {
			type: STRING,
			value: val
		};
	}

	function _return(node) {
		return {
			type: RETURN,
			_scope: node._scope,
			value: node
		};
	}

	function _semicolon(node) {
		var stmt = _node(node, SEMICOLON);
		stmt.expression = node;
		return stmt;
	}

	function _safeName(precious, name) {
		if (name.substring(0, 2) === '__') while (precious[name]) name += 'A';
		return name;
	}
	// cosmetic stuff: template logic generates nested blocks. Flatten them.

	function _flatten(node) {
		if (node.type == BLOCK || node.type == SCRIPT) {
			do {
				var found = false;
				var children = [];
				node.children.forEach(function(child) {
					if (child._isFunctionReference || (child.type == SEMICOLON && (child.expression == null || child.expression._isFunction))) return; // eliminate empty statement and dummy function node;
					node._async |= child._async;
					if (child.type == BLOCK || child.type == SCRIPT) {
						children = children.concat(child.children);
						found = true;
					} else children.push(child);
				})
				node.children = children;
			}
			while (found);
		}
		return node;
	}

	// generic helper to traverse parse tree
	// if doAll is true, fn is called on every property, otherwise only on sub-nodes
	// if clone object is passed, values returned by fn are assigned to clone properties

	function _propagate(node, fn, doAll, clone) {
		var result = clone ? clone : node;
		for (var prop in node) {
			// funDecls and expDecls are aliases to children
			// target property creates loop (see Node.prototype.toString)
			if (node.hasOwnProperty(prop) && prop.indexOf("Decls") < 0 && (doAll || prop != 'target') && prop[0] != '_') {
				var child = node[prop];
				if (child != null) {
					if (Array.isArray(child)) {
						if (clone) result[prop] = (child = [].concat(child));
						var undef = false;
						for (var i = 0; i < child.length; i++) {
							if (doAll || (child[i] && child[i].type)) {
								child[i] = fn(child[i], node);
								undef |= typeof child[i] === "undefined"
							}
						}
						if (undef) {
							result[prop] = child.filter(function(elt) {
								return typeof elt !== "undefined";
							});
						}
					} else {
						if (doAll || (child && child.type)) result[prop] = fn(child, node);

					}
				}
			}
		}
		return result;
	}

	// clones the tree rooted at node.

	function _clone(node) {
		var lastId = 0;
		var clones = {}; // target property creates cycles

		function cloneOne(child) {
			if (!child || !child.type) return child;
			var cloneId = child._cloneId;
			if (!cloneId) cloneId = (child._cloneId = ++lastId);
			var clone = clones[cloneId];
			if (clone) return clone;
			clones[cloneId] = (clone = {
				_cloneId: cloneId
			});
			return _propagate(child, cloneOne, true, clone);
		}

		return _propagate(node, cloneOne, true, {});
	}

	/*
	 * Utility class to generate parse trees from code templates
	 */

	function Template(pass, str, isExpression, createScope) {
		// parser the function and set the root
		var _root = parse("function _t(){" + str + "}").children[0].body;
		if (_root.children.length == 1) _root = _root.children[0];
		else _root = _node(_root.children[0], BLOCK, _root.children);

		// if template is an expression rather than a full statement, go one more step down
		//if (isExpression) 
		//	_root = _root.expression;
		// generates a parse tree from a template by substituting bindings.
		this.generate = function(scopeNode, bindings) {
			var scope = scopeNode._scope;
			_assert(scope != null);
			bindings = bindings || {};
			var fn = null;

			function gen(node) {
				if (node.type != SCRIPT && node.type != BLOCK) node._pass = pass;
				if (node.type == FUNCTION && createScope) {
					_assert(fn == null);
					fn = node;
				}
				if (!node || !node.type) {
					if (node == "_") return scope.options.callback;
					// not a parse node - replace if it is a name that matches a binding
					if (typeof node === "string") {
						if (node[0] === "$") return bindings[node];
						return _safeName(scope.options.precious, node);
					}
					return node;
				}
				node._scope = scope;
				// if node is ident; statement (SEMICOLON) or ident expression, try to match with binding
				var ident = node.type == SEMICOLON ? node.expression : node;
				if (ident && ident.type == IDENTIFIER && ident.value[0] === "$") {
					var result = bindings[ident.value];
					// transfer initializer if there is one
					if (ident.initializer) {
						result.initializer = gen(ident.initializer);
						if (result.initializer._async) result._async = true;
					}
					return result;
				} else {
					// recurse through sub nodes
					node = _propagate(node, function(child) {
						child = gen(child);
						// propagate async flag like analyze phase
						if (child && (child._async || (child === scope.options.callback && createScope)) && node.type !== FUNCTION) node._async = true;
						return child;
					}, true);
					node = _flatten(node);
					return node;
				}
			}

			// generate
			var result = gen(_clone(_root));
			if (fn) {
				// parser drops parenthesized flag (because of return)
				fn.parenthesized = true;
				var scope = new Scope(fn.body, fn._scope.options);
				scope.name = fn._scope.name;
				scope.line = fn._scope.line;
				scope.last = fn._scope.last;
				_assert(fn.params[0] === fn._scope.options.callback);
				scope.cbIndex = 0;

				function _changeScope(node, parent) {
					if (node.type == FUNCTION) return node;
					node._scope = scope;
					return _propagate(node, _changeScope);
				}
				_propagate(fn, _changeScope);
			}
			return isExpression ? result.value : result;
		}
		this.root = isExpression ? _root.value : _root; // for simplify pass
	}

	/*
	 * Utility to generate names of intermediate variables
	 */

	function Scope(script, options) {
		this.script = script;
		this.line = 0;
		this.last = 0;
		this.vars = [];
		this.functions = [];
		this.options = options;
		this.cbIndex = -1;
		this.isAsync = function() {
			return this.cbIndex >= 0;
		}
	}

	function _genId(node) {
		return _safeName(node._scope.options.precious, "__" + ++node._scope.last);
	}

	/*
	 * Preliminary pass: mark source nodes so we can map line numbers
	 * Also eliminate _fast_ syntax
	 */
	function _isMarker(node) {
		return node.type === IDENTIFIER && node.value === '_';
	}
	function _isStar(node) {
		return node.type === CALL && _isMarker(node.children[0]) && node.children[1].children.length === 2;
	}
	function _removeFast(node, options) {
		// ~_ -> _
		if (node.type === BITWISE_NOT && _isMarker(node.children[0])) {
			options.needsTransform = true;
			return node.children[0];
		}
		// [_] -> _ (with multiple marker)
		if (node.type === ARRAY_INIT && node.children.length === 1 && _isMarker(node.children[0])) {
			options.needsTransform = true;
			node.children[0]._returnArray = true; 
			return node.children[0];
		}
		// _ >> x -> x
		if (node.type === RSH && _isMarker(node.children[0])) {
			options.needsTransform = true;
			return node.children[1];
		}
		// _ << x -> x
		if (node.type === LSH && _isMarker(node.children[0])) {
			options.needsTransform = true;
			return node.children[1];
		}
		// !_ -> null
		if (node.type === NOT && _isMarker(node.children[0])) {
			options.needsTransform = true;
			node.type = FALSE;
			node.children = [];
			return node;
		}
		if (_isStar(node)) {
			options.needsTransform = true;
			node.children[0].value = _safeName(options.precious, "__rt") + ".streamlinify"
			return node;
		} 
		return node;
	}

	function _markSource(node, options) {
		function _markOne(node) {
			if (typeof node.value === 'string') options.precious[node.value] = true;
			node.params && node.params.forEach(function(param) {
				options.precious[param] = true;
			});
			node._isSourceNode = true;
			_propagate(node, function(child) {
				child = _removeFast(child, options);
				_markOne(child);
				return child;
			});
		}

		_markOne(node);
	}

	/*
	 * Canonicalization pass: wrap top level script if async
	 */

	function _isScriptAsync(script, options) {
		var async = false;

		function _doIt(node, parent) {
			switch (node.type) {
			case FUNCTION:
				// do not propagate into functions
				return node;
			case IDENTIFIER:
				if (node.value == options.callback) {
					async = true;
				} else { // propagate only if async is still false
					_propagate(node, _doIt);
				}
				return node;
			case CALL:
				// special hack for coffeescript top level closure
				var fn = node.children[0],
					args = node.children[1],
					ident;
				if (fn.type === DOT && (ident = fn.children[1]).value === "call" && (fn = fn.children[0]).type === FUNCTION && fn.params.length === 0 && !fn.name && args.children.length === 1 && args.children[0].type === THIS) {
					_propagate(fn.body, _doIt);
					return node;
				}
				// fall through			
			default:
				// do not propagate if async has been found
				if (!async) {
					_propagate(node, _doIt);
				}
				return node;
			}
		}
		_propagate(script, _doIt);
		if (async && options.verbose) console.log("WARNING: async calls found at top level in " + script.filename);
		return async;
	}

	var _rootTemplate = new Template("root",
	// define as string on one line to get lineno = 1
	"(function main(_){ $script }).call(this, __trap);");

	function _canonTopLevelScript(script, options) {
		script._scope = new Scope(script, options);
		if (_isScriptAsync(script, options)) return _rootTemplate.generate(script, {
			$script: script
		});
		else return script;
	}

	/*
	 * Scope canonicalization pass:
	 *   Set _scope on all nodes
	 *   Set _async on all nodes that contain an async marker
	 *   Move vars and functions to beginning of scope.
	 *   Replace this by __this.
	 *   Set _breaks flag on all statements that end with return, throw or break
	 */
	var _assignTemplate = new Template("canon", "$lhs = $rhs;");

	// try to give a meaningful name to an anonymous func

	function _guessName(node, parent) {
		function _sanitize(name) {
			// replace all invalid chars by '_o_'
			name = name.replace(/[^A-Z0-9_$]/ig, '_o_');
			// add '_o_' prefix if name is empty or starts with a digit
			return name && !/^\d/.test(name) ? name : '_o_' + name;
		}
		var id = _genId(node),
			n, nn;
		if (parent.type === IDENTIFIER) return _sanitize(parent.value) + id;
		if (parent.type === ASSIGN) {
			n = parent.children[0];
			var s = "";
			while ((n.type === DOT && (nn = n.children[1]).type === IDENTIFIER) || (n.type === INDEX && (nn = n.children[1]).type === STRING)) {
				s = s ? nn.value + "_" + s : nn.value;
				n = n.children[0];
			}
			if (n.type === IDENTIFIER) s = s ? n.value + "_" + s : n.value;
			if (s) return _sanitize(s) + id;
		} else if (parent.type == PROPERTY_INIT) {
			n = parent.children[0];
			if (n.type === IDENTIFIER || n.type === STRING) return _sanitize(n.value) + id;
		}
		return id;
	}

	function _canonScopes(node, options) {
		function _doIt(node, parent) {
			var scope = parent._scope;
			node._scope = scope;
			var async = scope.isAsync();
			if (!async && node.type !== FUNCTION) {
				if (node.type === IDENTIFIER && node.value === options.callback && !(_isStar(parent))) throw new Error(node.filename + ": Function contains async calls but does not have _ parameter: " + node.name + " at line " + node.lineno);
				return _propagate(node, _doIt);
			}

			if (node.type === TRY) node._async = true;
			switch (node.type) {
			case FUNCTION:
				var result = node;
				var cbIndex = node.params.reduce(function(index, param, i) {
					if (param != options.callback) return index;
					if (index < 0) return i;
					else throw new Error("duplicate _ parameter");
				}, -1);
				if (cbIndex >= 0) {
					// handle coffeescript fat arrow method definition (issue #141)
					if (_isFatArrow(node)) return node;
					// should rename options -> context because transform writes into it.
					options.needsTransform = true;
					// assign names to anonymous functions (for futures)
					if (!node.name) node.name = _guessName(node, parent);
				}
				// if function is a statement, move it away
				if (async && (parent.type === SCRIPT || parent.type === BLOCK)) {
					scope.functions.push(node);
					result = undefined;
				}
				// create new scope for the body
				var bodyScope = new Scope(node.body, options);
				node.body._scope = bodyScope;
				bodyScope.name = node.name;
				bodyScope.cbIndex = cbIndex;
				bodyScope.line = node.lineno;
				node.body = _propagate(node.body, _doIt);
				// insert declarations at beginning of body
				if (cbIndex >= 0) bodyScope.functions.push(_string("BEGIN_BODY")); // will be removed later
				node.body.children = bodyScope.functions.concat(node.body.children);
				if (bodyScope.hasThis && !node._inhibitThis) {
					bodyScope.vars.push(_identifier(_safeName(options.precious, "__this"), _node(node, THIS)));
				}
				if (bodyScope.hasArguments && !node._inhibitArguments) {
					bodyScope.vars.push(_identifier(_safeName(options.precious, "__arguments"), _identifier("arguments")));
				}
				if (bodyScope.vars.length > 0) {
					node.body.children.splice(0, 0, _node(node, VAR, bodyScope.vars));
				}
				// do not set _async flag
				return result;
			case VAR:
				var children = node.children.map(function(child) {
					if (!scope.vars.some(function(elt) {
						return elt.value == child.value;
					})) {
						scope.vars.push(_identifier(child.value));
					}
					if (!child.initializer) return null;
					child = _assignTemplate.generate(parent, {
						$lhs: _identifier(child.value),
						$rhs: child.initializer
					});
					if (parent.type === FOR) child = child.expression;
					return child;
				}).filter(function(child) {
					return child != null;
				});
				if (children.length == 0) {
					return;
				}
				var type = parent.type == BLOCK || parent.type === SCRIPT ? BLOCK : COMMA;
				var result = _node(parent, type, children);
				result = _propagate(result, _doIt);
				parent._async |= result._async;
				return result;
			case THIS:
				scope.hasThis = true;
				return _identifier(_safeName(options.precious, "__this"));
			case IDENTIFIER:
				if (node.value === "arguments") {
					scope.hasArguments = true;
					//if (!options.ninja) throw new Error("To use 'arguments' inside streamlined function, read the doc and set the 'ninja' option");
					return _identifier(_safeName(options.precious, "__arguments"));
				}
				node = _propagate(node, _doIt);
				node._async |= node.value === options.callback;
				if (node._async && !parent.isArgsList && // func(_) is ok
					!(parent.type === PROPERTY_INIT && node === parent.children[0]) && // { _: 1 } is ok
					!(parent.type === DOT && node === parent.children[1]))
					throw new Error("invalid usage of '_'")
				parent._async |= node._async;
				return node;
			case NEW_WITH_ARGS:
				var cbIndex = node.children[1].children.reduce(function(index, arg, i) {
					if (arg.type !== IDENTIFIER || arg.value !== options.callback) return index;
					if (index < 0) return i;
					else throw new Error("duplicate _ argument");
				}, -1);
				if (cbIndex >= 0) {
					var constr = _node(node, CALL, [_identifier(_safeName(options.precious, '__construct')), _node(node, LIST, [node.children[0], _number(cbIndex)])]);
					node = _node(node, CALL, [constr, node.children[1]]);
				}
				node.children[1].isArgsList = true;
				node = _propagate(node, _doIt);
				parent._async |= node._async;
				return node;
			case CALL:
				node.children[1].isArgsList = true;
				_convertCoffeeScriptCalls(node, options);
				_convertApply(node, options);
				node.children[1].isArgsList = true;
				// fall through
			default:
				// todo: set breaks flag
				node = _propagate(node, _doIt);
				_setBreaks(node);
				parent._async |= node._async;
				return node;
			}
		}
		return _propagate(node, _doIt);
	}

	function _convertCoffeeScriptCalls(node, options) {
		// takes care of anonymous functions inserted by 
		// CoffeeScript compiler
		var fn = node.children[0];
		var args = node.children[1];
		if (fn.type === FUNCTION && fn.params.length === 0 && !fn.name && args.children.length == 0) {
			// (function() { ... })() 
			// --> (function(_) { ... })(_)
			fn._noFuture = true;
			fn.params = [options.callback];
			args.children = [_identifier(options.callback)];
		} else if (fn.type === DOT) {
			var ident = fn.children[1];
			fn = fn.children[0];
			if (fn.type === FUNCTION && fn.params.length === 0 && !fn.name && ident.type === IDENTIFIER) {
				if (ident.value === "call" && args.children.length === 1 && args.children[0].type === THIS) {
					// (function() { ... }).call(this) 
					// --> (function(_) { ... })(_)
					node.children[0] = fn;
					fn._noFuture = true;
					fn.params = [options.callback];
					args.children = [_identifier(options.callback)];
					node._scope.hasThis = true;
					fn._inhibitThis = true;
				} else if (ident.value === "apply" && args.children.length === 2 && args.children[0].type === THIS && args.children[1].type === IDENTIFIER && args.children[1].value === "arguments") {
					// (function() { ... }).apply(this, arguments) 
					// --> (function(_) { ... })(_)
					node.children[0] = fn;
					fn._noFuture = true;
					fn.params = [options.callback];
					args.children = [_identifier(options.callback)];
					node._scope.hasThis = true;
					node._scope.hasArguments = true;
					fn._inhibitThis = true;
					fn._inhibitArguments = true;
				}
			}
		}
	}

	function _isFatArrow(node) {
		//this.method = function(_) {
        //	return Test.prototype.method.apply(_this, arguments);
      	//};
      	// Params may vary but so we only test body.
      	if (node.body.children.length !== 1) return false;
      	var n = node.body.children[0];
      	if (n.type !== RETURN || !n.value) return false;
      	n = n.value;
      	if (n.type !== CALL) return false;
      	var args = n.children[1].children;
      	var target = n.children[0];
      	if (args.length !== 2 || args[0].value !== '_this' || args[1].value !== 'arguments') return false;
      	if (target.type !== DOT || target.children[1].value !== 'apply') return false;
      	target = target.children[0];
      	if (target.type !== DOT || target.children[1].type !== IDENTIFIER) return false;
      	target = target.children[0];
      	if (target.type !== DOT || target.children[1].value !== 'prototype') return false;
      	target = target.children[0];
      	if (target.type !== IDENTIFIER) return false;
      	// Got it. Params are useless so nuke them
      	node.params = [];
      	return true;
    }

	function _convertApply(node, options) {
		// f.apply(this, arguments) -> __apply(_, f, __this, __arguments, cbIndex)
		var dot = node.children[0];
		var args = node.children[1];
		if (dot.type === DOT) {
			var ident = dot.children[1];
			if (ident.type === IDENTIFIER && ident.value === "apply" && args.children.length === 2 && args.children[0].type === THIS && args.children[1].type === IDENTIFIER && args.children[1].value === "arguments") {
				var f = dot.children[0];
				node.children[0] = _identifier('__apply');
				args.children = [_identifier(options.callback), f, _identifier('__this'), _identifier('__arguments'), _number(node._scope.cbIndex)];
				node._scope.hasThis = true;
				node._scope.hasArguments = true;
			}
		}
	}

	var _switchVarTemplate = new Template("canon", "{ var $v = true; }");
	var _switchIfTemplate = new Template("canon", "if ($v) { $block; }");

	function _setBreaks(node) {
		switch (node.type) {
		case IF:
			node._breaks = node.thenPart._breaks && node.elsePart && node.elsePart._breaks;
			break;
		case SWITCH:
			for (var i = 0; i < node.cases.length; i++) {
				var stmts = node.cases[i].statements;
				if (node._async && stmts.children.length > 0 && !stmts._breaks) {
					// narcissus has the strange idea of inserting an empty default after last case.
					// If we detect this and if the last case is not terminated by a break, we do not consider it an error 
					// and we just fix it by adding a break.
					if (i == node.cases.length - 2 && node.cases[i + 1].type === DEFAULT && node.cases[i + 1].statements.children.length === 1 && node.cases[i + 1].statements.children[0].type === SEMICOLON && node.cases[i + 1].statements.children[0].expression == null) {
						stmts.children.push(_node(node, BREAK));
						stmts._breaks = true;
					} else if (i === node.cases.length - 1) {
						stmts.children.push(_node(node, BREAK));
						stmts._breaks = true;
					} else {
						// we rewrite:
						//		case A: no_break_A
						//		case B: no_break_B
						//		case C: breaking_C
						//
						// as:
						//		case A: var __A = true;
						//		case B: var __B = true;
						//		case C:
						//			if (__A) no_break_A
						//			if (__B) no_break_B
						//			breaking_C
						var v = _identifier(_genId(node));
						node.cases[i].statements = _switchVarTemplate.generate(node.cases[i], {
							$v: v,
						});
						var ifStmt = _switchIfTemplate.generate(node.cases[i], {
							$v: v,
							$block: stmts,
						});
						node.cases[i + 1].statements.children.splice(0, 0, ifStmt);
					}
				}
			}
			break;
		case TRY:
			node._breaks = node.tryBlock._breaks && node.catchClauses[0] && node.catchClauses[0].block._breaks;
			break;
		case BLOCK:
		case SCRIPT:
			node.children.forEach(function(child) {
				node._breaks |= child._breaks;
			});
			break;
		case RETURN:
		case THROW:
		case BREAK:
			node._breaks = true;
			break;
		}
	}

	/*
	 * Flow canonicalization pass:
	 *   Converts all loops to FOR format
	 *   Converts lazy expressions
	 *   Splits try/catch/finally
	 *   Wraps isolated statements into blocks
	 */

	function _statementify(exp) {
		if (!exp) return exp;
		var block = _node(exp, BLOCK, []);

		function uncomma(node) {
			if (node.type === COMMA) {
				node.children.forEach(uncomma);
			} else {
				block.children.push(node.type == SEMICOLON ? node : _semicolon(node));
			}
		}
		uncomma(exp);
		return block;

	}

	function _blockify(node) {
		if (!node || node.type == BLOCK) return node;
		if (node.type == COMMA) return _statementify(node);
		var block = _node(node, BLOCK, [node]);
		block._async = node._async;
		return block;
	}

	var _flowsTemplates = {
		WHILE: new Template("flows", "{" + //
		"	for (; $condition;) {" + //
		"		$body;" + //
		"	}" + //
		"}"),

		DO: new Template("flows", "{" + //
		"	var $firstTime = true;" + //
		"	for (; $firstTime || $condition;) {" + //
		"		$firstTime = false;" + //
		"		$body;" + //
		"	}" + //
		"}"),

		FOR: new Template("flows", "{" + //
		"	$setup;" + //
		"	for (; $condition; $update) {" + //
		"		$body;" + //
		"	}" + //
		"}"),

		FOR_IN: new Template("flows", "{" + //
		"	var $array = __forIn($object);" + //
		"	var $i = 0;" + //
		"	for (; $i < $array.length;) {" + //
		"		$iter = $array[$i++];" + //
		"		$body;" + //
		"	}" + //
		"}"),

		TRY: new Template("flows", "" + //
		"try {" + //
		"	try { $try; }" + //
		"	catch ($ex) { $catch; }" + //
		"}" + //
		"finally { $finally; }"),

		AND: new Template("flows", "" + //
		"return (function $name(_){" + //
		"	var $v = $op1;" + //
		"	if (!$v) {" + //
		"		return $v;" + //
		"	}" + //
		"	return $op2;" + //
		"})(_)", true, true),

		OR: new Template("flows", "" + //
		"return (function $name(_){" + //
		"	var $v = $op1;" + //
		"	if ($v) {" + //
		"		return $v;" + //
		"	}" + //
		"	return $op2;" + //
		"})(_)", true, true),

		HOOK: new Template("flows", "" + //
		"return (function $name(_){" + //
		"	var $v = $condition;" + //
		"	if ($v) {" + //
		"		return $true;" + //
		"	}" + //
		"	return $false;" + //
		"})(_);", true, true),

		COMMA: new Template("flows", "" + //
		"return (function $name(_){" + //
		"	$body;" + //
		"	return $result;" + //
		"})(_);", true, true),

		CONDITION: new Template("flows", "" + //
		"return (function $name(_){" + //
		"	return $condition;" + //
		"})(_);", true, true),

		UPDATE: new Template("flows", "" + //
		"return (function $name(_){" + //
		"	$update;" + //
		"})(_);", true, true)
	};

	function _canonFlows(node, options) {
		function _doIt(node, parent) {
			var scope = node._scope;

			function _doAsyncFor(node) {
				// extra pass to wrap async condition and update
				if (node.condition && node.condition._async && node.condition.type !== CALL) node.condition = _flowsTemplates.CONDITION.generate(node, {
					$name: "__$" + node._scope.name,
					$condition: node.condition
				});
				if (node.update && node.update._async) node.update = _flowsTemplates.UPDATE.generate(node, {
					$name: "__$" + node._scope.name,
					$update: _statementify(node.update)
				});
			}
			if (node.type == FOR && node._pass === "flows") _doAsyncFor(node);
			if (!scope || !scope.isAsync() || node._pass === "flows") return _propagate(node, _doIt);

			switch (node.type) {
			case IF:
				node.thenPart = _blockify(node.thenPart);
				node.elsePart = _blockify(node.elsePart);
				break;
			case SWITCH:
				if (node._async) {
					var def = node.cases.filter(function(n) {
						return n.type == DEFAULT
					})[0];
					if (!def) {
						def = _node(node, DEFAULT);
						def.statements = _node(node, BLOCK, []);
						node.cases.push(def);
					}
					if (!def._breaks) {
						def.statements.children.push(_node(node, BREAK))
					}
				}
				break;
			case WHILE:
				node.body = _blockify(node.body);
				if (node._async) {
					node = _flowsTemplates.WHILE.generate(node, {
						$condition: node.condition,
						$body: node.body
					});
				}
				break;
			case DO:
				node.body = _blockify(node.body);
				if (node._async) {
					node = _flowsTemplates.DO.generate(node, {
						$firstTime: _identifier(_genId(node)),
						$condition: node.condition,
						$body: node.body
					});
				}
				break;
			case FOR:
				node.condition = node.condition || _number(1);
				node.body = _blockify(node.body);
				if (node._async) {
					if (node.setup) {
						node = _flowsTemplates.FOR.generate(node, {
							$setup: _statementify(node.setup),
							$condition: node.condition,
							$update: node.update,
							$body: node.body
						});
					} else {
						if (node._pass !== "flows") {
							node._pass = "flows";
							_doAsyncFor(node);
						}
					}
				}
				break;
			case FOR_IN:
				node.body = _blockify(node.body);
				if (node._async) {
					if (node.iterator.type != IDENTIFIER) {
						throw new Error("unsupported 'for ... in' syntax: type=" + _tag(node.iterator));
					}
					node = _flowsTemplates.FOR_IN.generate(node, {
						$array: _identifier(_genId(node)),
						$i: _identifier(_genId(node)),
						$object: node.object,
						$iter: node.iterator,
						$body: node.body
					});
				}
				break;
			case TRY:
				if (node.tryBlock && node.catchClauses[0] && node.finallyBlock) {
					node = _flowsTemplates.TRY.generate(node, {
						$try: node.tryBlock,
						$catch: node.catchClauses[0].block,
						$ex: node.catchClauses[0].varName,
						$finally: node.finallyBlock
					})
				}
				break;
			case AND:
			case OR:
				if (node._async) {
					node = _flowsTemplates[_tag(node)].generate(node, {
						$name: "__$" + node._scope.name,
						$v: _identifier(_genId(node)),
						$op1: node.children[0],
						$op2: node.children[1]
					});
				}
				break;
			case HOOK:
				if (node._async) {
					node = _flowsTemplates.HOOK.generate(node, {
						$name: "__$" + node._scope.name,
						$v: _identifier(_genId(node)),
						$condition: node.children[0],
						$true: node.children[1],
						$false: node.children[2]
					});
				}
				break;

			case COMMA:
				if (node._async) {
					node = _flowsTemplates.COMMA.generate(node, {
						$name: "__$" + node._scope.name,
						$body: _node(node, BLOCK, node.children.slice(0, node.children.length - 1).map(_semicolon)),
						$result: node.children[node.children.length - 1]
					});
				}
				break;
			}
			return _propagate(node, _doIt);
		}
		return _propagate(node, _doIt);
	}

	/*
	 * Disassembly pass
	 */

	function _split(node, prop) {
		var exp = node[prop];
		if (!exp || !exp._async) return node;
		var id = _genId(node);
		var v = _identifier(id, exp);
		node[prop] = _identifier(id);
		return _node(node, BLOCK, [_node(node, VAR, [v]), node]);
	}

	function _disassemble(node, options) {
		function _disassembleIt(node, parent, noResult) {
			if (!node._async) return _propagate(node, _scanIt);
			node = _propagate(node, _disassembleIt);
			if (node.type === CALL) {
				if (node.children[0].type === IDENTIFIER && node.children[0].value.indexOf('__wrap') == 0) {
					node._isWrapper = true;
					return node;
				}
				var args = node.children[1];
				if (args.children.some(function(arg) {
					return (arg.type === IDENTIFIER && arg.value === options.callback) || arg._isWrapper;
				})) {
					if (noResult) {
						node._scope.disassembly.push(_statementify(node));
						return;
					} else {
						if (parent.type == IDENTIFIER && parent.value.indexOf('__') === 0) {
							// don't generate another ID, use the parent one
							node._skipDisassembly = true;
							return node;
						}
						var id = _genId(node);
						var v = _identifier(id, node);
						node = _node(node, VAR, [v]);
						node._scope.disassembly.push(node);
						return _identifier(id);
					}
				}
			}
			return node;
		}

		function _scanIt(node, parent) {
			var scope = node._scope;
			if (!scope || !scope.isAsync() || !node._async) return _propagate(node, _scanIt);
			switch (node.type) {
			case IF:
				node = _split(node, "condition");
				break;
			case SWITCH:
				node = _split(node, "discriminant");
				break;
			case FOR:
				break;
			case RETURN:
				node = _split(node, "value");
				break;
			case THROW:
				node = _split(node, "exception");
				break;
			case VAR:
				_assert(node.children.length === 1);
				var ident = node.children[0];
				scope.disassembly = [];
				ident.initializer = _disassembleIt(ident.initializer, ident);
				node._async = ident.initializer._skipDisassembly;
				scope.disassembly.push(node);
				return _node(parent, BLOCK, scope.disassembly);
			case SEMICOLON:
				scope.disassembly = [];
				node.expression = _disassembleIt(node.expression, node, true);
				if (node.expression) {
					node._async = false;
					scope.disassembly.push(node);
				}
				return _node(parent, BLOCK, scope.disassembly);
			}
			return _propagate(node, _scanIt);
		}
		return _propagate(node, _scanIt);

	}

	/*
	 * Transformation pass - introducing callbacks
	 */
	var _cbTemplates = {
		FUNCTION: new Template("cb", "{" + //
		"	$decls;" + //
		"	var __frame = { name: $fname, line: $line };" + //
		"	return __func(_, this, arguments, $fn, $index, __frame, function $name(){" + //
		"		$body;" + //
		"		_();" + //
		"	});" + //
		"}"),

		FUNCTION_INTERNAL: new Template("cb", "{ $decls; $body; _(); }"),

		RETURN: new Template("cb", "return _(null, $value);"),

		RETURN_UNDEFINED: new Template("cb", "return _(null);"),

		THROW: new Template("cb", "return _($exception);"),

		IF: new Template("cb", "" + //
		"return (function $name(__then){" + //
		"	if ($condition) { $then; __then(); }" + //
		"	else { $else; __then(); }" + //
		"})(function $name(){ $tail; });"),

		SWITCH: new Template("cb", "" + // 
		"return (function $name(__break){" + //
		"	$statement;" + //
		"})(function $name(){ $tail; });"),

		LABEL: new Template("cb", "" + // 
		"$statement;" + //
		"$tail;"),

		BREAK: new Template("cb", "return __break();"),
		
		LABELLED_BREAK: new Template("cb", "return $break();"),

		CONTINUE: new Template("cb", "" + //
		"while (__more) { __loop(); } __more = true;" + //
		"return;"),

		LABELLED_CONTINUE: new Template("cb", "" + //
		"while ($more.get()) { $loop(); } $more.set(true);" + //
		"return;"),

		LOOP1: new Template("cb", "" + //
		"if ($v) {" + //
		"	$body;" + //
		"	while (__more) { __loop(); } __more = true;" + //
		"}" + //
		"else { __break(); }"),

		// LOOP2 is in temp pass so that it gets transformed if update is async
		LOOP2: new Template("temp", "var $v = $condition; $loop1;"),

		LOOP2_UPDATE: new Template("temp", "" + //
		"if ($beenHere) { $update; } else { $beenHere = true; }" + //
		"var $v = $condition; $loop1;"),

		FOR: new Template("cb", "" + //
		"return (function ___(__break){" + //
		"	var __more;" + //
		"	var __loop = __cb(_, __frame, 0, 0, function $name(){" + //
		"		__more = false;" + //
		"		$loop2" + //
		"	});" + //
		"	do { __loop(); } while (__more); __more = true;" + //
		"})(function $name(){ $tail;});"),

		LABELLED_FOR: new Template("cb", "" + //
		"return (function ___(__break){" + //
		"	var __more, $more = { get: function() { return __more; }, set: function(v) { __more = v; }};" + //
		"	var __loop = __cb(_, __frame, 0, 0, function $name(){" + //
		"		var $break = __break, $loop = __loop;" + //
		"		__more = false;" + //
		"		$loop2" + //
		"	});" + //
		"	do { __loop(); } while (__more); __more = true;" + //
		"})(function $name(){ $tail;});"),

		FOR_UPDATE: new Template("cb", "" + //
		"var $beenHere = false;" + //
		"return (function ___(__break){" + //
		"	var __more;" + //
		"	var __loop = __cb(_, __frame, 0, 0, function $name(){" + //
		"		__more = false;" + //
		"		$loop2" + //
		"	});" + //
		"	do { __loop(); } while (__more); __more = true;" + //
		"})(function $name(){ $tail; });"),

		LABELLED_FOR_UPDATE: new Template("cb", "" + //
		"var $beenHere = false;" + //
		"return (function ___(__break){" + //
		"	var __more, $more = { get: function() { return __more; }, set: function(v) { __more = v; }};" + //
		"	var __loop = __cb(_, __frame, 0, 0, function $name(){" + //
		"		var $break = __break, $loop = __loop;" + //
		"		__more = false;" + //
		"		$loop2" + //
		"	});" + //
		"	do { __loop(); } while (__more); __more = true;" + //
		"})(function $name(){ $tail; });"),

		CATCH: new Template("cb", "" + //
		"return (function ___(__then){" + //
		"	(function ___(_){" + //
		"		__tryCatch(_, function $name(){ $try; __then(); });" + //
		"	})(function ___($ex, __result){" + //
		"		__catch(function $name(){" + //
		"			if ($ex) { $catch; __then(); }" + //
		"			else { _(null, __result); }" + //
		"		});" + //
		"	});" + //
		"})(function ___(){" + //
		"	__tryCatch(_, function $name(){ $tail; });" + //
		"});"),

		FINALLY: new Template("cb", "" + //
		"return (function ___(__then){" + //
		"	(function ___(_){" + //
		"		__tryCatch(_, function $name(){ $try; _(null, null, true); });" + //
		"	})(function ___(__e, __r, __cont){" + //
		"		(function ___(__then){" + //
		"			__tryCatch(_, function $name(){ $finally; __then(); });" + //
		"		})(function ___(){" + //
		"			__tryCatch(_, function ___(){" + //
		"				if (__cont) __then(); else _(__e, __r);" + //
		"			});" + //
		"		})" + //
		"	});" + //
		"})(function ___(){" + //
		"	__tryCatch(_, function $name(){ $tail; });" + //
		"});"),

		CALL_VOID: new Template("cb", "return __cb(_, __frame, $offset, $col, function $name(){ $tail; }, true, $returnArray)", true),

		CALL_TMP: new Template("cb", "return __cb(_, __frame, $offset, $col, function ___(__0, $result){ $tail }, true, $returnArray)", true),

		CALL_RESULT: new Template("cb", "" + //
		"return __cb(_, __frame, $offset, $col, function $name(__0, $v){" + //
		"	var $result = $v;" + //
		"	$tail" + //
		"}, true, $returnArray)", true)
	};

	function _callbackify(node, options) {
		var label;
		function _scanIt(node, parent) {
			//console.log("CBIT: " + _tag(node) + " " + pp(node))
			node = _flatten(node);
			if (!node._scope || !node._scope.isAsync() || node._pass === "cb") return _propagate(node, _scanIt);
			switch (node.type) {
			case SCRIPT:
				if (parent._pass !== "cb") {
					// isolate the leading decls from the body because 'use strict'
					// do not allow hoisted functions inside try/catch
					var decls;
					for (var cut = 0; cut < node.children.length; cut++) {
						var child = node.children[cut];
						if (child.type === STRING && child.value === "BEGIN_BODY") {
							decls = node.children.splice(0, cut);
							node.children.splice(0, 1);
							break;
						}
					}
					var template = parent._noFuture || parent._pass === "flows" ? _cbTemplates.FUNCTION_INTERNAL : _cbTemplates.FUNCTION;
					node = template.generate(node, {
						$fn: parent.name,
						//node._scope.name ? _identifier(node._scope.name) : _node(node, NULL),
						$name: "__$" + node._scope.name,
						$fname: _string(parent.name),
						$line: _number(originalLine(options, node._scope.line)),
						$index: _number(node._scope.cbIndex),
						$decls: _node(node, BLOCK, decls || []),
						$body: node
					});
				}
				node.type = SCRIPT;
				// continue with block restructure
			case BLOCK:
				for (var i = 0; i < node.children.length; i++) {
					node.children[i] = _restructureIt(node, i);
				}
				return node;
			}
			return _propagate(node, _scanIt);
		}

		function _extractTail(parent, i) {
			return _node(parent, BLOCK, parent.children.splice(i + 1, parent.children.length - i - 1));
		}

		function _restructureIt(parent, i) {
			var node = parent.children[i];
			if (node._pass === "cb") return _propagate(node, _scanIt);
			//console.log("RESTRUCTUREIT: " + _tag(node) + " " + pp(node))
			switch (node.type) {
			case RETURN:
				_extractTail(parent, i);
				var template = node.value ? _cbTemplates.RETURN : _cbTemplates.RETURN_UNDEFINED;
				node = template.generate(node, {
					$value: node.value
				});
				break;
			case THROW:
				_extractTail(parent, i);
				node = _cbTemplates.THROW.generate(node, {
					$exception: node.exception
				});
				break;
			case BREAK:
				if (node.target && !node.target._async) {
					break;
				}
				_extractTail(parent, i);
				if (node.label) {
					node = _cbTemplates.LABELLED_BREAK.generate(node, {
						$break: _safeName(options.precious, '__break__' + node.label)
					});
				} else {
					node = _cbTemplates.BREAK.generate(node, {});					
				}
				break;
			case CONTINUE:
				if (node.target && !node.target._async) {
					break;
				}
				_extractTail(parent, i);
				if (node.label) {
					node = _cbTemplates.LABELLED_CONTINUE.generate(node, {
						$loop: _safeName(options.precious, '__loop__' + node.label),
						$more: _safeName(options.precious, '__more__' + node.label),
					});					
				} else {
					node = _cbTemplates.CONTINUE.generate(node, {});					
				}
				break;
			case TRY:
				var tail = _extractTail(parent, i);
				if (node.catchClauses[0]) {
					node = _cbTemplates.CATCH.generate(node, {
						$name: "__$" + node._scope.name,
						$try: node.tryBlock,
						$catch: node.catchClauses[0].block,
						$ex: node.catchClauses[0].varName,
						$tail: tail
					});
				} else {
					node = _cbTemplates.FINALLY.generate(node, {
						$name: "__$" + node._scope.name,
						$try: node.tryBlock,
						$finally: node.finallyBlock,
						$tail: tail
					});
				}
				break;
			default:
				if (node._async) {
					var tail = _extractTail(parent, i);
					switch (node.type) {
					case IF:
						node = _cbTemplates.IF.generate(node, {
							$name: "__$" + node._scope.name,
							$condition: node.condition,
							$then: node.thenPart,
							$else: node.elsePart || _node(node, BLOCK, []),
							$tail: tail
						});
						break;
					case SWITCH:
						node._pass = "cb"; // avoid infinite recursion
						node = _cbTemplates.SWITCH.generate(node, {
							$name: "__$" + node._scope.name,
							$statement: node,
							$tail: tail
						});
						break;
					case LABEL:
						var l = label;
						label = node.label;
						node = _cbTemplates.LABEL.generate(node, {
							$name: "__$" + node._scope.name,
							$statement: node.statement,
							$tail: tail
						});
						node = _scanIt(node, parent);
						label = l;
						return node;
					case FOR:
						var v = _identifier(_genId(node));
						var loop1 = _cbTemplates.LOOP1.generate(node, {
							$v: v,
							$body: node.body,
						});
						var update = node.update;
						var beenHere = update && _identifier(_genId(node));
						var loop2 = (update ? _cbTemplates.LOOP2_UPDATE : _cbTemplates.LOOP2).generate(node, {
							$v: v,
							$condition: node.condition,
							$beenHere: beenHere,
							$update: _statementify(update),
							$loop1: loop1
						});
						node = (update 
							? (label ? _cbTemplates.LABELLED_FOR_UPDATE : _cbTemplates.FOR_UPDATE) 
							: (label ? _cbTemplates.LABELLED_FOR : _cbTemplates.FOR)).generate(node, {
							$name: "__$" + node._scope.name,
							$loop: _identifier(_safeName(options.precious, '__loop__' + label)),
							$break: _identifier(_safeName(options.precious, '__break__' + label)),
							$more: _identifier(_safeName(options.precious, '__more__' + label)),
							$beenHere: beenHere,
							$loop2: loop2,
							$tail: tail

						});
						break;
					case VAR:
						_assert(node.children.length == 1);
						var ident = node.children[0];
						_assert(ident.type === IDENTIFIER);
						var call = ident.initializer;
						delete ident.initializer;
						_assert(call && call.type === CALL);
						return _restructureCall(call, tail, ident.value);
					case SEMICOLON:
						var call = node.expression;
						_assert(call.type === CALL)
						return _restructureCall(call, tail);
					default:
						throw new Error("internal error: bad node type: " + _tag(node) + ": " + pp(node));
					}
				}
			}
			return _scanIt(node, parent);

			function _restructureCall(node, tail, result) {
				var args = node.children[1];

				function _cbIndex(args) {
					return args.children.reduce(function(index, arg, i) {
						if ((arg.type == IDENTIFIER && arg.value === options.callback) || arg._isWrapper) return i;
						else return index;
					}, -1);
				}
				var i = _cbIndex(args);
				_assert(i >= 0);
				var returnArray = args.children[i]._returnArray;
				if (args.children[i]._isWrapper) {
					args = args.children[i].children[1];
					i = _cbIndex(args);
				}
				var bol = options.source.lastIndexOf('\n', node.start) + 1;
				var col = node.start - bol;
				args.children[i] = (result ? result.indexOf('__') === 0 ? _cbTemplates.CALL_TMP : _cbTemplates.CALL_RESULT : _cbTemplates.CALL_VOID).generate(node, {
					$v: _genId(node),
					$frameName: _string(node._scope.name),
					$offset: _number(originalLine(options, node.lineno, col) - originalLine(options, node._scope.line)),
					$col: _number(originalCol(options, node.lineno, col)),
					$name: "__$" + node._scope.name,
					$returnArray: returnArray,
					$result: result,
					$tail: tail
				});
				node = _propagate(node, _scanIt);

				var stmt = _node(node, RETURN, []);
				stmt.value = node;
				stmt._pass = "cb";
				return stmt;
			}
		}
		return _propagate(node, _scanIt);
	}

	/*
	 * Simplify pass - introducing callbacks
	 */

	function _checkUsed(val, used) {
		if (typeof val === "string" && val.substring(0, 2) === "__") used[val] = true;
	}


	var _optims = {
		function__0$fn: new Template("simplify", "return function ___(__0) { $fn(); }", true).root,
		function$return: new Template("simplify", "return function $fn1() { return $fn2(); }", true).root,
		function__0$arg1return_null$arg2: new Template("simplify", "return function ___(__0, $arg1) { return _(null, $arg2); }", true).root,
		__cb__: new Template("simplify", "return __cb(_, $frameVar, $line, $col, _)", true).root,
		__cbt__: new Template("simplify", "return __cb(_, $frameVar, $line, $col, _, true)", true).root,
		function$fn: new Template("simplify", "return function $fn1() { $fn2(); }", true).root

	}

	function _simplify(node, options, used) {
		if (node._simplified) return node;
		node._simplified = true;
		_propagate(node, function(child) {
			return _simplify(child, options, used)
		});
		_checkUsed(node.value, used);

		function _match(prop, v1, v2, result) {
			var ignored = ["parenthesized", "lineno", "start", "end", "tokenizer", "hasReturnWithValue"];
			if (prop.indexOf('_') == 0 || ignored.indexOf(prop) >= 0) return true;
			if (v1 == v2) return true;
			if (v1 == null || v2 == null) {
				// ignore difference between null and empty array
				if (prop == "children" && v1 && v1.length === 0) return true;
				return false;
			}
			if (Array.isArray(v1)) {
				if (v1.length != v2.length) return false;
				for (var i = 0; i < v1.length; i++) {
					if (!_match(prop, v1[i], v2[i], result)) return false;
				}
				return true;
			}
			if (v1.type === IDENTIFIER && v1.value[0] === "$" && v2.type === NUMBER) {
				result[v1.value] = v2.value;
				return true;
			}
			if (typeof v1 == "string" && v1[0] == "$" && typeof v2 == "string") {
				result[v1] = v2;
				return true;
			}
			if (v1.type) {
				var exp;
				if (v1.type == SCRIPT && v1.children[0] && (exp = v1.children[0].expression) && typeof exp.value == "string" && exp.value[0] == '$') {
					result[exp.value] = v2;
					return true;
				}
				if (v1.type != v2.type) return false;
				if (v1.type == IDENTIFIER && v1.value == '$') {
					result[v1.value] = v2.value;
					return true;
				}

				for (var prop in v1) {
					if (v1.hasOwnProperty(prop) && prop.indexOf("Decls") < 0 && prop != "target") {
						if (!_match(prop, v1[prop], v2[prop], result)) return false;
					}
				}
				return true;
			}
			return false;
		}

		var result = {};
		if (_match("", _optims.function__0$fn, node, result)) return _identifier(result.$fn);
		if (_match("", _optims.function$return, node, result) && (result.$fn1 === '___' || result.$fn1.indexOf('__$') === 0) && (result.$fn2 === '__break')) return _identifier(result.$fn2);
		if (_match("", _optims.function__0$arg1return_null$arg2, node, result) && result.$arg1 == result.$arg2) return _identifier("_");
		if (options.optimize && _match("", _optims.__cb__, node, result)) return _identifier("_");
		if (options.optimize && _match("", _optims.__cbt__, node, result)) return _identifier("_");
		if (_match("", _optims.function$fn, node, result) && (result.$fn1 === '___' || result.$fn1.indexOf('__$') === 0) && (result.$fn2 === '_' || result.$fn2 === '__then' || result.$fn2 === '__loop')) return _identifier(result.$fn2);
		_flatten(node);
		return node;
	}

	function _extend(obj, other) {
		for (var i in other) {
			obj[i] = other[i];
		}
		return obj;
	}

	function _cl(obj) {
		return _extend({}, obj);
	}

	/// * `transformed = transform.transform(source, options)`  
	///   Transforms streamline source.  
	///   The following `options` may be specified:
	///   * `sourceName` identifies source (stack traces, transformation errors)
	///   * `lines` controls line mapping
	//    Undocumented options:
	//    * (obsolete) `callback` alternative identifier if `_` is already used 
	//    * (internal) `noHelpers` disables generation of helper functions (`__cb`, etc.)
	//    * (internal) `optimize` optimizes transform (but misses stack frames)
	exports.transform = function(source, options) {
		try {
			source = source.replace(/\r\n/g, "\n");
			options = options ? _extend({}, options) : {}; // clone to isolate options set at file level
			var sourceOptions = /streamline\.options\s*=\s*(\{.*\})/.exec(source);
			if (sourceOptions) {
				_extend(options, JSON.parse(sourceOptions[1]));
			}
			options.source = source;
			options.callback = options.callback || "_";
			options.lines = options.lines || "preserve";
			options.precious = {}; // identifiers found inside source
			//console.log("TRANSFORMING " + options.sourceName)
			//console.log("source=" + source);
			var node = parse(source + "\n", options.sourceName); // final newline avoids infinite loop if unterminated string literal at the end
			var strict = node.children[0] && node.children[0].expression && node.children[0].expression.value == "use strict";
			strict && node.children.splice(0, 1);
			_markSource(node, options);
			//console.log("tree=" + node);
			node = _canonTopLevelScript(node, options);
			//console.log("CANONTOPLEVEL=" + pp(node));
			node = _canonScopes(node, options);
			//console.log("CANONSCOPES=" + pp(node));
			if (!options.needsTransform) return source;
			node = _canonFlows(node, options);
			//console.log("CANONFLOWS=" + pp(node));
			node = _disassemble(node, options);
			//console.log("DISASSEMBLE=" + pp(node))
			node = _callbackify(node, options);
			//console.log("CALLBACKIFY=" + pp(node))
			var used = {};
			node = _simplify(node, options, used);

			var result = format(node, options.lines);

			// add helpers at beginning so that __g is initialized before any other code
			if (!options.noHelpers) {
				var s = exports.helpersSource(options, used, strict);
				if (options.lines == "sourcemap") {
					result.prepend(s);
				} else {
					result = s + result;
				}
			}
			//console.log("result=" + result);
			//console.log("TRANSFORMED " + options.sourceName + ": " + result.length)
			return result;
		} catch (err) {
			var message = "error streamlining " + (options.sourceName || 'source') + ": " + err.message;
			if (err.source && err.cursor) {
				var line = 1;
				for (var i = 0; i < err.cursor; i++) {
					if (err.source[i] === "\n") line += 1;
				}
				message += " on line " + line;
			} else if (err.stack) {
				message += "\nSTACK:\n" + err.stack;
			}
			throw new Error(message);
		}
	}
	// hack to fix #123
	exports.transform.version = exports.version;

	function _trim(fn) {
		return fn.toString().replace(/\s+/g, " ");
	}

	function include(mod, modules) {
		var source = modules + "['" + mod + "']=(mod={exports:{}});";
		source += "(function(module, exports){";
		var req = require; 	// prevents client side require from getting fs as a dependency
		source += req('fs').readFileSync(__dirname + '/../' + mod + '.js', 'utf8').replace(/(\/\/[^"\n]*\n|\/\*[\s\S]*?\*\/|\n)[ \t]*/g, "");
		source += "})(mod, mod.exports);";
		return source;
	}

	function requireRuntime(options) {
		if (!options.standalone) return "require('streamline/lib/callbacks/runtime').runtime(__filename, " + !!options.oldStyleFutures + ")";
		var modules = _safeName(options.precious, "__modules");
		var s = "(function(){var " + modules + "={},mod;";
		s += "function require(p){var m=" + modules + "[p.substring(15)]; return m && m.exports};";
		s += include('globals', modules);
		s += include('util/future', modules);
		s += include('callbacks/runtime', modules);
		if (['funnel', 'forEach_', 'map_', 'filter_', 'every_', 'some_', 'reduce_', 'reduceRight_', 'sort_', 'apply_'].some(function(name) {
				return options.precious[name];
			})) s += include('callbacks/builtins', modules);
		s += "return " + modules + "['callbacks/runtime'].exports.runtime(__filename, " + !!options.oldStyleFutures + ");";
		s += "})()";
		return s;
	}

	// Undocumented (internal)
	exports.helpersSource = function(options, used, strict) {
		var srcName = "" + options.sourceName; // + "_.js";
		var i = srcName.indexOf('node_modules/');
		if (i == -1 && typeof process === 'object' && typeof process.cwd === 'function') i = process.cwd().length;
		srcName = i >= 0 ? srcName.substring(i + 13) : srcName;
		var sep = options.lines == "preserve" ? " " : "\n";
		strict = strict ? '"use strict";' + sep : "";
		var s = sep + strict;
		var keys = ['__g', '__func', '__cb', '__future', '__propagate', '__trap', '__catch', '__tryCatch', '__forIn', '__apply', '__construct', '__setEF'];
		var __rt = _safeName(options.precious, "__rt");
		s += "var " + __rt + "=" + requireRuntime(options);
		keys.forEach(function(key) {
			var k = _safeName(options.precious, key);
			if (used[k]) s += "," + k + "=" + __rt + "." + key;
		});
		s += ";" + sep;
		return s;
	}
})(typeof exports !== 'undefined' ? exports : (window.Streamline = window.Streamline || {}));
