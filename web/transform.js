/* vim: set sw=2 ts=2 et foldmethod=marker: */
/*
 * Identify and transform ransform async functions for streamlinejs
 *
 * Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>
 */

/*
 * The transformation routine
 *
 * Taking the output of emscripten as input
 * A few functions are initially marked as async manually 
 * All async functions are identified based on the rule:
 *     Any function that calls an async function is also async
 * Add the _ parameter in the definition and calls of all async functions (except for initial ones)
 * The transformed code is to be further transformed by streamline.js
 *
 * Assumptions on the input
 *
 * All the async functions have the '_' prefix in their names
 * Functions are never got renamed or assigned -- functions can be uniquely identified by their names
 * There may be other functions (without the '_' prefix), which never call async functions
 * _ is never used as a parameter -- for streamline.js
 * No function pointers of async functions -- will be wrapped with vimjs_async_cmd_call in the source code
 * No complicated structures that may confuse streamline.js -- fall through in switch, and break to labels
 */


/*
 * decompiler.js taken from Narcissus and modified {{{1
 */

/* ***** BEGIN LICENSE BLOCK *****
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
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Shu-Yu Guo <shu@rfrn.org>
 *   Bruno Jouhier
 *   Gregor Richards
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

function indent(n, s) {
    var ss = "", d = true;

    for (var i = 0, j = s.length; i < j; i++) {
        if (d)
            for (var k = 0; k < n; k++)
                ss += " ";
        ss += s[i];
        d = s[i] === '\n';
    }

    return ss;
}

function isBlock(n) {
    return n && (n.type === BLOCK);
}

function isNonEmptyBlock(n) {
    return isBlock(n) && n.children.length > 0;
}

function nodeStrEscape(str) {
    return str.replace(/\\/g, "\\\\")
        .replace(/"/g, "\\\"")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/</g, "\\u003C")
        .replace(/>/g, "\\u003E");
}

function nodeStr(n) {
    if (/[\u0000-\u001F\u0080-\uFFFF]/.test(n.value)) {
        // use the convoluted algorithm to avoid broken low/high characters
        var str = "";
        for (var i = 0; i < n.value.length; i++) {
            var c = n.value[i];
            if (c <= "\x1F" || c >= "\x80") {
                var cc = c.charCodeAt(0).toString(16);
                while (cc.length < 4) cc = "0" + cc;
                str += "\\u" + cc;
            } else {
                str += nodeStrEscape(c);
            }
        }
        return '"' + str + '"';
    }

    return '"' + nodeStrEscape(n.value) + '"';
}

/*
 * Lu Wang: let pp() handles async function definitions and calls
 */
