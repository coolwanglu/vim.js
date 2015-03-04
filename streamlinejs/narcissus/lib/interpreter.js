/* -*- Mode: JS; tab-width: 4; indent-tabs-mode: nil; -*-
 * vim: set sw=4 ts=4 et tw=78:
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Narcissus JavaScript engine.
 *
 * The Initial Developer of the Original Code is
 * Brendan Eich <brendan@mozilla.org>.
 * Portions created by the Initial Developer are Copyright (C) 2004
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Tom Austin <taustin@ucsc.edu>
 *   Brendan Eich <brendan@mozilla.org>
 *   Shu-Yu Guo <shu@rfrn.org>
 *   Dave Herman <dherman@mozilla.com>
 *   Dimitris Vardoulakis <dimvar@ccs.neu.edu>
 *   Patrick Walton <pcwalton@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Narcissus - JS implemented in JS.
 *
 * Execution of parse trees.
 *
 * Standard classes except for eval, Function, Array, and String are borrowed
 * from the host JS environment.  Function is metacircular.  Array and String
 * are reflected via wrapping the corresponding native constructor and adding
 * an extra level of prototype-based delegation.
 */

var parser = require('./parser');
var options = require('./options');
var definitions = require('./definitions');
var resolver = require('./resolver');
var hostGlobal = require('./global');
var bytecode = require('./bytecode');
var decompiler = require('./decompiler');

// Set constants in the local scope.
eval(definitions.consts);

const WeakMap = definitions.WeakMap;
const StaticEnv = resolver.StaticEnv;
const Def = resolver.Def;

const applyNew = definitions.applyNew;

const GLOBAL_CODE = 0, EVAL_CODE = 1, FUNCTION_CODE = 2, MODULE_CODE = 3;

// An unexported type of exception object used for internal signalling.
// User exceptions are self-representing; whenever we use exceptions to
// model other kinds of control flow, such as early exits from loops or
// functions, we use instances of InternalSignal.
function InternalSignal() { }

InternalSignal.prototype = { toString: function() { return "[object InternalSignal]" } };

const RETURN_SIGNAL = new InternalSignal,
      BREAK_SIGNAL = new InternalSignal,
      CONTINUE_SIGNAL = new InternalSignal,
      EXIT_SIGNAL = new InternalSignal;

function ExecutionContext(type, strict) {
    this.type = type;
    this.strict = !!strict;
}

function isStackOverflow(e) {
    var re = /InternalError: (script stack space quota is exhausted|too much recursion)/;
    return re.test(e.toString());
}

// The underlying global object for narcissus.
var globalBase = {
    // Value properties.
    NaN: NaN, Infinity: Infinity, undefined: undefined,

    // Function properties.
    eval: function eval(s) {
        if (typeof s !== "string")
            return s;

        var x = ExecutionContext.current;
        var x2 = new ExecutionContext(EVAL_CODE);
        x2.thisObject = x.thisObject;
        x2.thisModule = x.thisModule;
        x2.functionInstance = x.functionInstance;
        x2.scope = x.strict ? { object: new Object, parent: x.scope } : x.scope;
        var ast = parser.parse(s);
        if (ast.hasModules) {
            resolver.resolve(ast, new StaticEnv(x.staticEnv));
            instantiateModules(ast, x2.scope);
        }
        x2.execute(ast);
        return x2.result;
    },

    // Class constructors.  Where ECMA-262 requires C.length === 1, we declare
    // a dummy formal parameter.
    Function: function Function(dummy) {
        var p = "", b = "", n = arguments.length;
        if (n) {
            var m = n - 1;
            if (m) {
                p += arguments[0];
                for (var k = 1; k < m; k++)
                    p += "," + arguments[k];
            }
            b += arguments[m];
        }

        // XXX We want to pass a good file and line to the tokenizer.
        // Note the anonymous name to maintain parity with Spidermonkey.

        // NB: Use the STATEMENT_FORM constant since we don't want to push this
        // function onto the fake compilation context.
        var f = parser.parseFunction("anonymous(" + p + ") {" + b + "}", false, parser.STATEMENT_FORM);

        var s = {object: global, parent: null};
        return newFunction(f,{scope:s});
    },
    Array: function (dummy) {
        // Array when called as a function acts as a constructor.
        return Array.apply(this, arguments);
    },
    String: function String(s) {
        // Called as function or constructor: convert argument to string type.
        s = arguments.length ? "" + s : "";
        if (this instanceof String) {
            // Called as constructor: save the argument as the string value
            // of this String object and return this object.
            this.value = s;
            return this;
        }
        return s;
    },

    // Don't want to proxy RegExp or some features won't work
    RegExp: RegExp,

    // Extensions to ECMA.
    load: function load(s) {
        if (typeof s !== "string")
            return s;

        evaluate(snarf(s), s, 1)
    },
    dis: function dis(f) {
        if (typeof f !== "function")
            throw new TypeError(f + " is not a function");
        var fint = functionInternals.get(f);
        if (!fint)
            throw new TypeError("only works on scripts");
        return fint.getBytecode().toString();
    },
    quit: function() { throw EXIT_SIGNAL; },
    assertEq: function() {
        return assertEq.apply(null, arguments);
    }
};

