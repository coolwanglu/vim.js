#!/usr/bin/env python
# Update timestamp 
#
# Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>

import sys
import re
import subprocess

data = open(sys.argv[1]).read()
p = re.compile('<span id="last-updated-time">.*?</span>')
if len(p.findall(data)) != 1:
    print 'Error!'
else:
    open(sys.argv[1], 'w').write(p.sub('<span id="last-updated-time">' + subprocess.check_output(['date', '-u']).strip() + '</span>', data))
    