var pp_dump_async_funcs = true;
function pp(n, d, inLetHead) {
    var topScript = false;

    if (!n)
        return "";
    if (!(n instanceof Object))
        return n;
    if (!d) {
        topScript = true;
        d = 1;
    }

    var p = "";

    if (n.parenthesized)
        p += "(";

    switch (n.type) {
        case GETTER:
        case SETTER:
            if (n.type === GETTER)
                p += "get";
            else
                p += "set";

            p += (n.name ? " " + n.name : "") + "(";
            for (var i = 0, j = n.params.length; i < j; i++)
                p += (i > 0 ? ", " : "") + pp(n.params[i], d);
            p += ") " + pp(n.body, d);
            break;

        case FUNCTION:
            if (n.name && (n.name in async_func_names) && (!(n.name in async_func_names_no_change))) {
              if(!pp_dump_async_funcs)
                break;
              p += "function " + n.name +"(_";
              for (var i = 0, j = n.params.length; i < j; i++)
                p += ", " + pp(n.params[i], d);
            } else {
              p += "function" + (n.name ? " " + n.name : "") + "(";
              for (var i = 0, j = n.params.length; i < j; i++)
                p += (i > 0 ? ", " : "") + pp(n.params[i], d);
            }
            p += ") " + pp(n.body, d);
            break;

        case SCRIPT:
        case BLOCK:
            var nc = n.children;
            if (topScript) {
                // No indentation.
                for (var i = 0, j = nc.length; i < j; i++) {
                    if (i > 0)
                        p += "\n";
                    p += pp(nc[i], d);
                    var eoc = p[p.length - 1];
                    if (eoc != ";")
                        p += ";";
                }

                break;
            }

            p += "{";
            if (n.id !== undefined)
                p += " /* " + n.id + " */";
            p += "\n";
            for (var i = 0, j = nc.length; i < j; i++) {
                if (i > 0)
                    p += "\n";
                p += indent(4, pp(nc[i], d));
                var eoc = p[p.length - 1];
                if (eoc != ";")
                    p += ";";
            }
            p += "\n}";
            break;

        case LET_BLOCK:
            p += "let (" + pp(n.variables, d, true) + ") ";
            if (n.expression)
                p += pp(n.expression, d);
            else
                p += pp(n.block, d);
            break;

        case IF:
            p += "if (" + pp(n.condition, d) + ") ";

            var tp = n.thenPart, ep = n.elsePart;
            var b = isBlock(tp) || isBlock(ep);
            if (!b)
                p += "{\n";
            p += (b ? pp(tp, d) : indent(4, pp(tp, d))) + "\n";

            if (ep) {
                if (!b)
                    p += "} else {\n";
                else
                    p += " else ";

                p += (b ? pp(ep, d) : indent(4, pp(ep, d))) + "\n";
            }
            if (!b)
                p += "}";
            break;

        case SWITCH:
            p += "switch (" + pp(n.discriminant, d) + ") {\n";
            for (var i = 0, j = n.cases.length; i < j; i++) {
                var ca = n.cases[i];
                if (ca.type === CASE)
                    p += "  case " + pp(ca.caseLabel, d) + ":\n";
                else
                    p += "  default:\n";
                ps = pp(ca.statements, d);
                p += ps.slice(2, ps.length - 2) + "\n";
            }
            p += "}";
            break;

        case FOR:
            p += "for (" + pp(n.setup, d) + "; "
                + pp(n.condition, d) + "; "
                + pp(n.update, d) + ") ";

            var pb = pp(n.body, d);
            if (!isBlock(n.body))
                p += "{\n" + indent(4, pb) + ";\n}";
            else if (n.body)
                p += pb;
            break;

        case WHILE:
            p += "while (" + pp(n.condition, d) + ") ";

            var pb = pp(n.body, d);
            if (!isBlock(n.body))
                p += "{\n" + indent(4, pb) + ";\n}";
            else
                p += pb;
            break;

        case FOR_IN:
            var u = n.varDecl;
            p += n.isEach ? "for each (" : "for (";
            p += (u ? pp(u, d) : pp(n.iterator, d)) + " in " +
                pp(n.object, d) + ") ";

            var pb = pp(n.body, d);
            if (!isBlock(n.body))
                p += "{\n" + indent(4, pb) + ";\n}";
            else if (n.body)
                p += pb;
            break;

        case DO:
            p += "do " + pp(n.body, d);
            p += " while (" + pp(n.condition, d) + ");";
            break;

        case BREAK:
            p += "break" + (n.label ? " " + n.label : "") + ";";
            break;

        case CONTINUE:
            p += "continue" + (n.label ? " " + n.label : "") + ";";
            break;

        case TRY:
            p += "try ";
            p += pp(n.tryBlock, d);
            for (var i = 0, j = n.catchClauses.length; i < j; i++) {
                var t = n.catchClauses[i];
                p += " catch (" + pp(t.varName, d) +
                    (t.guard ? " if " + pp(t.guard, d) : "") +
                    ") ";
                p += pp(t.block, d);
            }
            if (n.finallyBlock) {
                p += " finally ";
                p += pp(n.finallyBlock, d);
            }
            break;

        case THROW:
            p += "throw " + pp(n.exception, d);
            break;

        case RETURN:
            p += "return";
            if (n.value)
                p += " " + pp(n.value, d);
            break;

        case YIELD:
            p += "yield";
            if (n.value)
                p += " " + pp(n.value, d);
            break;

        case GENERATOR:
            p += pp(n.expression, d) + " " + pp(n.tail, d);
            break;

        case WITH:
            p += "with (" + pp(n.object, d) + ") ";
            p += pp(n.body, d);
            break;

        case LET:
        case VAR:
        case CONST:
            var nc = n.children;
            if (!inLetHead) {
                p += tokens[n.type] + " ";
            }
            for (var i = 0, j = nc.length; i < j; i++) {
                if (i > 0)
                    p += ", ";
                var u = nc[i];
                p += pp(u.name, d);
                if (u.initializer)
                    p += " = " + pp(u.initializer, d);
            }
            break;

        case DEBUGGER:
            p += "debugger NYI\n";
            break;

        case SEMICOLON:
            if (n.expression) {
                p += pp(n.expression, d) + ";";
            }
            break;

        case LABEL:
            p += n.label + ":\n" + pp(n.statement, d);
            break;

        case COMMA:
        case LIST:
            var nc = n.children;
            for (var i = 0, j = nc.length; i < j; i++) {
                if (i > 0)
                    p += ", ";
                p += pp(nc[i], d);
            }
            break;

        case ASSIGN:
            var nc = n.children;
            var t = n.assignOp;
            p += pp(nc[0], d) + " " + (t ? tokens[t] : "") + "="
                + " " + pp(nc[1], d);
            break;

        case HOOK:
            var nc = n.children;
            p += "(" + pp(nc[0], d) + " ? "
                + pp(nc[1], d) + " : "
                + pp(nc[2], d);
            p += ")";
            break;

        case OR:
        case AND:
            var nc = n.children;
            p += "(" + pp(nc[0], d) + " " + tokens[n.type] + " "
                + pp(nc[1], d);
            p += ")";
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
        case GE:
        case GT:
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
            var nc = n.children;
            p += "(" + pp(nc[0], d) + " " + tokens[n.type] + " "
                + pp(nc[1], d) + ")";
            break;

        case DELETE:
        case VOID:
        case TYPEOF:
            p += tokens[n.type] + " "  + pp(n.children[0], d);
            break;

        case NOT:
        case BITWISE_NOT:
            p += tokens[n.type] + pp(n.children[0], d);
            break;

        case UNARY_PLUS:
            p += "+" + pp(n.children[0], d);
            break;

        case UNARY_MINUS:
            p += "-" + pp(n.children[0], d);
            break;

        case INCREMENT:
        case DECREMENT:
            if (n.postfix) {
                p += pp(n.children[0], d) + tokens[n.type];
            } else {
                p += tokens[n.type] + pp(n.children[0], d);
            }
            break;

        case DOT:
            var nc = n.children;
            p += pp(nc[0], d) + "." + pp(nc[1], d);
            break;

        case INDEX:
            var nc = n.children;
            p += pp(nc[0], d) + "[" + pp(nc[1], d) + "]";
            break;

        case CALL:
            var nc = n.children;
            p += pp(nc[0], d) + "(";
            if(nc[0].type === IDENTIFIER && (nc[0].value in async_func_names)) {
                p += '_';
                if(nc[1].children.length > 0)
                    p += ', ';
            }
            p += pp(nc[1], d) + ")";
            break;

        case NEW:
        case NEW_WITH_ARGS:
            var nc = n.children;
            p += "new " + pp(nc[0], d);
            if (nc[1])
                p += "(" + pp(nc[1], d) + ")";
            break;

        case ARRAY_INIT:
            p += "[";
            var nc = n.children;
            for (var i = 0, j = nc.length; i < j; i++) {
                if(nc[i])
                    p += pp(nc[i], d);
                p += ","
            }
            p += "]";
            break;

        case ARRAY_COMP:
            p += "[" + pp (n.expression, d) + " ";
            p += pp(n.tail, d);
            p += "]";
            break;

        case COMP_TAIL:
            var nc = n.children;
            for (var i = 0, j = nc.length; i < j; i++) {
                if (i > 0)
                    p += " ";
                p += pp(nc[i], d);
            }
            if (n.guard)
                p += " if (" + pp(n.guard, d) + ")";
            break;

        case OBJECT_INIT:
            var nc = n.children;
            if (nc[0] && nc[0].type === PROPERTY_INIT)
                p += "{\n";
            else
                p += "{";
            for (var i = 0, j = nc.length; i < j; i++) {
                if (i > 0) {
                    p += ",\n";
                }

                var t = nc[i];
                if (t.type === PROPERTY_INIT) {
                    var tc = t.children;
                    var l;
                    /*
                     * See if the left needs to be quoted.
                     *
                     * N.B. If negative numeral prop names ever get converted
                     * internally to numbers by the parser, we need to quote
                     * those also.
                     */
                    var propName = tc[0].value;
                    if (typeof propName === "string" && !lexer.isIdentifier(propName)) {
                        l = nodeStr(tc[0]);
                    } else {
                        l = pp(tc[0], d);
                    }
                    p += indent(4, l) + ": " +
                        indent(4, pp(tc[1], d)).substring(4);
                } else {
                    p += indent(4, pp(t, d));
                }
            }
            p += "\n}";
            break;

        case NULL:
            p += "null";
            break;

        case THIS:
            p += "this";
            break;

        case TRUE:
            p += "true";
            break;

        case FALSE:
            p += "false";
            break;

        case IDENTIFIER:
        case NUMBER:
        case REGEXP:
            p += n.value;
            break;

        case STRING:
            p += nodeStr(n);
            break;

        case GROUP:
            p += "(" + pp(n.children[0], d) + ")";
            break;

        default:
            throw "PANIC: unknown operation " + tokens[n.type] + " " + n.toSource();
    }

    if (n.parenthesized)
        p += ")";

    return p;
}