function wrapNative(name, val) {
    if (!definitions.isNativeCode(val))
        return val;
    return Proxy.createFunction(
        definitions.makePassthruHandler(val),
        function() { return val.apply(hostGlobal, arguments); },
        function() { return applyNew(val, arguments); });
}

var hostHandler = definitions.blacklistHandler(hostGlobal, options.hiddenHostGlobals);
var hostHandlerGet = hostHandler.get;
hostHandler.get = function(receiver, name) {
    return wrapNative(name, hostHandlerGet(receiver, name));
};
var hostProxy = Proxy.create(hostHandler);

var globalStaticEnv;                       // global static scope
var moduleInstances = new WeakMap();       // maps module instance objects -> module instances
var global = Object.create(hostProxy, {}); // user global object

function resetEnvironment() {
    ExecutionContext.current = new ExecutionContext(GLOBAL_CODE);
    let names = Object.getOwnPropertyNames(global);
    for (let i = 0, n = names.length; i < n; i++) {
        delete global[names[i]];
    }
    moduleInstances = new WeakMap();
    globalStaticEnv = new StaticEnv();

    let names = Object.getOwnPropertyNames(hostProxy);
    for (let i = 0, n = names.length; i < n; i++) {
        globalStaticEnv.bind(names[i], new Def());
    }
    for (let key in globalBase) {
        let val = globalBase[key];
        global[key] = val;
        // NB: this assumes globalBase never contains module or import bindings
        globalStaticEnv.bind(key, new Def());
    }
}
resetEnvironment();

// Helper to avoid Object.prototype.hasOwnProperty polluting scope objects.
function hasDirectProperty(o, p) {
    return Object.prototype.hasOwnProperty.call(o, p);
}

// Reflect a host class into the target global environment by delegation.
function reflectClass(name, proto) {
    var gctor = global[name];
    definitions.defineProperty(gctor, "prototype", proto, true, true, true);
    definitions.defineProperty(proto, "constructor", gctor, false, false, true);
    return proto;
}

// Reflect Array -- note that all Array methods are generic.
reflectClass('Array', new Array);

// Reflect String, overriding non-generic methods.
var gSp = reflectClass('String', new String);
gSp.toSource = function () { return this.value.toSource(); };
gSp.toString = function () { return this.value; };
gSp.valueOf  = function () { return this.value; };
global.String.fromCharCode = String.fromCharCode;

ExecutionContext.current = null;

ExecutionContext.prototype = {
    scope: {object: global, parent: null},
    thisObject: global,
    thisModule: null,
    functionInstance: null,
    result: undefined,
    target: null,

    // Execute a node in this execution context.
    execute: function(n) {
        var prev = ExecutionContext.current;
        ExecutionContext.current = this;
        try {
            execute(n, this);
        } finally {
            ExecutionContext.current = prev;
        }
    },

    newFunction: function(n) {
        return newFunction(n, this);
    }
};

function Reference(base, propertyName, node) {
    this.base = base;
    this.propertyName = propertyName;
    this.node = node;
}

Reference.prototype.toString = function () {
    return decompiler.pp(this.node);
}

function getValue(v) {
    if (v instanceof Reference) {
        if (!v.base) {
            // Hook needed for Zaphod
            if (exports.getValueHook)
                return exports.getValueHook(v.propertyName);
            throw new ReferenceError(v.propertyName + " is not defined",
                                     v.node.filename, v.node.lineno);
        }
        return v.base[v.propertyName];
    }
    return v;
}

function putValue(v, w, vn) {
    if (v instanceof Reference)
        return (v.base || global)[v.propertyName] = w;
    throw new ReferenceError("Invalid assignment left-hand side",
                             vn.filename, vn.lineno);
}

function isPrimitive(v) {
    var t = typeof v;
    return (t === "object") ? v === null : t !== "function";
}

function isObject(v) {
    var t = typeof v;
    return (t === "object") ? v !== null : t === "function";
}

// If r instanceof Reference, v === getValue(r); else v === r.  If passed, rn
// is the node whose execute result was r.
function toObject(v, r, rn) {
    switch (typeof v) {
      case "boolean":
        return new global.Boolean(v);
      case "number":
        return new global.Number(v);
      case "string":
        return new global.String(v);
      case "function":
        return v;
      case "object":
        if (v !== null)
            return v;
    }
    var message = r + " (type " + (typeof v) + ") has no properties";
    throw rn ? new TypeError(message, rn.filename, rn.lineno)
        : new TypeError(message);
}

