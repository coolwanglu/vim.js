#!/usr/bin/env python

"""
Naive script to add ASYNC_ARG for necessary functions
parsing error messages from make/clang

Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>
"""

import os
import re

DEBUG=False
#DEBUG=True

modified_files = {}
commit_msg = []
proto_refreshed = {}

"""
B newly got a new arg ASYNC_ARG,
A calls B, but A has not been updated yet
"""
def insert_call_arg(fn, lineno, col, arg_cnt):
    try:
        with open(fn) as inf:
            lines = inf.readlines()
            line = lines[lineno]

            #safe guard
            if 'ASYNC_ARG' in line:
                raise Exception(('duplicated args!', fn, lineno, col, arg_cnt))

            if line[col] != ')':
                return False
            if line[:col].strip()[-1] == '(':
                new_arg = ' ASYNC_ARG_ONLY'
            else:
                new_arg = ' ASYNC_ARG'
            lines[lineno] = line[:col] + new_arg + line[col:];
        with open(fn,'w') as outf:
            outf.write(''.join(lines))

        global commit_msg
        commit_msg.append('Insert call arg: {0} {1} {2} {3}'.format(fn, lineno, col, arg_cnt))
        return True
    except:
        if DEBUG:
            raise
        return False

"""
B gots a new arg ASYNC_ARG
A calls B with ASYNC_ARG, but A does not have a ASYNC_ARG as parameter
declare ASYNC_ARG for A
"""
def decl_async_arg(fn, lineno, col):
    try:
        with open(fn) as inf:
            lines = inf.readlines()
            line = lines[lineno]

            # find the containing function body
            for i in range(lineno-1, -1, -1):
                if lines[i][0] == '{':
                    break
            else:
                return False

            # insert KR declaration
            lines.insert(i, '    DECL_ASYNC_ARG_KR\n')
            # find the function head
            for j in range(i-1, -1, -1):
                if len(lines[j]) != len(lines[j].lstrip()):
                    continue
                if ')' not in lines[j]:
                    raise Exception(('cannot find function head', fn, lineno, col))
                break
            else:
                return False
            

            # declare the arg
            line = lines[j]
            idx = line.index(')')

            #safe guard
            if 'ASYNC_ARG' in line:
                raise Exception(('duplicated args!', fn, lineno, col, j, line))

            tmp_line = line[:idx].rstrip()

            if tmp_line.endswith('('):
                new_arg = ' ASYNC_ARG_ONLY'
            elif tmp_line.endswith('void'):
                tmp_line = tmp_line[:-4]
                new_arg = ' ASYNC_ARG_ONLY'
            else:
                new_arg = ' ASYNC_ARG'
            lines[j] = tmp_line + new_arg + line[idx:];

        with open(fn,'w') as outf:
            outf.write(''.join(lines))

        global commit_msg
        commit_msg.append('Declare async arg: {0} {1} {2}'.format(fn, lineno, col))
        return True
    except:
        if DEBUG:
            raise
        return False

"""
We just defined a new ASYNC_ARG for A
but A has been declared somewhere else, need to fix it also
"""
def fix_conflict_decl(fn, lineno, col, funcname):
    try:
        if not fn.endswith('.c'): # sometimes we got conflict in .pro files
            return False
        with open(fn) as inf:
            lines = inf.readlines()
            line = lines[lineno]

            if not line[col:].startswith(funcname):
                return False

            # declare the arg
            line = lines[lineno]
            idx = line.index('))')
            if idx == -1:
                return False

            #safe guard
            if 'ASYNC_ARG' in line:
                raise Exception(('duplicated args!', fn, lineno, col, funcname))

            tmp_line = line[:idx].rstrip()

            if tmp_line.endswith('('):
                new_arg = ' DECL_ASYNC_ARG_ONLY'
            elif tmp_line.endswith('void'):
                tmp_line = tmp_line[:-4]
                new_arg = ' DECL_ASYNC_ARG_ONLY'
            else:
                new_arg = ' DECL_ASYNC_ARG'
            lines[lineno] = tmp_line + new_arg + line[idx:];

        with open(fn,'w') as outf:
            outf.write(''.join(lines))

        global commit_msg
        commit_msg.append('Fix conflict declaration: {0} {1} {2} {3}'.format(fn, lineno, col, funcname))
        return True
    except:
        if DEBUG:
            raise
        return False

previous_declaration_callbacks = []
def process(line):
    # try to parse it
    try:
        l = line.split(':')
        fn = l[0]
        lineno = int(l[1])
        col = int(l[2])
    except:
        return False

    global modified_files
    if fn in modified_files:
        # do not modify a single file for more than once
        # as the same location may trigger multiple errors
        return False

    ok = False
    conflict_pattern = re.compile(r'error: conflicting types for \'([^\']+)\'')
    global previous_declaration_callbacks

    if 'error: too few arguments to function call' in line:
        r = re.compile(r'expected\s*(\d+),').findall(line)
        if len(r) > 0:
            arg_cnt = int(r[0])
        elif 'single argument' in line:
            arg_cnt = 1
        else:
            raise 'unknown msg'
        ok = insert_call_arg(fn, lineno-1, col-1, arg_cnt)
    elif 'error: use of undeclared identifier \'_async_context\'' in line:
        ok = decl_async_arg(fn, lineno-1, col-1)
    elif len(previous_declaration_callbacks) > 0:
        p = previous_declaration_callbacks[0]
        ok = p[0](fn, lineno-1, col-1, p[1])
        previous_declaration_callbacks = []
    else:
        r = conflict_pattern.findall(line)
        if len(r) > 0:
            previous_declaration_callbacks.append((fix_conflict_decl, r[0]))
            # wait for next message
            # leave ok as False

    if fn.endswith('.c'):
        global proto_refreshed
        if not fn in proto_refreshed:
            proto_refreshed[fn] = 1
            os.system('make {0}.pro'.format(fn[:-2]))

    if ok:
        modified_files[fn] = 1
    else:
        print 'Not handled:',line.strip()
    return ok

def init():
    global commit_msg
    commit_msg = []
    global previous_declaration_callbacks
    previous_declaration_callbacks = []
    global modified_files
    modified_files = {}
    global proto_refreshed
    proto_refreshed = {}

def work():
    while True:
        init()
        os.remove('err.log')
        os.system('make 2>err.log')
        cnt = 0;
        with open('err.log') as inf:
            for l in inf:
                if DEBUG:
                    print 'cur:',l.strip()

                if process(l):
                    cnt += 1
        if cnt == 0:
            print 'Done.'
            break

        print 'Fixed:', cnt
        global commit_msg
        os.system('git commit -am "auto commit by fix.py\n{0}"'.format('\n'.join(commit_msg)))

        if DEBUG:
            break

if __name__ == '__main__':
    work()