/*
 * End of decompilier.js }}}1
 */







function get_emscripten_function_names(funDecls) {
    var names = []
    for(var i = 0, l = funDecls.length; i < l; ++i) {
        var func_name = funDecls[i].name;
        if (func_name.length > 0 && func_name[0] === '_')
            names.push(func_name);
    }
    return names;
}

function traverse(n, callback) {
    if(n === null) return;
    callback(n);
    switch(n.type) {
        case MODULE:
        case FUNCTION:
        case GENERATOR:
        case GETTER:
        case SETTER:
            traverse(n.body, callback);
            break;
        case IMPORT:
        case EXPORT:
        case BREAK:
        case CONTINUE:
        case FINALLY:
        case DEBUGGER:
        case NULL:
        case TRUE:
        case FALSE:
        case IDENTIFIER:
        case NUMBER:
        case STRING:
        case REGEXP:
            break
        case SCRIPT:
            n.funDecls.forEach(function(n) {
                traverse(n, callback);
            });
            // fall through
        case BLOCK:
        case COMMA:
        case ASSIGN:
        case HOOK:
        case OR:
        case AND:
        case BITWISE_OR:
        case BITWISE_XOR:
        case BITWISE_AND:
        case EQ:
        case NE:
        case STRICT_EQ:
        case STRICT_NE:
        case LT:
        case LE:
        case GE:
        case GT:
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
        case DELETE:
        case VOID:
        case TYPEOF:
        case NOT:
        case BITWISE_NOT:
        case UNARY_PLUS:
        case UNARY_MINUS:
        case INCREMENT:
        case DECREMENT:
        case DOT:
        case INDEX:
        case LIST:
        case CALL:
        case NEW:
        case NEW_WITH_ARGS:
        case ARRAY_INIT:
        case PROPERTY_INIT:
        case GROUP:
            n.children.forEach(function(n) {
                traverse(n, callback);
            });
            break;
        case IF:
            [n.condition, n.thenPart, n.elsePart].forEach(function(n) {
                traverse(n, callback);
            });
            break;
        case SWITCH:
            traverse(n.discriminant, callback);
            n.cases.forEach(function(n) {
                traverse(n, callback);
            });
            break;
        case CASE:
            traverse(n.caseLabel, callback);
            // fall through
        case DEFAULT:
            traverse(n.statements, callback);
            break;
        case FOR:
            n.setup && traverse(n.setup, callback);
            // fall through
        case WHILE:
            n.condition && traverse(n.condition, callback);
            traverse(n.body, callback);
            n.update && traverse(n.update, callback);
            break;
        case FOR_IN:
            n.varDecl && traverse(n.varDecl, callback);
            traverse(n.object, callback);
            traverse(n.body, callback);
            break;
        case DO:
            [n.body, n.condition].forEach(function(n) {
                traverse(n, callback);
            });
            break;
        case TRY:
            traverse(n.tryBlock, callback);
            n.catchClauses.forEach(function(n) {
                traverse(n, callback);
            });
            n.finallyBlock && traverse(n.finallyBlock, callback);
            break;
        case CATCH:
            n.guard && traverse(n.guard, callback);
            traverse(n.block, callback);
            break;
        case THROW:
            traverse(n.exception, callback);
            break;
        case RETURN:
            n.value && traverse(n.value, callback);
            break;
        case WITH:
            [n.object, n.body].forEach(function(n) {
                traverse(n, callback);
            });
            break;
        case VAR:
        case CONST:
            n.children.forEach(function(n) {
                n.initializer && traverse(n.initializer, callback);
            });
            break;
        case SEMICOLON:
            n.expression && traverse(n.expression, callback);
            break;
        case LABEL:
            traverse(n.statement, callback);
            break;
        default:
            break;
    }
}