// reifyModule :: (Module) -> module instance object
function reifyModule(mod) {
    return mod.instance.proxy;
}

function bindImports(impDecls, x) {
    for (var i = 0; i < impDecls.length; i++) {
        var list = impDecls[i].pathList;
        for (var j = 0; j < list.length; j++) {
            bindImport(list[j], x);
        }
    }
}

function bindImport(decl, x) {
    var t = x.scope.object;
    var lhs = decl.children[0];
    var rhs = decl.children[1];
    var mod = lhs.denotedModule;

    function bind(importID, exportID) {
        definitions.defineGetter(t, importID, function() {
            var m = reifyModule(mod);
            return m[exportID];
        }, true);
    }

    if (rhs.type === IDENTIFIER) {
        if (rhs.value === "*") {
            mod.exports.forEach(function(exportID, exp) {
                if (!mod.exportedModules.has(exportID))
                    bind(exportID, exportID);
            });
        } else {
            bind(rhs.value, rhs.value);
        }
        return;
    }

    for (var i = 0; i < rhs.children.length; i++) {
        var pair = rhs.children[i];
        bind(pair.children[1].value, pair.children[0].value);
    }
}

function executeModule(n, x) {
    var m = x.scope.object[n.name];
    var inst = moduleInstances.get(m);
    var x2 = new ExecutionContext(MODULE_CODE, true);
    x2.scope = inst.scope;
    x2.thisObject = m;
    x2.thisModule = m;
    x2.execute(n.body);
    return m;
}

