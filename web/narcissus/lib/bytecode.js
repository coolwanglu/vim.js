/* -*- Mode: JS; tab-width: 4; indent-tabs-mode: nil; -*-
 * vim: set sw=4 ts=4 et tw=78:
/*
 * Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>
 * Bundled for Hypnotic
 */


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

(function() {
    var Narcissus = window.Narcissus = window.Narcissus || {};
    if(Narcissus.bytecode) return;
    var exports = Narcissus.bytecode= {};

const definitions = Narcissus.definitions.

// Set constants in the local scope.
eval(definitions.consts);

const apply = definitions.apply;
const applyNew = definitions.applyNew;
const Dict = definitions.Dict;

function popN(stack, n) {
    return stack.splice(stack.length - n, n);
}

var HOLE = { toString: function() { return "HOLE" }, toSource: function() { return "HOLE" } };

// bytecode = { exec: function(operands, mode, ExecutionContext) -> signal }
// signal   = YIELD_SIGNAL | UNWIND_SIGNAL | undefined | address
// address  = array index, i.e. integer in [0, 2^32)
// mode     = { unwind: [address], goal: goal }
//          | null
// goal     = RETURN_GOAL | THROW_GOAL | address

const YIELD_SIGNAL = -1, UNWIND_SIGNAL = -2;
const RETURN_GOAL = -1, THROW_GOAL = -2;

function Bytecode(proto) {
    for (var key in proto) {
        if (proto.hasOwnProperty(key))
            this[key] = proto[key];
    }
}

Bytecode.prototype = {
    flatten: function() {
        var result = {};
        result.opcode = this.opcode;
        for (var key in this) {
            if (this.hasOwnProperty(key)) {
                var val = this[key];
                if (typeof val !== "function")
                    result[key] = val;
            }
        }
        return result;
    },
    toString: function() {
        var result;
        function table(x) {
            return !(x instanceof Array) && !(x instanceof Fixup) &&
                (typeof x === "object") && x;
        }
        function appendTable(x) {
            for (var k in x) {
                var v = x[k];
                if (x.hasOwnProperty(k) && k !== "opcode" && typeof v !== "function") {
                    if (!table(v))
                        result += " " + k + ":";
                    appendValue(v);
                }
            }
        }
        function appendValue(x) {
            if (x instanceof Array) {
                result += " [";
                for (var i = 0, n = x.length; i < n; i++) {
                    if (i > 0)
                        result += ", ";
                    result += x[i];
                }
                result += "]";
            } else if (x instanceof Fixup) {
                result += " " + (+x);
            } else if (table(x)) {
                appendTable(x);
            } else {
                result += " " + uneval(x);
            }
        }
        result = this.opcode.toUpperCase();
        appendTable(this);
        return result;
    }
};

function bytecodeClass(props) {
    var proto = new Bytecode(props);
    var constructor = proto.constructor;
    var wrapped = function(x) {
        if (!(this instanceof wrapped))
            return new wrapped(x);
        constructor.call(this, x);
    };
    proto.constructor = wrapped;
    wrapped.prototype = proto;
    return wrapped;
}

const binops = [];

[
    BITWISE_OR, BITWISE_XOR, BITWISE_AND, EQ, NE, STRICT_EQ, STRICT_NE, LT, LE, GT, GE,
    LSH, RSH, PLUS, MINUS, MUL, DIV, MOD, IN, INSTANCEOF
].forEach(function(code) {
    binops[code] = new Function("x", "y", "return x " + definitions.tokens[code] + " y;");
});

var Binop = bytecodeClass({
    opcode: "Binop",
    constructor: function Binop(code) {
        this.operator = code;
        this.name = definitions.tokens[code];
        this.callback = binops[code];
    },
    exec: function Binop(stack, x) {
        var operand2 = stack.pop();
        var operand1 = stack.pop();
        var callback = this.callback;
        stack.push(callback(operand1, operand2));
    }
});

function unop(code) {
    if (code === UNARY_PLUS)
        code = PLUS;
    else if (code === UNARY_MINUS)
        code = MINUS;
    return definitions.tokens[code];
}

const unops = [];

[ DELETE, VOID, TYPEOF, NOT, BITWISE_NOT, UNARY_PLUS, UNARY_MINUS ].forEach(function(code) {
    unops[code] = new Function("x", "return " + unop(code) + " x;");
});


var Unop = bytecodeClass({
    opcode: "Unop",
    constructor: function Unop(code) {
        this.operator = code;
        this.name = definitions.tokens[code];
        this.callback = unops[code];
    },
    exec: function Unop(stack, x) {
        var operand = stack.pop();
        var callback = this.callback;
        stack.push(callback(operand));
    }
});

var Pop = new Bytecode({
    opcode: "Pop",
    exec: function Pop(stack, x) {
        stack.pop();
    }
});

var Debug = bytecodeClass({
    opcode: "Debug",
    constructor: function Debug(msg) {
        this.msg = msg;
    },
    exec: function Debug(stack, x) {
        print("DEBUG: " + this.msg);
    }
});

var Yield = bytecodeClass({
    opcode: "Yield",
    constructor: function Yield(targets) {
        this.targets = targets;
    },
    exec: function Yield(stack, x) {
        return YIELD_SIGNAL;
    }
});

// Similar to Jump but passes through at least one finally block
var Unwind = new Bytecode({
    opcode: "Unwind",
    exec: function Unwind(stack, x) {
        return UNWIND_SIGNAL;
    }
});

var Mode = bytecodeClass({
    opcode: "Mode",
    constructor: function Mode(mode) {
        this.mode = mode;
    },
    exec: function Mode(stack, x) {
        x.thisGenerator.mode = this.mode;
    }
});

var Jump = bytecodeClass({
    opcode: "Jump",
    constructor: function Jump(label) {
        this.label = label;
    },
    exec: function Jump(stack, x) {
        return this.label;
    },
    link: function(label) {
        this.label = label;
    }
});

var JumpT = bytecodeClass({
    opcode: "JumpT",
    constructor: function JumpT(label) {
        this.label = label;
    },
    exec: function JumpT(stack, x) {
        var v = stack.pop();
        if (v)
            return this.label;
    },
    link: function(label) {
        this.label = label;
    }
});

var JumpF = bytecodeClass({
    opcode: "JumpF",
    constructor: function JumpF(label) {
        this.label = label;
    },
    exec: function JumpF(stack, x) {
        var v = stack.pop();
        if (!v)
            return this.label;
    },
    link: function(label) {
        this.label = label;
    }
});

var Dup = new Bytecode({
    opcode: "Dup",
    exec: function Dup(stack, x) {
        stack.push(stack.top());
    }
});

var Lambda = bytecodeClass({
    opcode: "Lambda",
    constructor: function Lambda(node) {
        this.node = node;
    },
    exec: function Lambda(stack, x) {
        stack.push(x.newFunction(this.node));
    }
});

var Const = bytecodeClass({
    opcode: "Const",
    constructor: function Const(value) {
        this.value = value;
    },
    exec: function Const(stack, x) {
        stack.push(this.value);
    }
});

var Hole = new Bytecode({
    opcode: "Hole",
    exec: function Hole(stack, x) {
        stack.push(HOLE);
    }
});

var True = Const(true);
var False = Const(false);
var Null = Const(null);
var Undefined = Const(void 0);

var SetProp = bytecodeClass({
    opcode: "SetProp",
    constructor: function SetProp(ret) {
        this["return"] = ret;
    },
    exec: function SetProp(stack, x) {
        var v = stack.pop();
        var n = stack.pop();
        var o = stack.pop();
        try {
            stack.push(o[n] = v);
            return this["return"];
        } catch (e) {
            stack.push(e);
        }
    }
});

var GetProp = bytecodeClass({
    opcode: "GetProp",
    constructor: function SetProp(ret) {
        this["return"] = ret;
    },
    exec: function GetProp(stack, x) {
        var n = stack.pop();
        var o = stack.pop();
        try {
            stack.push(o[n]);
            return this["return"];
        } catch (e) {
            stack.push(e);
        }
    }
});

var Catch = bytecodeClass({
    opcode: "Catch",
    constructor: function Catch(name) {
        this.name = name;
    },
    exec: function Catch(stack, x) {
        x.thisGenerator.mode = null;
        x.scope = {object: {}, parent: x.scope};
        x.scope.object[this.name] = stack.pop();
    }
});

var Unbind = bytecodeClass({
    opcode: "Unbind",
    constructor: function Unbind(count) {
        this.count = count;
    },
    exec: function Unbind(stack, x) {
        for (var i = 0, n = this.count; i < n; i++)
            x.scope = x.scope.parent;
    }
});

var GetVar = bytecodeClass({
    opcode: "GetVar",
    constructor: function GetVar(name) {
        this.name = name;
    },
    exec: function GetVar(stack, x) {
        var name = this.name;
        for (var s = x.scope; s; s = s.parent) {
            if (name in s.object) {
                stack.push(s.object[name]);
                return;
            }
        }
        // this is as broken as the rest of the interpreter
        throw new ReferenceError(name + " is not defined");
    }
});

var SetVar = bytecodeClass({
    opcode: "SetVar",
    constructor: function SetVar(name) {
        this.name = name;
    },
    exec: function SetVar(stack, x) {
        var v = stack.top();
        var name = this.name;
        for (var s = x.scope; s; s = s.parent) {
            if (name in s.object) {
                s.object[name] = v;
                return;
            }
        }
        stack.pop();
        // this is as broken as the rest of the interpreter
        throw new ReferenceError(name + " is not defined");
    }
});

var FCall = bytecodeClass({
    opcode: "FCall",
    constructor: function FCall(props) {
        this.arity = props.arity;
        this["return"] = props["return"];
    },
    exec: function FCall(stack, x) {
        var arity = this.arity;
        var a = stack.splice(stack.length - arity, arity).reverse();
        var f = stack.pop();
        try {
            stack.push(apply(f, x.thisObject, a));
            return this["return"];
        } catch (e) {
            stack.push(e);
        }
    }
});

var MCall = bytecodeClass({
    opcode: "MCall",
    constructor: function MCall(props) {
        this.arity = props.arity;
        this["return"] = props["return"];
    },
    exec: function MCall(stack, x) {
        var arity = this.arity;
        var a = stack.splice(stack.length - arity, arity).reverse();
        var n = stack.pop();
        var o = stack.pop();
        try {
            var f = o[n];
            stack.push(apply(f, o, a));
            return this["return"];
        } catch (e) {
            stack.push(e);
        }
    }
});

var NCall = bytecodeClass({
    opcode: "NCall",
    constructor: function NCall(props) {
        this.arity = props.arity;
        this["return"] = props["return"];
    },
    exec: function NCall(stack, x) {
        var a = popN(stack, this.arity);
        var f = stack.pop();
        try {
            stack.push(applyNew(f, a));
            return this["return"];
        } catch (e) {
            stack.push(e);
        }
    }
});

var NewArray = bytecodeClass({
    opcode: "NewArray",
    constructor: function NewArray(arity) {
        this.arity = arity;
    },
    exec: function NewArray(stack, x) {
        var elts = popN(stack, this.arity);
        var a = [];
        a.length = elts.length;
        for (var i = 0, n = elts.length; i < n; i++) {
            var elt = elts[i];
            if (elt !== HOLE)
                a[i] = elt;
        }
        stack.push(a);
    }
});

var NewObject = bytecodeClass({
    opcode: "NewObject",
    constructor: function NewObject(names) {
        this.names = names;
    },
    exec: function NewObject(stack, x) {
        var names = this.names;
        var arity = names.length;
        var props = popN(stack, arity);
        var o = {};
        for (var i = 0; i < arity; i++)
            o[names[i]] = props[i];
        stack.push(o);
    }
});

var Nop = new Bytecode({ opcode: "Nop", exec: function Nop(stack, x) { } });

function Proc() {
    this.bytecodes = [];
}

Proc.prototype = {
    add: function(instr) {
        var label = this.bytecodes.length;
        this.bytecodes.push(instr);
        return label;
    },
    pc: function() {
        return this.bytecodes.length;
    },
    execute: function(g, pc) {
        const bytecodes = this.bytecodes, x = g.context, operands = g.operands;
        var result, instr, signal;

        vm:
        for (;;) {
            instr = bytecodes[pc++];
            signal = instr.exec(operands, x);
            if (typeof signal === "undefined")
                continue vm;

            switch (signal) {
              case UNWIND_SIGNAL:
                var mode = g.mode;
                if (mode === null)
                    continue vm;
                var unwind = mode.unwind;
                if (!unwind.length) {
                    g.mode = null;
                    var goal = mode.goal;
                    switch (goal) {
                      case RETURN_GOAL:
                        throw new GeneratorReturn(operands.pop());

                      case THROW_GOAL:
                        throw operands.pop();

                      default:
                        pc = +goal;
                        continue vm;
                    }
                }
                pc = +unwind.pop();
                continue vm;

              case YIELD_SIGNAL:
                if (g.closed) {
                    g.state = DEAD;
                    throw new TypeError("yield from closing generator");
                }
                result = operands.pop();
                g.targets = instr.targets;
                x.result = result;
                return result;

              default:
                pc = signal;
            }
        }
    },
    toJSON: function() {
        return JSON.stringify(this.bytecodes.map(function(instr) { return instr.flatten() }));
    },
    toString: function() {
        var n = String(this.bytecodes.length).length;
        function pad(s) {
            return spaces(n - s.length) + s;
        }
        function spaces(m) {
            var result = "";
            for (var i = 0; i < m; i++)
                result += " ";
            return result;
        }
        return this.bytecodes.map(function(instr, i) {
            return pad(String(i)) + ": " + instr.toString();
        }).join("\n");
    }
};

function Fixup() {
    this.address = null;
};

Fixup.prototype = {
    valueOf: function() {
        if (this.address === null)
            throw new TypeError("read before fixup");
        return this.address;
    }
};

// a debugging version of fixup that saves a stack trace from where the fixup is created
var DebugFixup = function Fixup() {
    this.context = (new Error).stack;
    this.address = null;
};

DebugFixup.prototype = {
    valueOf: function() {
        if (this.address === null) {
            var err = new TypeError("read before fixup");
            err.context = this.context;
            throw err;
        }
        return this.address;
    }
};

//Fixup = DebugFixup;

function Env(parent) {
    this.parent = parent;
}

Env.prototype = {
    extend: function(opts) {
        var result = new Env(this);
        if ("catch" in opts)
            result["catch"] = opts["catch"];
        if ("finally" in opts)
            result["finally"] = opts["finally"];
        if ("break" in opts)
            result["break"] = opts["break"];
        if ("continue" in opts)
            result["continue"] = opts["continue"];
        if ("scope" in opts)
            result.scope = opts.scope;
        return result;
    },
    unwindReturn: function() {
        var finallys = [];
        for (var env = this; env.parent; env = env.parent) {
            if ("finally" in env)
                finallys.push(env["finally"]);
        }
        return { unwind: finallys.reverse(), goal: RETURN_GOAL };
    },
    unwindJump: function(type, label) {
        var finallys = [];
        var goal;
        var scopes = 0;
        for (var env = this; env.parent; env = env.parent) {
            if ("finally" in env)
                finallys.push(env["finally"]);
            if ("scope" in env)
                scopes++;
            if (type in env) {
                var entry = env[type];
                if (!label || entry.labels.has(label)) {
                    goal = entry.goal;
                    break;
                }
            }
        }
        // ECMA-262 semantics guarantees we find our goal
        return { unwind: finallys.reverse(), goal: goal, scopes: scopes };
    },
    unwindBreak: function(label) {
        return this.unwindJump("break", label);
    },
    unwindContinue: function(label) {
        return this.unwindJump("continue", label);
    },
    unwindThrow: function() {
        var finallys = [];
        var goal = THROW_GOAL;
        for (var env = this; env.parent; env = env.parent) {
            if ("catch" in env) {
                goal = env["catch"];
                break;
            }
            if ("finally" in env)
                finallys.push(env["finally"]);
        }
        return { unwind: finallys.reverse(), goal: goal };
    }
};

Env.EMPTY = new Env(null);

function compile(node) {
    var proc = new Proc();
    compileScript(node, proc, Env.EMPTY);
    return proc;
}

function compileScript(node, proc, env) {
    for (var a = node.body.funDecls, n = a.length, i = 0; i < n; i++) {
        var fnode = a[i];
        proc.add(Lambda(fnode));
        proc.add(SetVar(fnode.name));
    }
    compileStatement(node.body, proc, env);
    proc.add(Undefined);
    proc.add(Mode({ unwind: [], goal: RETURN_GOAL }));
    proc.add(Unwind);
}

function compileExpression(node, proc, env) {
    switch (node.type) {
      case FUNCTION:
        proc.add(Lambda(node));
        break;

      case ASSIGN:
      case INCREMENT:
      case DECREMENT:
        throw new Error("not yet implemented");

      case IDENTIFIER:
        proc.add(GetVar(node.value));
        break;

      case DOT:
      case INDEX:
        throw new Error("not yet implemented");

      case HOOK:
        compileExpression(node.children[0], proc, env);
        var j1 = JumpT();
        proc.add(j1);
        compileExpression(node.children[1], proc, env);
        var j2 = Jump();
        proc.add(j2);
        j1.link(proc.pc());
        compileExpression(node.children[2], proc, env);
        j2.link(proc.pc());
        proc.add(Nop);
        break;

      case OR:
        compileExpression(node.children[0], proc, env);
        proc.add(Dup);
        var j1 = JumpT();
        proc.add(j1);
        proc.add(Pop);
        compileExpression(node.children[1], proc, env);
        j1.link(proc.pc());
        proc.add(Nop);
        break;

      case AND:
        compileExpression(node.children[0], proc, env);
        proc.add(Dup);
        var j1 = JumpF();
        proc.add(j1);
        proc.add(Pop);
        compileExpression(node.children[1], proc, env);
        j1.link(proc.pc());
        proc.add(Nop);
        break;

      case BITWISE_OR:
      case BITWISE_XOR:
      case BITWISE_AND:
      case EQ:
      case NE:
      case STRICT_EQ:
      case STRICT_NE:
      case LT:
      case LE:
      case GT:
      case GE:
      case IN:
      case INSTANCEOF:
      case LSH:
      case RSH:
      case URSH:
      case PLUS:
      case MINUS:
      case MUL:
      case DIV:
      case MOD:
        compileExpression(node.children[0], proc, env);
        compileExpression(node.children[1], proc, env);
        proc.add(Binop(node.type));
        break;

      case YIELD:
        var j1 = new Fixup, j2 = new Fixup, j3 = new Fixup;
        if (node.value)
            compileExpression(node.value, proc, env);
        else
            proc.add(Undefined);
        proc.add(Yield({ "throw": j1, close: j2, send: j3 }));
        j1.address = proc.pc();
        proc.add(Mode(env.unwindThrow()));
        proc.add(Unwind);
        j2.address = proc.pc();
        proc.add(Mode(env.unwindReturn()));
        proc.add(Unwind);
        j3.address = proc.pc();
        proc.add(Nop);
        break;

      case DELETE:
      case VOID:
      case TYPEOF:
      case NOT:
      case BITWISE_NOT:
      case UNARY_PLUS:
      case UNARY_MINUS:
        compileExpression(node.children[0], proc, env);
        proc.add(Unop(node.type));
        break;

      case COMMA:
      case LIST:
      case NEW:
      case CALL:
      case NEW_WITH_ARGS:
      case ARRAY_INIT:
      case OBJECT_INIT:
      case THIS:
        throw new Error("not yet implemented");

      case NULL:
        proc.add(Null);
        break;

      case TRUE:
        proc.add(True);
        break;

      case FALSE:
        proc.add(False);
        break;

      case NUMBER:
      case STRING:
      case REGEXP:
        proc.add(Const(node.value));
        break;

      default:
        throw new Error("unrecognized expression type: " + definitions.tokens[node.type]);
    }
}

function compileStatement(node, proc, env, labels) {
    switch (node.type) {
      case FUNCTION:
      case DEBUGGER:
      case MODULE:
      case IMPORT:
      case EXPORT:
        break;

      case VAR:
      case CONST:
      case LET:
        throw new Error("not yet implemented");

      case BREAK:
        var mode = env.unwindBreak(node.label);
        if (mode.scopes)
            proc.add(Unbind(mode.scopes));
        if (!mode.unwind.length) {
            proc.add(Jump(mode.goal));
        } else {
            proc.add(Mode(mode));
            proc.add(Unwind);
        }
        break;

      case CONTINUE:
        throw new Error("not yet implemented");

      case SWITCH:
        throw new Error("not yet implemented");

      case THROW:
        compileExpression(node.exception, proc, env);
        proc.add(Mode(env.unwindThrow()));
        proc.add(Unwind);
        break;

      case RETURN:
        compileExpression(node.value, proc, env);
        proc.add(Mode(env.unwindReturn()));
        proc.add(Unwind);
        break;

      case IF:
        compileExpression(node.condition, proc, env);
        var j1 = JumpF();
        proc.add(j1);
        compileStatement(node.thenPart, proc, env);
        var join = proc.pc();
        if (node.elsePart) {
            var j2 = Jump();
            proc.add(j2);
            j1.link(proc.pc());
            compileStatement(node.elsePart, proc, env);
            j2.link(proc.pc());
        } else {
            j1.link(join);
        }
        proc.add(Nop);
        break;

      case SCRIPT:
      case BLOCK:
        var a = node.children;
        for (var i = 0, n = a.length; i < n; i++)
            compileStatement(a[i], proc, env);
        break;

      case TRY:
        var l1 = new Fixup, l2 = new Fixup;
        var hasCatch = !!node.catchClauses.length;
        var hasFinally = !!node.finallyBlock;
        var bodyEnv = hasCatch && hasFinally
            ? env.extend({ "catch": l1, "finally": l2 })
        : hasCatch
            ? env.extend({ "catch": l1 })
        : env.extend({ "finally": l2 });
        // try block
        compileStatement(node.tryBlock, proc, bodyEnv);
        var j1;
        if (hasCatch) {
            var catchEnv;
            // if there's a finally block, need an explicit jump from end of try to finally
            if (hasFinally) {
                j1 = Jump();
                proc.add(j1);
                catchEnv = env.extend({ "finally": j2 });
            } else {
                catchEnv = env;
            }
            // catch block
            l1.address = proc.pc();
            compileCatchClause(node.catchClauses[0], proc, catchEnv);
        }
        if (hasFinally) {
            // if there's a catch block, need an explicit jump from end of try to finally
            if (hasCatch)
                j1.link(proc.pc());
            l2.address = proc.pc();
            // finally block
            compileStatement(node.finallyBlock, proc, env);
            proc.add(Unwind);
        }
        break;

      case WHILE:
      case DO:
      case FOR:
      case FOR_IN:
        compileLoop(node, proc, env, labels);
        break;

      case LABEL:
        if (!labels)
            labels = new Dict();
        while (node.type === LABEL) {
            labels.set(node.label, true);
            node = node.statement;
        }
        var l1 = new Fixup;
        compileStatement(node, proc, env.extend({
            "break": { goal: l1, labels: labels }
        }), labels);
        l1.address = proc.pc();
        proc.add(Nop);
        break;

      case SEMICOLON:
        if (node.expression) {
            compileExpression(node.expression, proc, env);
            proc.add(Pop);
        }
        break;

      default:
        throw new Error("unrecognized statement type: " + definitions.tokens[node.type]);
    }
}

function compileLoop(node, proc, env, labels) {
    throw new Error("not yet implemented");
}

function compileCatchClause(node, proc, env) {
    proc.add(Catch(node.varName));
    compileStatement(node.block, proc, env.extend({ scope: true }));
    proc.add(Unbind(1));
}

const NEWBORN = 0, ACTIVE = 1, INACTIVE = 2, DEAD = 3;

function Generator(proc, x) {
    this.proc = proc;
    this.context = x;
    this.state = NEWBORN;
    this.closed = false;
    this.mode = null;
    // guaranteed not to start with throw or close targets
    this.targets = { send: 0 };
    this.operands = [];
    this.userObject = new GeneratorObject(this);
}

Generator.prototype = {
    send: function(v) {
        switch (this.state) {
          case ACTIVE:
            throw new TypeError("already executing generator");

          case DEAD:
            throw new TypeError("attempt to send " + v + " to dead generator");

          case NEWBORN:
            if (typeof v !== "undefined")
                throw new TypeError("attempt to send " + v + " to newborn generator");
        }
        try {
            this.operands.push(v);
            this.state = ACTIVE;
            return this.proc.execute(this, +this.targets.send);
        } finally {
            if (this.state === ACTIVE)
                this.state = INACTIVE;
        }
    },
    "throw": function(v) {
        switch (this.state) {
          case ACTIVE:
            throw new TypeError("already executing generator");

          case DEAD:
            throw new TypeError("attempt to throw " + v + " to dead generator");

          case NEWBORN:
            this.state = DEAD;
            throw v;
        }
        try {
            this.operands.push(v);
            this.state = ACTIVE;
            return this.proc.execute(this, +this.targets["throw"]);
        } finally {
            if (this.state === ACTIVE)
                this.state = INACTIVE;
        }
    },
    close: function() {
        switch (this.state) {
          case ACTIVE:
            throw new TypeError("already executing generator");

          case DEAD:
            throw new TypeError("attempt to close dead generator");

          case NEWBORN:
            this.state = DEAD;
            return;
        }
        try {
            this.operands.push();
            this.closed = true;
            this.state = ACTIVE;
            this.proc.execute(this, +this.targets.close);
        } finally {
            this.state = DEAD;
        }
    }
};

function GeneratorObject(generator) {
    this.__generator__ = generator;
}

GeneratorObject.prototype = {
    next: function() {
        return this.send();
    },
    send: function(v) {
        return this.__generator__.send(v);
    },
    "throw": function(v) {
        return this.__generator__["throw"](v);
    },
    close: function() {
        this.__generator__.close();
    },
    toString: function() {
        return "[object Generator]";
    },
    toSource: function() {
        return "({})";
    }
};

var StopIteration = { toString: function() { return "[object StopIteration]" }, value: void 0 };

function GeneratorReturn(value) {
    if (typeof value === "undefined")
        return StopIteration;
    this.value = value;
}

GeneratorReturn.prototype = { toString: function() { return "[object GeneratorReturn]" } };

exports.compile = compile;
exports.Generator = Generator;
exports.GeneratorReturn = GeneratorReturn;
exports.StopIteration = StopIteration;

})();