function work() {

    var in_src = fs.readFileSync(in_filename, 'utf8');

    console.log('Parsing...')


    var root = window.Narcissus.parser.parse(in_src);

    console.log('Generating call graph...')


    // emscripten prefixes all C/C++ functions with '_'
    var func_names = get_emscripten_function_names(root.funDecls);

    root.funDecls.forEach(function(n) {
        var func_name = n.name;
        if(func_name.length > 0 && func_name[0] === '_') {
            traverse(n, function(n) {
                if(n.type === IDENTIFIER) {
                    var nm = n.value;
                    if(nm.length > 0 & nm[0] === '_') {
                        if(!(nm in call_graph))
                            call_graph[nm] = {};
                        call_graph[nm][func_name] = 1;
                    }
                }
            });
        }
    });

    console.log('Looking for async functions...');

    // initial async functions should not be changed
    for(var i = 0, l = async_func_names_to_check.length; i < l; ++i) {
        async_func_names_no_change[async_func_names_to_check[i]] = 1;
    }

    while(async_func_names_to_check.length > 0) {
        var cur_fn = async_func_names_to_check.pop();
        async_func_names[cur_fn] = 1;
        if(cur_fn in call_graph) {
            var callers = call_graph[cur_fn];
            for(var caller in callers) {
                if(!(caller in async_func_names)) {
                    async_func_names[caller] = 1;
                    async_func_names_to_check.push(caller);
                }
            }
        }
    }

    fs.writeFileSync('async_function_list', JSON.stringify(async_func_names, null, 2));
    var cnt = 0;
    for(var fn in async_func_names)
        ++ cnt;
    console.log(cnt + ' aync functions found, written to async_function_list.')

    console.log('Saving...');
    pp_dump_async_funcs = false;
    var out_src = pp(root);
    
    pp_dump_async_funcs = true;
    var out_async_src_list = [];
    for(var i = 0; i < job_count; ++i) 
      out_async_src_list.push('');
    var cur_idx = 0;
    root.funDecls.forEach(function(n) {
      if ((n.name in async_func_names) && (!(n.name in async_func_names_no_change))) {
        out_async_src_list[cur_idx] += pp(n);
        ++cur_idx;
        if(cur_idx == job_count)
          cur_idx = 0;
      }
    });

    fs.writeFileSync(out_filename+'._js', out_src);
    for(var i = 0; i < job_count; ++i)
      fs.writeFileSync(out_filename+'.'+i+'._js', out_async_src_list[i]);
}

console.log('Preparation...');

// ugly preparation of narcissus
window = this;
require('./narcissus/lib/options')
require('./narcissus/lib/definitions')
require('./narcissus/lib/lexer')
require('./narcissus/lib/parser')

eval(window.Narcissus.definitions.consts);
var lexer = window.Narcissus.lexer;
const tokens = window.Narcissus.definitions.tokens;

// b in call_graph[a] means b calls a
var call_graph = {};

var fs = require('fs');
var async_func_names = {};
// initial functions inside async_func_names_to_check are not transformed
// but you can write in the streamline fashion directly
var async_func_names_to_check = [
    '_vimjs_sleep', 
    '_vimjs_wait_for_chars', 
    '_vimjs_update',
    '_vimjs_flash',
    '_vimjs_browse',
    '_vimjs_async_call_safe0', 
    '_vimjs_async_call_safe1', 
    '_vimjs_async_call_safe2', 
    '_vimjs_async_call_safe3', 
    '_vimjs_async_call_safe6', 
    ];
var async_func_names_no_change = {};

in_filename = process.argv[2]
out_filename = process.argv[3]
job_count = parseInt(process.argv[4])

if(in_filename && out_filename)
  work();
else
  console.error('Cannot understand the arguments');