function execute(n, x) {
    var a, c, f, i, j, r, s, t, u, v;

    switch (n.type) {
      case MODULE:
        if (n.body)
            x.result = executeModule(n, x);
        break;

      case IMPORT:
      case EXPORT:
        break;

      case FUNCTION:
        if (n.functionForm !== parser.DECLARED_FORM) {
            if (!n.name || n.functionForm === parser.STATEMENT_FORM) {
                v = newFunction(n, x);
                if (n.functionForm === parser.STATEMENT_FORM)
                    definitions.defineProperty(x.scope.object, n.name, v, true);
            } else {
                t = new Object;
                x.scope = {object: t, parent: x.scope};
                try {
                    v = newFunction(n, x);
                    definitions.defineProperty(t, n.name, v, true, true);
                } finally {
                    x.scope = x.scope.parent;
                }
            }
        }
        break;

      case GENERATOR:
        u = new bytecode.Generator(x.functionInstance.getBytecode(), x);
        x.thisGenerator = u;
        x.result = u.userObject;
        throw RETURN_SIGNAL;

      case SCRIPT:
        t = x.scope.object;
        n.modAssns.forEach(function(name, node) {
            definitions.defineMemoGetter(t, name, function() {
                return reifyModule(node.initializer.denotedModule);
            }, true);
        });
        bindImports(n.impDecls, x);
        a = n.funDecls;
        for (i = 0, j = a.length; i < j; i++) {
            s = a[i].name;
            f = newFunction(a[i], x);
            // ECMA-262 says variable bindings created by `eval' are deleteable.
            definitions.defineProperty(t, s, f, x.type !== EVAL_CODE);
        }
        a = n.varDecls;
        var defineVar;
        if (x.thisModule) {
            defineVar = function(obj, prop) {
                // start out as a getter/setter that throws on get
                definitions.defineGetterSetter(obj, prop, function() {
                    throw new ReferenceError(prop + " is not initialized");
                }, function(val) {
                    // on first set, replace with ordinary property
                    definitions.defineProperty(obj, prop, val, false);
                    return val;
                }, false);
            };
        } else {
            defineVar = function(obj, prop) {
                // ECMA-262 says variable bindings created by `eval' are deleteable.
                definitions.defineProperty(obj, prop, undefined, x.type !== EVAL_CODE, false);
            };
        }
        for (i = 0, j = a.length; i < j; i++) {
            u = a[i];
            s = u.name;
            if (u.readOnly && hasDirectProperty(t, s)) {
                throw new TypeError("Redeclaration of const " + s,
                                    u.filename, u.lineno);
            }
            if (u.readOnly || !hasDirectProperty(t, s)) {
                // Does not correctly handle 'const x;' -- see bug 592335.
                defineVar(t, s);
            }
        }
        // FALL THROUGH

      case BLOCK:
        c = n.children;
        for (i = 0, j = c.length; i < j; i++)
            execute(c[i], x);
        break;

      case IMPORT:
      case EXPORT:
        break;

      case IF:
        if (getValue(execute(n.condition, x)))
            execute(n.thenPart, x);
        else if (n.elsePart)
            execute(n.elsePart, x);
        break;

      case SWITCH:
        s = getValue(execute(n.discriminant, x));
        a = n.cases;
        var matchDefault = false;
        switch_loop:
        for (i = 0, j = a.length; ; i++) {
            if (i === j) {
                if (n.defaultIndex >= 0) {
                    i = n.defaultIndex - 1; // no case matched, do default
                    matchDefault = true;
                    continue;
                }
                break;                      // no default, exit switch_loop
            }
            t = a[i];                       // next case (might be default!)
            if (t.type === CASE) {
                u = getValue(execute(t.caseLabel, x));
            } else {
                if (!matchDefault)          // not defaulting, skip for now
                    continue;
                u = s;                      // force match to do default
            }
            if (u === s) {
                for (;;) {                  // this loop exits switch_loop
                    if (t.statements.children.length) {
                        try {
                            execute(t.statements, x);
                        } catch (e if e === BREAK_SIGNAL && x.target === n) {
                            break switch_loop;
                        }
                    }
                    if (++i === j)
                        break switch_loop;
                    t = a[i];
                }
                // NOT REACHED
            }
        }
        break;

      case FOR:
        n.setup && getValue(execute(n.setup, x));
        // FALL THROUGH
      case WHILE:
        while (!n.condition || getValue(execute(n.condition, x))) {
            try {
                execute(n.body, x);
            } catch (e if e === BREAK_SIGNAL && x.target === n) {
                break;
            } catch (e if e === CONTINUE_SIGNAL && x.target === n) {
                // Must run the update expression.
            }
            n.update && getValue(execute(n.update, x));
        }
        break;

      case FOR_IN:
        u = n.varDecl;
        if (u)
            execute(u, x);
        r = n.iterator;
        s = execute(n.object, x);
        v = getValue(s);

        t = (v === null || v === undefined) ? v : toObject(v, s, n.object);
        a = [];
        for (i in t)
            a.push(i);
        for (i = 0, j = a.length; i < j; i++) {
            putValue(execute(r, x), a[i], r);
            try {
                execute(n.body, x);
            } catch (e if e === BREAK_SIGNAL && x.target === n) {
                break;
            } catch (e if e === CONTINUE_SIGNAL && x.target === n) {
                continue;
            }
        }
        break;

      case DO:
        do {
            try {
                execute(n.body, x);
            } catch (e if e === BREAK_SIGNAL && x.target === n) {
                break;
            } catch (e if e === CONTINUE_SIGNAL && x.target === n) {
                continue;
            }
        } while (getValue(execute(n.condition, x)));
        break;

      case BREAK:
        x.target = n.target;
        throw BREAK_SIGNAL;

      case CONTINUE:
        x.target = n.target;
        throw CONTINUE_SIGNAL;

      case TRY:
        try {
            execute(n.tryBlock, x);
        } catch (e if !(e instanceof InternalSignal) && (j = n.catchClauses.length)) {
            x.result = undefined;
            for (i = 0; ; i++) {
                if (i === j)
                    throw e;
                t = n.catchClauses[i];
                x.scope = {object: {}, parent: x.scope};
                definitions.defineProperty(x.scope.object, t.varName, e, true);
                try {
                    if (t.guard && !getValue(execute(t.guard, x)))
                        continue;
                    execute(t.block, x);
                    break;
                } finally {
                    x.scope = x.scope.parent;
                }
            }
        } finally {
            // We may already be returning something from the try or catch
            // blocks so save result incase of changes from the
            // finallyBlock.
            t = x.result;
            if (n.finallyBlock)
                execute(n.finallyBlock, x);
            x.result = t;
        }
        break;

      case THROW:
        throw getValue(execute(n.exception, x));

      case RETURN:
        // Check for returns with no return value
        x.result = n.value ? getValue(execute(n.value, x)) : undefined;
        throw RETURN_SIGNAL;

      case WITH:
        r = execute(n.object, x);
        t = toObject(getValue(r), r, n.object);
        x.scope = {object: t, parent: x.scope};
        try {
            execute(n.body, x);
        } finally {
            x.scope = x.scope.parent;
        }
        break;

      case VAR:
      case CONST:
        c = n.children;
        for (i = 0, j = c.length; i < j; i++) {
            u = c[i].initializer;
            if (!u)
                continue;
            t = c[i].name;
            for (s = x.scope; s; s = s.parent) {
                if (hasDirectProperty(s.object, t))
                    break;
            }
            u = getValue(execute(u, x));
            if (n.type === CONST)
                definitions.defineProperty(s.object, t, u, x.type !== EVAL_CODE, true);
            else
                s.object[t] = u;
        }
        break;

      case DEBUGGER:
        throw "NYI: " + definitions.tokens[n.type];

      case SEMICOLON:
        if (n.expression)
            x.result = getValue(execute(n.expression, x));
        break;

      case LABEL:
        try {
            execute(n.statement, x);
        } catch (e if e === BREAK_SIGNAL && x.target === n.target) {
        }
        break;

      case COMMA:
        c = n.children;
        for (i = 0, j = c.length; i < j; i++)
            v = getValue(execute(c[i], x));
        break;

      case ASSIGN:
        c = n.children;
        r = execute(c[0], x);
        t = n.assignOp;
        if (t)
            u = getValue(r);
        v = getValue(execute(c[1], x));
        if (t) {
            switch (t) {
              case BITWISE_OR:  v = u | v; break;
              case BITWISE_XOR: v = u ^ v; break;
              case BITWISE_AND: v = u & v; break;
              case LSH:         v = u << v; break;
              case RSH:         v = u >> v; break;
              case URSH:        v = u >>> v; break;
              case PLUS:        v = u + v; break;
              case MINUS:       v = u - v; break;
              case MUL:         v = u * v; break;
              case DIV:         v = u / v; break;
              case MOD:         v = u % v; break;
            }
        }
        putValue(r, v, c[0]);
        break;

      case HOOK:
        c = n.children;
        v = getValue(execute(c[0], x)) ? getValue(execute(c[1], x))
            : getValue(execute(c[2], x));
        break;

      case OR:
        c = n.children;
        v = getValue(execute(c[0], x)) || getValue(execute(c[1], x));
        break;

      case AND:
        c = n.children;
        v = getValue(execute(c[0], x)) && getValue(execute(c[1], x));
        break;

      case BITWISE_OR:
        c = n.children;
        v = getValue(execute(c[0], x)) | getValue(execute(c[1], x));
        break;

      case BITWISE_XOR:
        c = n.children;
        v = getValue(execute(c[0], x)) ^ getValue(execute(c[1], x));
        break;

      case BITWISE_AND:
        c = n.children;
        v = getValue(execute(c[0], x)) & getValue(execute(c[1], x));
        break;

      case EQ:
        c = n.children;
        v = getValue(execute(c[0], x)) == getValue(execute(c[1], x));
        break;

      case NE:
        c = n.children;
        v = getValue(execute(c[0], x)) != getValue(execute(c[1], x));
        break;

      case STRICT_EQ:
        c = n.children;
        v = getValue(execute(c[0], x)) === getValue(execute(c[1], x));
        break;

      case STRICT_NE:
        c = n.children;
        v = getValue(execute(c[0], x)) !== getValue(execute(c[1], x));
        break;

      case LT:
        c = n.children;
        v = getValue(execute(c[0], x)) < getValue(execute(c[1], x));
        break;

      case LE:
        c = n.children;
        v = getValue(execute(c[0], x)) <= getValue(execute(c[1], x));
        break;

      case GE:
        c = n.children;
        v = getValue(execute(c[0], x)) >= getValue(execute(c[1], x));
        break;

      case GT:
        c = n.children;
        v = getValue(execute(c[0], x)) > getValue(execute(c[1], x));
        break;

      case IN:
        c = n.children;
        v = getValue(execute(c[0], x)) in getValue(execute(c[1], x));
        break;

      case INSTANCEOF:
        c = n.children;
        t = getValue(execute(c[0], x));
        u = getValue(execute(c[1], x));
        if (isObject(u) && functionInternals.has(u))
            v = hasInstance(u, t);
        // Since we use native functions such as Date along with host ones such
        // as global.eval, we want both to be considered instances of the native
        // Function constructor.
        else
            v = (t instanceof u) || (u === Function && t instanceof global.Function);
        break;

      case LSH:
        c = n.children;
        v = getValue(execute(c[0], x)) << getValue(execute(c[1], x));
        break;

      case RSH:
        c = n.children;
        v = getValue(execute(c[0], x)) >> getValue(execute(c[1], x));
        break;

      case URSH:
        c = n.children;
        v = getValue(execute(c[0], x)) >>> getValue(execute(c[1], x));
        break;

      case PLUS:
        c = n.children;
        v = getValue(execute(c[0], x)) + getValue(execute(c[1], x));
        break;

      case MINUS:
        c = n.children;
        v = getValue(execute(c[0], x)) - getValue(execute(c[1], x));
        break;

      case MUL:
        c = n.children;
        v = getValue(execute(c[0], x)) * getValue(execute(c[1], x));
        break;

      case DIV:
        c = n.children;
        v = getValue(execute(c[0], x)) / getValue(execute(c[1], x));
        break;

      case MOD:
        c = n.children;
        v = getValue(execute(c[0], x)) % getValue(execute(c[1], x));
        break;

      case DELETE:
        t = execute(n.children[0], x);
        v = !(t instanceof Reference) || delete t.base[t.propertyName];
        break;

      case VOID:
        getValue(execute(n.children[0], x));
        break;

      case TYPEOF:
        t = execute(n.children[0], x);
        if (t instanceof Reference)
            t = t.base ? t.base[t.propertyName] : undefined;
        v = typeof t;
        break;

      case NOT:
        v = !getValue(execute(n.children[0], x));
        break;

      case BITWISE_NOT:
        v = ~getValue(execute(n.children[0], x));
        break;

      case UNARY_PLUS:
        v = +getValue(execute(n.children[0], x));
        break;

      case UNARY_MINUS:
        v = -getValue(execute(n.children[0], x));
        break;

      case INCREMENT:
      case DECREMENT:
        t = execute(n.children[0], x);
        u = Number(getValue(t));
        if (n.postfix)
            v = u;
        putValue(t, (n.type === INCREMENT) ? ++u : --u, n.children[0]);
        if (!n.postfix)
            v = u;
        break;

      case DOT:
        c = n.children;
        r = execute(c[0], x);
        t = getValue(r);
        u = c[1].value;
        v = new Reference(toObject(t, r, c[0]), u, n);
        break;

      case INDEX:
        c = n.children;
        r = execute(c[0], x);
        t = getValue(r);
        u = getValue(execute(c[1], x));
        v = new Reference(toObject(t, r, c[0]), String(u), n);
        break;

      case LIST:
        // Curse ECMA for specifying that arguments is not an Array object!
        v = {};
        c = n.children;
        for (i = 0, j = c.length; i < j; i++) {
            u = getValue(execute(c[i], x));
            definitions.defineProperty(v, i, u, false, false, true);
        }
        definitions.defineProperty(v, "length", i, false, false, true);
        break;

      case CALL:
        c = n.children;
        r = execute(c[0], x);
        a = execute(c[1], x);
        f = getValue(r);
        x.staticEnv = n.staticEnv;
        if (typeof f !== "function") {
            throw new TypeError(r + " is not callable", c[0].filename, c[0].lineno);
        }
        t = (r instanceof Reference) ? r.base : null;
        if (t instanceof Activation)
            t = null;
        v = call(f, t, a, x);
        break;

      case NEW:
      case NEW_WITH_ARGS:
        c = n.children;
        r = execute(c[0], x);
        f = getValue(r);
        if (n.type === NEW) {
            a = {};
            definitions.defineProperty(a, "length", 0, false, false, true);
        } else {
            a = execute(c[1], x);
        }
        if (typeof f !== "function") {
            throw new TypeError(r + " is not a constructor", c[0].filename, c[0].lineno);
        }
        v = construct(f, a, x);
        break;

      case ARRAY_INIT:
        v = [];
        c = n.children;
        for (i = 0, j = c.length; i < j; i++) {
            if (c[i])
                v[i] = getValue(execute(c[i], x));
        }
        v.length = j;
        break;

      case OBJECT_INIT:
        v = {};
        c = n.children;
        for (i = 0, j = c.length; i < j; i++) {
            t = c[i];
            if (t.type === PROPERTY_INIT) {
                let c2 = t.children;
                v[c2[0].value] = getValue(execute(c2[1], x));
            } else {
                f = newFunction(t, x);
                u = (t.type === GETTER) ? '__defineGetter__'
                    : '__defineSetter__';
                v[u](t.name, thunk(f, x));
            }
        }
        break;

      case NULL:
        v = null;
        break;

      case THIS:
        v = x.thisObject;
        break;

      case TRUE:
        v = true;
        break;

      case FALSE:
        v = false;
        break;

      case IDENTIFIER:
        for (s = x.scope; s; s = s.parent) {
            if (n.value in s.object)
                break;
        }
        v = new Reference(s && s.object, n.value, n);
        break;

      case NUMBER:
      case STRING:
      case REGEXP:
        v = n.value;
        break;

      case GROUP:
        v = execute(n.children[0], x);
        break;

      default:
        throw "PANIC: unknown operation " + n.type + ": " + uneval(n);
    }

    return v;
}

function Activation(f, a) {
    for (var i = 0, j = f.params.length; i < j; i++)
        definitions.defineProperty(this, f.params[i], a[i], true);
    definitions.defineProperty(this, "arguments", a, true);
}

// Null Activation.prototype's proto slot so that Object.prototype.* does not
// pollute the scope of heavyweight functions.  Also delete its 'constructor'
// property so that it doesn't pollute function scopes.

Activation.prototype = Object.create(null);

function FunctionInternals(node, scope) {
    this.node = node;
    this.scope = scope;
    this.length = node.params.length;
}

/*
 * ModuleInstance :: (Module, scope) -> ModuleInstance
 *
 * Dynamic semantic representation of a module.
 */
function ModuleInstance(mod, scope) {
    this.module = mod;
    this.scope = scope;
}

/*
 * newModule :: (Module, scope) -> module instance object
 *
 * Instantiates a module node, producing a module instance object.
 */
function newModule(mod, scope) {
    var exports = mod.exports;

    // the module instance
    mod.instance = new ModuleInstance(mod, {object: new Object, parent: scope});

    function keys() {
        var result = [];
        exports.forEach(function(name, exp) {
            result.push(name);
        });
        return result;
    }

    function getExportDescriptor(name) {
        if (exports.has(name)) {
            var exp = exports.get(name);
            var inst = exp.resolved.module.instance;

            return {
                value: inst.scope.object[exp.resolved.internalID],
                writable: false,
                enumerable: true,
                configurable: true
            };
        }

        throw new ReferenceError("no such export: " + name);
    }

    function getExportValue(receiver, name) {
        return getExportDescriptor(name).value;
    }

    function hasExport(name) {
        return exports.has(name);
    }

    function refuse() { }

    // the module instance proxy
    var instObj = Proxy.create({
        getOwnPropertyDescriptor: getExportDescriptor,
        getPropertyDescriptor: getExportDescriptor,
        getOwnPropertyNames: keys,
        defineProperty: refuse,
        "delete": refuse,
        fix: refuse,
        has: hasExport,
        hasOwn: hasExport,
        get: getExportValue,
        set: refuse,
        enumerate: keys,
        keys: keys
    });

    // associate the instance with the instance proxy
    moduleInstances.set(instObj, mod.instance);
    mod.instance.proxy = instObj;

    return instObj;
}

function instantiateModules(n, scope) {
    n.modDefns.forEach(function(name, defn) {
        var m = defn.module;
        var instObj = newModule(m, scope);
        var inst = moduleInstances.get(instObj);
        definitions.defineProperty(scope.object, name, instObj, true, true);
        instantiateModules(m.node.body, inst.scope);
    });
}

function getPropertyDescriptor(obj, name) {
    while (obj) {
        if (({}).hasOwnProperty.call(obj, name))
            return Object.getOwnPropertyDescriptor(obj, name);
        obj = Object.getPrototypeOf(obj);
    }
}

function getOwnProperties(obj) {
    var map = {};
    for (var name in Object.getOwnPropertyNames(obj))
        map[name] = Object.getOwnPropertyDescriptor(obj, name);
    return map;
}

// Returns a new function wrapped with a Proxy.
function newFunction(n, x) {
    var fint = new FunctionInternals(n, x.scope);
    var props = Object.create(Fp);
    definitions.defineProperty(props, "length", fint.length, false, false, true);
    definitions.defineProperty(props, "toString", function() {
        return fint.toString();
    }, false, false, true);
    var handler = definitions.makePassthruHandler(props);
    var p = Proxy.createFunction(handler,
                                 function() { return fint.call(p, this, arguments, x); },
                                 function() { return fint.construct(p, arguments, x); });
    functionInternals.set(p, fint);
    var proto = {};
    definitions.defineProperty(p, "prototype", proto, true);
    definitions.defineProperty(proto, "constructor", p, false, false, true);
    return p;
}

const functionInternals = new WeakMap();

function hasInstance(u, v) {
    if (isPrimitive(v))
        return false;
    var p = u.prototype;
    if (isPrimitive(p)) {
        throw new TypeError("'prototype' property is not an object",
                            this.node.filename, this.node.lineno);
    }
    var o;
    while ((o = Object.getPrototypeOf(v))) {
        if (o === p)
            return true;
        v = o;
    }
    return false;
}

function call(f, t, a, x) {
    var fint = functionInternals.get(f);
    if (!fint)
        return f.apply(t, a);
    return fint.call(f, t, a, x);
}

function construct(f, a, x) {
    var fint = functionInternals.get(f);
    if (!fint)
        return applyNew(f, a);
    return fint.construct(f, a, x);
}

var FIp = FunctionInternals.prototype = {
    call: function(f, t, a, x) {
        var x2 = new ExecutionContext(FUNCTION_CODE, this.node.body.strict);
        x2.thisObject = t || global;
        x2.thisModule = null;
        x2.functionInstance = this;
        definitions.defineProperty(a, "callee", f, false, false, true);
        var n = this.node;
        x2.scope = {object: new Activation(n, a), parent: this.scope};
        try {
            x2.execute(n.body);
        } catch (e if e === RETURN_SIGNAL) {
            return x2.result;
        }
        return undefined;
    },

    construct: function(f, a, x) {
        var p = this.prototype;
        var o = isObject(p) ? Object.create(p) : new Object;

        var v = this.call(f, o, a, x);
        if (isObject(v))
            return v;
        return o;
    },

    getBytecode: function() {
        var n = this.node;
        if (!n.proc)
            n.proc = bytecode.compile(n.body.type === GENERATOR ? n.body : n);
        return n.proc;
    },

    toString: function() {
        var parenthesized = this.node.parenthesized;
        this.node.parenthesized = false;
        var result = decompiler.pp(this.node);
        this.node.parenthesized = parenthesized;
        return result;
    }
};

// Connect Function.prototype and Function.prototype.constructor in global.
var Fp = new Function;
reflectClass('Function', Fp);

function thunk(f, x) {
    return function () { return functionInternals.get(f).call(f, this, arguments, x); };
}

function resolveGlobal(ast) {
    // clone the static env so we can rollback if compilation fails
    var extendedStaticEnv = globalStaticEnv.copy();
    resolver.resolve(ast, extendedStaticEnv);
    // compilation succeeded, so commit to the extended static env
    globalStaticEnv = extendedStaticEnv;
}

function evaluate(s, f, l) {
    if (typeof s !== "string")
        return s;

    var x = new ExecutionContext(GLOBAL_CODE);
    var ast = parser.parse(s, f, l);
    if (ast.hasModules) {
        resolveGlobal(ast);
        instantiateModules(ast, x.scope);
    }
    x.execute(ast);
    return x.result;
}

function printStackTrace(stack) {
    var st = String(stack).split(/\n/);
    // beautify stack trace:
    //   - eliminate blank lines
    //   - sanitize confusing trace lines for getters and js -e expressions
    //   - simplify source location reporting
    //   - indent
    for (var i = 0; i < st.length; i++) {
        var line = st[i].trim();
        if (line) {
            line = line.replace(/^(\(\))?@/, "<unknown>@");
            line = line.replace(/@(.*\/|\\)?([^\/\\]+:[0-9]+)/, " at $2");
            print("    in " + line);
        }
    }
}

// Used to interpret the .break directive at the REPL.
const CANCEL_SIGNAL = new InternalSignal;

// A read-eval-print-loop that roughly tracks the behavior of the js shell.
function repl() {

    // Display a value similarly to the js shell.
    function display(x) {
        if (typeof x === "object") {
            // At the js shell, objects with no |toSource| don't print.
            if (x !== null && "toSource" in x) {
                try {
                    print(x.toSource());
                } catch (e) {
                }
            } else {
                print("null");
            }
        } else if (typeof x === "string") {
            print(uneval(x));
        } else if (typeof x !== "undefined") {
            // Since x must be primitive, String can't throw.
            print(String(x));
        }
    }

    // String conversion that never throws.
    function string(x) {
        try {
            return String(x);
        } catch (e) {
            return "unknown (can't convert to string)";
        }
    }

    // isCommand :: (string) -> boolean
    function isCommand(line) {
        switch (line.trim()) {
          case ".help":
            print(".begin  Begin multiline input mode.");
            print(".break  Sometimes you get stuck in a place you can't get out... This will get you out.");
            print(".clear  Break, and also clear the global environment.");
            print(".end    End multiline input mode.");
            print(".exit   Exit the prompt.");
            print(".help   Show repl options.");
            return true;

          case ".clear":
            resetEnvironment();
            // FALL THROUGH

          case ".break":
            throw CANCEL_SIGNAL;

          case ".exit":
            throw EXIT_SIGNAL;
        }
        return false;
    }

    var x = new ExecutionContext(GLOBAL_CODE);

    // Line number in/out parameter to parser.parseStdin.
    var ln = {value: 0};

    ExecutionContext.current = x;
    for (;;) {
        x.result = undefined;
        putstr("njs> ");
        var src = readline();

        // If readline receives EOF it returns null.
        if (src === null) {
            print("");
            break;
        }
        ++ln.value;

        try {
            var ast = parser.parseStdin(src, ln, "...  ", isCommand);
            if (ast.hasModules) {
                resolveGlobal(ast);
                instantiateModules(ast, x.scope);
            }
            execute(ast, x);
            display(x.result);
        } catch (e if e === EXIT_SIGNAL) {
            break;
        } catch (e if e === CANCEL_SIGNAL) {
            continue;
        } catch (e if e instanceof SyntaxError) {
            const PREFIX = (e.filename || "stdin") + ":" + e.lineNumber + ": ";
            print(PREFIX + e.toString());
            print(PREFIX + e.source);
            print(PREFIX + ".".repeat(e.cursor) + "^");
        } catch (e if e instanceof Error) {
            print((e.filename || "stdin") + ":" +  e.lineNumber + ": " + e.toString());
            if (e.stack)
                printStackTrace(e.stack);
        } catch (e) {
            print("uncaught exception: " + string(e));
        }
    }
    ExecutionContext.current = null;
}

function test(thunk) {
    try {
        thunk();
    } catch (e) {
        print(e.fileName + ":" + e.lineNumber + ": " + e.name + ": " + e.message);
        printStackTrace(e.stack);
        return false;
    }
    return true;
}

// resetEnvironment wipes any properties added externally to global,
// but properties added to globalBase will persist.
exports.global = global;
exports.globalBase = globalBase;
exports.resetEnvironment = resetEnvironment;
exports.evaluate = evaluate;
exports.getValueHook = null;
exports.repl = repl;
exports.test = test;
